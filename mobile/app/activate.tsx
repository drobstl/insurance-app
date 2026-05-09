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
  Platform,
  Animated,
  Easing,
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

/**
 * Format an E.164 phone number for human-readable display in copy.
 * `+15551234567` → `+1 (555) 123-4567`. Falls back to raw on malformed.
 */
function formatPhoneForDisplay(e164: string): string {
  const digits = e164.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) {
    return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return e164;
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
  // Per-client linqLinePhone is only available post-login. The May 8
  // flow inversion (activate-first) reaches this screen WITHOUT a
  // session, so we fall back to the platform default. Today there's
  // a single platform Linq line; per-agent lines are forward-compat
  // (Phase 4) and not in production.
  const PLATFORM_LINQ_PHONE = '+14046453010';
  const linqLinePhone = getParamValue(params.linqLinePhone).trim() || PLATFORM_LINQ_PHONE;

  const [pushStatus, setPushStatus] = useState<'unknown' | 'requesting' | 'enabled' | 'denied'>('unknown');
  const [activating, setActivating] = useState(false);
  const [activationStarted, setActivationStarted] = useState(false);
  const advancedRef = useRef(false);
  const forwardRef = useRef<() => void>(() => {});
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // On mount: check current notification permission state. If it's not
  // yet decided, auto-trigger the iOS permission dialog so the user
  // always lands here with the dialog up (our numbered "Tap Allow"
  // instructions on this screen point at the dialog and are useless
  // if it isn't there).
  //
  // CRITICAL: the iOS permission grant and the Expo push token fetch
  // are TWO separate concerns. `registerForPushNotificationsAsync`
  // returns null in multiple cases — including when permission IS
  // granted but the token fetch failed (network blip, project ID
  // misconfig, simulator). Using its return value to derive permission
  // status conflates the two and falsely shows "Notifications are off"
  // when the user actually granted. The OS permission state is the
  // source of truth — re-check it directly after the prompt regardless
  // of what the token fetch did.
  useEffect(() => {
    (async () => {
      try {
        const { status } = await Notifications.getPermissionsAsync();
        if (status === 'granted') {
          setPushStatus('enabled');
          return;
        }
        if (status === 'denied') {
          setPushStatus('denied');
          return;
        }
        // 'undetermined' — auto-prompt so the dialog appears now.
        setPushStatus('requesting');
        try {
          await registerForPushNotificationsAsync();
        } catch (err) {
          // Token fetch failure is NOT permission denial — see comment
          // above. Log + fall through to the post-prompt re-check.
          console.warn('[activate] push token fetch failed', err);
        }
        // Re-check the OS permission state after the prompt completes.
        try {
          const { status: postStatus } = await Notifications.getPermissionsAsync();
          if (postStatus === 'granted') {
            setPushStatus('enabled');
            // Best-effort token save now that we know permission is
            // granted. If the token registered above this is a no-op;
            // if it didn't, this gives it a second chance.
            try {
              const session = await getSession();
              if (session?.clientCode) {
                registerAndSavePushToken(session.clientCode).catch(() => {});
              }
            } catch {
              // Session lookup failed — non-blocking.
            }
          } else {
            setPushStatus('denied');
          }
        } catch {
          // getPermissionsAsync threw post-prompt — unusual but treat
          // as denied so the UI fails closed.
          setPushStatus('denied');
        }
      } catch {
        // Simulator or unsupported — leave as 'unknown'.
      }
    })();
  }, []);

  // Subtle pulse on the Activate button to draw the eye to the primary
  // action. Stops once the user actually taps it (or has navigated away
  // to iMessage). 800ms up + 800ms down with a slight overshoot.
  useEffect(() => {
    if (activating || activationStarted) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.035,
          duration: 800,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1.0,
          duration: 800,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => {
      loop.stop();
    };
  }, [activating, activationStarted, pulseAnim]);

  // Auto-advance to the login screen once the user comes back from
  // iMessage. The activation event is processed server-side
  // asynchronously when the Linq webhook fires; the mobile UI doesn't
  // need to wait. After Activate, the next step is for the user to
  // enter their code on /login (May 8 flow inversion).
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

  const forwardAfterActivate = () => {
    if (advancedRef.current === false) advancedRef.current = true;
    router.replace('/login' as never);
  };

  // Keep the ref in sync with the latest forwardAfterActivate closure.
  forwardRef.current = forwardAfterActivate;

  const handleActivate = async () => {
    if (activating) return;
    setActivating(true);
    try {
      const body = buildActivationBody(agentFirstName, clientFirstName);
      const smsUrl = buildSmsUrl(linqLinePhone, body);
      const supported = await Linking.canOpenURL(smsUrl);
      if (!supported) {
        // Device doesn't support SMS (e.g. iPad without cellular). Skip
        // gracefully — the action item stays queued server-side and the
        // agent will see it as "not yet activated" in the queue.
        forwardAfterActivate();
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
      // Composer failed — fall through to login so the user isn't
      // stranded on the Activate screen.
      forwardAfterActivate();
    } finally {
      setActivating(false);
    }
  };

  const hasValidPhoto = agentPhotoBase64
    && agentPhotoBase64.length > 0
    && agentPhotoBase64 !== 'undefined'
    && agentPhotoBase64 !== 'null';
  const photoUri = hasValidPhoto ? `data:image/jpeg;base64,${agentPhotoBase64}` : null;

  // Format the Linq line for the body copy. Empty when no line is
  // configured (the activation flow short-circuits to /agent-profile in
  // that case anyway, so the body copy never reaches a real client).
  const linqLineDisplay = linqLinePhone ? formatPhoneForDisplay(linqLinePhone) : '';

  // Numbered-step instructions guide the user through the iOS dialog
  // (which is a centered system modal we can't move) and on to the
  // Activate button below it. Step 1 only when notification permission
  // is still being decided; otherwise just step 2 (Activate).
  const showStepOne = pushStatus === 'unknown' || pushStatus === 'requesting';

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
          <Text style={styles.title}>You&apos;re almost in.</Text>
          <Text style={styles.subtitle}>One quick thing before we&apos;re set up.</Text>
        </View>

        <View style={styles.contentSection}>
          <SafeAreaView style={styles.formSafeArea}>
            <View style={styles.layoutColumn}>
              {/* Single short body line at the top of white area. */}
              <Text style={styles.topLine}>
                Tap Activate to text {agentFirstName}
                {linqLineDisplay ? ` at ${linqLineDisplay}` : '’s office line'}.
              </Text>

              {/* Flex spacer absorbs the middle zone where the iOS
                  permission dialog appears. The steps + Activate
                  button below sit in the lower portion of the white
                  area, BELOW where the dialog ends. */}
              <View style={styles.flexSpacer} />

              <View style={styles.stepsBlock}>
                {showStepOne ? (
                  <View style={styles.stepRow}>
                    <Text style={styles.stepNumber}>1.</Text>
                    <Text style={styles.stepText}>
                      Tap <Text style={styles.stepEmphasis}>&ldquo;Allow&rdquo;</Text>
                    </Text>
                    <Text style={styles.stepArrowUp}>⤴</Text>
                  </View>
                ) : pushStatus === 'denied' ? (
                  <View style={styles.deniedRow}>
                    <Text style={styles.deniedText}>
                      Notifications are off. You can enable them later in your phone&apos;s Settings.
                    </Text>
                    <TouchableOpacity
                      style={styles.deniedSettingsLink}
                      onPress={() => Linking.openSettings().catch(() => {})}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.deniedSettingsLinkText}>Open Settings</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <View style={styles.enabledRow}>
                    <Text style={styles.enabledText}>Notifications are on ✓</Text>
                  </View>
                )}

                <View style={styles.stepRow}>
                  <Text style={styles.stepNumber}>{showStepOne ? '2.' : '1.'}</Text>
                  <Text style={styles.stepText}>
                    Then tap <Text style={styles.stepEmphasis}>Activate</Text>
                  </Text>
                  <Text style={styles.stepArrowDown}>⤵</Text>
                </View>

                <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
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
                </Animated.View>
                <Text style={styles.activateHint}>
                  Opens Messages with your hello pre-written — just tap Send.
                </Text>
              </View>
            </View>
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
  layoutColumn: {
    flex: 1,
    paddingHorizontal: 28,
    paddingTop: 24,
    paddingBottom: 24,
  },
  topLine: {
    fontSize: 15,
    color: '#2D3748',
    lineHeight: 22,
    fontWeight: '500',
  },
  flexSpacer: {
    flex: 1,
    minHeight: 80,
  },
  stepsBlock: {
    // Anchored to the bottom of layoutColumn via the flexSpacer above.
    // Steps + Activate button + hint sit as a tight group below where
    // the iOS permission dialog ends.
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  stepNumber: {
    fontSize: 22,
    fontWeight: '800',
    color: '#0D4D4D',
    marginRight: 12,
    minWidth: 26,
  },
  stepText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#0D4D4D',
    flex: 1,
  },
  stepEmphasis: {
    fontWeight: '800',
    color: '#0D4D4D',
  },
  stepArrowUp: {
    fontSize: 38,
    fontWeight: '900',
    color: '#B45309',
    marginLeft: 8,
    lineHeight: 44,
  },
  stepArrowDown: {
    fontSize: 38,
    fontWeight: '900',
    color: '#0D4D4D',
    marginLeft: 8,
    lineHeight: 44,
  },
  enabledRow: {
    marginTop: 14,
    paddingHorizontal: 4,
  },
  enabledText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#065F46',
  },
  deniedRow: {
    marginTop: 14,
    paddingHorizontal: 4,
  },
  deniedText: {
    fontSize: 13,
    color: '#92400E',
    lineHeight: 18,
  },
  deniedSettingsLink: {
    marginTop: 4,
    alignSelf: 'flex-start',
  },
  deniedSettingsLinkText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0D4D4D',
    textDecorationLine: 'underline',
  },
  activateButton: {
    backgroundColor: '#0D4D4D',
    borderRadius: 14,
    paddingVertical: 20,
    alignItems: 'center',
    shadowColor: '#3DD6C3',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.45,
    shadowRadius: 14,
    elevation: 8,
    marginBottom: 8,
    borderWidth: 2,
    borderColor: '#3DD6C3',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  activateButtonText: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  activateHint: {
    fontSize: 12,
    color: '#718096',
    textAlign: 'center',
    marginBottom: 6,
    marginTop: 2,
  },
});
