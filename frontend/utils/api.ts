import AsyncStorage from '@react-native-async-storage/async-storage';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';

interface RequestOptions {
  method?: string;
  body?: any;
  headers?: Record<string, string>;
}

// Migrate old token keys to new keys (run once)
let migrated = false;
async function migrateTokenIfNeeded() {
  if (migrated) return;
  if (typeof window === 'undefined') return;
  migrated = true;
  try {
    const oldToken = await AsyncStorage.getItem('token');
    const oldUser = await AsyncStorage.getItem('user');
    const newToken = await AsyncStorage.getItem('auth_token');
    if (oldToken && !newToken) {
      await AsyncStorage.setItem('auth_token', oldToken);
      await AsyncStorage.removeItem('token');
    }
    if (oldUser && !(await AsyncStorage.getItem('user_data'))) {
      await AsyncStorage.setItem('user_data', oldUser);
      await AsyncStorage.removeItem('user');
    }
  } catch {}
}

export async function apiCall(endpoint: string, options: RequestOptions = {}) {
  // Ensure migration ran
  await migrateTokenIfNeeded();
  
  const token = await AsyncStorage.getItem('auth_token');
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...options.headers,
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  const url = `${BACKEND_URL}/api${endpoint}`;
  console.log(`[API] ${options.method || 'GET'} ${endpoint} | Auth: ${token ? 'Yes' : 'No'}`);
  
  const response = await fetch(url, {
    method: options.method || 'GET',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Request failed' }));
    console.log(`[API] Error: ${error.detail || response.status}`);
    throw new Error(error.detail || `HTTP ${response.status}`);
  }
  return response.json();
}

export async function login(email: string, password: string) {
  const data = await apiCall('/auth/login', {
    method: 'POST',
    body: { email, password },
  });
  await AsyncStorage.setItem('auth_token', data.token);
  await AsyncStorage.setItem('user_data', JSON.stringify(data.user));
  return data;
}

export async function register(email: string, password: string, name: string, role: string) {
  const data = await apiCall('/auth/register', {
    method: 'POST',
    body: { email, password, name, role },
  });
  await AsyncStorage.setItem('auth_token', data.token);
  await AsyncStorage.setItem('user_data', JSON.stringify(data.user));
  return data;
}

export async function logout() {
  // Clear both old and new keys
  await AsyncStorage.multiRemove(['auth_token', 'user_data', 'token', 'user']);
  console.log('[API] Logged out - cleared all auth data');
}

export async function getStoredUser() {
  const userData = await AsyncStorage.getItem('user_data');
  const token = await AsyncStorage.getItem('auth_token');
  if (userData && token) {
    return JSON.parse(userData);
  }
  return null;
}
