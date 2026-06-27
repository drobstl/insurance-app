import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Pressable,
  StyleSheet,
  Image,
  Modal,
  Linking,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  Easing,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import type { ResetRevealData } from '../lib/reset-reveal-client';

const fmtUsd = (n: number) => '$' + Math.round(n).toLocaleString('en-US');

// How long each beat holds before auto-advancing (ms). The final ask beat
// rests (0) — the client acts or dismisses from there.
const BEAT_MS = [2600, 3200, 3000, 3600, 3200, 0];
const LAST = BEAT_MS.length - 1;

export interface ResetRevealProps {
  visible: boolean;
  data: ResetRevealData;
  onEngage: () => void;
  onDismiss: () => void;
}

/**
 * The in-app reset reveal — a full-screen, auto-playing story built from the
 * client's own numbers, framed as something their agent made for them.
 *
 * Compliance: shows their real mortgage balance / payment (their own facts) and
 * keeps the time + growth conceptual. It never renders a projected payoff date,
 * cash value, or return — those are the licensed specialist's illustration.
 */
export default function ResetReveal({ visible, data, onEngage, onDismiss }: ResetRevealProps) {
  const [idx, setIdx] = useState(0);
  const beatOpacity = useSharedValue(0);
  const beatTranslateY = useSharedValue(14);

  // Start fresh each time it opens.
  useEffect(() => {
    if (visible) setIdx(0);
  }, [visible]);

  // Re-run the entrance on every beat change (mirrors FullScreenCard's pattern).
  useEffect(() => {
    beatOpacity.value = 0;
    beatTranslateY.value = 14;
    beatOpacity.value = withTiming(1, { duration: 420, easing: Easing.out(Easing.ease) });
    beatTranslateY.value = withSpring(0, { damping: 16, stiffness: 120 });
  }, [idx, visible, beatOpacity, beatTranslateY]);

  // Auto-advance until the final beat.
  useEffect(() => {
    if (!visible) return;
    const hold = BEAT_MS[idx] ?? 3000;
    if (!hold) return;
    const t = setTimeout(() => setIdx((i) => Math.min(i + 1, LAST)), hold);
    return () => clearTimeout(t);
  }, [visible, idx]);

  const beatStyle = useAnimatedStyle(() => ({
    opacity: beatOpacity.value,
    transform: [{ translateY: beatTranslateY.value }],
  }));

  const advance = () => {
    if (idx < LAST) setIdx((i) => i + 1);
  };

  const handleEngage = () => {
    if (data.schedulingUrl) Linking.openURL(data.schedulingUrl).catch(() => {});
    onEngage();
  };

  const hasPhoto =
    !!data.agentPhotoBase64 &&
    data.agentPhotoBase64.length > 0 &&
    data.agentPhotoBase64 !== 'undefined' &&
    data.agentPhotoBase64 !== 'null';

  const beats: React.ReactNode[] = [
    <Text key="b0" style={styles.headline}>A lot can change in a few years, {data.firstName || 'friend'}.</Text>,
    <View key="b1" style={styles.center}>
      <Text style={styles.eyebrow}>your mortgage today</Text>
      {data.hasRealNumbers && data.mortgageBalance != null ? (
        <Text style={styles.big}>{fmtUsd(data.mortgageBalance)}</Text>
      ) : (
        <Text style={styles.headline}>the biggest check you write.</Text>
      )}
      {data.monthlyPayment != null ? (
        <Text style={styles.sub}>{fmtUsd(data.monthlyPayment)} a month, year after year.</Text>
      ) : null}
    </View>,
    <Text key="b2" style={styles.headline}>What if it didn&apos;t have to take decades?</Text>,
    <Text key="b3" style={styles.headline}>
      Imagine that payment working for you instead — growing where a market drop can&apos;t touch it.
    </Text>,
    <View key="b4" style={styles.center}>
      <Text style={styles.headline}>Mortgage handled. Retirement handled.</Text>
      <Text style={styles.sub}>On the income you already make.</Text>
    </View>,
    <View key="b5" style={styles.center}>
      <Text style={styles.headline}>Since we set up your coverage, new options opened up.</Text>
      <TouchableOpacity style={styles.cta} onPress={handleEngage} activeOpacity={0.85}>
        <Text style={styles.ctaText}>See if my family qualifies</Text>
      </TouchableOpacity>
      {!data.hasRealNumbers ? (
        <Text style={styles.subSmall}>A 10-minute look — we&apos;ll map your numbers together.</Text>
      ) : null}
      <TouchableOpacity onPress={onDismiss} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
        <Text style={styles.notnow}>Not now</Text>
      </TouchableOpacity>
    </View>,
  ];

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent={false}
      statusBarTranslucent
      onRequestClose={onDismiss}
    >
      <LinearGradient
        colors={['#0D4D4D', '#072E2C']}
        style={styles.fill}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      >
        <Pressable style={styles.fill} onPress={advance}>
          <View style={styles.dots}>
            {BEAT_MS.map((_, i) => (
              <View key={i} style={[styles.dot, i === idx ? styles.dotActive : null]} />
            ))}
          </View>

          <TouchableOpacity
            style={styles.close}
            onPress={onDismiss}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Text style={styles.closeText}>✕</Text>
          </TouchableOpacity>

          <View style={styles.stage}>
            <Animated.View style={[styles.beatWrap, beatStyle]}>{beats[idx]}</Animated.View>
          </View>

          <View style={styles.badge}>
            {hasPhoto ? (
              <Image
                source={{ uri: `data:image/jpeg;base64,${data.agentPhotoBase64}` }}
                style={styles.badgePhoto}
              />
            ) : (
              <View style={styles.badgePhotoFallback}>
                <Text style={styles.badgeFallbackText}>
                  {(data.agentFirstName || 'A').charAt(0).toUpperCase()}
                </Text>
              </View>
            )}
            <Text style={styles.badgeText}>from your agent, {data.agentFirstName}</Text>
          </View>
        </Pressable>
      </LinearGradient>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  dots: {
    position: 'absolute',
    top: 56,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginHorizontal: 3,
    backgroundColor: 'rgba(255,255,255,0.25)',
  },
  dotActive: { width: 16, backgroundColor: '#3DD6C3' },
  close: {
    position: 'absolute',
    top: 50,
    right: 24,
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  closeText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  stage: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 32 },
  beatWrap: { alignItems: 'center' },
  center: { alignItems: 'center' },
  eyebrow: { color: '#9FE1CB', fontSize: 14, marginBottom: 12, letterSpacing: 0.3 },
  headline: {
    color: '#FFFFFF',
    fontSize: 26,
    fontWeight: '700',
    textAlign: 'center',
    lineHeight: 34,
  },
  big: { color: '#FFFFFF', fontSize: 44, fontWeight: '800', marginVertical: 6 },
  sub: { color: '#9FE1CB', fontSize: 15, textAlign: 'center', marginTop: 14, lineHeight: 22 },
  subSmall: { color: '#9FE1CB', fontSize: 13, textAlign: 'center', marginTop: 12, paddingHorizontal: 16 },
  cta: {
    backgroundColor: '#3DD6C3',
    borderRadius: 16,
    paddingVertical: 15,
    paddingHorizontal: 28,
    marginTop: 28,
  },
  ctaText: { color: '#04342C', fontSize: 16, fontWeight: '700' },
  notnow: { color: '#9FE1CB', fontSize: 14, marginTop: 18, opacity: 0.85 },
  badge: {
    position: 'absolute',
    bottom: 44,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  badgePhoto: {
    width: 28,
    height: 28,
    borderRadius: 14,
    marginRight: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.4)',
  },
  badgePhotoFallback: {
    width: 28,
    height: 28,
    borderRadius: 14,
    marginRight: 8,
    backgroundColor: '#3DD6C3',
    justifyContent: 'center',
    alignItems: 'center',
  },
  badgeFallbackText: { color: '#04342C', fontSize: 13, fontWeight: '700' },
  badgeText: { color: '#9FE1CB', fontSize: 13 },
});
