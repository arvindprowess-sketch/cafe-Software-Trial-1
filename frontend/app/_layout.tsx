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
import { FUEL } from '../utils/theme';
import { CartProvider } from '../utils/CartContext';

export default function RootLayout() {
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

  return (
    <View style={styles.container}>
      <StatusBar style="dark" />
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: FUEL.sand },
});
