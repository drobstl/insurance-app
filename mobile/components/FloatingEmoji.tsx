import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Dimensions, Easing } from 'react-native';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// ── Individual Floating Piece ────────────────────────────────────────────────

interface FloatingPieceProps {
  emoji: string;
  delay: number;
  startX: number;
  size: number;
  duration: number;
  direction: 'up' | 'down';
}

const FloatingPiece: React.FC<FloatingPieceProps> = ({
  emoji,
  delay,
  startX,
  size,
  duration,
  direction,
}) => {
  const startY = direction === 'down' ? -40 : SCREEN_HEIGHT + 40;
  const endY = direction === 'down' ? SCREEN_HEIGHT + 40 : -40;

  const translateY = useRef(new Animated.Value(startY)).current;
  const translateX = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const rotate = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const drift = (Math.random() - 0.5) * 120;

    Animated.sequence([
      Animated.delay(delay),
      Animated.parallel([
        Animated.timing(translateY, {
          toValue: endY,
          duration,
          easing: Easing.linear,
          useNativeDriver: true,
        }),
        Animated.timing(translateX, {
          toValue: drift,
          duration,
          easing: Easing.bezier(0.3, 0, 0.7, 1),
          useNativeDriver: true,
        }),
        Animated.timing(rotate, {
          toValue: (Math.random() - 0.5) * 4,
          duration,
          easing: Easing.linear,
          useNativeDriver: true,
        }),
        Animated.sequence([
          Animated.timing(opacity, {
            toValue: Math.random() * 0.3 + 0.3,
            duration: 600,
            useNativeDriver: true,
          }),
          Animated.delay(duration - 1400),
          Animated.timing(opacity, {
            toValue: 0,
            duration: 800,
            useNativeDriver: true,
          }),
        ]),
      ]),
    ]).start();
  }, [delay, duration, endY, translateY, translateX, rotate, opacity]);

  const rotateInterpolate = rotate.interpolate({
    inputRange: [-2, 2],
    outputRange: ['-45deg', '45deg'],
  });

  return (
    <Animated.View
      style={{
        position: 'absolute',
        left: startX,
        top: 0,
        opacity,
        transform: [
          { translateY },
          { translateX },
          { rotate: rotateInterpolate },
        ],
      }}
    >
      <Text style={{ fontSize: size }}>{emoji}</Text>
    </Animated.View>
  );
};

// ── Floating Emoji Container ─────────────────────────────────────────────────

interface FloatingEmojiProps {
  isVisible: boolean;
  /** Array of emoji to randomly pick from */
  emoji: string[];
  /** Whether emoji float up or drift down */
  direction?: 'up' | 'down';
  /** Number of emoji to generate */
  count?: number;
  onComplete?: () => void;
}

const FloatingEmoji: React.FC<FloatingEmojiProps> = ({
  isVisible,
  emoji,
  direction = 'down',
  count = 18,
  onComplete,
}) => {
  const completeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pieces = useRef<
    Array<{
      id: number;
      emoji: string;
      delay: number;
      startX: number;
      size: number;
      duration: number;
    }>
  >([]);

  useEffect(() => {
    if (isVisible && pieces.current.length === 0) {
      for (let i = 0; i < count; i++) {
        pieces.current.push({
          id: i,
          emoji: emoji[Math.floor(Math.random() * emoji.length)],
          delay: Math.random() * 4000,
          startX: Math.random() * SCREEN_WIDTH,
          size: Math.random() * 12 + 14,
          duration: Math.random() * 3000 + 5000,
        });
      }
      if (onComplete) {
        if (completeTimerRef.current) {
          clearTimeout(completeTimerRef.current);
        }
        completeTimerRef.current = setTimeout(onComplete, 10000);
      }
    }

    return () => {
      if (completeTimerRef.current) {
        clearTimeout(completeTimerRef.current);
        completeTimerRef.current = null;
      }
    };
  }, [isVisible, emoji, count, onComplete]);

  if (!isVisible) return null;

  return (
    <View style={styles.container} pointerEvents="none">
      {pieces.current.map((piece) => (
        <FloatingPiece
          key={piece.id}
          emoji={piece.emoji}
          delay={piece.delay}
          startX={piece.startX}
          size={piece.size}
          duration={piece.duration}
          direction={direction}
        />
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 999,
    pointerEvents: 'none',
  },
});

export default FloatingEmoji;
