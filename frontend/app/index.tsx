import React, { useState, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { login, register } from '../utils/api';

const Z_RED = '#E23744';

export default function AuthScreen() {
  const router = useRouter();
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState('customer');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = useCallback(async () => {
    setError('');
    if (!email || !password || (!isLogin && !name)) { setError('Please fill all fields'); return; }
    setLoading(true);
    try {
      const data = isLogin ? await login(email, password) : await register(email, password, name, role);
      router.replace(data.user.role === 'admin' ? '/(admin)/dashboard' : '/(tabs)/home');
    } catch (e: any) { setError(e.message || 'Something went wrong'); }
    finally { setLoading(false); }
  }, [email, password, name, role, isLogin, router]);

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.topSection}>
            <View style={styles.logoBg}>
              <Ionicons name="restaurant" size={36} color="#FFF" />
            </View>
            <Text style={styles.brand}>diet cafe</Text>
            <Text style={styles.tagline}>Discover healthy meals near you</Text>
          </View>

          <View style={styles.formSection}>
            <View style={styles.tabRow}>
              <TouchableOpacity testID="auth-login-tab" style={[styles.tab, isLogin && styles.tabActive]} onPress={() => { setIsLogin(true); setError(''); }}>
                <Text style={[styles.tabText, isLogin && styles.tabTextActive]}>Login</Text>
              </TouchableOpacity>
              <TouchableOpacity testID="auth-register-tab" style={[styles.tab, !isLogin && styles.tabActive]} onPress={() => { setIsLogin(false); setError(''); }}>
                <Text style={[styles.tabText, !isLogin && styles.tabTextActive]}>Sign up</Text>
              </TouchableOpacity>
            </View>

            {!isLogin && (
              <TextInput testID="auth-name-input" style={styles.input} value={name} onChangeText={setName} placeholder="Full Name" placeholderTextColor="#B0B0B0" autoCapitalize="words" />
            )}
            <TextInput testID="auth-email-input" style={styles.input} value={email} onChangeText={setEmail} placeholder="Email" placeholderTextColor="#B0B0B0" keyboardType="email-address" autoCapitalize="none" />
            <TextInput testID="auth-password-input" style={styles.input} value={password} onChangeText={setPassword} placeholder="Password" placeholderTextColor="#B0B0B0" secureTextEntry />

            {!isLogin && (
              <View style={styles.roleRow}>
                {[{ key: 'customer', label: 'Customer', icon: 'person' as const, desc: 'Order healthy meals' }].map(r => (
                  <TouchableOpacity key={r.key} testID={`auth-role-${r.key}`} style={[styles.roleBtn, role === r.key && styles.roleBtnActive]} onPress={() => setRole(r.key)}>
                    <Ionicons name={r.icon} size={18} color={role === r.key ? '#FFF' : '#696969'} />
                    <Text style={[styles.roleText, role === r.key && styles.roleTextActive]}>{r.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {error ? <Text testID="auth-error" style={styles.error}>{error}</Text> : null}

            <TouchableOpacity testID="auth-submit-btn" style={styles.submitBtn} onPress={handleSubmit} disabled={loading} activeOpacity={0.85}>
              {loading ? <ActivityIndicator color="#FFF" /> : <Text style={styles.submitText}>{isLogin ? 'Login' : 'Create account'}</Text>}
            </TouchableOpacity>

            {isLogin && (
              <TouchableOpacity testID="demo-admin-btn" style={styles.demoBtn} onPress={() => { setEmail('admin@dietcafe.com'); setPassword('admin123'); }}>
                <Ionicons name="storefront" size={14} color={Z_RED} />
                <Text style={styles.demoBtnText}>Café Owner? Tap here to login</Text>
              </TouchableOpacity>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#FFF' },
  scroll: { flexGrow: 1, justifyContent: 'center', padding: 24 },
  topSection: { alignItems: 'center', marginBottom: 36 },
  logoBg: { width: 72, height: 72, borderRadius: 20, backgroundColor: Z_RED, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  brand: { fontSize: 34, fontWeight: '800', color: '#1C1C2E', letterSpacing: -0.5 },
  tagline: { fontSize: 14, color: '#9C9C9C', marginTop: 4 },
  formSection: { backgroundColor: '#FFF', borderRadius: 16, padding: 20, borderWidth: 1, borderColor: '#EFEFEF' },
  tabRow: { flexDirection: 'row', marginBottom: 20, backgroundColor: '#F5F5F5', borderRadius: 10, padding: 3 },
  tab: { flex: 1, paddingVertical: 10, borderRadius: 8, alignItems: 'center' },
  tabActive: { backgroundColor: '#FFF', elevation: 2 },
  tabText: { fontSize: 14, fontWeight: '600', color: '#9C9C9C' },
  tabTextActive: { color: '#1C1C2E' },
  input: { backgroundColor: '#F5F5F5', borderRadius: 10, padding: 14, color: '#1C1C2E', fontSize: 15, marginBottom: 12, borderWidth: 1, borderColor: '#EFEFEF' },
  roleRow: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  roleBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, borderRadius: 10, backgroundColor: '#F5F5F5', borderWidth: 1, borderColor: '#EFEFEF' },
  roleBtnActive: { backgroundColor: Z_RED, borderColor: Z_RED },
  roleText: { fontSize: 13, fontWeight: '600', color: '#696969' },
  roleTextActive: { color: '#FFF' },
  error: { color: Z_RED, fontSize: 13, marginBottom: 10, textAlign: 'center' },
  submitBtn: { backgroundColor: Z_RED, borderRadius: 12, paddingVertical: 15, alignItems: 'center', marginTop: 4 },
  submitText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
  demoBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 16, paddingVertical: 10 },
  demoBtnText: { color: Z_RED, fontSize: 13, fontWeight: '500' },
});
