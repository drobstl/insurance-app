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

// IUL concept visual — a pool you build now and reach for later, with a lid the
// taxman can't lift. A jar fills with mint; a shield line caps it as a coin tries
// to slip past from above. Concept only — no figures, no rates.

const CANVAS_W = 300;
const CANVAS_H = 184;
const JAR_W = 104;
const JAR_H = 132;
const WALL = 2;
const INNER_H = JAR_H - WALL * 2;
const FILL_MAX = INNER_H * 0.82;
const MINT = '#3DD6C3';

export interface ResetVisualProps {
  playKey?: number | string;
}

export default function ResetTaxBucket({ playKey }: ResetVisualProps) {
  const fill = useSharedValue(0);
  const coin = useSharedValue(0);
  const shield = useSharedValue(0);

  useEffect(() => {
    fill.value = 0;
    coin.value = 0;
    shield.value = 0;
    coin.value = withTiming(1, { duration: 900, easing: Easing.in(Easing.quad) });
    fill.value = withDelay(700, withTiming(1, { duration: 1900, easing: Easing.out(Easing.cubic) }));
    shield.value = withDelay(
      1500,
      withSequence(
        withTiming(1, { duration: 360, easing: Easing.out(Easing.quad) }),
        withTiming(0.7, { duration: 500, easing: Easing.inOut(Easing.ease) }),
      ),
    );
  }, [playKey, fill, coin, shield]);

  const fillStyle = useAnimatedStyle(() => ({ height: fill.value * FILL_MAX }));
  const labelStyle = useAnimatedStyle(() => ({ opacity: interpolate(fill.value, [0.5, 0.85], [0, 1], 'clamp') }));
  // A coin drops from above and is turned away at the lid (it never gets in).
  const coinStyle = useAnimatedStyle(() => ({
    opacity: interpolate(coin.value, [0, 0.7, 1], [0, 1, 0], 'clamp'),
    transform: [{ translateY: interpolate(coin.value, [0, 1], [-44, -6], 'clamp') }],
  }));
  const shieldStyle = useAnimatedStyle(() => ({
    opacity: interpolate(shield.value, [0, 1], [0.3, 1]),
    transform: [{ scaleX: 0.9 + shield.value * 0.1 }],
  }));

  return (
    <View style={styles.canvas} pointerEvents="none">
      <Text style={styles.taxLabel}>taxes</Text>
      <Animated.View style={[styles.coin, coinStyle]} />

      <View style={styles.jarWrap}>
        {/* the protective lid / shield */}
        <Animated.View style={[styles.shield, shieldStyle]} />
        <View style={styles.jar}>
          <Animated.View style={[styles.fill, fillStyle]}>
            <View style={styles.wave} />
          </Animated.View>
          <Animated.Text style={[styles.keepText, labelStyle]}>yours{'\n'}to keep</Animated.Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  canvas: { width: CANVAS_W, height: CANVAS_H, alignSelf: 'center', justifyContent: 'center', alignItems: 'center' },
  taxLabel: { position: 'absolute', top: 8, color: 'rgba(255,255,255,0.45)', fontSize: 12, fontWeight: '500' },
  coin: {
    position: 'absolute',
    top: 30,
    width: 13,
    height: 13,
    borderRadius: 6.5,
    backgroundColor: 'rgba(255,255,255,0.5)',
  },
  jarWrap: { marginTop: 18, alignItems: 'center' },
  shield: {
    width: JAR_W + 14,
    height: 4,
    borderRadius: 2,
    backgroundColor: MINT,
    marginBottom: 6,
    shadowColor: MINT,
    shadowOpacity: 0.6,
    shadowRadius: 6,
  },
  jar: {
    width: JAR_W,
    height: JAR_H,
    borderWidth: WALL,
    borderColor: 'rgba(255,255,255,0.28)',
    borderRadius: 16,
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
    overflow: 'hidden',
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  fill: { width: '100%', backgroundColor: MINT, borderTopLeftRadius: 4, borderTopRightRadius: 4 },
  wave: { position: 'absolute', top: 0, left: 0, right: 0, height: 3, backgroundColor: '#BFF3E9' },
  keepText: {
    position: 'absolute',
    bottom: 16,
    color: '#04342C',
    fontSize: 13,
    fontWeight: '800',
    textAlign: 'center',
  },
});
