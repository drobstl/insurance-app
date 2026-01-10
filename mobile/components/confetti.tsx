import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated, Dimensions, Easing } from 'react-native';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

const CONFETTI_COLORS = [
  '#E63946', // Red
  '#2A9D8F', // Teal
  '#E9C46A', // Yellow
  '#457B9D', // Blue
  '#F4A261', // Orange
  '#84A98C', // Green
  '#F72585', // Pink
  '#4CC9F0', // Light Blue
];

interface ConfettiPieceProps {
  delay: number;
  startX: number;
  color: string;
  size: number;
  duration: number;
}

const ConfettiPiece: React.FC<ConfettiPieceProps> = ({ delay, startX, color, size, duration }) => {
  const translateY = useRef(new Animated.Value(-50)).current;
  const translateX = useRef(new Animated.Value(0)).current;
  const rotate = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const horizontalDrift = (Math.random() - 0.5) * 150;
    
    Animated.sequence([
      Animated.delay(delay),
      Animated.parallel([
        Animated.timing(translateY, {
          toValue: SCREEN_HEIGHT + 100,
          duration: duration,
          easing: Easing.linear,
          useNativeDriver: true,
        }),
        Animated.timing(translateX, {
          toValue: horizontalDrift,
          duration: duration,
          easing: Easing.bezier(0.25, 0.1, 0.25, 1),
          useNativeDriver: true,
        }),
        Animated.timing(rotate, {
          toValue: Math.random() * 10 - 5,
          duration: duration,
          easing: Easing.linear,
          useNativeDriver: true,
        }),
        Animated.sequence([
          Animated.delay(duration * 0.7),
          Animated.timing(opacity, {
            toValue: 0,
            duration: duration * 0.3,
            useNativeDriver: true,
          }),
        ]),
      ]),
    ]).start();
  }, [delay, duration, translateY, translateX, rotate, opacity]);

  const rotateInterpolate = rotate.interpolate({
    inputRange: [-5, 5],
    outputRange: ['-180deg', '180deg'],
  });

  return (
    <Animated.View
      style={[
        styles.confettiPiece,
        {
          left: startX,
          width: size,
          height: size * 1.5,
          backgroundColor: color,
          borderRadius: size * 0.15,
          transform: [
            { translateY },
            { translateX },
            { rotate: rotateInterpolate },
          ],
          opacity,
        },
      ]}
    />
  );
};

interface ConfettiProps {
  isVisible: boolean;
  onComplete?: () => void;
}

const Confetti: React.FC<ConfettiProps> = ({ isVisible, onComplete }) => {
  const pieces = useRef<Array<{
    id: number;
    delay: number;
    startX: number;
    color: string;
    size: number;
    duration: number;
  }>>([]);

  useEffect(() => {
    if (isVisible && pieces.current.length === 0) {
      // Generate confetti pieces
      const numPieces = 80;
      for (let i = 0; i < numPieces; i++) {
        pieces.current.push({
          id: i,
          delay: Math.random() * 1500, // Staggered start over 1.5 seconds
          startX: Math.random() * SCREEN_WIDTH,
          color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
          size: Math.random() * 10 + 6, // 6-16px
          duration: Math.random() * 2000 + 3000, // 3-5 seconds to fall
        });
      }
      
      // Call onComplete after animation finishes
      if (onComplete) {
        setTimeout(onComplete, 5500);
      }
    }
  }, [isVisible, onComplete]);

  if (!isVisible) return null;

  return (
    <View style={styles.container} pointerEvents="none">
      {pieces.current.map((piece) => (
        <ConfettiPiece
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
  confettiPiece: {
    position: 'absolute',
    top: 0,
  },
});

export default Confetti;
