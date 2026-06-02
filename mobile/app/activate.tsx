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

/**
 * Phase 1 Track B — in-app Activate screen.
 *
 * SOURCE OF TRUTH: docs/AFL_Messaging_Operating_Model_v3.1.md §3.3
 * (welcome flow Step 2) + CONTEXT.md > Channel Rules > The two-step
 * welcome flow.
 *
 * Renders ONCE per client between the notification pre-prompt
 * (`/notify`) and the agent profile screen. The push-permission step
 * used to live on this screen too; it now has its own branded
 * pre-prompt screen (`/notify`) that runs immediately before this one
 * (decoupled in the mobile onboarding redesign). This screen now has a
 * single responsibility:
 *
 *    The Activate button uses the `sms:` URL scheme to compose a
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
 * Build the activation SMS body — the inbound the client sends to the
 * Linq line on tap.
 *
 * SOURCE OF TRUTH: `docs/afl-compliance-layer-whatwhy.md` §"Activate
 * consent copy (ship verbatim)". Wording is fixed by the compliance
 * spec — the pre-filled message is the strongest opt-in artifact AFL
 * has (the client's own outbound, in their words), so it must read
 * as deliberate consent + carry the client-code verification token
 * the webhook checks against.
 *
 * Critical constraint: do NOT include the literal words STOP or HELP
 * here — they would false-trigger the F2 opt-out detection on a
 * happy-path activation inbound.
 *
 * Fallback rules:
 *   - Missing `clientCode` → drop the "code {CODE}." clause; the
 *     byPhone resolver placeholder is the primary detection mechanism
 *     and works without the code. Code presence is a verification
 *     signal stored as `welcomeActivationMatchedByCodeInBody`.
 *   - Missing `agentFirstName` → fall back to "your agent" so the
 *     sentence still reads as a deliberate consent statement.
 */
function buildActivationBody(agentFirstName: string, clientCode: string): string {
  const agent = agentFirstName?.trim() || 'your agent';
  const code = clientCode?.trim().toUpperCase();
  if (code) {
    return `Activate my account — code ${code}. Yes, I'd like to receive policy updates, reminders, and service texts from ${agent}.`;
  }
  return `Activate my account. Yes, I'd like to receive policy updates, reminders, and service texts from ${agent}.`;
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
    clientCode?: string | string[];
    clientName?: string | string[];
    referralMessage?: string | string[];
    businessCardBase64?: string | string[];
    linqLinePhone?: string | string[];
  }>();

  const agentName = getParamValue(params.agentName);
  const agentFirstName = getFirstName(agentName) || 'your agent';
  const agentPhotoBase64 = getParamValue(params.agentPhotoBase64);
  const clientName = getParamValue(params.clientName);
  const clientCode = getParamValue(params.clientCode);
  // Per-client linqLinePhone is only available post-login. The May 8
  // flow inversion (activate-first) reaches this screen WITHOUT a
  // session, so we fall back to the platform default. Today there's
  // a single platform Linq line; per-agent lines are forward-compat
  // (Phase 4) and not in production.
  const PLATFORM_LINQ_PHONE = '+14046453010';
  const linqLinePhone = getParamValue(params.linqLinePhone).trim() || PLATFORM_LINQ_PHONE;

  const [activating, setActivating] = useState(false);
  const [activationStarted, setActivationStarted] = useState(false);
  const advancedRef = useRef(false);
  const forwardRef = useRef<() => void>(() => {});
  const pulseAnim = useRef(new Animated.Value(1)).current;

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

  // Auto-advance to the agent profile once the user comes back from
  // iMessage. The activation event is processed server-side
  // asynchronously when the Linq webhook fires; the mobile UI doesn't
  // need to wait. Reverted May 25, 2026 from /login → /agent-profile:
  // login is now the unauthenticated entry, so by the time the user
  // reaches /activate they're already identified and the profile params
  // are in the URL — push them through directly.
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
    // Carry the sharedParams through to /agent-profile so the profile
    // screen has everything it needs without re-fetching. Mirrors the
    // shape navigateToProfile uses when routing directly to profile.
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

  // Keep the ref in sync with the latest forwardAfterActivate closure.
  forwardRef.current = forwardAfterActivate;

  const handleActivate = async () => {
    if (activating) return;
    setActivating(true);
    try {
      const body = buildActivationBody(agentFirstName, clientCode);
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

  return (
    <View style={styles.outerContainer}>
      <SafeAreaView style={styles.topSafeArea} />

      <View style={styles.container}>
        <View style={styles.headerSection}>
          {photoUri ? (
            <Image source={{ uri: photoUri }} style={styles.agentPhoto} />
          ) : (
            // Depersonalized fallback (May 8 flow inversion): show the
            // AgentForLife brand icon (infinity symbol on dark green)
            // instead of an initial-letter placeholder. Daniel's call —
            // a lone "Y" from "your agent" doesn't read as branded.
            <Image source={require('../assets/icon.png')} style={styles.agentPhoto} />
          )}
          <Text style={styles.title}>You&apos;re almost in.</Text>
          <Text style={styles.subtitle}>One quick thing before we&apos;re set up.</Text>
        </View>

        <View style={styles.contentSection}>
          <SafeAreaView style={styles.formSafeArea}>
            <View style={styles.layoutColumn}>
              <Text style={styles.topLine}>
                Tap Activate to text {agentFirstName}
                {linqLineDisplay ? ` at ${linqLineDisplay}` : '’s office line'}.
              </Text>

              {/* Flex spacer pushes the action group toward the lower
                  half of the white area. */}
              <View style={styles.flexSpacer} />

              <View style={styles.actionBlock}>
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

                {/* Consent disclosure — AFL compliance layer Part 1.
                    Wording is locked verbatim by
                    docs/afl-compliance-layer-whatwhy.md §"Activate
                    consent copy (ship verbatim)". This is the exact
                    consent the client agrees to when they tap Activate;
                    do NOT edit without a spec amendment. */}
                <Text style={styles.consentDisclosure}>
                  By tapping <Text style={styles.consentBold}>Activate</Text>, you
                  agree to receive account, policy, and service text messages —
                  including automated messages — from{' '}
                  <Text style={styles.consentBold}>{agentName || 'your agent'}</Text>{' '}
                  at this number. Msg & data rates may apply. Message frequency
                  varies. Reply <Text style={styles.consentBold}>STOP</Text> to
                  opt out, <Text style={styles.consentBold}>HELP</Text> for help. See{' '}
                  <Text
                    style={styles.consentLink}
                    onPress={() => Linking.openURL('https://agentforlife.app/terms').catch(() => {})}
                  >
                    Terms
                  </Text>{' '}
                  &{' '}
                  <Text
                    style={styles.consentLink}
                    onPress={() => Linking.openURL('https://agentforlife.app/privacy').catch(() => {})}
                  >
                    Privacy
                  </Text>
                  .
                </Text>

                {/* Lead-mode "I'm a lead, enter here" link removed
                    May 25, 2026 as part of the login-first refactor.
                    Leads no longer reach /activate at all (login resolves
                    accessType: 'lead' and routes to /lead-home directly),
                    so the affordance has nothing to refer to. /lead-login
                    is now orphaned but kept in place as a fallback route. */}

                {/* Agent fallback: an agent who installed the app via
                    the App Store and tapped "Open" (instead of returning
                    to Safari where the pair flow auto-resumes) lands
                    here without a session and no way forward. This link
                    routes them to instructions for the QR pair flow.
                    Real clients who tap it confused will read "head to
                    your dashboard on your laptop" and back out — no harm
                    done. */}
                <TouchableOpacity
                  style={styles.agentLink}
                  onPress={() => router.replace('/agent-welcome' as never)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.agentLinkText}>Are you an agent? →</Text>
                </TouchableOpacity>
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
  actionBlock: {
    // Anchored to the bottom of layoutColumn via the flexSpacer above —
    // Activate button + hint + consent sit as a tight group.
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
  agentLink: {
    marginTop: 24,
    paddingVertical: 8,
    paddingHorizontal: 12,
    alignSelf: 'center',
  },
  agentLinkText: {
    fontSize: 12,
    color: '#9CA3AF',
    fontWeight: '500',
    textAlign: 'center',
    textDecorationLine: 'underline',
  },
  consentDisclosure: {
    fontSize: 11,
    lineHeight: 16,
    color: '#718096',
    textAlign: 'center',
    marginTop: 10,
    paddingHorizontal: 4,
  },
  consentBold: {
    fontWeight: '700',
    color: '#4a5568',
  },
  consentLink: {
    color: '#0D4D4D',
    textDecorationLine: 'underline',
    fontWeight: '600',
  },
  leadEntryLink: {
    marginTop: 18,
    paddingVertical: 8,
    paddingHorizontal: 12,
    alignSelf: 'center',
  },
  leadEntryLinkText: {
    fontSize: 12,
    color: '#3DD6C3',
    fontWeight: '600',
    textAlign: 'center',
  },
});
