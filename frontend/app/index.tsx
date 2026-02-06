import React, { useState, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator, SafeAreaView
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { login, register } from '../utils/api';

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
    if (!email || !password || (!isLogin && !name)) {
      setError('Please fill all fields');
      return;
    }
    setLoading(true);
    try {
      let data;
      if (isLogin) {
        data = await login(email, password);
      } else {
        data = await register(email, password, name, role);
      }
      if (data.user.role === 'admin') {
        router.replace('/(admin)/dashboard');
      } else {
        router.replace('/(tabs)/home');
      }
    } catch (e: any) {
      setError(e.message || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }, [email, password, name, role, isLogin, router]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.header}>
            <View style={styles.logoContainer}>
              <Ionicons name="flame" size={48} color="#FF3B30" />
            </View>
            <Text style={styles.brandName}>DIET CAFE</Text>
            <Text style={styles.tagline}>Fuel Your Fitness</Text>
          </View>

          <View style={styles.formCard}>
            <View style={styles.tabRow}>
              <TouchableOpacity
                testID="auth-login-tab"
                style={[styles.tab, isLogin && styles.tabActive]}
                onPress={() => { setIsLogin(true); setError(''); }}
              >
                <Text style={[styles.tabText, isLogin && styles.tabTextActive]}>LOGIN</Text>
              </TouchableOpacity>
              <TouchableOpacity
                testID="auth-register-tab"
                style={[styles.tab, !isLogin && styles.tabActive]}
                onPress={() => { setIsLogin(false); setError(''); }}
              >
                <Text style={[styles.tabText, !isLogin && styles.tabTextActive]}>REGISTER</Text>
              </TouchableOpacity>
            </View>

            {!isLogin && (
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Name</Text>
                <TextInput
                  testID="auth-name-input"
                  style={styles.input}
                  value={name}
                  onChangeText={setName}
                  placeholder="Your name"
                  placeholderTextColor="#48484A"
                  autoCapitalize="words"
                />
              </View>
            )}

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Email</Text>
              <TextInput
                testID="auth-email-input"
                style={styles.input}
                value={email}
                onChangeText={setEmail}
                placeholder="email@example.com"
                placeholderTextColor="#48484A"
                keyboardType="email-address"
                autoCapitalize="none"
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Password</Text>
              <TextInput
                testID="auth-password-input"
                style={styles.input}
                value={password}
                onChangeText={setPassword}
                placeholder="Enter password"
                placeholderTextColor="#48484A"
                secureTextEntry
              />
            </View>

            {!isLogin && (
              <View style={styles.inputGroup}>
                <Text style={styles.label}>I am a</Text>
                <View style={styles.roleRow}>
                  <TouchableOpacity
                    testID="auth-role-customer"
                    style={[styles.roleBtn, role === 'customer' && styles.roleBtnActive]}
                    onPress={() => setRole('customer')}
                  >
                    <Ionicons name="person" size={18} color={role === 'customer' ? '#FFF' : '#8E8E93'} />
                    <Text style={[styles.roleText, role === 'customer' && styles.roleTextActive]}>Customer</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    testID="auth-role-admin"
                    style={[styles.roleBtn, role === 'admin' && styles.roleBtnActive]}
                    onPress={() => setRole('admin')}
                  >
                    <Ionicons name="shield" size={18} color={role === 'admin' ? '#FFF' : '#8E8E93'} />
                    <Text style={[styles.roleText, role === 'admin' && styles.roleTextActive]}>Admin</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {error ? (
              <View style={styles.errorBox}>
                <Ionicons name="alert-circle" size={16} color="#FF453A" />
                <Text testID="auth-error" style={styles.errorText}>{error}</Text>
              </View>
            ) : null}

            <TouchableOpacity
              testID="auth-submit-btn"
              style={styles.submitBtn}
              onPress={handleSubmit}
              disabled={loading}
              activeOpacity={0.8}
            >
              {loading ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <Text style={styles.submitText}>{isLogin ? 'LOGIN' : 'CREATE ACCOUNT'}</Text>
              )}
            </TouchableOpacity>

            {isLogin && (
              <View style={styles.demoBox}>
                <Text style={styles.demoLabel}>Demo Accounts:</Text>
                <TouchableOpacity
                  testID="demo-admin-btn"
                  style={styles.demoBtn}
                  onPress={() => { setEmail('admin@dietcafe.com'); setPassword('admin123'); }}
                >
                  <Text style={styles.demoBtnText}>Admin: admin@dietcafe.com</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#000000' },
  flex: { flex: 1 },
  scroll: { flexGrow: 1, justifyContent: 'center', padding: 24 },
  header: { alignItems: 'center', marginBottom: 40 },
  logoContainer: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: 'rgba(255,59,48,0.15)', alignItems: 'center', justifyContent: 'center',
    marginBottom: 16,
  },
  brandName: { fontSize: 32, fontWeight: '800', color: '#FFFFFF', letterSpacing: 2 },
  tagline: { fontSize: 14, color: '#8E8E93', marginTop: 4, letterSpacing: 1 },
  formCard: {
    backgroundColor: '#121212', borderRadius: 20, padding: 24,
    borderWidth: 1, borderColor: '#2C2C2E',
  },
  tabRow: { flexDirection: 'row', marginBottom: 24, gap: 8 },
  tab: {
    flex: 1, paddingVertical: 12, borderRadius: 10,
    backgroundColor: '#1C1C1E', alignItems: 'center',
  },
  tabActive: { backgroundColor: '#FF3B30' },
  tabText: { fontSize: 14, fontWeight: '700', color: '#8E8E93', letterSpacing: 1 },
  tabTextActive: { color: '#FFFFFF' },
  inputGroup: { marginBottom: 16 },
  label: { fontSize: 12, fontWeight: '600', color: '#8E8E93', marginBottom: 6, letterSpacing: 0.5 },
  input: {
    backgroundColor: '#1C1C1E', borderRadius: 10, padding: 14,
    color: '#FFFFFF', fontSize: 16, borderWidth: 1, borderColor: '#2C2C2E',
  },
  roleRow: { flexDirection: 'row', gap: 12 },
  roleBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 12, borderRadius: 10,
    backgroundColor: '#1C1C1E', borderWidth: 1, borderColor: '#2C2C2E',
  },
  roleBtnActive: { backgroundColor: '#FF3B30', borderColor: '#FF3B30' },
  roleText: { fontSize: 14, fontWeight: '600', color: '#8E8E93' },
  roleTextActive: { color: '#FFFFFF' },
  errorBox: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: 'rgba(255,69,58,0.15)', padding: 12, borderRadius: 8, marginBottom: 16,
  },
  errorText: { color: '#FF453A', fontSize: 13 },
  submitBtn: {
    backgroundColor: '#FF3B30', borderRadius: 12, paddingVertical: 16,
    alignItems: 'center', marginTop: 8,
    shadowColor: '#FF3B30', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 8, elevation: 5,
  },
  submitText: { color: '#FFF', fontSize: 16, fontWeight: '700', letterSpacing: 1 },
  demoBox: { marginTop: 20, alignItems: 'center' },
  demoLabel: { color: '#48484A', fontSize: 12, marginBottom: 8 },
  demoBtn: {
    backgroundColor: '#1C1C1E', paddingVertical: 8, paddingHorizontal: 16,
    borderRadius: 8, borderWidth: 1, borderColor: '#2C2C2E',
  },
  demoBtnText: { color: '#8E8E93', fontSize: 12 },
});
