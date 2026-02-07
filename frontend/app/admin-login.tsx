import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiCall } from '../utils/api';

const Z_RED = '#E23744';

export default function AdminLoginScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const handleLogin = async () => {
    setError('');
    
    if (!email || !password) {
      setError('Please enter email and password');
      return;
    }

    setLoading(true);
    try {
      const result = await apiCall('/auth/login', {
        method: 'POST',
        body: { email, password }
      });
      
      if (result.user.role !== 'admin') {
        setError('This login is for café owners only. Customers please use phone login.');
        return;
      }

      await AsyncStorage.setItem('token', result.token);
      await AsyncStorage.setItem('user', JSON.stringify(result.user));
      
      router.replace('/(admin)/dashboard');
    } catch (e: any) {
      setError(e.message || 'Invalid credentials');
    } finally {
      setLoading(false);
    }
  };

  const fillDemoCredentials = () => {
    setEmail('admin@dietcafe.com');
    setPassword('admin123');
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          {/* Back Button */}
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color="#1C1C2E" />
          </TouchableOpacity>

          {/* Logo */}
          <View style={styles.logoSection}>
            <View style={styles.logoBg}>
              <Ionicons name="storefront" size={32} color="#FFF" />
            </View>
            <Text style={styles.brand}>Café Owner</Text>
            <Text style={styles.tagline}>Admin Dashboard Access</Text>
          </View>

          <View style={styles.formCard}>
            <Text style={styles.title}>Welcome back!</Text>
            <Text style={styles.subtitle}>Login with your admin credentials</Text>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Email</Text>
              <View style={styles.inputContainer}>
                <Ionicons name="mail" size={20} color="#9C9C9C" />
                <TextInput
                  style={styles.input}
                  value={email}
                  onChangeText={setEmail}
                  placeholder="admin@dietcafe.com"
                  placeholderTextColor="#B0B0B0"
                  keyboardType="email-address"
                  autoCapitalize="none"
                />
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Password</Text>
              <View style={styles.inputContainer}>
                <Ionicons name="lock-closed" size={20} color="#9C9C9C" />
                <TextInput
                  style={styles.input}
                  value={password}
                  onChangeText={setPassword}
                  placeholder="••••••••"
                  placeholderTextColor="#B0B0B0"
                  secureTextEntry={!showPassword}
                />
                <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
                  <Ionicons name={showPassword ? "eye-off" : "eye"} size={20} color="#9C9C9C" />
                </TouchableOpacity>
              </View>
            </View>

            {error ? <Text style={styles.error}>{error}</Text> : null}

            <TouchableOpacity 
              style={[styles.primaryBtn, (!email || !password) && styles.primaryBtnDisabled]} 
              onPress={handleLogin} 
              disabled={loading || !email || !password}
            >
              {loading ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <>
                  <Text style={styles.primaryBtnText}>Login to Dashboard</Text>
                  <Ionicons name="arrow-forward" size={20} color="#FFF" />
                </>
              )}
            </TouchableOpacity>

            <TouchableOpacity style={styles.demoBtn} onPress={fillDemoCredentials}>
              <Ionicons name="flash" size={16} color={Z_RED} />
              <Text style={styles.demoBtnText}>Use demo credentials</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.infoBox}>
            <Ionicons name="information-circle" size={18} color="#5B5FE0" />
            <Text style={styles.infoText}>
              This login is for café owners only. Regular customers can login using their phone number.
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F8F8F8' },
  scroll: { flexGrow: 1, padding: 24 },
  
  // Back button
  backBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#FFF', alignItems: 'center', justifyContent: 'center', marginBottom: 20, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
  
  // Logo
  logoSection: { alignItems: 'center', marginBottom: 32 },
  logoBg: { width: 72, height: 72, borderRadius: 18, backgroundColor: Z_RED, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  brand: { fontSize: 26, fontWeight: '800', color: '#1C1C2E' },
  tagline: { fontSize: 14, color: '#9C9C9C', marginTop: 4 },
  
  // Form Card
  formCard: { backgroundColor: '#FFF', borderRadius: 20, padding: 24, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 12, elevation: 4 },
  
  // Titles
  title: { fontSize: 22, fontWeight: '800', color: '#1C1C2E', marginBottom: 4 },
  subtitle: { fontSize: 14, color: '#696969', marginBottom: 24 },
  
  // Input
  inputGroup: { marginBottom: 16 },
  label: { fontSize: 13, fontWeight: '600', color: '#1C1C2E', marginBottom: 8 },
  inputContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F5F5F5', borderRadius: 12, paddingHorizontal: 14, gap: 10 },
  input: { flex: 1, fontSize: 15, color: '#1C1C2E', paddingVertical: 14 },
  
  // Buttons
  primaryBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: Z_RED, borderRadius: 14, paddingVertical: 16, marginTop: 8 },
  primaryBtnDisabled: { backgroundColor: '#D0D0D0' },
  primaryBtnText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
  
  demoBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 14, marginTop: 8 },
  demoBtnText: { fontSize: 14, fontWeight: '600', color: Z_RED },
  
  // Error
  error: { color: Z_RED, fontSize: 13, textAlign: 'center', marginBottom: 8 },
  
  // Info box
  infoBox: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, backgroundColor: '#F0F0FF', borderRadius: 12, padding: 14, marginTop: 24 },
  infoText: { flex: 1, fontSize: 12, color: '#5B5FE0', lineHeight: 18 },
});
