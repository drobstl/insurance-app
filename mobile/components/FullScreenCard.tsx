import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Image,
  Modal,
  Dimensions,
  Linking,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  withSpring,
  Easing,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import Confetti from './confetti';
import Snowfall from './Snowfall';
import Fireworks from './Fireworks';
import Balloons from './Balloons';
import FloatingEmoji from './FloatingEmoji';
import { type CardTheme } from '../lib/holidayThemes';

// ── Props ────────────────────────────────────────────────────────────────────

export interface FullScreenCardProps {
  visible: boolean;
  onClose: () => void;
  /** Resolved theme for this card */
  theme: CardTheme;
  /** Notification type */
  type: string;
  /** Client's first name for the greeting */
  clientName?: string;
  /** Notification title (fallback for greeting) */
  title: string;
  /** Notification body text */
  body: string;
  /** Agent branding */
  agentName?: string;
  agentPhotoBase64?: string;
  agencyName?: string;
  agencyLogoBase64?: string;
  /** Booking */
  includeBookingLink?: boolean;
  schedulingUrl?: string;
}

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// ── Component ────────────────────────────────────────────────────────────────

export default function FullScreenCard({
  visible,
  onClose,
  theme,
  type,
  clientName,
  title,
  body,
  agentName,
  agentPhotoBase64,
  agencyName,
  agencyLogoBase64,
  includeBookingLink,
  schedulingUrl,
}: FullScreenCardProps) {
  const [showConfetti, setShowConfetti] = useState(false);
  const effectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Animation values
  const contentOpacity = useSharedValue(0);
  const contentTranslateY = useSharedValue(30);
  const photoScale = useSharedValue(0.6);

  // ── Entrance Animation ───────────────────────────────────────────────────

  useEffect(() => {
    if (visible) {
      // Reset
      contentOpacity.value = 0;
      contentTranslateY.value = 30;
      photoScale.value = 0.6;

      // Animate in
      photoScale.value = withDelay(
        200,
        withSpring(1, { damping: 14, stiffness: 100 }),
      );

      contentOpacity.value = withDelay(
        350,
        withTiming(1, { duration: 400, easing: Easing.out(Easing.ease) }),
      );

      contentTranslateY.value = withDelay(
        350,
        withSpring(0, { damping: 16, stiffness: 120 }),
      );

      // Fire effects after a short delay
      if (effectTimerRef.current) {
        clearTimeout(effectTimerRef.current);
      }
      effectTimerRef.current = setTimeout(() => setShowConfetti(true), 400);
    } else {
      setShowConfetti(false);
    }

    return () => {
      if (effectTimerRef.current) {
        clearTimeout(effectTimerRef.current);
        effectTimerRef.current = null;
      }
    };
  }, [visible]);

  // ── Animated Styles ─────────────────────────────────────────────────────

  const photoStyle = useAnimatedStyle(() => ({
    transform: [{ scale: photoScale.value }],
  }));

  const contentStyle = useAnimatedStyle(() => ({
    opacity: contentOpacity.value,
    transform: [{ translateY: contentTranslateY.value }],
  }));

  // ── Helpers ─────────────────────────────────────────────────────────────

  const hasPhoto =
    agentPhotoBase64 &&
    agentPhotoBase64.length > 0 &&
    agentPhotoBase64 !== 'undefined' &&
    agentPhotoBase64 !== 'null';

  const hasAgencyLogo =
    agencyLogoBase64 &&
    agencyLogoBase64.length > 0 &&
    agencyLogoBase64 !== 'undefined' &&
    agencyLogoBase64 !== 'null';

  const showBooking = includeBookingLink && schedulingUrl;

  // Build the personalised greeting
  const greeting = clientName
    ? `${theme.greetingPrefix}, ${clientName}!`
    : title;

  const handleBookAppointment = () => {
    if (schedulingUrl) {
      Linking.openURL(schedulingUrl);
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent={false}
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <LinearGradient
        colors={theme.gradientColors}
        style={styles.gradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      >
        {/* Floating emoji background (renders behind content) */}
        {theme.floatingEmoji && theme.floatingEmoji.length > 0 && (
          <FloatingEmoji
            isVisible={visible}
            emoji={theme.floatingEmoji}
            direction={theme.floatingDirection || 'down'}
          />
        )}

        {/* Main effect overlay — chosen per holiday */}
        {theme.effect === 'snowfall' && (
          <Snowfall
            isVisible={showConfetti}
            onComplete={() => setShowConfetti(false)}
          />
        )}
        {theme.effect === 'fireworks' && (
          <Fireworks
            isVisible={showConfetti}
            onComplete={() => setShowConfetti(false)}
          />
        )}
        {theme.effect === 'balloons' && (
          <Balloons
            isVisible={showConfetti}
            onComplete={() => setShowConfetti(false)}
          />
        )}
        {theme.effect === 'confetti' && (
          <Confetti
            isVisible={showConfetti}
            onComplete={() => setShowConfetti(false)}
          />
        )}

        {/* Close button */}
        <TouchableOpacity
          style={styles.closeButton}
          onPress={onClose}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Text style={styles.closeText}>✕</Text>
        </TouchableOpacity>

        {/* Main content */}
        <View style={styles.content}>
          {/* Agent photo */}
          <Animated.View style={[styles.photoWrapper, photoStyle]}>
            {hasPhoto ? (
              <Image
                source={{
                  uri: `data:image/jpeg;base64,${agentPhotoBase64}`,
                }}
                style={styles.agentPhoto}
              />
            ) : (
              <View style={styles.agentPhotoFallback}>
                <Text style={styles.agentPhotoFallbackText}>
                  {agentName?.charAt(0)?.toUpperCase() || 'A'}
                </Text>
              </View>
            )}
          </Animated.View>

          {/* Text content */}
          <Animated.View style={[styles.textContent, contentStyle]}>
            {/* Agent name */}
            {agentName ? (
              <Text style={styles.agentNameText}>{agentName}</Text>
            ) : null}

            {/* Agency name */}
            {agencyName ? (
              <Text style={styles.agencyNameText}>{agencyName}</Text>
            ) : null}

            {/* Agency logo */}
            {hasAgencyLogo ? (
              <View style={styles.agencyLogoWrap}>
                <Image
                  source={{
                    uri: `data:image/jpeg;base64,${agencyLogoBase64}`,
                  }}
                  style={styles.agencyLogo}
                  resizeMode="contain"
                />
              </View>
            ) : null}

            {/* Greeting */}
            <Text style={styles.greetingText}>{greeting}</Text>

            {/* Body */}
            <Text style={styles.bodyText}>{body}</Text>

            {/* Book appointment button */}
            {showBooking && (
              <TouchableOpacity
                style={[styles.bookButton, { backgroundColor: theme.accent }]}
                onPress={handleBookAppointment}
                activeOpacity={0.85}
              >
                <Text
                  style={[
                    styles.bookButtonText,
                    {
                      color:
                        theme.accent === '#FFFFFF' ||
                        theme.accent === '#FFD700' ||
                        theme.accent === '#C0C0C0' ||
                        theme.accent === '#FFB6C1'
                          ? '#1A1A2E'
                          : '#FFFFFF',
                    },
                  ]}
                >
                  Book your appointment
                </Text>
              </TouchableOpacity>
            )}
          </Animated.View>
        </View>
      </LinearGradient>
    </Modal>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  gradient: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButton: {
    position: 'absolute',
    top: 60,
    right: 24,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  closeText: {
    fontSize: 16,
    color: '#FFFFFF',
    fontWeight: '700',
  },
  content: {
    alignItems: 'center',
    paddingHorizontal: 32,
    maxWidth: SCREEN_WIDTH,
  },

  // ── Agent photo ─────────────────────────────────────────────────────────
  photoWrapper: {
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 8,
  },
  agentPhoto: {
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 4,
    borderColor: 'rgba(255,255,255,0.5)',
    backgroundColor: '#F8F9FA',
  },
  agentPhotoFallback: {
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 4,
    borderColor: 'rgba(255,255,255,0.5)',
    backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  agentPhotoFallbackText: {
    fontSize: 48,
    fontWeight: '700',
    color: '#FFFFFF',
  },

  // ── Text content ────────────────────────────────────────────────────────
  textContent: {
    alignItems: 'center',
  },
  agentNameText: {
    fontSize: 20,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 2,
    textAlign: 'center',
  },
  agencyNameText: {
    fontSize: 14,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.75)',
    marginBottom: 12,
    textAlign: 'center',
  },
  agencyLogoWrap: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 12,
    padding: 8,
    marginBottom: 20,
  },
  agencyLogo: {
    width: 50,
    height: 50,
  },
  greetingText: {
    fontSize: 28,
    fontWeight: '800',
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 16,
    lineHeight: 36,
  },
  bodyText: {
    fontSize: 16,
    fontWeight: '400',
    color: 'rgba(255,255,255,0.9)',
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 24,
    paddingHorizontal: 8,
  },

  // ── Booking button ──────────────────────────────────────────────────────
  bookButton: {
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 32,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  bookButtonText: {
    fontSize: 16,
    fontWeight: '700',
  },
});
