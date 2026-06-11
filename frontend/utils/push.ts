import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { apiCall } from './api';

// P6 — Expo push registration (customers only; callers check the role).
// Every step is best-effort: permission denied, web/emulator, or network
// problems all end in a silent skip — push is never allowed to break the app.

async function waitForAuthToken(maxMs = 5000): Promise<string | null> {
  // Fresh logins store auth_token right AFTER the auth response resolves,
  // so give AsyncStorage a few beats before posting the device token.
  const start = Date.now();
  for (;;) {
    const token = await AsyncStorage.getItem('auth_token');
    if (token) return token;
    if (Date.now() - start >= maxMs) return null;
    await new Promise(r => setTimeout(r, 500));
  }
}

async function postToken(pushToken: string): Promise<void> {
  await apiCall('/users/push-token', {
    method: 'POST',
    body: { token: pushToken, platform: Platform.OS },
  });
}

export async function registerPushToken(): Promise<void> {
  try {
    if (Platform.OS === 'web' || !Device.isDevice) return; // simulators/web: skip
    const existing = await Notifications.getPermissionsAsync();
    let status = existing.status;
    if (status !== 'granted') {
      ({ status } = await Notifications.requestPermissionsAsync());
    }
    if (status !== 'granted') return; // denied -> silent skip
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance.DEFAULT,
      });
    }
    const { data: pushToken } = await Notifications.getExpoPushTokenAsync();
    if (!pushToken) return;
    if (!(await waitForAuthToken())) return;
    await postToken(pushToken);
    console.log('[PUSH] device registered');
  } catch (e) {
    console.log('[PUSH] registration skipped:', e);
  }
}

// Expo occasionally rotates push tokens; re-register on refresh (customers only).
export function watchPushTokenRefresh() {
  try {
    return Notifications.addPushTokenListener(async (t) => {
      try {
        const userData = await AsyncStorage.getItem('user_data');
        const user = userData ? JSON.parse(userData) : null;
        if (user?.role !== 'customer') return;
        const data = (t as any)?.data;
        if (typeof data === 'string' && data) await postToken(data);
      } catch (e) {
        console.log('[PUSH] token refresh skipped:', e);
      }
    });
  } catch {
    return { remove: () => {} };
  }
}
