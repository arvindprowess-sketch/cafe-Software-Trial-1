import React, { useState, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiCall } from '../utils/api';

const Z_RED = '#E23744';
const ORANGE = '#FF9F0A';
const PURPLE = '#5B5FE0';

export default function StaffLoginScreen() {
  const router = useRouter();
  const [pin, setPin] = useState(['', '', '', '', '', '']);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const pinRefs = useRef<(TextInput | null)[]>([]);

  const handlePinChange = (value: string, index: number) => {
    if (value.length > 1) {
      // Handle paste
      const digits = value.replace(/\D/g, '').slice(0, 6).split('');
      const newPin = ['', '', '', '', '', ''];
      digits.forEach((d, i) => { if (i < 6) newPin[i] = d; });
      setPin(newPin);
      const lastIdx = Math.min(digits.length - 1, 5);
      pinRefs.current[lastIdx]?.focus();
      // Auto-submit if 4+ digits
      const pinStr = newPin.join('');
      if (pinStr.length >= 4) setTimeout(() => handleLogin(pinStr), 100);
      return;
    }
    const newPin = [...pin];
    newPin[index] = value.replace(/\D/g, '');
    setPin(newPin);
    if (value && index < 5) {
      pinRefs.current[index + 1]?.focus();
    }
    // Auto-submit when 4+ digits entered
    const pinStr = newPin.join('');
    if (pinStr.length >= 4 && value && index >= 3) {
      setTimeout(() => handleLogin(pinStr), 100);
    }
  };

  const handleKeyPress = (e: any, index: number) => {
    if (e.nativeEvent.key === 'Backspace' && !pin[index] && index > 0) {
      pinRefs.current[index - 1]?.focus();
    }
  };

  const handleLogin = async (pinOverride?: string) => {
    setError('');
    const pinStr = pinOverride || pin.join('');
    if (pinStr.length < 4) {
      setError('Enter at least 4 digits');
      return;
    }
    setLoading(true);
    try {
      const result = await apiCall('/auth/pin-login', {
        method: 'POST',
        body: { pin: pinStr }
      });
      await AsyncStorage.setItem('auth_token', result.token);
      await AsyncStorage.setItem('user_data', JSON.stringify(result.user));
      if (result.user.role === 'kitchen') {
        router.replace('/(kitchen)/orders');
      } else if (result.user.role === 'cashier') {
        router.replace('/(cashier)/pos');
      }
    } catch (e: any) {
      setError(e.message || 'Invalid PIN');
      setPin(['', '', '', '', '', '']);
      pinRefs.current[0]?.focus();
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={styles.scroll}>
          {/* Back button */}
          <TouchableOpacity data-testid="back-btn" style={styles.backBtn} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color="#1C1C2E" />
          </TouchableOpacity>

          {/* Logo */}
          <View style={styles.logoSection}>
            <View style={styles.logoBg}>
              <Ionicons name="keypad" size={36} color="#FFF" />
            </View>
            <Text style={styles.brand}>Staff Login</Text>
            <Text style={styles.tagline}>Enter your PIN to continue</Text>
          </View>

          {/* Roles info */}
          <View style={styles.rolesRow}>
            <View style={[styles.roleChip, { backgroundColor: '#FFF3E0' }]}>
              <Ionicons name="flame" size={14} color={ORANGE} />
              <Text style={[styles.roleChipText, { color: ORANGE }]}>Kitchen</Text>
            </View>
            <View style={[styles.roleChip, { backgroundColor: '#F0F0FF' }]}>
              <Ionicons name="card" size={14} color={PURPLE} />
              <Text style={[styles.roleChipText, { color: PURPLE }]}>Cashier</Text>
            </View>
          </View>

          {/* PIN Input */}
          <View style={styles.formCard}>
            <View style={styles.pinContainer}>
              {pin.map((digit, index) => (
                <TextInput
                  key={index}
                  ref={ref => pinRefs.current[index] = ref}
                  data-testid={`pin-${index}`}
                  style={[styles.pinInput, digit && styles.pinInputFilled]}
                  value={digit}
                  onChangeText={(v) => handlePinChange(v, index)}
                  onKeyPress={(e) => handleKeyPress(e, index)}
                  keyboardType="number-pad"
                  maxLength={1}
                  secureTextEntry
                  autoFocus={index === 0}
                />
              ))}
            </View>

            {error ? <Text style={styles.error}>{error}</Text> : null}

            <TouchableOpacity
              data-testid="pin-login-btn"
              style={[styles.primaryBtn, pin.join('').length < 4 && styles.primaryBtnDisabled]}
              onPress={() => handleLogin()}
              disabled={loading || pin.join('').length < 4}
            >
              {loading ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <>
                  <Text style={styles.primaryBtnText}>Login</Text>
                  <Ionicons name="arrow-forward" size={20} color="#FFF" />
                </>
              )}
            </TouchableOpacity>
          </View>

          <View style={styles.infoBox}>
            <Ionicons name="information-circle" size={16} color="#9C9C9C" />
            <Text style={styles.infoText}>Ask your admin for your staff PIN</Text>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F8F8F8' },
  scroll: { flex: 1, justifyContent: 'center', padding: 24 },
  backBtn: { position: 'absolute', top: 16, left: 24, width: 44, height: 44, borderRadius: 22, backgroundColor: '#FFF', alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2, zIndex: 10 },
  logoSection: { alignItems: 'center', marginBottom: 24 },
  logoBg: { width: 72, height: 72, borderRadius: 18, backgroundColor: '#1C1C2E', alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  brand: { fontSize: 26, fontWeight: '800', color: '#1C1C2E' },
  tagline: { fontSize: 14, color: '#9C9C9C', marginTop: 4 },
  rolesRow: { flexDirection: 'row', justifyContent: 'center', gap: 12, marginBottom: 24 },
  roleChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20 },
  roleChipText: { fontSize: 13, fontWeight: '600' },
  formCard: { backgroundColor: '#FFF', borderRadius: 20, padding: 24, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 12, elevation: 4 },
  pinContainer: { flexDirection: 'row', justifyContent: 'center', gap: 10, marginBottom: 20 },
  pinInput: { width: 48, height: 56, borderRadius: 14, backgroundColor: '#F5F5F5', borderWidth: 2, borderColor: '#EFEFEF', textAlign: 'center', fontSize: 24, fontWeight: '800', color: '#1C1C2E' },
  pinInputFilled: { borderColor: '#1C1C2E', backgroundColor: '#F0F0F0' },
  error: { color: Z_RED, fontSize: 13, textAlign: 'center', marginBottom: 12 },
  primaryBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#1C1C2E', borderRadius: 14, paddingVertical: 16 },
  primaryBtnDisabled: { backgroundColor: '#D0D0D0' },
  primaryBtnText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
  infoBox: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 24 },
  infoText: { fontSize: 13, color: '#9C9C9C' },
});
