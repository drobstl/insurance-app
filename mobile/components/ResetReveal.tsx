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
  useWindowDimensions,
  type GestureResponderEvent,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  withRepeat,
  interpolate,
  Easing,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import type { ResetRevealData } from '../lib/reset-reveal-client';
import ResetGrowthGraph from './ResetGrowthGraph';
import ResetMortgageMelt from './ResetMortgageMelt';
import ResetMoneyLoop from './ResetMoneyLoop';
import ResetTaxBucket from './ResetTaxBucket';
import ResetGuidance from './ResetGuidance';
import {
  resetDeck,
  RESET_OPENER,
  RESET_ASK_HEADLINE,
  RESET_ASK_CTA,
  type ResetVisual,
} from '../lib/reset-products';

const fmtUsd = (n: number) => '$' + Math.round(n).toLocaleString('en-US');

// The reveal is six tap-through beats (see `beats` below). Keep in sync.
const BEAT_COUNT = 6;
const LAST = BEAT_COUNT - 1;

// Each product's beat 4 draws its own concept visual. All take a `playKey` so
// the animation restarts when the client taps into the beat.
function renderVisual(visual: ResetVisual, playKey: number) {
  switch (visual) {
    case 'melt':
      return <ResetMortgageMelt playKey={playKey} />;
    case 'loop':
      return <ResetMoneyLoop playKey={playKey} />;
    case 'bucket':
      return <ResetTaxBucket playKey={playKey} />;
    case 'guidance':
      return <ResetGuidance playKey={playKey} />;
    case 'graph':
    default:
      return <ResetGrowthGraph playKey={playKey} />;
  }
}

export interface ResetRevealProps {
  visible: boolean;
  data: ResetRevealData;
  onEngage: () => void;
  onDismiss: () => void;
}

/**
 * The in-app reset reveal — a full-screen, tap-through story framed as something
 * the client's agent made for them. The server matches the client to one of five
 * doors (data.product); this renders that door's copy + concept visual.
 *
 * The client paces it: tap the right side for the next beat, the left side to
 * go back. (No auto-play — it was too fast.)
 *
 * Compliance: the DFL door shows their real mortgage balance / payment (their
 * own facts); every visual is concept-only. It never renders a projected payoff
 * date, cash value, tax outcome, or return — those are the licensed
 * specialist's illustration.
 */
export default function ResetReveal({ visible, data, onEngage, onDismiss }: ResetRevealProps) {
  const [idx, setIdx] = useState(0);
  const { width } = useWindowDimensions();
  const beatOpacity = useSharedValue(0);
  const beatTranslateY = useSharedValue(14);
  const hintPulse = useSharedValue(0);

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

  const beatStyle = useAnimatedStyle(() => ({
    opacity: beatOpacity.value,
    transform: [{ translateY: beatTranslateY.value }],
  }));

  // A gentle, looping "you can tap" cue — without it a first-timer has no way to
  // know the screen advances on tap.
  useEffect(() => {
    if (!visible) return;
    hintPulse.value = 0;
    hintPulse.value = withRepeat(
      withTiming(1, { duration: 1100, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
  }, [visible, hintPulse]);
  const hintStyle = useAnimatedStyle(() => ({
    opacity: interpolate(hintPulse.value, [0, 1], [0.4, 0.95]),
  }));
  const hintChevronStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: interpolate(hintPulse.value, [0, 1], [0, 5]) }],
  }));

  // Tap-to-advance: the left third goes back, the rest goes forward
  // (stories-style). Buttons sit on top and capture their own taps.
  const handleTap = (e: GestureResponderEvent) => {
    const x = e.nativeEvent.locationX;
    if (x < width * 0.32) setIdx((i) => Math.max(i - 1, 0));
    else setIdx((i) => Math.min(i + 1, LAST));
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

  const deck = resetDeck(data.product);
  const firstName = data.firstName || 'friend';
  const showMortgageFact = !!deck.usesMortgageFact && data.hasRealNumbers && data.mortgageBalance != null;

  const beats: React.ReactNode[] = [
    // 1 — opener
    <Text key="b0" style={styles.headline}>{RESET_OPENER.replace('{name}', firstName)}</Text>,
    // 2 — the hook. DFL shows the client's real mortgage number; the rest frame
    // the concept in words.
    deck.usesMortgageFact ? (
      <View key="b1" style={styles.center}>
        {deck.hookEyebrow ? <Text style={styles.eyebrow}>{deck.hookEyebrow}</Text> : null}
        {showMortgageFact ? (
          <Text style={styles.big}>{fmtUsd(data.mortgageBalance as number)}</Text>
        ) : (
          <Text style={styles.headline}>{deck.hookHeadline}</Text>
        )}
        {data.monthlyPayment != null ? (
          <Text style={styles.sub}>{fmtUsd(data.monthlyPayment)} a month, year after year.</Text>
        ) : null}
      </View>
    ) : (
      <Text key="b1" style={styles.headline}>{deck.hookHeadline}</Text>
    ),
    // 3 — the turn
    <Text key="b2" style={styles.headline}>{deck.turn}</Text>,
    // 4 — the concept visual + the line that lands with it
    <View key="b3" style={styles.center}>
      <Text style={[styles.headline, styles.graphHeadline]}>{deck.visualHeadline}</Text>
      {renderVisual(deck.visual, idx)}
      <Text style={styles.sub}>{deck.visualCaption}</Text>
    </View>,
    // 5 — the payoff
    <View key="b4" style={styles.center}>
      <Text style={styles.headline}>{deck.payoffHeadline}</Text>
      <Text style={styles.sub}>{deck.payoffSub}</Text>
    </View>,
    // 6 — the ask
    <View key="b5" style={styles.center}>
      <Text style={styles.headline}>{RESET_ASK_HEADLINE}</Text>
      <TouchableOpacity style={styles.cta} onPress={handleEngage} activeOpacity={0.85}>
        <Text style={styles.ctaText}>{RESET_ASK_CTA}</Text>
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
        <Pressable style={styles.fill} onPress={handleTap}>
          <View style={styles.dots}>
            {Array.from({ length: BEAT_COUNT }).map((_, i) => (
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

          {idx < LAST ? (
            <Animated.View style={[styles.tapHint, hintStyle]} pointerEvents="none">
              <Text style={styles.tapHintText}>Tap to continue</Text>
              <Animated.Text style={[styles.tapHintChevron, hintChevronStyle]}>›</Animated.Text>
            </Animated.View>
          ) : null}

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
  graphHeadline: { fontSize: 23, lineHeight: 30, marginBottom: 18 },
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
  tapHint: {
    position: 'absolute',
    bottom: 92,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  tapHintText: { color: 'rgba(255,255,255,0.8)', fontSize: 13, fontWeight: '600', letterSpacing: 0.2 },
  tapHintChevron: { color: '#3DD6C3', fontSize: 18, fontWeight: '800', marginLeft: 5, marginTop: -1 },
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
