import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated, Dimensions, Easing } from 'react-native';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

const NUM_SNOWFLAKES = 60;

// ── Individual Snowflake ─────────────────────────────────────────────────────

interface SnowflakeProps {
  delay: number;
  startX: number;
  size: number;
  duration: number;
  maxOpacity: number;
}

const Snowflake: React.FC<SnowflakeProps> = ({
  delay,
  startX,
  size,
  duration,
  maxOpacity,
}) => {
  const translateY = useRef(new Animated.Value(-20)).current;
  const translateX = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const drift = (Math.random() - 0.5) * 100;

    Animated.sequence([
      Animated.delay(delay),
      Animated.parallel([
        Animated.timing(translateY, {
          toValue: SCREEN_HEIGHT + 20,
          duration,
          easing: Easing.linear,
          useNativeDriver: true,
        }),
        Animated.timing(translateX, {
          toValue: drift,
          duration,
          easing: Easing.bezier(0.4, 0, 0.6, 1),
          useNativeDriver: true,
        }),
        Animated.sequence([
          Animated.timing(opacity, {
            toValue: maxOpacity,
            duration: 400,
            useNativeDriver: true,
          }),
          Animated.delay(duration - 800),
          Animated.timing(opacity, {
            toValue: 0,
            duration: 400,
            useNativeDriver: true,
          }),
        ]),
      ]),
    ]).start();
  }, [delay, duration, translateY, translateX, opacity, maxOpacity]);

  return (
    <Animated.View
      style={{
        position: 'absolute',
        left: startX,
        top: 0,
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: '#FFFFFF',
        opacity,
        transform: [{ translateY }, { translateX }],
      }}
    />
  );
};

// ── Snowfall Container ───────────────────────────────────────────────────────

interface SnowfallProps {
  isVisible: boolean;
  onComplete?: () => void;
}

const Snowfall: React.FC<SnowfallProps> = ({ isVisible, onComplete }) => {
  const completeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pieces = useRef<
    Array<{
      id: number;
      delay: number;
      startX: number;
      size: number;
      duration: number;
      maxOpacity: number;
    }>
  >([]);

  useEffect(() => {
    if (isVisible && pieces.current.length === 0) {
      for (let i = 0; i < NUM_SNOWFLAKES; i++) {
        pieces.current.push({
          id: i,
          delay: Math.random() * 3000,
          startX: Math.random() * SCREEN_WIDTH,
          size: Math.random() * 5 + 2,
          duration: Math.random() * 3000 + 4000,
          maxOpacity: Math.random() * 0.4 + 0.6,
        });
      }
      if (onComplete) {
        if (completeTimerRef.current) {
          clearTimeout(completeTimerRef.current);
        }
        completeTimerRef.current = setTimeout(onComplete, 8000);
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
        <Snowflake
          key={piece.id}
          delay={piece.delay}
          startX={piece.startX}
          size={piece.size}
          duration={piece.duration}
          maxOpacity={piece.maxOpacity}
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

export default Snowfall;
