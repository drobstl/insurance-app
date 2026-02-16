import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated, Dimensions, Easing } from 'react-native';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

const BALLOON_COLORS = [
  '#FF6B6B', // Red
  '#4ECDC4', // Teal
  '#FFE66D', // Yellow
  '#A78BFA', // Purple
  '#F472B6', // Pink
  '#34D399', // Green
  '#60A5FA', // Blue
  '#FB923C', // Orange
];

// ── Individual Balloon ───────────────────────────────────────────────────────

interface BalloonProps {
  delay: number;
  startX: number;
  color: string;
  size: number;
  duration: number;
}

const Balloon: React.FC<BalloonProps> = ({
  delay,
  startX,
  color,
  size,
  duration,
}) => {
  const translateY = useRef(new Animated.Value(SCREEN_HEIGHT + 60)).current;
  const translateX = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const rotate = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const wobble = (Math.random() - 0.5) * 60;

    Animated.sequence([
      Animated.delay(delay),
      Animated.parallel([
        // Rise up
        Animated.timing(translateY, {
          toValue: -size * 3,
          duration,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        // Gentle horizontal drift
        Animated.timing(translateX, {
          toValue: wobble,
          duration,
          easing: Easing.bezier(0.4, 0, 0.2, 1),
          useNativeDriver: true,
        }),
        // Slight tilt
        Animated.timing(rotate, {
          toValue: (Math.random() - 0.5) * 2,
          duration,
          easing: Easing.bezier(0.4, 0, 0.2, 1),
          useNativeDriver: true,
        }),
        // Fade in quickly, stay visible, fade near top
        Animated.sequence([
          Animated.timing(opacity, {
            toValue: 0.9,
            duration: 400,
            useNativeDriver: true,
          }),
          Animated.delay(duration - 1000),
          Animated.timing(opacity, {
            toValue: 0,
            duration: 600,
            useNativeDriver: true,
          }),
        ]),
      ]),
    ]).start();
  }, [delay, duration, size, translateY, translateX, rotate, opacity]);

  const rotateInterpolate = rotate.interpolate({
    inputRange: [-1, 1],
    outputRange: ['-12deg', '12deg'],
  });

  const balloonWidth = size;
  const balloonHeight = size * 1.25;
  const stringLength = size * 0.7;

  return (
    <Animated.View
      style={{
        position: 'absolute',
        left: startX,
        top: 0,
        alignItems: 'center',
        opacity,
        transform: [
          { translateY },
          { translateX },
          { rotate: rotateInterpolate },
        ],
      }}
    >
      {/* Balloon body */}
      <View
        style={{
          width: balloonWidth,
          height: balloonHeight,
          borderRadius: balloonWidth / 2,
          backgroundColor: color,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.25,
          shadowRadius: 4,
        }}
      >
        {/* Highlight / shine */}
        <View
          style={{
            position: 'absolute',
            top: balloonHeight * 0.15,
            left: balloonWidth * 0.2,
            width: balloonWidth * 0.25,
            height: balloonHeight * 0.3,
            borderRadius: balloonWidth * 0.15,
            backgroundColor: 'rgba(255,255,255,0.35)',
            transform: [{ rotate: '-20deg' }],
          }}
        />
      </View>

      {/* Knot */}
      <View
        style={{
          width: 0,
          height: 0,
          borderLeftWidth: 4,
          borderRightWidth: 4,
          borderTopWidth: 6,
          borderLeftColor: 'transparent',
          borderRightColor: 'transparent',
          borderTopColor: color,
          marginTop: -1,
        }}
      />

      {/* String */}
      <View
        style={{
          width: 1,
          height: stringLength,
          backgroundColor: 'rgba(255,255,255,0.4)',
        }}
      />
    </Animated.View>
  );
};

// ── Balloons Container ───────────────────────────────────────────────────────

interface BalloonsProps {
  isVisible: boolean;
  onComplete?: () => void;
}

const Balloons: React.FC<BalloonsProps> = ({ isVisible, onComplete }) => {
  const completeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pieces = useRef<
    Array<{
      id: number;
      delay: number;
      startX: number;
      color: string;
      size: number;
      duration: number;
    }>
  >([]);

  useEffect(() => {
    if (isVisible && pieces.current.length === 0) {
      const numBalloons = 12;
      for (let i = 0; i < numBalloons; i++) {
        pieces.current.push({
          id: i,
          delay: Math.random() * 2500,
          startX: Math.random() * (SCREEN_WIDTH - 50) + 10,
          color:
            BALLOON_COLORS[Math.floor(Math.random() * BALLOON_COLORS.length)],
          size: Math.random() * 14 + 26,
          duration: Math.random() * 2000 + 4000,
        });
      }
      if (onComplete) {
        if (completeTimerRef.current) {
          clearTimeout(completeTimerRef.current);
        }
        completeTimerRef.current = setTimeout(onComplete, 7500);
      }
    }

    return () => {
      if (completeTimerRef.current) {
        clearTimeout(completeTimerRef.current);
        completeTimerRef.current = null;
      }
    };
  }, [isVisible, onComplete]);

  if (!isVisible) return null;

  return (
    <View style={styles.container} pointerEvents="none">
      {pieces.current.map((piece) => (
        <Balloon
          key={piece.id}
          delay={piece.delay}
          startX={piece.startX}
          color={piece.color}
          size={piece.size}
          duration={piece.duration}
        />
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1000,
    pointerEvents: 'none',
  },
});

export default Balloons;
