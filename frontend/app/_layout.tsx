import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View, StyleSheet } from 'react-native';
import { useFonts as useAntonFonts, Anton_400Regular } from '@expo-google-fonts/anton';
import {
  useFonts as useHankenFonts,
  HankenGrotesk_400Regular,
  HankenGrotesk_500Medium,
  HankenGrotesk_600SemiBold,
  HankenGrotesk_700Bold,
  HankenGrotesk_800ExtraBold,
} from '@expo-google-fonts/hanken-grotesk';
import * as Sentry from '@sentry/react-native';
import { FUEL } from '../utils/theme';
import { CartProvider } from '../utils/CartContext';
import { StoreProvider } from '../utils/StoreContext';
import { getStoredUser } from '../utils/api';
import { registerPushToken, watchPushTokenRefresh } from '../utils/push';

// Crash reporting — env-gated: no EXPO_PUBLIC_SENTRY_DSN -> skip entirely.
const sentryDsn = process.env.EXPO_PUBLIC_SENTRY_DSN;
if (sentryDsn) {
  Sentry.init({ dsn: sentryDsn, tracesSampleRate: 0.1 });
}

function RootLayout() {
  // FUEL typography: Anton (display) + Hanken Grotesk (body).
  // We don't block rendering on font load so the app stays functional;
  // fonts apply automatically once ready.
  useAntonFonts({ Anton_400Regular });
  useHankenFonts({
    HankenGrotesk_400Regular,
    HankenGrotesk_500Medium,
    HankenGrotesk_600SemiBold,
    HankenGrotesk_700Bold,
    HankenGrotesk_800ExtraBold,
  });

  useEffect(() => {
    // Push registration for already-logged-in customers (fresh logins are
    // handled by the api.ts auth hook). Permission denied -> silent skip.
    (async () => {
      const user = await getStoredUser();
      if (user?.role === 'customer') registerPushToken();
    })();
    const sub = watchPushTokenRefresh();
    return () => sub.remove();
  }, []);

  return (
    <View style={styles.container}>
      <StatusBar style="dark" />
      <StoreProvider>
        <CartProvider>
          <Stack
            screenOptions={{
              headerShown: false,
              animation: 'slide_from_right',
              contentStyle: { backgroundColor: FUEL.sand },
            }}
          >
            <Stack.Screen name="index" />
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="cart" />
            <Stack.Screen name="customize" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
          </Stack>
        </CartProvider>
      </StoreProvider>
    </View>
  );
}

// Per Sentry Expo docs: wrap the root component (no-op profiler when DSN unset).
export default Sentry.wrap(RootLayout);

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: FUEL.sand },
});
