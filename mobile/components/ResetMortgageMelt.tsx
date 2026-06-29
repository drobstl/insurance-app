import React, { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  withSequence,
  interpolate,
  Easing,
} from 'react-native-reanimated';

// DFL concept visual — the interest split, told in dollar signs. The tall "to
// the bank" column drops and its $ squeeze down small; "back to you" rises and
// fills with full-size $. Concept only: $ are a money glyph, never an amount —
// no figures, no payoff date.

const CANVAS_W = 300;
const CANVAS_H = 184;
const BAR_W = 66;
const MAX_BAR = 116;
const BASE_Y = 150;
const MINT = '#3DD6C3';

export interface ResetVisualProps {
  playKey?: number | string;
}

export default function ResetMortgageMelt({ playKey }: ResetVisualProps) {
  const t = useSharedValue(0);
  const pop = useSharedValue(0);

  useEffect(() => {
    t.value = 0;
    pop.value = 0;
    t.value = withTiming(1, { duration: 2200, easing: Easing.inOut(Easing.cubic) });
    pop.value = withDelay(
      2200,
      withSequence(
        withTiming(1, { duration: 220, easing: Easing.out(Easing.quad) }),
        withTiming(0, { duration: 320, easing: Easing.in(Easing.quad) }),
      ),
    );
  }, [playKey, t, pop]);

  // Bar heights — the bank melts down, you rise up.
  const bankFillStyle = useAnimatedStyle(() => ({ height: interpolate(t.value, [0, 1], [0.9, 0.24]) * MAX_BAR }));
  const youFillStyle = useAnimatedStyle(() => ({ height: interpolate(t.value, [0, 1], [0.24, 0.9]) * MAX_BAR + pop.value * 6 }));
  // The $ scale with their bar: squeezed small when low, full size when high.
  const bankDollarStyle = useAnimatedStyle(() => ({ transform: [{ scale: interpolate(t.value, [0, 1], [1, 0.45]) }] }));
  const youDollarStyle = useAnimatedStyle(() => ({ transform: [{ scale: interpolate(t.value, [0, 1], [0.45, 1]) }] }));
  const arrowStyle = useAnimatedStyle(() => ({
    opacity: interpolate(t.value, [0.25, 0.55], [0, 1], 'clamp'),
    transform: [{ translateX: interpolate(t.value, [0.25, 1], [-6, 6], 'clamp') }],
  }));

  return (
    <View style={styles.canvas} pointerEvents="none">
      {/* to the bank — melts down, $ squeeze small */}
      <View style={[styles.col, { left: 34 }]}>
        <View style={styles.track} />
        <Animated.View style={[styles.fill, styles.bankFill, bankFillStyle]}>
          <Animated.Text style={[styles.dollar, styles.bankDollar, bankDollarStyle]}>$</Animated.Text>
        </Animated.View>
      </View>

      {/* transfer arrow */}
      <Animated.Text style={[styles.arrow, arrowStyle]}>→</Animated.Text>

      {/* back to you — rises, fills with full-size $ */}
      <View style={[styles.col, { right: 34 }]}>
        <View style={styles.track} />
        <Animated.View style={[styles.fill, styles.youFill, youFillStyle]}>
          <Animated.Text style={[styles.dollar, styles.youDollar, youDollarStyle]}>$</Animated.Text>
        </Animated.View>
      </View>

      <Text style={[styles.label, styles.bankLabel]}>to the bank</Text>
      <Text style={[styles.label, styles.youLabel]}>back to you</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  canvas: { width: CANVAS_W, height: CANVAS_H, alignSelf: 'center' },
  col: { position: 'absolute', top: BASE_Y - MAX_BAR, width: BAR_W, height: MAX_BAR },
  track: {
    position: 'absolute',
    bottom: 0,
    width: BAR_W,
    height: MAX_BAR,
    borderRadius: 9,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  fill: {
    position: 'absolute',
    bottom: 0,
    width: BAR_W,
    borderRadius: 9,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
  },
  bankFill: { backgroundColor: 'rgba(255,255,255,0.22)' },
  youFill: { backgroundColor: MINT },
  dollar: { fontSize: 34, fontWeight: '800', lineHeight: 38 },
  bankDollar: { color: 'rgba(255,255,255,0.6)' },
  youDollar: { color: '#04342C' },
  arrow: {
    position: 'absolute',
    top: BASE_Y - MAX_BAR / 2 - 14,
    left: 0,
    right: 0,
    textAlign: 'center',
    color: MINT,
    fontSize: 26,
    fontWeight: '700',
  },
  label: { position: 'absolute', top: BASE_Y + 10, fontSize: 13, fontWeight: '600' },
  bankLabel: { left: 34, width: BAR_W, textAlign: 'center', color: 'rgba(255,255,255,0.6)' },
  youLabel: { right: 34, width: BAR_W, textAlign: 'center', color: MINT },
});
