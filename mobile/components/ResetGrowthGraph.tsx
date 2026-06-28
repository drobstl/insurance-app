import React, { useEffect, useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  useDerivedValue,
  withTiming,
  withSequence,
  withDelay,
  interpolate,
  Easing,
  type SharedValue,
} from 'react-native-reanimated';

// Concept-only growth visual for the reset reveal — drawn with plain Views +
// reanimated so it ships in an over-the-air update (no native SVG/Skia module).
//
// Compliance: this is a SHAPE, not a projection. There are no axes, no dollar
// figures, no dates, no percentages — just "your money" holding and climbing
// while "the market" dips. The licensed specialist presents real numbers.

const CANVAS_W = 300;
const CANVAS_H = 170;
const PAD_X = 18;
const PAD_TOP = 24; // headroom for the floating labels
const PAD_BOTTOM = 16;

const PLOT_W = CANVAS_W - PAD_X * 2;
const PLOT_H = CANVAS_H - PAD_TOP - PAD_BOTTOM;

// The crash window, in normalized x. The draw deliberately slows across it
// (the "hold") so the flat plateau reads as steadiness while the market drops.
const CRASH_LO = 0.46;
const CRASH_HI = 0.6;

const MINT = '#3DD6C3';

type Pt = readonly [number, number]; // [x 0..1, y 0..1 bottom→top]

// "Your money": climbs, flattens across the crash (holds steady), keeps climbing.
const YOUR_MONEY: Pt[] = [
  [0.0, 0.12],
  [0.1, 0.18],
  [0.2, 0.25],
  [0.3, 0.33],
  [0.4, 0.42],
  [0.46, 0.47],
  [0.5, 0.485],
  [0.55, 0.49],
  [0.6, 0.495],
  [0.66, 0.55],
  [0.74, 0.64],
  [0.82, 0.74],
  [0.9, 0.83],
  [1.0, 0.93],
];

// "The market": tracks early, peaks, plunges through the crash with a little
// jagged shudder, then recovers but stays well below. Same x grid → the reveal
// front advances both lines in lockstep.
const MARKET: Pt[] = [
  [0.0, 0.12],
  [0.1, 0.18],
  [0.2, 0.25],
  [0.3, 0.33],
  [0.4, 0.41],
  [0.46, 0.44],
  [0.5, 0.32],
  [0.55, 0.2],
  [0.6, 0.15],
  [0.66, 0.2],
  [0.74, 0.17],
  [0.82, 0.22],
  [0.9, 0.25],
  [1.0, 0.3],
];

const toPx = ([x, y]: Pt) => ({
  x: PAD_X + x * PLOT_W,
  y: PAD_TOP + (1 - y) * PLOT_H, // invert: y=1 is the top
});

interface SegGeom {
  left: number;
  top: number;
  width: number;
  angle: string;
  threshold: number; // progress value at which this segment is fully drawn
}

/** Pre-compute the rotated-bar geometry for each segment of a polyline. */
function buildSegments(points: Pt[], strokeWidth: number): SegGeom[] {
  const segs: SegGeom[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const a = toPx(points[i]);
    const b = toPx(points[i + 1]);
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const length = Math.sqrt(dx * dx + dy * dy);
    const angleDeg = (Math.atan2(dy, dx) * 180) / Math.PI;
    const midX = (a.x + b.x) / 2;
    const midY = (a.y + b.y) / 2;
    // Center-rotate a bar placed at the segment midpoint so its ends land on
    // the two points. A small overlap closes the seams between segments.
    const drawW = length + strokeWidth * 0.6;
    segs.push({
      left: midX - drawW / 2,
      top: midY - strokeWidth / 2,
      width: drawW,
      angle: `${angleDeg}deg`,
      threshold: points[i + 1][0], // reveal once the pen passes the end point
    });
  }
  return segs;
}

function Segment({
  geom,
  color,
  strokeWidth,
  maxOpacity,
  progress,
}: {
  geom: SegGeom;
  color: string;
  strokeWidth: number;
  maxOpacity: number;
  progress: SharedValue<number>;
}) {
  const band = 0.045; // how quickly a segment fades in as the pen reaches it
  const style = useAnimatedStyle(() => ({
    opacity: interpolate(
      progress.value,
      [geom.threshold - band, geom.threshold],
      [0, maxOpacity],
      'clamp',
    ),
  }));
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {
          position: 'absolute',
          left: geom.left,
          top: geom.top,
          width: geom.width,
          height: strokeWidth,
          borderRadius: strokeWidth / 2,
          backgroundColor: color,
          transform: [{ rotate: geom.angle }],
        },
        style,
      ]}
    />
  );
}

function PolyLine({
  points,
  color,
  strokeWidth,
  maxOpacity,
  progress,
}: {
  points: Pt[];
  color: string;
  strokeWidth: number;
  maxOpacity: number;
  progress: SharedValue<number>;
}) {
  const segs = useMemo(() => buildSegments(points, strokeWidth), [points, strokeWidth]);
  return (
    <>
      {segs.map((g, i) => (
        <Segment
          key={i}
          geom={g}
          color={color}
          strokeWidth={strokeWidth}
          maxOpacity={maxOpacity}
          progress={progress}
        />
      ))}
    </>
  );
}

export interface ResetGrowthGraphProps {
  /** Restart the draw whenever this changes (e.g. the beat index). */
  playKey?: number | string;
}

/**
 * The animated "your money vs the market" line graph. Your-money climbs, holds
 * flat through a market crash (a "holds steady" tag lands in the pause), then
 * keeps climbing; the end point pulses once. Concept only — no numbers.
 */
export default function ResetGrowthGraph({ playKey }: ResetGrowthGraphProps) {
  const progress = useSharedValue(0);
  const endPulse = useSharedValue(0);

  const endPt = useMemo(() => toPx(YOUR_MONEY[YOUR_MONEY.length - 1]), []);

  useEffect(() => {
    progress.value = 0;
    endPulse.value = 0;
    // Slow climb → a long, slow crossing of the crash window (the hold) → climb.
    progress.value = withSequence(
      withTiming(CRASH_LO, { duration: 1500, easing: Easing.out(Easing.cubic) }),
      withTiming(CRASH_HI, { duration: 1700, easing: Easing.inOut(Easing.quad) }),
      withTiming(1, { duration: 1700, easing: Easing.out(Easing.cubic) }),
    );
    // One pulse on the end point once the line finishes (≈ total of the above).
    endPulse.value = withDelay(
      4900,
      withSequence(
        withTiming(1, { duration: 240, easing: Easing.out(Easing.quad) }),
        withTiming(0, { duration: 360, easing: Easing.in(Easing.quad) }),
      ),
    );
  }, [playKey, progress, endPulse]);

  // A tremor that rides the draw front through the crash, then settles. Tied to
  // progress (not time) so it stays in sync with where the market line is drawn.
  const shudder = useDerivedValue(() => {
    const p = progress.value;
    if (p <= CRASH_LO || p >= CRASH_HI + 0.02) return 0;
    const t = (p - CRASH_LO) / (CRASH_HI + 0.02 - CRASH_LO);
    const envelope = Math.sin(t * Math.PI); // 0 → 1 → 0 across the window
    return Math.sin(t * 26) * envelope * 2.6; // ±2.6px, many cycles
  });

  const marketStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: shudder.value }, { translateY: shudder.value * 0.5 }],
  }));

  const holdsSteadyStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0.5, 0.56, 0.66], [0, 1, 1], 'clamp'),
    transform: [
      { translateY: interpolate(progress.value, [0.5, 0.58], [6, 0], 'clamp') },
    ],
  }));

  const yourMoneyLabelStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0.78, 0.95], [0, 1], 'clamp'),
  }));
  const marketLabelStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0.6, 0.8], [0, 0.6], 'clamp'),
  }));

  const endDotStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0.95, 1], [0, 1], 'clamp'),
    transform: [{ scale: 1 + endPulse.value * 0.55 }],
  }));
  const endHaloStyle = useAnimatedStyle(() => ({
    opacity: endPulse.value * 0.5,
    transform: [{ scale: 0.8 + endPulse.value * 1.6 }],
  }));

  return (
    <View style={styles.canvas} pointerEvents="none">
      {/* The market line (faint), with its crash shudder. */}
      <Animated.View style={[StyleSheet.absoluteFill, marketStyle]}>
        <PolyLine
          points={MARKET}
          color="#FFFFFF"
          strokeWidth={2.5}
          maxOpacity={0.34}
          progress={progress}
        />
      </Animated.View>

      {/* Your-money line (thick mint), drawn on top. */}
      <PolyLine
        points={YOUR_MONEY}
        color={MINT}
        strokeWidth={4.5}
        maxOpacity={1}
        progress={progress}
      />

      {/* End-point pulse. */}
      <Animated.View
        style={[
          styles.endHalo,
          { left: endPt.x - 13, top: endPt.y - 13 },
          endHaloStyle,
        ]}
      />
      <Animated.View
        style={[styles.endDot, { left: endPt.x - 5, top: endPt.y - 5 }, endDotStyle]}
      />

      {/* Floating labels — concept words only, never numbers. */}
      <Animated.Text style={[styles.yourMoneyLabel, yourMoneyLabelStyle]}>
        your money
      </Animated.Text>
      <Animated.Text style={[styles.marketLabel, marketLabelStyle]}>
        the market
      </Animated.Text>
      <Animated.View style={[styles.holdsSteady, holdsSteadyStyle]}>
        <Text style={styles.holdsSteadyText}>holds steady</Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  canvas: {
    width: CANVAS_W,
    height: CANVAS_H,
    alignSelf: 'center',
  },
  endDot: {
    position: 'absolute',
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: MINT,
  },
  endHalo: {
    position: 'absolute',
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: MINT,
  },
  yourMoneyLabel: {
    position: 'absolute',
    right: 6,
    top: PAD_TOP - 18,
    color: MINT,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  marketLabel: {
    position: 'absolute',
    right: 6,
    bottom: PAD_BOTTOM - 2,
    color: 'rgba(255,255,255,0.55)',
    fontSize: 11,
    fontWeight: '600',
  },
  holdsSteady: {
    position: 'absolute',
    left: PAD_X + PLOT_W * 0.5 - 44,
    top: PAD_TOP + PLOT_H * 0.36,
    backgroundColor: 'rgba(61,214,195,0.16)',
    borderColor: 'rgba(61,214,195,0.5)',
    borderWidth: 1,
    borderRadius: 11,
    paddingHorizontal: 9,
    paddingVertical: 3,
  },
  holdsSteadyText: {
    color: '#BFF3E9',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
});
