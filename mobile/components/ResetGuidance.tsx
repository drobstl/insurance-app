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

// QFA concept visual — your money, with a pro in your corner. A stack of savings
// sits beside a trusted guide who steps in; once they do, the stack gets a
// confident lift. Concept only — no figures.

const CANVAS_W = 300;
const CANVAS_H = 184;
const MINT = '#3DD6C3';
const DISCS = [0, 1, 2, 3];

export interface ResetVisualProps {
  playKey?: number | string;
}

export default function ResetGuidance({ playKey }: ResetVisualProps) {
  const stack = useSharedValue(0);
  const pro = useSharedValue(0);
  const lift = useSharedValue(0);

  useEffect(() => {
    stack.value = 0;
    pro.value = 0;
    lift.value = 0;
    stack.value = withTiming(1, { duration: 500, easing: Easing.out(Easing.back(1.4)) });
    pro.value = withDelay(550, withTiming(1, { duration: 650, easing: Easing.out(Easing.cubic) }));
    lift.value = withDelay(
      1250,
      withSequence(
        withTiming(1, { duration: 300, easing: Easing.out(Easing.quad) }),
        withTiming(0.6, { duration: 400, easing: Easing.inOut(Easing.ease) }),
      ),
    );
  }, [playKey, stack, pro, lift]);

  const stackStyle = useAnimatedStyle(() => ({
    opacity: stack.value,
    transform: [
      { scale: 0.85 + stack.value * 0.15 },
      { translateY: interpolate(lift.value, [0, 1], [0, -10], 'clamp') },
    ],
  }));
  const proStyle = useAnimatedStyle(() => ({
    opacity: pro.value,
    transform: [{ translateX: interpolate(pro.value, [0, 1], [40, 0]) }],
  }));
  const arrowStyle = useAnimatedStyle(() => ({
    opacity: interpolate(lift.value, [0, 0.6], [0, 1], 'clamp'),
    transform: [{ translateY: interpolate(lift.value, [0, 1], [6, -6], 'clamp') }],
  }));

  return (
    <View style={styles.canvas} pointerEvents="none">
      <View style={styles.row}>
        {/* your money */}
        <View style={styles.stackCol}>
          <Animated.Text style={[styles.upArrow, arrowStyle]}>↑</Animated.Text>
          <Animated.View style={[styles.stack, stackStyle]}>
            {DISCS.map((i) => (
              <View
                key={i}
                style={[styles.disc, { bottom: i * 13, opacity: 0.7 + i * 0.1 }]}
              />
            ))}
          </Animated.View>
          <Text style={styles.stackLabel}>your money</Text>
        </View>

        {/* a pro in your corner */}
        <Animated.View style={[styles.proCol, proStyle]}>
          <View style={styles.proBadge}>
            <View style={styles.checkShort} />
            <View style={styles.checkLong} />
          </View>
          <Text style={styles.proLabel}>a pro in your{'\n'}corner</Text>
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  canvas: { width: CANVAS_W, height: CANVAS_H, alignSelf: 'center', justifyContent: 'center', alignItems: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 36 },
  stackCol: { alignItems: 'center', width: 96 },
  stack: { width: 76, height: 64, justifyContent: 'flex-end' },
  disc: {
    position: 'absolute',
    alignSelf: 'center',
    width: 76,
    height: 18,
    borderRadius: 9,
    backgroundColor: MINT,
  },
  upArrow: { color: MINT, fontSize: 20, fontWeight: '800', marginBottom: 2, height: 22 },
  stackLabel: { color: '#9FE1CB', fontSize: 12, fontWeight: '600', marginTop: 12 },
  proCol: { alignItems: 'center', width: 96 },
  proBadge: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: MINT,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkShort: {
    position: 'absolute',
    width: 9,
    height: 3.5,
    borderRadius: 2,
    backgroundColor: '#04342C',
    transform: [{ rotate: '45deg' }, { translateX: -6 }, { translateY: 4 }],
  },
  checkLong: {
    position: 'absolute',
    width: 18,
    height: 3.5,
    borderRadius: 2,
    backgroundColor: '#04342C',
    transform: [{ rotate: '-45deg' }, { translateX: 3 }],
  },
  proLabel: { color: '#9FE1CB', fontSize: 12, fontWeight: '600', textAlign: 'center', marginTop: 12 },
});
