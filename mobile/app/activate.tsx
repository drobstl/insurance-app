import { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  Image,
  Linking,
  ActivityIndicator,
  AppState,
  AppStateStatus,
  ScrollView,
  Platform,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { registerForPushNotificationsAsync } from './_layout';
import { getSession, registerAndSavePushToken } from './index';

/**
 * Phase 1 Track B — in-app Activate screen.
 *
 * SOURCE OF TRUTH: docs/AFL_Messaging_Operating_Model_v3.1.md §3.3
 * (welcome flow Step 2) + CONTEXT.md > Channel Rules > The two-step
 * welcome flow.
 *
 * Renders ONCE per client between successful login and the agent
 * profile screen. Two responsibilities:
 *
 * 1. Pre-prompt push notification permission so retention,
 *    anniversary, holiday, and birthday lanes can reach this client.
 *    The client app's push token is registered to the client doc by
 *    registerAndSavePushToken (called from index.tsx on login). Push
 *    permission denial is NOT a hard block on activation — they can
 *    proceed to Activate without push, but the channel matrix
 *    (CONTEXT.md > Channel Rules) makes it clear that anniversary /
 *    holiday / birthday cards will silently end for them.
 *
 * 2. The Activate button uses the `sms:` URL scheme to compose a
 *    pre-filled outbound FROM the client TO the Linq line, with the
 *    body locked by v3.1 §3.3:
 *      "Hi [Agent], it's [Client] — I'm set up on the app!"
 *    The Linq webhook (web/app/api/linq/webhook/route.ts) recognizes
 *    the inbound via the `welcome_pending_{clientId}` placeholder
 *    thread the agent action item writer pre-registered against this
 *    client's phone (server side). On match, the webhook stamps
 *    `clientActivatedAt` on the client doc, regenerates / sends the
 *    agent's vCard MMS reply, and asks for the thumbs-up reciprocity.
 *
 * After Activate is tapped the user is bounced to iMessage; once they
 * come back the AppState listener auto-advances to /agent-profile.
 *
 * HARD GATE — no Skip button. Daniel's May 6, 2026 follow-up locked
 * this: the Activate screen is the gatekeeper to the rest of the app.
 * The only way out is through the Activate button. Rationale: the
 * whole architectural premise of v3.1 §3.3 (client-initiated inbound
 * to Linq for clean carrier consent provenance + reply-ratio
 * reinforcement) doesn't fire for clients who skip — losing them
 * silently defeats the welcome flow's strategic payoff.
 *
 * If a user taps Activate, gets bounced to iMessage, backs out without
 * sending, and returns to the app: the AppState listener auto-advances
 * them to the profile (we have no signal from the mobile UI that they
 * actually sent — the webhook confirms server-side asynchronously).
 * If they didn't send, `clientActivatedAt` stays null and they see
 * the Activate screen again on next login. That is the correct
 * behavior; do NOT add polling or an "I sent it" confirmation step.
 *
 * The two defensive fallbacks below (empty linqLinePhone, Linking
 * .canOpenURL false) ARE bypasses but they are config / hardware
 * limits, not user choice. Without them an iPad-without-cellular user
 * or an env-var-misconfigured deploy would be permanently stranded.
 *
 * The flow is independent of the LINQ_OUTBOUND_DISABLED kill switch
 * (e017d55) because the inbound that arrives at the Linq line is
 * INBOUND, not outbound. The webhook still receives it; only the
 * vCard MMS reply (outbound) is gated by the freeze. So this screen
 * still validates the activation funnel under the freeze.
 */

const getParamValue = (value: string | string[] | undefined): string => {
  if (Array.isArray(value)) return value[0] ?? '';
  return value ?? '';
};

const getFirstName = (fullName: string | undefined): string => {
  if (!fullName) return '';
  return fullName.split(' ')[0] || '';
};

/**
 * Build the canonical activation SMS body per v3.1 §3.3.
 * Returns plain text; URL-encoding is the caller's responsibility.
 */
function buildActivationBody(agentFirstName: string, clientFirstName: string): string {
  const a = agentFirstName || 'there';
  const c = clientFirstName || 'me';
  return `Hi ${a}, it's ${c} — I'm set up on the app!`;
}

/**
 * Compose an `sms:` URL using the platform-specific delimiter.
 * iOS canonical form: `sms:+15551234567&body=...` (ampersand).
 * Android canonical form: `sms:+15551234567?body=...` (question mark).
 * iOS accepts both; Android < 8 may not.
 */
function buildSmsUrl(linqLinePhone: string, body: string): string {
  const delimiter = Platform.OS === 'ios' ? '&' : '?';
  return `sms:${linqLinePhone}${delimiter}body=${encodeURIComponent(body)}`;
}

export default function ActivateScreen() {
  const params = useLocalSearchParams<{
    agentId?: string | string[];
    agentName?: string | string[];
    agentEmail?: string | string[];
    agentPhone?: string | string[];
    agentPhotoBase64?: string | string[];
    agencyName?: string | string[];
    agencyLogoBase64?: string | string[];
    clientId?: string | string[];
    clientName?: string | string[];
    referralMessage?: string | string[];
    businessCardBase64?: string | string[];
    linqLinePhone?: string | string[];
  }>();

  const agentName = getParamValue(params.agentName);
  const agentFirstName = getFirstName(agentName) || 'your agent';
  const agentPhotoBase64 = getParamValue(params.agentPhotoBase64);
  const clientName = getParamValue(params.clientName);
  const clientFirstName = getFirstName(clientName) || 'me';
  const linqLinePhone = getParamValue(params.linqLinePhone).trim();

  const [pushStatus, setPushStatus] = useState<'unknown' | 'requesting' | 'enabled' | 'denied'>('unknown');
  const [activating, setActivating] = useState(false);
  const [activationStarted, setActivationStarted] = useState(false);
  const advancedRef = useRef(false);
  const forwardRef = useRef<() => void>(() => {});

  // On mount: check current notification permission state. Don't auto-
  // request — that's a user gesture step on the explicit button below.
  useEffect(() => {
    (async () => {
      try {
        const { status } = await Notifications.getPermissionsAsync();
        setPushStatus(status === 'granted' ? 'enabled' : 'unknown');
      } catch {
        // Simulator or unsupported — leave as 'unknown'.
      }
    })();
  }, []);

  // Auto-advance to the agent profile once the user comes back from
  // iMessage. The activation event is processed server-side asynchronously
  // when the Linq webhook fires; the mobile UI doesn't need to wait.
  // forwardToProfile is held in a ref so the AppState listener doesn't
  // need to be re-bound when params identity changes.
  useEffect(() => {
    if (!activationStarted) return;
    const handleAppStateChange = (nextState: AppStateStatus) => {
      if (nextState === 'active' && !advancedRef.current) {
        advancedRef.current = true;
        setTimeout(() => {
          forwardRef.current();
        }, 350);
      }
    };
    const sub = AppState.addEventListener('change', handleAppStateChange);
    return () => sub.remove();
  }, [activationStarted]);

  const forwardToProfile = () => {
    if (advancedRef.current === false) advancedRef.current = true;
    router.replace({
      pathname: '/agent-profile',
      params: {
        agentId: getParamValue(params.agentId),
        agentName,
        agentEmail: getParamValue(params.agentEmail),
        agentPhone: getParamValue(params.agentPhone),
        agentPhotoBase64,
        agencyName: getParamValue(params.agencyName),
        agencyLogoBase64: getParamValue(params.agencyLogoBase64),
        clientId: getParamValue(params.clientId),
        clientName,
        referralMessage: getParamValue(params.referralMessage),
        businessCardBase64: getParamValue(params.businessCardBase64),
      },
    });
  };

  // Keep the ref in sync with the latest forwardToProfile closure (which
  // captures the latest params).
  forwardRef.current = forwardToProfile;

  const handleEnableNotifications = async () => {
    if (pushStatus === 'enabled') return;
    setPushStatus('requesting');
    try {
      const token = await registerForPushNotificationsAsync();
      if (token) {
        const session = await getSession();
        if (session?.clientCode) {
          // Persist the token server-side. Best-effort; failure here
          // does not block activation.
          registerAndSavePushToken(session.clientCode).catch(() => {});
        }
        setPushStatus('enabled');
      } else {
        setPushStatus('denied');
      }
    } catch {
      setPushStatus('denied');
    }
  };

  const handleActivate = async () => {
    if (activating) return;
    setActivating(true);
    try {
      // No Linq line configured? Skip the activation step entirely
      // and route straight to the agent profile so login isn't blocked.
      if (!linqLinePhone) {
        forwardToProfile();
        return;
      }
      const body = buildActivationBody(agentFirstName, clientFirstName);
      const smsUrl = buildSmsUrl(linqLinePhone, body);
      const supported = await Linking.canOpenURL(smsUrl);
      if (!supported) {
        // Device doesn't support SMS (e.g. iPad without cellular). Skip
        // gracefully — the action item stays queued server-side and the
        // agent will see it as "not yet activated" in the queue.
        forwardToProfile();
        return;
      }
      setActivationStarted(true);
      await Linking.openURL(smsUrl);
      // The user is now in iMessage. The AppState listener above will
      // auto-advance them when they return. If they never come back to
      // the app (e.g. force-quit), the next launch flow short-circuits
      // the Activate screen because clientActivatedAt may not be set
      // yet — the lookup-client-code response surfaces it on next login,
      // and they see the screen again. That's acceptable: better to ask
      // a second time than to silently move past the activation step.
    } catch {
      // Composer failed — fall through to profile so the user isn't
      // stranded on the Activate screen.
      forwardToProfile();
    } finally {
      setActivating(false);
    }
  };

  const hasValidPhoto = agentPhotoBase64
    && agentPhotoBase64.length > 0
    && agentPhotoBase64 !== 'undefined'
    && agentPhotoBase64 !== 'null';
  const photoUri = hasValidPhoto ? `data:image/jpeg;base64,${agentPhotoBase64}` : null;

  return (
    <View style={styles.outerContainer}>
      <SafeAreaView style={styles.topSafeArea} />

      <View style={styles.container}>
        <View style={styles.headerSection}>
          {photoUri ? (
            <Image source={{ uri: photoUri }} style={styles.agentPhoto} />
          ) : (
            <View style={[styles.agentPhoto, styles.agentPhotoPlaceholder]}>
              <Text style={styles.agentPhotoPlaceholderText}>
                {agentFirstName.charAt(0).toUpperCase()}
              </Text>
            </View>
          )}
          <Text style={styles.title}>You&apos;re in.</Text>
          <Text style={styles.subtitle}>One quick thing before we&apos;re set up.</Text>
        </View>

        <View style={styles.contentSection}>
          <SafeAreaView style={styles.formSafeArea}>
            <ScrollView
              style={styles.scrollView}
              contentContainerStyle={styles.scrollContent}
              bounces={false}
            >
              <Text style={styles.bodyHeading}>
                Connect with {agentFirstName}
              </Text>
              <Text style={styles.bodyText}>
                Tap below to text {agentFirstName}&apos;s office line. This connects you
                so {agentFirstName} can send you policy reminders, schedule your annual
                reviews, and keep your policy info up to date right here in the app.
              </Text>
              <Text style={styles.bodyText}>
                You&apos;ll always be able to reach {agentFirstName} here.
              </Text>

              <View style={styles.notifBlock}>
                <Text style={styles.notifHeading}>
                  {pushStatus === 'enabled' ? 'Notifications are on ✓' : 'Turn on notifications'}
                </Text>
                <Text style={styles.notifBody}>
                  {pushStatus === 'enabled'
                    ? `That's how ${agentFirstName} reaches you when something important comes up with your policy.`
                    : `That's how ${agentFirstName} reaches you when something important comes up with your policy.`}
                </Text>
                {pushStatus !== 'enabled' ? (
                  <TouchableOpacity
                    style={[styles.notifButton, pushStatus === 'requesting' && styles.buttonDisabled]}
                    onPress={handleEnableNotifications}
                    disabled={pushStatus === 'requesting'}
                    activeOpacity={0.85}
                  >
                    {pushStatus === 'requesting' ? (
                      <ActivityIndicator color="#0D4D4D" size="small" />
                    ) : (
                      <Text style={styles.notifButtonText}>
                        {pushStatus === 'denied' ? 'Open Settings' : 'Allow notifications'}
                      </Text>
                    )}
                  </TouchableOpacity>
                ) : null}
                {pushStatus === 'denied' ? (
                  <Text style={styles.notifHint}>
                    You can turn this on later in your phone&apos;s Settings.
                  </Text>
                ) : null}
              </View>

              <TouchableOpacity
                style={[styles.activateButton, activating && styles.buttonDisabled]}
                onPress={handleActivate}
                disabled={activating}
                activeOpacity={0.85}
              >
                {activating ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <Text style={styles.activateButtonText}>Activate</Text>
                )}
              </TouchableOpacity>
            </ScrollView>
          </SafeAreaView>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  outerContainer: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  topSafeArea: {
    backgroundColor: '#0D4D4D',
  },
  container: {
    flex: 1,
    backgroundColor: '#0D4D4D',
  },
  headerSection: {
    alignItems: 'center',
    paddingTop: 32,
    paddingBottom: 32,
    paddingHorizontal: 24,
  },
  agentPhoto: {
    width: 96,
    height: 96,
    borderRadius: 48,
    borderWidth: 3,
    borderColor: '#3DD6C3',
    marginBottom: 18,
  },
  agentPhotoPlaceholder: {
    backgroundColor: '#3DD6C3',
    justifyContent: 'center',
    alignItems: 'center',
  },
  agentPhotoPlaceholderText: {
    color: '#0D4D4D',
    fontSize: 36,
    fontWeight: '800',
  },
  title: {
    fontSize: 32,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.85)',
    fontWeight: '500',
    textAlign: 'center',
  },
  contentSection: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
  },
  formSafeArea: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 28,
    paddingTop: 28,
    paddingBottom: 32,
  },
  bodyHeading: {
    fontSize: 20,
    fontWeight: '700',
    color: '#0D4D4D',
    marginBottom: 12,
  },
  bodyText: {
    fontSize: 15,
    color: '#2D3748',
    lineHeight: 22,
    marginBottom: 12,
  },
  notifBlock: {
    marginTop: 20,
    marginBottom: 24,
    padding: 16,
    borderRadius: 14,
    backgroundColor: '#F8FBFA',
    borderWidth: 1,
    borderColor: '#3DD6C3',
  },
  notifHeading: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0D4D4D',
    marginBottom: 6,
  },
  notifBody: {
    fontSize: 13,
    color: '#4A5568',
    lineHeight: 19,
    marginBottom: 12,
  },
  notifButton: {
    backgroundColor: '#3DD6C3',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  notifButtonText: {
    color: '#0D4D4D',
    fontSize: 14,
    fontWeight: '700',
  },
  notifHint: {
    marginTop: 8,
    fontSize: 12,
    color: '#718096',
    fontStyle: 'italic',
  },
  activateButton: {
    backgroundColor: '#0D4D4D',
    borderRadius: 14,
    paddingVertical: 18,
    alignItems: 'center',
    shadowColor: '#0D4D4D',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
    marginBottom: 14,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  activateButtonText: {
    color: '#FFFFFF',
    fontSize: 19,
    fontWeight: '700',
  },
});
