import { useEffect, useRef } from 'react';
import { AppState, AppStateStatus, Linking, Platform } from 'react-native';
import { DarkTheme, ThemeProvider } from '@react-navigation/native';
import { router, Stack, usePathname } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';
import analytics from '@react-native-firebase/analytics';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { getSession, registerAndSavePushToken } from './index';

// Configure how notifications are presented when the app is in the foreground.
// shouldSetBadge is false because the user is already in the app — no need for
// a badge. The server sends badge:1 so backgrounded pushes still show the dot.
// Badge is cleared to 0 on foreground entry and when notifications are handled.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

/**
 * Register for push notifications and return the Expo push token.
 * Returns null if permissions are denied or running on a simulator.
 */
export async function registerForPushNotificationsAsync(): Promise<string | null> {
  // Push notifications only work on physical devices
  if (!Device.isDevice) {
    console.log('Push notifications require a physical device');
    return null;
  }

  // Check existing permissions
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  // Request permission if not already granted
  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    console.log('Push notification permission not granted');
    return null;
  }

  // Android needs a notification channel
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#3DD6C3',
    });
  }

  // Get the Expo push token
  const projectId = Constants.expoConfig?.extra?.eas?.projectId;
  if (!projectId) {
    console.error('EAS project ID not found in app config');
    return null;
  }

  const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
  return tokenData.data;
}

/** Set up the BOOK_APPOINTMENT category so push notifications can show a Book action button. */
async function setupBookNotificationCategory() {
  try {
    await Notifications.setNotificationCategoryAsync('BOOK_APPOINTMENT', [
      {
        identifier: 'book',
        buttonTitle: 'Book',
        options: { opensAppToForeground: true },
      },
    ]);
  } catch (e) {
    console.warn('Could not set up notification category:', e);
  }
}

// Custom theme with Quility colors
const CustomTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    primary: '#3DD6C3',
    background: '#0D4D4D',
    card: '#FFFFFF',
    text: '#2D3748',
    border: '#E5E7EB',
    notification: '#3DD6C3',
  },
};

export default function RootLayout() {
  const pathname = usePathname();
  const notificationListener = useRef<Notifications.EventSubscription>();
  const responseListener = useRef<Notifications.EventSubscription>();

  // Log screen views to Firebase Analytics on navigation
  useEffect(() => {
    analytics().logScreenView({
      screen_name: pathname,
      screen_class: pathname,
    });
  }, [pathname]);

  // Set up Book action button for booking-related push notifications
  useEffect(() => {
    setupBookNotificationCategory();
  }, []);

  // Re-register push token and clear badge when the app comes back to foreground.
  // Handles token rotation and recovers from failed initial registrations.
  useEffect(() => {
    Notifications.setBadgeCountAsync(0).catch(() => {});
    Notifications.dismissAllNotificationsAsync().catch(() => {});

    const handleAppStateChange = async (nextState: AppStateStatus) => {
      if (nextState === 'active') {
        Notifications.setBadgeCountAsync(0).catch(() => {});
        Notifications.dismissAllNotificationsAsync().catch(() => {});
        try {
          const session = await getSession();
          if (session?.clientCode) {
            registerAndSavePushToken(session.clientCode).catch(() => {});
          }
        } catch {
          // Silently ignore -- best-effort refresh
        }
      }
    };

    const sub = AppState.addEventListener('change', handleAppStateChange);
    return () => sub.remove();
  }, []);

  // Set up notification listeners
  useEffect(() => {
    /**
     * Route the agent into the send-confirmation screen from a
     * push-notification tap.
     *
     * Two code paths reach the same destination:
     *   1. Warm-open via `addNotificationResponseReceivedListener` —
     *      app was already running, listener fires on tap.
     *   2. Cold-open via `getLastNotificationResponseAsync` — app was
     *      killed when the push arrived; the OS held the tap response
     *      and we collect it on mount BEFORE the listener could have
     *      caught it. Without this we'd race-lose the tap and the
     *      agent would land on /agent-home with no idea what to do.
     */
    const routeFromNotification = (
      data: Record<string, unknown> | undefined,
      actionIdentifier?: string,
    ) => {
      Notifications.setBadgeCountAsync(0).catch(() => {});
      Notifications.dismissAllNotificationsAsync().catch(() => {});

      // If they tapped the Book action, open the agent's calendar
      if (actionIdentifier === 'book' && data?.schedulingUrl && typeof data.schedulingUrl === 'string') {
        Linking.openURL(data.schedulingUrl);
        return;
      }

      // Agent-side: notifications carrying an appointmentId mean "tap
      // to send confirmation". Route the agent into the send screen
      // so the message composer opens with everything filled in.
      if (
        typeof data?.appointmentId === 'string' &&
        data.appointmentId &&
        (data.kind === 'confirmation' || data.kind === 'reminder')
      ) {
        router.push({
          pathname: '/send/[apptId]',
          params: { apptId: data.appointmentId, kind: data.kind },
        } as never);
      }
    };

    // Cold-launch path: ask the OS for the last notification response
    // that woke us up. If there is one, route immediately. We delay
    // slightly so the root Stack has a chance to mount before we push
    // onto it — otherwise expo-router silently drops the push.
    Notifications.getLastNotificationResponseAsync()
      .then((response) => {
        if (!response) return;
        const data = response.notification.request.content.data as Record<string, unknown> | undefined;
        setTimeout(() => {
          routeFromNotification(data, response.actionIdentifier);
        }, 250);
      })
      .catch((err) => {
        console.warn('getLastNotificationResponse failed:', err);
      });

    // Foreground notifications: clear the badge.
    notificationListener.current = Notifications.addNotificationReceivedListener((notification) => {
      console.log('Notification received:', notification.request.content.title);
      Notifications.setBadgeCountAsync(0).catch(() => {});
    });

    // Warm-tap path: listener for when the user taps while the app is
    // already running.
    responseListener.current = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as Record<string, unknown> | undefined;
      routeFromNotification(data, response.actionIdentifier);
    });

    return () => {
      if (notificationListener.current) {
        notificationListener.current.remove();
      }
      if (responseListener.current) {
        responseListener.current.remove();
      }
    };
  }, []);

  return (
    <ThemeProvider value={CustomTheme}>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: '#0D4D4D' },
          animation: 'slide_from_right',
        }}
      >
        <Stack.Screen name="index" />
        <Stack.Screen name="activate" />
        <Stack.Screen name="login" />
        <Stack.Screen name="agent-profile" />
        <Stack.Screen name="policies" />
        <Stack.Screen name="agent-home" />
        <Stack.Screen name="agent-welcome" />
        <Stack.Screen name="pair/[code]" />
        <Stack.Screen name="send/[apptId]" />
      </Stack>
      <StatusBar style="light" />
    </ThemeProvider>
  );
}
