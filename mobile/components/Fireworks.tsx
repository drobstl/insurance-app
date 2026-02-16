import React, { useEffect, useRef, useState } from 'react';
import { View, StyleSheet, Animated, Dimensions, Easing } from 'react-native';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

const FIREWORK_COLORS = [
  '#FF3030', // Red
  '#FFFFFF', // White
  '#4488FF', // Blue
  '#FFD700', // Gold
  '#FF6347', // Tomato
  '#87CEEB', // Sky blue
];

// ── Individual Particle ──────────────────────────────────────────────────────

interface ParticleProps {
  centerX: number;
  centerY: number;
  angle: number;
  distance: number;
  color: string;
  size: number;
  delay: number;
  duration: number;
}

const Particle: React.FC<ParticleProps> = ({
  centerX,
  centerY,
  angle,
  distance,
  color,
  size,
  delay,
  duration,
}) => {
  const translateX = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const targetX = Math.cos(angle) * distance;
    const targetY = Math.sin(angle) * distance + 30; // slight gravity

    Animated.sequence([
      Animated.delay(delay),
      Animated.parallel([
        // Expand outward
        Animated.timing(translateX, {
          toValue: targetX,
          duration,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(translateY, {
          toValue: targetY,
          duration,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        // Flash in, then fade out
        Animated.sequence([
          Animated.timing(opacity, {
            toValue: 1,
            duration: 80,
            useNativeDriver: true,
          }),
          Animated.delay(duration * 0.3),
          Animated.timing(opacity, {
            toValue: 0,
            duration: duration * 0.6,
            easing: Easing.in(Easing.quad),
            useNativeDriver: true,
          }),
        ]),
        // Shrink as they fly outward
        Animated.timing(scale, {
          toValue: 0.15,
          duration,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    ]).start();
  }, [angle, delay, distance, duration, opacity, scale, translateX, translateY]);

  return (
    <Animated.View
      style={{
        position: 'absolute',
        left: centerX - size / 2,
        top: centerY - size / 2,
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: color,
        opacity,
        transform: [{ translateX }, { translateY }, { scale }],
      }}
    />
  );
};

// ── Fireworks Container ──────────────────────────────────────────────────────

interface Burst {
  id: number;
  centerX: number;
  centerY: number;
  delay: number;
  particles: Array<{
    id: number;
    angle: number;
    distance: number;
    color: string;
    size: number;
    duration: number;
  }>;
}

interface FireworksProps {
  isVisible: boolean;
  onComplete?: () => void;
}

const Fireworks: React.FC<FireworksProps> = ({ isVisible, onComplete }) => {
  const [bursts, setBursts] = useState<Burst[]>([]);
  const completeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (isVisible && bursts.length === 0) {
      const numBursts = 5;
      const newBursts: Burst[] = [];

      for (let b = 0; b < numBursts; b++) {
        const numParticles = Math.floor(Math.random() * 8) + 22;
        const burstColor =
          FIREWORK_COLORS[Math.floor(Math.random() * FIREWORK_COLORS.length)];
        const particles = [];

        for (let p = 0; p < numParticles; p++) {
          const baseAngle = (p / numParticles) * Math.PI * 2;
          particles.push({
            id: p,
            angle: baseAngle + (Math.random() - 0.5) * 0.3,
            distance: Math.random() * 60 + 70,
            color:
              Math.random() > 0.3
                ? burstColor
                : FIREWORK_COLORS[
                    Math.floor(Math.random() * FIREWORK_COLORS.length)
                  ],
            size: Math.random() * 4 + 3,
            duration: Math.random() * 400 + 900,
          });
        }

        newBursts.push({
          id: b,
          centerX:
            Math.random() * (SCREEN_WIDTH * 0.6) + SCREEN_WIDTH * 0.2,
          centerY:
            Math.random() * (SCREEN_HEIGHT * 0.35) + SCREEN_HEIGHT * 0.1,
          delay: b * 700 + Math.random() * 300,
          particles,
        });
      }

      setBursts(newBursts);

      if (onComplete) {
        if (completeTimerRef.current) {
          clearTimeout(completeTimerRef.current);
        }
        completeTimerRef.current = setTimeout(
          onComplete,
          numBursts * 700 + 2500,
        );
      }
    }

    return () => {
      if (completeTimerRef.current) {
        clearTimeout(completeTimerRef.current);
        completeTimerRef.current = null;
      }
    };
  }, [isVisible]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!isVisible || bursts.length === 0) return null;

  return (
    <View style={styles.container} pointerEvents="none">
      {bursts.map((burst) =>
        burst.particles.map((particle) => (
          <Particle
            key={`${burst.id}-${particle.id}`}
            centerX={burst.centerX}
            centerY={burst.centerY}
            angle={particle.angle}
            distance={particle.distance}
            color={particle.color}
            size={particle.size}
            delay={burst.delay}
            duration={particle.duration}
          />
        )),
      )}
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

export default Fireworks;
