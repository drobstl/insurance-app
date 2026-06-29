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

// DFL concept visual — the interest split. A tall "to the bank" column melts
// down while "back to you" rises to take its place. Concept only: no figures,
// no payoff date — just the shape of the trade.

const CANVAS_W = 300;
const CANVAS_H = 184;
const BAR_W = 66;
const MAX_BAR = 116;
const BASE_Y = 150; // baseline the bars sit on
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

  const bankStyle = useAnimatedStyle(() => ({
    height: interpolate(t.value, [0, 1], [0.92, 0.22]) * MAX_BAR,
  }));
  const youStyle = useAnimatedStyle(() => ({
    height: interpolate(t.value, [0, 1], [0.22, 0.92]) * MAX_BAR + pop.value * 6,
  }));
  const arrowStyle = useAnimatedStyle(() => ({
    opacity: interpolate(t.value, [0.25, 0.55], [0, 1], 'clamp'),
    transform: [{ translateX: interpolate(t.value, [0.25, 1], [-6, 6], 'clamp') }],
  }));

  return (
    <View style={styles.canvas} pointerEvents="none">
      {/* to the bank — melts down */}
      <View style={[styles.col, { left: 34 }]}>
        <View style={styles.track} />
        <Animated.View style={[styles.fill, styles.bankFill, bankStyle]} />
      </View>

      {/* transfer arrow */}
      <Animated.Text style={[styles.arrow, arrowStyle]}>→</Animated.Text>

      {/* back to you — rises */}
      <View style={[styles.col, { right: 34 }]}>
        <View style={styles.track} />
        <Animated.View style={[styles.fill, styles.youFill, youStyle]} />
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
  fill: { position: 'absolute', bottom: 0, width: BAR_W, borderRadius: 9 },
  bankFill: { backgroundColor: 'rgba(255,255,255,0.26)' },
  youFill: { backgroundColor: MINT },
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
