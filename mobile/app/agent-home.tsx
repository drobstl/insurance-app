import { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  Pressable,
  ScrollView,
} from 'react-native';
import { router } from 'expo-router';
import { onAuthStateChanged } from 'firebase/auth';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { auth, db } from '../firebase';
import {
  getAgentSession,
  clearAgentSession,
  registerAgentPushToken,
  type AgentSession,
} from '../lib/agent-session';
import { registerForPushNotificationsAsync } from './_layout';

/**
 * /agent-home — what an agent sees after pairing their phone.
 *
 * Today this is a "you're paired, we'll text you" splash. The real
 * value happens elsewhere: when a lead is booked, the server pushes a
 * notification here, the agent taps it, and we'll open the message
 * composer directly. Push registration happens on this screen.
 *
 * Future shape: this screen will likely grow to show recent
 * appointments, sent confirmations, and a "send now" button for any
 * appointment that hasn't had a confirmation sent yet. For now it's a
 * landing page that proves the pair flow + push registration both work.
 */
export default function AgentHomeScreen() {
  const [session, setSession] = useState<AgentSession | null>(null);
  const [pushStatus, setPushStatus] = useState<'pending' | 'granted' | 'denied' | 'error'>(
    'pending',
  );

  // Load the cached agent session so we can render names instantly,
  // and gate on Firebase auth state actually being present. If the
  // session is on disk but Firebase isn't signed in (shouldn't happen
  // in the normal flow, but could after a force-quit/reinstall), we
  // bounce back to the root so the user re-pairs.
  useEffect(() => {
    let cancelled = false;
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (cancelled) return;
      const cached = await getAgentSession();
      if (!user || !cached) {
        // No agent identity available. Clear any stale session marker
        // and route back to the root, which will fall through to the
        // standard client-side login.
        if (cached) await clearAgentSession();
        router.replace('/' as never);
        return;
      }
      setSession(cached);
    });
    return () => {
      cancelled = true;
      unsub();
    };
  }, []);

  // Register the device's push token against the agent profile. This
  // is the gate that enables server-side push triggers (booking,
  // reschedule, 1-hour reminder) to reach this device.
  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    (async () => {
      try {
        const pushToken = await registerForPushNotificationsAsync();
        if (cancelled) return;
        if (!pushToken) {
          setPushStatus('denied');
          return;
        }
        const ok = await registerAgentPushToken(pushToken);
        if (cancelled) return;
        setPushStatus(ok ? 'granted' : 'error');
      } catch (err) {
        console.warn('agent push registration failed:', err);
        if (!cancelled) setPushStatus('error');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [session]);

  const handleSignOut = async () => {
    await clearAgentSession();
    router.replace('/' as never);
  };

  // Live "needs your attention" list.
  //
  // Push notifications are best-effort delivery — they expire on the
  // lock screen, get dismissed accidentally, or arrive when the agent
  // is mid-call. Without an in-app catch-up surface, the only recovery
  // path is the dashboard's Resend button, which an agent on the go
  // doesn't have hands for.
  //
  // This list shows every scheduled future appointment that still
  // needs an action from the agent — either the post-booking
  // confirmation hasn't been sent, or it's inside the 1-hour reminder
  // window and the reminder hasn't been sent. Each row is a one-tap
  // route to the send composer for that specific appointment, same
  // destination as the notification tap.
  const [pendingItems, setPendingItems] = useState<PendingItem[]>([]);
  useEffect(() => {
    if (!session?.uid) return;
    const apptsRef = collection(db, 'agents', session.uid, 'appointments');
    const q = query(apptsRef, where('status', '==', 'scheduled'));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const nowMs = Date.now();
        const reminderWindowMs = 90 * 60 * 1000; // catch-up window for reminders: 90 min
        const items: PendingItem[] = [];
        snap.forEach((docSnap) => {
          const data = docSnap.data();
          const scheduledMs = tsToMillis(data.scheduledAt);
          if (scheduledMs === null) return;
          // Don't surface appointments that are already in the past
          // beyond the reminder window — those become noise.
          if (scheduledMs + reminderWindowMs < nowMs) return;
          const leadName = typeof data.leadName === 'string' ? data.leadName : '';
          const needsConfirmation = !data.sentConfirmationAt;
          const withinReminderWindow =
            scheduledMs - nowMs <= reminderWindowMs && scheduledMs - nowMs > -reminderWindowMs;
          const needsReminder = withinReminderWindow && !data.sentReminderAt;
          if (needsConfirmation) {
            items.push({
              apptId: docSnap.id,
              kind: 'confirmation',
              leadName,
              scheduledMs,
            });
          }
          if (needsReminder) {
            items.push({
              apptId: docSnap.id,
              kind: 'reminder',
              leadName,
              scheduledMs,
            });
          }
        });
        // Sort: most urgent first. Reminders for soon-starting appts
        // come before generic confirmation backlog.
        items.sort((a, b) => a.scheduledMs - b.scheduledMs);
        setPendingItems(items);
      },
      (err) => {
        console.warn('agent-home pending items snapshot failed:', err);
      },
    );
    return () => unsub();
  }, [session?.uid]);

  const handlePendingTap = (item: PendingItem) => {
    router.push({
      pathname: '/send/[apptId]',
      params: { apptId: item.apptId, kind: item.kind },
    } as never);
  };

  if (!session) {
    return (
      <View style={styles.container}>
        <SafeAreaView style={styles.safe} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safe}>
        <ScrollView contentContainerStyle={styles.scroll}>
          <View style={styles.headerBlock}>
            <Text style={styles.greeting}>You’re all set,</Text>
            <Text style={styles.agentName}>{session.agentName}.</Text>
            {!!session.agencyName && (
              <Text style={styles.agency}>{session.agencyName}</Text>
            )}
          </View>

          {/* Catch-up list: lives above the "what happens next" card
              when there's anything pending, so the agent's eyes land
              on actionable items first. When empty, falls back to the
              instructional card so first-time / between-bookings agents
              still get context. */}
          {pendingItems.length > 0 ? (
            <View style={styles.pendingCard}>
              <Text style={styles.pendingTitle}>Needs your attention</Text>
              {pendingItems.map((item) => (
                <Pressable
                  key={`${item.apptId}-${item.kind}`}
                  style={styles.pendingRow}
                  onPress={() => handlePendingTap(item)}
                >
                  <View style={styles.pendingRowText}>
                    <Text style={styles.pendingRowName}>
                      {item.leadName || 'Unnamed lead'}
                    </Text>
                    <Text style={styles.pendingRowSub}>
                      {formatRelativeTime(item.scheduledMs)} •{' '}
                      {item.kind === 'reminder' ? 'Send reminder' : 'Send confirmation'}
                    </Text>
                  </View>
                  <Text style={styles.pendingRowArrow}>›</Text>
                </Pressable>
              ))}
            </View>
          ) : (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>You’re all caught up</Text>
              <Text style={styles.cardBody}>
                When you book an appointment from your dashboard, this phone will
                buzz with a notification. Tap it and the confirmation text to your
                lead opens up, already addressed and ready to send. You just hit
                send. If you ever miss the buzz, the appointment will show up here
                until you’ve sent.
              </Text>
            </View>
          )}

          <View style={styles.statusBox}>
            <Text style={styles.statusLabel}>Notifications</Text>
            <Text style={styles[pushStatusKey(pushStatus)]}>
              {pushStatusLabel(pushStatus)}
            </Text>
            {pushStatus === 'denied' && (
              <Text style={styles.statusHelper}>
                Open iOS Settings → Agent for Life → Notifications and turn
                them on. Without notifications we can’t alert you when a lead
                books.
              </Text>
            )}
            {pushStatus === 'error' && (
              <Text style={styles.statusHelper}>
                Couldn’t save the notification setup. Try closing and reopening
                the app.
              </Text>
            )}
          </View>

          <Pressable style={styles.signOut} onPress={handleSignOut}>
            <Text style={styles.signOutText}>Sign out</Text>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

interface PendingItem {
  apptId: string;
  kind: 'confirmation' | 'reminder';
  leadName: string;
  scheduledMs: number;
}

/**
 * Pull a millis value off whatever shape Firestore handed us for the
 * scheduledAt field. Server-set Timestamps come through as objects
 * with toMillis(); locally-set Timestamps (or after restoration from
 * cache) sometimes have only seconds + nanoseconds.
 */
function tsToMillis(value: unknown): number | null {
  if (!value) return null;
  if (typeof (value as { toMillis?: () => number }).toMillis === 'function') {
    return (value as { toMillis: () => number }).toMillis();
  }
  if (typeof value === 'object' && value !== null && 'seconds' in value) {
    return (value as { seconds: number }).seconds * 1000;
  }
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

/**
 * Friendly relative formatting for the pending list — "in 2 hours",
 * "today at 3:00pm", "tomorrow at 9:30am", "Thursday at 1:00pm".
 * Long enough to convey when, short enough to fit on one row.
 */
function formatRelativeTime(ms: number): string {
  const date = new Date(ms);
  const now = new Date();
  const diffMin = Math.round((ms - now.getTime()) / 60000);
  const timeStr = date
    .toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
    .toLowerCase()
    .replace(' ', '');
  if (Math.abs(diffMin) < 60) {
    if (diffMin === 0) return 'starting now';
    if (diffMin > 0) return `in ${diffMin} min`;
    return `${Math.abs(diffMin)} min ago`;
  }
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();
  if (sameDay) return `today at ${timeStr}`;
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const isTomorrow =
    date.getFullYear() === tomorrow.getFullYear() &&
    date.getMonth() === tomorrow.getMonth() &&
    date.getDate() === tomorrow.getDate();
  if (isTomorrow) return `tomorrow at ${timeStr}`;
  const weekday = date.toLocaleDateString(undefined, { weekday: 'long' });
  return `${weekday} at ${timeStr}`;
}

function pushStatusKey(s: typeof pushStatusValues[number]): 'pushPending' | 'pushGranted' | 'pushDenied' | 'pushError' {
  switch (s) {
    case 'granted':
      return 'pushGranted';
    case 'denied':
      return 'pushDenied';
    case 'error':
      return 'pushError';
    default:
      return 'pushPending';
  }
}

const pushStatusValues = ['pending', 'granted', 'denied', 'error'] as const;

function pushStatusLabel(s: typeof pushStatusValues[number]): string {
  switch (s) {
    case 'granted':
      return 'On — you’re ready to receive booking alerts.';
    case 'denied':
      return 'Off — notifications were not granted.';
    case 'error':
      return 'Setup didn’t complete. Try again.';
    default:
      return 'Setting up…';
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0D4D4D',
  },
  safe: {
    flex: 1,
  },
  scroll: {
    padding: 24,
    paddingTop: 40,
  },
  headerBlock: {
    marginBottom: 32,
  },
  greeting: {
    fontSize: 22,
    color: 'rgba(255,255,255,0.85)',
    fontWeight: '500',
  },
  agentName: {
    fontSize: 32,
    color: '#FFFFFF',
    fontWeight: '700',
    marginTop: 2,
  },
  agency: {
    fontSize: 15,
    color: 'rgba(255,255,255,0.7)',
    marginTop: 6,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 20,
    marginBottom: 20,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0D4D4D',
    marginBottom: 8,
  },
  cardBody: {
    fontSize: 15,
    color: '#333',
    lineHeight: 22,
  },
  pendingCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 6,
    marginBottom: 20,
  },
  pendingTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0D4D4D',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 10,
  },
  pendingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: '#ececec',
  },
  pendingRowText: {
    flex: 1,
  },
  pendingRowName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0D4D4D',
  },
  pendingRowSub: {
    fontSize: 13,
    color: '#555',
    marginTop: 2,
  },
  pendingRowArrow: {
    fontSize: 28,
    color: '#aaa',
    marginLeft: 8,
    marginTop: -4,
  },
  statusBox: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 14,
    padding: 18,
    marginBottom: 32,
  },
  statusLabel: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.7)',
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  pushPending: {
    fontSize: 15,
    color: 'rgba(255,255,255,0.85)',
  },
  pushGranted: {
    fontSize: 15,
    color: '#3DD6C3',
    fontWeight: '600',
  },
  pushDenied: {
    fontSize: 15,
    color: '#FFD89A',
    fontWeight: '600',
  },
  pushError: {
    fontSize: 15,
    color: '#FF9B9B',
    fontWeight: '600',
  },
  statusHelper: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.7)',
    marginTop: 8,
    lineHeight: 18,
  },
  signOut: {
    alignSelf: 'center',
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  signOutText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 14,
    textDecorationLine: 'underline',
  },
});
