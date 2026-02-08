import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View, StyleSheet } from 'react-native';

export default function RootLayout() {
  return (
    <View style={styles.container}>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right', contentStyle: { backgroundColor: '#FFFFFF' } }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="(admin)" />
        <Stack.Screen name="(kitchen)" />
        <Stack.Screen name="(cashier)" />
        <Stack.Screen name="staff-login" />
        <Stack.Screen name="customize" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
      </Stack>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },
});
