import { useEffect, useState } from 'react';
import { DarkTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as Font from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { View, ActivityIndicator, Text } from 'react-native';
import 'react-native-reanimated';

// Keep splash screen visible while loading fonts
SplashScreen.preventAutoHideAsync();

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
  const [fontsLoaded, setFontsLoaded] = useState(false);

  useEffect(() => {
    async function loadFonts() {
      try {
        await Font.loadAsync({
          'PeaceSans': require('../assets/fonts/PeaceSans.otf'),
        });
        setFontsLoaded(true);
      } catch (error) {
        // If font loading fails, continue with system font
        console.log('Font loading error (using system font):', error);
        setFontsLoaded(true);
      } finally {
        await SplashScreen.hideAsync();
      }
    }

    loadFonts();
  }, []);

  if (!fontsLoaded) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0D4D4D' }}>
        <ActivityIndicator size="large" color="#3DD6C3" />
        <Text style={{ color: '#FFFFFF', marginTop: 16 }}>Loading...</Text>
      </View>
    );
  }

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
