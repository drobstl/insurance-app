import React, { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withRepeat,
  Easing,
} from 'react-native-reanimated';

// IBC concept visual — your money circles back to you instead of out the door.
// A coin orbits a ring around a "you" hub (it keeps coming home), while a faint
// "the bank" sits off to the side where the money no longer goes. Concept only.

const CANVAS_W = 300;
const CANVAS_H = 184;
const RING = 120; // ring diameter
const DOT = 14;
const MINT = '#3DD6C3';

export interface ResetVisualProps {
  playKey?: number | string;
}

export default function ResetMoneyLoop({ playKey }: ResetVisualProps) {
  const rot = useSharedValue(0);
  const fade = useSharedValue(0);

  useEffect(() => {
    fade.value = 0;
    rot.value = 0;
    fade.value = withTiming(1, { duration: 600, easing: Easing.out(Easing.ease) });
    rot.value = withRepeat(withTiming(360, { duration: 3400, easing: Easing.linear }), -1, false);
  }, [playKey, rot, fade]);

  const orbitStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rot.value}deg` }],
  }));
  const fadeStyle = useAnimatedStyle(() => ({ opacity: fade.value }));

  return (
    <Animated.View style={[styles.canvas, fadeStyle]} pointerEvents="none">
      {/* faint "the bank" — where the money no longer goes */}
      <View style={styles.bank}>
        <Text style={styles.bankText}>the bank</Text>
      </View>

      <View style={styles.center}>
        {/* the loop the money travels */}
        <View style={styles.ring} />

        {/* the orbiting coin */}
        <Animated.View style={[styles.orbit, orbitStyle]}>
          <View style={styles.dot} />
        </Animated.View>

        {/* you — home base */}
        <View style={styles.hub}>
          <Text style={styles.hubText}>you</Text>
        </View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  canvas: { width: CANVAS_W, height: CANVAS_H, alignSelf: 'center', justifyContent: 'center', alignItems: 'center' },
  center: { width: RING, height: RING, justifyContent: 'center', alignItems: 'center' },
  ring: {
    position: 'absolute',
    width: RING,
    height: RING,
    borderRadius: RING / 2,
    borderWidth: 2,
    borderColor: 'rgba(61,214,195,0.35)',
    borderStyle: 'dashed',
  },
  orbit: { position: 'absolute', width: RING, height: RING },
  dot: {
    position: 'absolute',
    top: -DOT / 2,
    left: RING / 2 - DOT / 2,
    width: DOT,
    height: DOT,
    borderRadius: DOT / 2,
    backgroundColor: MINT,
  },
  hub: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 1.5,
    borderColor: 'rgba(61,214,195,0.6)',
    backgroundColor: 'rgba(61,214,195,0.12)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  hubText: { color: '#BFF3E9', fontSize: 14, fontWeight: '700' },
  bank: {
    position: 'absolute',
    right: 14,
    top: 22,
    opacity: 0.4,
  },
  bankText: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 12,
    fontWeight: '500',
    textDecorationLine: 'line-through',
  },
});
