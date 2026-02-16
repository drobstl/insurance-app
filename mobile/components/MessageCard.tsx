import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Image,
  Linking,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  withDelay,
  withSequence,
  Easing,
} from 'react-native-reanimated';
import {
  subscribeToUnreadNotifications,
  markNotificationAsRead,
  type AgentNotification,
} from '../lib/notifications';
import { getCardTheme, isExpandableType } from '../lib/holidayThemes';
import FullScreenCard from './FullScreenCard';

// ── Props ────────────────────────────────────────────────────────────────────

interface MessageCardProps {
  agentId: string;
  clientId: string;
  /** Agent's display name */
  agentName?: string;
  /** Base64-encoded agent photo for the card avatar */
  agentPhotoBase64?: string;
  /** Agent's scheduling URL — enables "Book your appointment" button */
  schedulingUrl?: string;
  /** Agency name for full-screen branded cards */
  agencyName?: string;
  /** Base64-encoded agency logo for full-screen cards */
  agencyLogoBase64?: string;
  /** Client's first name — used in personalised greetings */
  clientName?: string;
  /** Delay in ms before the card entrance animation starts */
  entranceDelay?: number;
}

// ── Animation Config ─────────────────────────────────────────────────────────

const SPRING_CONFIG = {
  damping: 16,
  stiffness: 120,
  mass: 1,
};

const ENTRANCE_DELAY = 1500; // ms after mount before card appears

// ── Component ────────────────────────────────────────────────────────────────

export default function MessageCard({
  agentId,
  clientId,
  agentName,
  agentPhotoBase64,
  schedulingUrl,
  agencyName,
  agencyLogoBase64,
  clientName,
  entranceDelay = ENTRANCE_DELAY,
}: MessageCardProps) {
  const [notifications, setNotifications] = useState<AgentNotification[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isReady, setIsReady] = useState(false);
  const [fullScreenVisible, setFullScreenVisible] = useState(false);

  // Animation values
  const containerHeight = useSharedValue(0);
  const cardOpacity = useSharedValue(0);
  const cardScale = useSharedValue(0.95);

  // ── Firestore Subscription ───────────────────────────────────────────────

  useEffect(() => {
    if (!agentId || !clientId) return;

    const unsubscribe = subscribeToUnreadNotifications(
      agentId,
      clientId,
      (unread) => {
        setNotifications(unread);
        if (unread.length > 0 && !isReady) {
          setIsReady(true);
        }
      },
    );

    return unsubscribe;
  }, [agentId, clientId]);

  // ── Entrance Animation ───────────────────────────────────────────────────

  useEffect(() => {
    if (!isReady || notifications.length === 0) return;

    // Phase 1: Expand the container height (pushes buttons down)
    containerHeight.value = withDelay(
      entranceDelay,
      withSpring(1, SPRING_CONFIG),
    );

    // Phase 2: Fade in and scale the card (slightly after height starts)
    cardOpacity.value = withDelay(
      entranceDelay + 200,
      withTiming(1, { duration: 300, easing: Easing.out(Easing.ease) }),
    );

    cardScale.value = withDelay(
      entranceDelay + 200,
      withSpring(1, SPRING_CONFIG),
    );
  }, [isReady, notifications.length > 0]);

  // ── Dismiss Animation ────────────────────────────────────────────────────

  const handleDismiss = useCallback(async () => {
    const current = notifications[currentIndex];
    if (!current) return;

    // Mark as read in Firestore — onSnapshot will remove it from the list
    try {
      await markNotificationAsRead(agentId, clientId, current.id);
    } catch (err) {
      console.error('Error marking notification as read:', err);
    }

    if (notifications.length <= 1) {
      // Last notification — collapse the card
      cardOpacity.value = withTiming(0, { duration: 200 });
      cardScale.value = withTiming(0.95, { duration: 200 });
      containerHeight.value = withDelay(
        100,
        withSpring(0, { ...SPRING_CONFIG, stiffness: 100 }),
      );
    } else {
      // More notifications — crossfade to next
      cardOpacity.value = withSequence(
        withTiming(0, { duration: 150 }),
        withTiming(1, { duration: 150 }),
      );
      // Clamp index if we're at the end of the list
      if (currentIndex >= notifications.length - 1) {
        setCurrentIndex(0);
      }
    }
  }, [notifications, currentIndex, agentId, clientId]);

  // ── Full-Screen Handlers ────────────────────────────────────────────────

  const handleCardPress = useCallback(() => {
    const current = notifications[currentIndex];
    if (current && isExpandableType(current.type)) {
      setFullScreenVisible(true);
    }
  }, [notifications, currentIndex]);

  const handleFullScreenClose = useCallback(() => {
    setFullScreenVisible(false);
  }, []);

  // ── Booking Link Handler ─────────────────────────────────────────────────

  const handleBookAppointment = useCallback(() => {
    if (schedulingUrl) {
      Linking.openURL(schedulingUrl);
    }
  }, [schedulingUrl]);

  // ── Animated Styles ──────────────────────────────────────────────────────

  const containerStyle = useAnimatedStyle(() => ({
    maxHeight: containerHeight.value * 300, // expand from 0 to max
    marginBottom: containerHeight.value * 16,
    opacity: containerHeight.value > 0.01 ? 1 : 0,
  }));

  const cardStyle = useAnimatedStyle(() => ({
    opacity: cardOpacity.value,
    transform: [{ scale: cardScale.value }],
  }));

  // ── Early Return ─────────────────────────────────────────────────────────

  if (notifications.length === 0 && !isReady) return null;

  const current = notifications[currentIndex] || notifications[0];
  if (!current) return null;

  const theme = getCardTheme(current.type, current.holiday);
  const expandable = isExpandableType(current.type);

  const agentFirstName = agentName?.split(' ')[0] || 'your agent';
  const hasPhoto =
    agentPhotoBase64 &&
    agentPhotoBase64.length > 0 &&
    agentPhotoBase64 !== 'undefined' &&
    agentPhotoBase64 !== 'null';
  const showBookingButton = current.includeBookingLink && schedulingUrl;

  // Determine inline card styling based on type
  const isDefault =
    current.type === 'message' || current.type === 'anniversary';
  const inlineBorderColor = isDefault ? '#3DD6C3' : theme.borderColor;
  const inlineBgColor = isDefault ? '#FFFFFF' : theme.bgTint;

  // ── Render ───────────────────────────────────────────────────────────────

  const cardContent = (
    <Animated.View
      style={[
        styles.card,
        {
          borderLeftColor: inlineBorderColor,
          backgroundColor: inlineBgColor,
        },
        cardStyle,
      ]}
    >
      {/* Card Header */}
      <View style={styles.cardHeader}>
        {/* Themed emoji badge for holiday/birthday */}
        {!isDefault && theme.emoji ? (
          <View style={styles.emojiBadge}>
            <Text style={styles.emojiBadgeText}>{theme.emoji}</Text>
          </View>
        ) : null}

        {/* Agent avatar */}
        {hasPhoto ? (
          <Image
            source={{ uri: `data:image/jpeg;base64,${agentPhotoBase64}` }}
            style={styles.avatar}
          />
        ) : (
          <View style={styles.avatarFallback}>
            <Text style={styles.avatarFallbackText}>
              {agentName?.charAt(0)?.toUpperCase() || 'A'}
            </Text>
          </View>
        )}

        <View style={styles.headerText}>
          <Text style={styles.cardTitle} numberOfLines={1}>
            {current.title}
          </Text>
          <Text style={styles.cardFrom}>From {agentFirstName}</Text>
        </View>

        {/* Dismiss button */}
        <TouchableOpacity
          onPress={handleDismiss}
          style={styles.dismissButton}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Text style={styles.dismissText}>✕</Text>
        </TouchableOpacity>
      </View>

      {/* Message body */}
      <Text style={styles.messageBody}>{current.body}</Text>

      {/* Tap-to-expand hint for expandable cards */}
      {expandable && (
        <Text style={[styles.expandHint, { color: theme.borderColor }]}>
          Tap to view full card
        </Text>
      )}

      {/* Book appointment button */}
      {showBookingButton && (
        <TouchableOpacity
          style={styles.bookButton}
          onPress={handleBookAppointment}
          activeOpacity={0.8}
        >
          <Text style={styles.bookButtonText}>Book your appointment</Text>
        </TouchableOpacity>
      )}

      {/* Multi-notification indicator */}
      {notifications.length > 1 && (
        <View style={styles.indicator}>
          <Text style={styles.indicatorText}>
            {currentIndex + 1} of {notifications.length}
          </Text>
        </View>
      )}
    </Animated.View>
  );

  return (
    <>
      <Animated.View style={[styles.container, containerStyle]}>
        {expandable ? (
          <TouchableOpacity activeOpacity={0.9} onPress={handleCardPress}>
            {cardContent}
          </TouchableOpacity>
        ) : (
          cardContent
        )}
      </Animated.View>

      {/* Full-screen overlay for holiday / birthday cards */}
      <FullScreenCard
        visible={fullScreenVisible}
        onClose={handleFullScreenClose}
        theme={theme}
        type={current.type}
        clientName={clientName}
        title={current.title}
        body={current.body}
        agentName={agentName}
        agentPhotoBase64={agentPhotoBase64}
        agencyName={agencyName}
        agencyLogoBase64={agencyLogoBase64}
        includeBookingLink={current.includeBookingLink}
        schedulingUrl={schedulingUrl}
      />
    </>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderLeftWidth: 4,
    borderLeftColor: '#3DD6C3',
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 4,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  emojiBadge: {
    marginRight: 6,
  },
  emojiBadgeText: {
    fontSize: 20,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    marginRight: 10,
    backgroundColor: '#F8F9FA',
  },
  avatarFallback: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#0D4D4D',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  avatarFallbackText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  headerText: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#2D3748',
  },
  cardFrom: {
    fontSize: 12,
    color: '#9CA3AF',
    marginTop: 1,
  },
  dismissButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },
  dismissText: {
    fontSize: 12,
    color: '#9CA3AF',
    fontWeight: '600',
  },
  messageBody: {
    fontSize: 14,
    color: '#4A5568',
    lineHeight: 21,
  },
  expandHint: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 8,
  },
  bookButton: {
    marginTop: 12,
    backgroundColor: '#3DD6C3',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  bookButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  indicator: {
    alignItems: 'center',
    marginTop: 10,
  },
  indicatorText: {
    fontSize: 11,
    color: '#CBD5E0',
    fontWeight: '600',
  },
});
