import AsyncStorage from '@react-native-async-storage/async-storage';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';

interface RequestOptions {
  method?: string;
  body?: any;
  headers?: Record<string, string>;
}

export async function apiCall(endpoint: string, options: RequestOptions = {}) {
  const token = await AsyncStorage.getItem('auth_token');
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...options.headers,
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  const url = `${BACKEND_URL}/api${endpoint}`;
  const response = await fetch(url, {
    method: options.method || 'GET',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Request failed' }));
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
  await AsyncStorage.removeItem('auth_token');
  await AsyncStorage.removeItem('user_data');
}

export async function getStoredUser() {
  const userData = await AsyncStorage.getItem('user_data');
  const token = await AsyncStorage.getItem('auth_token');
  if (userData && token) {
    return JSON.parse(userData);
  }
  return null;
}
