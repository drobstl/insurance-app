import { useEffect } from 'react';
import { DarkTheme, ThemeProvider } from '@react-navigation/native';
import { Stack, usePathname } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';
import analytics from '@react-native-firebase/analytics';

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

  // Log screen views to Firebase Analytics on navigation
  useEffect(() => {
    analytics().logScreenView({
      screen_name: pathname,
      screen_class: pathname,
    });
  }, [pathname]);

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
        <Stack.Screen name="agent-profile" />
        <Stack.Screen name="policies" />
      </Stack>
      <StatusBar style="light" />
    </ThemeProvider>
  );
}
