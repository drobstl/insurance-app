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
import { auth } from '../firebase';
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

          <View style={styles.card}>
            <Text style={styles.cardTitle}>What happens next</Text>
            <Text style={styles.cardBody}>
              When you book an appointment from your dashboard, this phone will
              buzz with a notification. Tap it and the confirmation text to your
              lead opens up, already addressed and ready to send. You just hit
              send.
            </Text>
          </View>

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
