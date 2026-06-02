import { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  Image,
  ActivityIndicator,
  AppState,
  AppStateStatus,
  Animated,
  Easing,
  Linking,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import * as Notifications from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';
import { registerAndSavePushToken } from './index';

/**
 * Notification pre-prompt — the branded screen that runs immediately
 * BEFORE /activate in the client onboarding flow (mobile onboarding
 * redesign, Jun 2026). It owns the push-permission ritual that used to
 * live on the Activate screen.
 *
 * SOURCE OF TRUTH: docs/mobile-onboarding-redesign-spec.md §3, §7.
 *
 * Why a branded pre-prompt instead of firing the OS dialog cold:
 *   - iOS only ever shows its system permission alert ONCE. If we fire
 *     it cold and the client taps "Don't Allow", push is dead forever
 *     (no second chance without a trip to Settings). The pre-prompt lets
 *     us make the value case in our own voice first, so the real OS
 *     dialog only fires when the client has already said "yes, I want
 *     this" by tapping Allow — maximizing grant rate.
 *   - It must read as an AgentForLife screen (teal, infinity icon, our
 *     copy), NOT a pixel clone of the iOS system alert. A clone trips
 *     Apple's deceptive-UI / Google's deceptive-behavior review rules.
 *
 * 🔒 LOCKED (Jun 1) — soft-gate, never block, but maximize allows:
 *   (1) "Maybe later" does NOT fire the real OS dialog (preserves the
 *       iOS one-shot for a future launch).
 *   (2) Only "Allow" fires the OS dialog.
 *   (3) If the OS dialog itself is denied → show the "Notifications are
 *       off → Open Settings" recovery and proceed anyway.
 *   (4) Never block forward progress to /activate.
 *   (5) Bias the hierarchy hard toward Allow — big pulsing button, small
 *       low-contrast "Maybe later".
 *   (6) Re-surface the pre-prompt at most ONCE on a later launch if they
 *       deferred (see DEFER_KEY below) — capped to avoid nagware.
 *
 * This screen never renders for clients who have already decided: if
 * push is already granted (or provisional) we register the token and
 * fall straight through to /activate; if it's hard-denied (the OS won't
 * let us ask again) we also fall straight through. We only paint the
 * pre-prompt when the OS will actually let us ask.
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
 * Counts how many times the client has DEFERRED the pre-prompt by
 * tapping "Maybe later". Absent = 0. We show on 0 deferrals, re-surface
 * once after the 1st deferral, and stop after the 2nd — exactly one
 * re-surface, per the locked decision (6). Stored, not in-memory, so the
 * cap survives app restarts.
 */
const DEFER_KEY = 'notify_preprompt_deferrals';
const MAX_DEFERRALS = 2;

type Decision = 'pending' | 'show' | 'recovery';

export default function NotifyScreen() {
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
  const clientCode = getParamValue(params.clientCode);

  const [decision, setDecision] = useState<Decision>('pending');
  const [requesting, setRequesting] = useState(false);
  const navigatedRef = useRef(false);
  const pulse = useRef(new Animated.Value(0)).current;

  // Forward EVERY incoming param straight through to /activate so the
  // Activate screen (and the agent-profile screen it forwards to) has
  // the full payload without re-fetching. Mirrors the param shape
  // navigateToProfile builds in index.tsx.
  const proceed = () => {
    if (navigatedRef.current) return;
    navigatedRef.current = true;
    router.replace({
      pathname: '/activate',
      params: {
        agentId: getParamValue(params.agentId),
        agentName,
        agentEmail: getParamValue(params.agentEmail),
        agentPhone: getParamValue(params.agentPhone),
        agentPhotoBase64: getParamValue(params.agentPhotoBase64),
        agencyName: getParamValue(params.agencyName),
        agencyLogoBase64: getParamValue(params.agencyLogoBase64),
        clientId: getParamValue(params.clientId),
        clientCode,
        clientName: getParamValue(params.clientName),
        referralMessage: getParamValue(params.referralMessage),
        businessCardBase64: getParamValue(params.businessCardBase64),
        linqLinePhone: getParamValue(params.linqLinePhone),
      },
    });
  };

  // On mount, decide whether to paint the pre-prompt at all. We only
  // show it when the OS will genuinely let us ask AND we haven't already
  // burned the re-surface cap. Everything else falls straight through to
  // /activate, rendering only the teal loader so there's no flash of the
  // pre-prompt before we navigate away.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const perm = await Notifications.getPermissionsAsync();
        if (cancelled) return;

        // Already allowed (granted or iOS provisional). Best-effort save
        // the token — this is the relocated "fire prompt + save token in
        // one motion" the Activate screen used to do — then move on.
        if (perm.granted) {
          if (clientCode) registerAndSavePushToken(clientCode).catch(() => {});
          proceed();
          return;
        }

        // Hard-denied: the OS won't let us ask again (iOS one-shot
        // already spent, or Android "don't ask again"). Re-prompting is
        // impossible, so don't nag — fall through.
        if (!perm.canAskAgain) {
          proceed();
          return;
        }

        // Askable. (Android 13 reports a not-yet-asked permission as
        // denied+canAskAgain:true; that lands here too, which is what we
        // want.) Respect the deferral cap before painting.
        const deferralsRaw = await SecureStore.getItemAsync(DEFER_KEY);
        if (cancelled) return;
        const deferrals = Number(deferralsRaw) || 0;
        if (deferrals >= MAX_DEFERRALS) {
          proceed();
          return;
        }

        setDecision('show');
      } catch {
        // Permission API failed — never strand the client on a blank
        // screen; let them through to Activate.
        if (!cancelled) proceed();
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sonar-style halo behind the Allow button. A single value ramps 0→1
  // on a loop; the ring scales out and fades, with opacity easing in
  // from 0 so the loop reset is invisible (no pop). ~1.6s is calm, not a
  // strobe. Native-driver-safe (transform + opacity only).
  useEffect(() => {
    if (decision !== 'show') return;
    pulse.setValue(0);
    const loop = Animated.loop(
      Animated.timing(pulse, {
        toValue: 1,
        duration: 1600,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [decision, pulse]);

  // When we're showing the OS-off recovery and the client comes back
  // from Settings with notifications now enabled, pick up the token and
  // move on automatically — they already did the work.
  useEffect(() => {
    if (decision !== 'recovery') return;
    const onChange = async (next: AppStateStatus) => {
      if (next !== 'active') return;
      try {
        const perm = await Notifications.getPermissionsAsync();
        if (perm.granted) {
          if (clientCode) registerAndSavePushToken(clientCode).catch(() => {});
          proceed();
        }
      } catch {
        // ignore — they can still tap Continue
      }
    };
    const sub = AppState.addEventListener('change', onChange);
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [decision]);

  const handleAllow = async () => {
    if (requesting) return;
    setRequesting(true);
    try {
      // This is the ONLY place the real OS dialog fires. registerAnd-
      // SavePushToken below re-checks permission (now granted) and so
      // does NOT trigger a second dialog — it just mints + saves the
      // token.
      const { status } = await Notifications.requestPermissionsAsync();
      if (status === 'granted') {
        if (clientCode) registerAndSavePushToken(clientCode).catch(() => {});
        proceed();
      } else {
        // Denied at the OS dialog — soft-gate: show the recovery row,
        // don't block.
        setDecision('recovery');
      }
    } catch {
      proceed();
    } finally {
      setRequesting(false);
    }
  };

  // "Maybe later" — deliberately does NOT fire the OS dialog. Record the
  // deferral (so the re-surface cap advances) and fall through.
  const handleMaybeLater = async () => {
    try {
      const raw = await SecureStore.getItemAsync(DEFER_KEY);
      const next = (Number(raw) || 0) + 1;
      await SecureStore.setItemAsync(DEFER_KEY, String(next));
    } catch {
      // best-effort — if the write fails the worst case is one extra
      // re-surface, which is acceptable.
    }
    proceed();
  };

  const ringScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.45] });
  const ringOpacity = pulse.interpolate({ inputRange: [0, 0.12, 1], outputRange: [0, 0.45, 0] });

  if (decision === 'pending') {
    return (
      <View style={styles.outer}>
        <SafeAreaView style={styles.safe}>
          <View style={styles.loadingContent}>
            <ActivityIndicator color="#3DD6C3" size="large" />
          </View>
        </SafeAreaView>
      </View>
    );
  }

  if (decision === 'recovery') {
    return (
      <View style={styles.outer}>
        <SafeAreaView style={styles.safe}>
          <View style={styles.content}>
            <Image source={require('../assets/icon.png')} style={styles.icon} />
            <Text style={styles.title}>Notifications are off</Text>
            <Text style={styles.body}>
              No problem — you can turn them on anytime. To get policy
              updates and reminders from {agentFirstName}, switch
              notifications on in Settings.
            </Text>

            <View style={styles.spacer} />

            <TouchableOpacity
              style={styles.primaryButton}
              onPress={() => Linking.openSettings().catch(() => {})}
              activeOpacity={0.85}
            >
              <Text style={styles.primaryButtonText}>Open Settings</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.secondaryLink} onPress={proceed} activeOpacity={0.7}>
              <Text style={styles.secondaryLinkText}>Continue</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </View>
    );
  }

  return (
    <View style={styles.outer}>
      <SafeAreaView style={styles.safe}>
        <View style={styles.content}>
          <Image source={require('../assets/icon.png')} style={styles.icon} />
          <Text style={styles.title}>Stay in the loop with {agentFirstName}</Text>
          <Text style={styles.body}>
            Push notifications keep you on top of policy updates, anniversary
            reviews, and the birthdays and holidays your agent likes to mark.
          </Text>

          <View style={styles.spacer} />

          <View style={styles.buttonWrap}>
            <Animated.View
              pointerEvents="none"
              style={[styles.pulseRing, { transform: [{ scale: ringScale }], opacity: ringOpacity }]}
            />
            <TouchableOpacity
              style={[styles.primaryButton, requesting && styles.buttonDisabled]}
              onPress={handleAllow}
              disabled={requesting}
              activeOpacity={0.85}
            >
              {requesting ? (
                <ActivityIndicator color="#0D4D4D" size="small" />
              ) : (
                <Text style={styles.primaryButtonText}>Allow</Text>
              )}
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={styles.secondaryLink}
            onPress={handleMaybeLater}
            disabled={requesting}
            activeOpacity={0.7}
          >
            <Text style={styles.secondaryLinkText}>Maybe later</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  outer: {
    flex: 1,
    backgroundColor: '#0D4D4D',
  },
  safe: {
    flex: 1,
    backgroundColor: '#0D4D4D',
  },
  loadingContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    paddingVertical: 40,
  },
  icon: {
    width: 96,
    height: 96,
    borderRadius: 24,
    marginBottom: 28,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 14,
  },
  body: {
    fontSize: 16,
    lineHeight: 24,
    color: 'rgba(255, 255, 255, 0.85)',
    fontWeight: '500',
    textAlign: 'center',
    paddingHorizontal: 4,
  },
  spacer: {
    height: 48,
  },
  buttonWrap: {
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pulseRing: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 999,
    backgroundColor: '#3DD6C3',
  },
  primaryButton: {
    backgroundColor: '#3DD6C3',
    borderRadius: 999,
    paddingVertical: 18,
    paddingHorizontal: 64,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#3DD6C3',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
    elevation: 8,
  },
  primaryButtonText: {
    color: '#0D4D4D',
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  secondaryLink: {
    marginTop: 28,
    paddingVertical: 10,
    paddingHorizontal: 16,
    alignSelf: 'center',
  },
  secondaryLinkText: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.5)',
    fontWeight: '500',
    textAlign: 'center',
  },
});
