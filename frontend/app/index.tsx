import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator, Alert
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiCall } from '../utils/api';

const Z_RED = '#D62300';
const GREEN = '#509E2F';
const BK_BROWN = '#502314';
const BK_CREAM = '#F5EBDC';
const BK_ORANGE = '#FF8732';
const BK_TEXT_LIGHT = '#8B6F61';

type Step = 'phone' | 'otp' | 'name';

export default function AuthScreen() {
  const router = useRouter();
  const [step, setStep] = useState<Step>('phone');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [demoOtp, setDemoOtp] = useState('');
  const [countdown, setCountdown] = useState(0);
  const [isNewUser, setIsNewUser] = useState(false);
  
  const otpRefs = useRef<(TextInput | null)[]>([]);

  // Countdown timer for resend
  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [countdown]);

  const handleSendOtp = async () => {
    setError('');
    const cleanPhone = phone.replace(/\D/g, '');
    
    if (cleanPhone.length !== 10) {
      setError('Please enter a valid 10-digit phone number');
      return;
    }

    setLoading(true);
    try {
      const result = await apiCall('/auth/otp/send', {
        method: 'POST',
        body: { phone: cleanPhone }
      });
      
      // For demo, show OTP
      if (result.demo_otp) {
        setDemoOtp(result.demo_otp);
      }
      
      setStep('otp');
      setCountdown(30); // 30 seconds before resend
    } catch (e: any) {
      setError(e.message || 'Failed to send OTP');
    } finally {
      setLoading(false);
    }
  };

  const handleOtpChange = (value: string, index: number) => {
    if (value.length > 1) {
      // Handle paste
      const digits = value.replace(/\D/g, '').slice(0, 6).split('');
      const newOtp = [...otp];
      digits.forEach((d, i) => {
        if (i < 6) newOtp[i] = d;
      });
      setOtp(newOtp);
      if (digits.length === 6) {
        otpRefs.current[5]?.focus();
      }
      return;
    }

    const newOtp = [...otp];
    newOtp[index] = value.replace(/\D/g, '');
    setOtp(newOtp);

    // Auto focus next input
    if (value && index < 5) {
      otpRefs.current[index + 1]?.focus();
    }
  };

  const handleOtpKeyPress = (e: any, index: number) => {
    if (e.nativeEvent.key === 'Backspace' && !otp[index] && index > 0) {
      otpRefs.current[index - 1]?.focus();
    }
  };

  const handleVerifyOtp = async () => {
    setError('');
    const otpString = otp.join('');
    
    if (otpString.length !== 6) {
      setError('Please enter complete 6-digit OTP');
      return;
    }

    setLoading(true);
    try {
      const result = await apiCall('/auth/otp/verify', {
        method: 'POST',
        body: { 
          phone: phone.replace(/\D/g, ''), 
          otp: otpString,
          name: name || undefined
        }
      });
      
      // Save token (must match keys in api.ts)
      await AsyncStorage.setItem('auth_token', result.token);
      await AsyncStorage.setItem('user_data', JSON.stringify(result.user));
      
      // Check if new user needs to enter name
      if (result.is_new_user && !name) {
        setIsNewUser(true);
        setStep('name');
      } else {
        // Navigate to home
        router.replace('/(tabs)/home');
      }
    } catch (e: any) {
      setError(e.message || 'Invalid OTP');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveName = async () => {
    if (!name.trim()) {
      setError('Please enter your name');
      return;
    }
    
    // Name already sent during OTP verify, just navigate
    router.replace('/(tabs)/home');
  };

  const handleResendOtp = async () => {
    if (countdown > 0) return;
    setOtp(['', '', '', '', '', '']);
    setError('');
    await handleSendOtp();
  };

  const handleAdminLogin = () => {
    // Admin/Staff now use web panel at diet-expo-mobile.preview.emergentagent.com
    Alert.alert('Web Panel', 'Admin & staff login is available on the web panel.\n\nOpen your browser to access the management dashboard.');
  };

  // Phone Input Step
  const renderPhoneStep = () => (
    <>
      <View style={styles.iconContainer}>
        <View style={styles.phoneBg}>
          <Ionicons name="phone-portrait" size={40} color={Z_RED} />
        </View>
      </View>
      
      <Text style={styles.title}>Enter your mobile number</Text>
      <Text style={styles.subtitle}>We'll send you an OTP to verify</Text>

      <View style={styles.phoneInputContainer}>
        <View style={styles.countryCode}>
          <Text style={styles.flag}>🇮🇳</Text>
          <Text style={styles.countryText}>+91</Text>
        </View>
        <TextInput
          style={styles.phoneInput}
          value={phone}
          onChangeText={setPhone}
          placeholder="9876543210"
          placeholderTextColor="#B0B0B0"
          keyboardType="phone-pad"
          maxLength={10}
          autoFocus
        />
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <TouchableOpacity 
        style={[styles.primaryBtn, phone.replace(/\D/g, '').length !== 10 && styles.primaryBtnDisabled]} 
        onPress={handleSendOtp} 
        disabled={loading || phone.replace(/\D/g, '').length !== 10}
      >
        {loading ? (
          <ActivityIndicator color="#FFF" />
        ) : (
          <>
            <Text style={styles.primaryBtnText}>Get OTP</Text>
            <Ionicons name="arrow-forward" size={20} color="#FFF" />
          </>
        )}
      </TouchableOpacity>

      <View style={styles.divider}>
        <View style={styles.dividerLine} />
        <Text style={styles.dividerText}>or</Text>
        <View style={styles.dividerLine} />
      </View>

      <TouchableOpacity style={styles.adminBtn} onPress={handleAdminLogin}>
        <Ionicons name="storefront" size={18} color={Z_RED} />
        <Text style={styles.adminBtnText}>Cafe Owner? Use Web Panel</Text>
      </TouchableOpacity>
    </>
  );

  // OTP Input Step
  const renderOtpStep = () => (
    <>
      <TouchableOpacity style={styles.backBtn} onPress={() => { setStep('phone'); setOtp(['', '', '', '', '', '']); setError(''); }}>
        <Ionicons name="arrow-back" size={24} color="#1C1C2E" />
      </TouchableOpacity>

      <View style={styles.iconContainer}>
        <View style={styles.otpBg}>
          <Ionicons name="shield-checkmark" size={40} color={GREEN} />
        </View>
      </View>
      
      <Text style={styles.title}>Verify OTP</Text>
      <Text style={styles.subtitle}>Enter the 6-digit code sent to +91 {phone}</Text>

      {/* Demo OTP Display */}
      {demoOtp && (
        <View style={styles.demoOtpBox}>
          <Ionicons name="information-circle" size={16} color="#FF9F0A" />
          <Text style={styles.demoOtpText}>Demo OTP: <Text style={styles.demoOtpCode}>{demoOtp}</Text></Text>
        </View>
      )}

      <View style={styles.otpContainer}>
        {otp.map((digit, index) => (
          <TextInput
            key={index}
            ref={ref => otpRefs.current[index] = ref}
            style={[styles.otpInput, digit && styles.otpInputFilled]}
            value={digit}
            onChangeText={(value) => handleOtpChange(value, index)}
            onKeyPress={(e) => handleOtpKeyPress(e, index)}
            keyboardType="number-pad"
            maxLength={1}
            selectTextOnFocus
          />
        ))}
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <TouchableOpacity 
        style={[styles.primaryBtn, otp.join('').length !== 6 && styles.primaryBtnDisabled]} 
        onPress={handleVerifyOtp} 
        disabled={loading || otp.join('').length !== 6}
      >
        {loading ? (
          <ActivityIndicator color="#FFF" />
        ) : (
          <>
            <Text style={styles.primaryBtnText}>Verify & Continue</Text>
            <Ionicons name="checkmark-circle" size={20} color="#FFF" />
          </>
        )}
      </TouchableOpacity>

      <TouchableOpacity 
        style={styles.resendBtn} 
        onPress={handleResendOtp}
        disabled={countdown > 0}
      >
        <Ionicons name="refresh" size={16} color={countdown > 0 ? '#B0B0B0' : Z_RED} />
        <Text style={[styles.resendText, countdown > 0 && { color: '#B0B0B0' }]}>
          {countdown > 0 ? `Resend OTP in ${countdown}s` : 'Resend OTP'}
        </Text>
      </TouchableOpacity>
    </>
  );

  // Name Input Step (for new users)
  const renderNameStep = () => (
    <>
      <View style={styles.iconContainer}>
        <View style={styles.nameBg}>
          <Ionicons name="person" size={40} color="#5B5FE0" />
        </View>
      </View>
      
      <Text style={styles.title}>What's your name?</Text>
      <Text style={styles.subtitle}>Let us know what to call you</Text>

      <TextInput
        style={styles.nameInput}
        value={name}
        onChangeText={setName}
        placeholder="Enter your name"
        placeholderTextColor="#B0B0B0"
        autoCapitalize="words"
        autoFocus
      />

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <TouchableOpacity 
        style={[styles.primaryBtn, !name.trim() && styles.primaryBtnDisabled]} 
        onPress={handleSaveName} 
        disabled={!name.trim()}
      >
        <Text style={styles.primaryBtnText}>Continue</Text>
        <Ionicons name="arrow-forward" size={20} color="#FFF" />
      </TouchableOpacity>
    </>
  );

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          {/* Logo */}
          <View style={styles.logoSection}>
            <View style={styles.logoBg}>
              <Ionicons name="restaurant" size={32} color="#FFF" />
            </View>
            <Text style={styles.brand}>diet cafe</Text>
          </View>

          <View style={styles.formCard}>
            {step === 'phone' && renderPhoneStep()}
            {step === 'otp' && renderOtpStep()}
            {step === 'name' && renderNameStep()}
          </View>

          <Text style={styles.terms}>
            By continuing, you agree to our Terms of Service & Privacy Policy
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F8F8F8' },
  scroll: { flexGrow: 1, justifyContent: 'center', padding: 24 },
  
  // Logo
  logoSection: { alignItems: 'center', marginBottom: 32 },
  logoBg: { width: 64, height: 64, borderRadius: 16, backgroundColor: Z_RED, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  brand: { fontSize: 28, fontWeight: '800', color: '#1C1C2E' },
  
  // Form Card
  formCard: { backgroundColor: '#FFF', borderRadius: 20, padding: 24, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 12, elevation: 4 },
  
  // Back button
  backBtn: { position: 'absolute', top: 16, left: 16, width: 40, height: 40, borderRadius: 20, backgroundColor: '#F5F5F5', alignItems: 'center', justifyContent: 'center', zIndex: 10 },
  
  // Icon containers
  iconContainer: { alignItems: 'center', marginBottom: 20, marginTop: 8 },
  phoneBg: { width: 80, height: 80, borderRadius: 40, backgroundColor: '#FDE8EA', alignItems: 'center', justifyContent: 'center' },
  otpBg: { width: 80, height: 80, borderRadius: 40, backgroundColor: '#E8F5E9', alignItems: 'center', justifyContent: 'center' },
  nameBg: { width: 80, height: 80, borderRadius: 40, backgroundColor: '#E8E8FF', alignItems: 'center', justifyContent: 'center' },
  
  // Titles
  title: { fontSize: 22, fontWeight: '800', color: '#1C1C2E', textAlign: 'center', marginBottom: 8 },
  subtitle: { fontSize: 14, color: '#696969', textAlign: 'center', marginBottom: 24 },
  
  // Phone input
  phoneInputContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F5F5F5', borderRadius: 12, overflow: 'hidden', marginBottom: 16 },
  countryCode: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 14, backgroundColor: '#EFEFEF', gap: 6 },
  flag: { fontSize: 18 },
  countryText: { fontSize: 16, fontWeight: '600', color: '#1C1C2E' },
  phoneInput: { flex: 1, fontSize: 18, fontWeight: '600', color: '#1C1C2E', paddingHorizontal: 14, paddingVertical: 14, letterSpacing: 1 },
  
  // OTP input
  otpContainer: { flexDirection: 'row', justifyContent: 'center', gap: 10, marginBottom: 20 },
  otpInput: { width: 48, height: 56, borderRadius: 12, backgroundColor: '#F5F5F5', borderWidth: 2, borderColor: '#EFEFEF', textAlign: 'center', fontSize: 22, fontWeight: '700', color: '#1C1C2E' },
  otpInputFilled: { borderColor: GREEN, backgroundColor: '#E8F5E9' },
  
  // Demo OTP box
  demoOtpBox: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#FFF8E1', borderRadius: 10, padding: 12, marginBottom: 16 },
  demoOtpText: { fontSize: 13, color: '#FF9F0A' },
  demoOtpCode: { fontWeight: '800', fontSize: 16, letterSpacing: 2 },
  
  // Name input
  nameInput: { backgroundColor: '#F5F5F5', borderRadius: 12, padding: 16, fontSize: 18, fontWeight: '600', color: '#1C1C2E', marginBottom: 16, textAlign: 'center' },
  
  // Buttons
  primaryBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: Z_RED, borderRadius: 14, paddingVertical: 16, marginBottom: 12 },
  primaryBtnDisabled: { backgroundColor: '#D0D0D0' },
  primaryBtnText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
  
  resendBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12 },
  resendText: { fontSize: 14, fontWeight: '600', color: Z_RED },
  
  // Divider
  divider: { flexDirection: 'row', alignItems: 'center', marginVertical: 20 },
  dividerLine: { flex: 1, height: 1, backgroundColor: '#EFEFEF' },
  dividerText: { paddingHorizontal: 16, fontSize: 13, color: '#B0B0B0' },
  
  // Admin button
  adminBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#FDE8EA', borderRadius: 12, paddingVertical: 14 },
  adminBtnText: { fontSize: 14, fontWeight: '600', color: Z_RED },
  
  // Staff button
  staffBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#F5F5F5', borderRadius: 12, paddingVertical: 14, marginTop: 10 },
  staffBtnText: { fontSize: 14, fontWeight: '600', color: '#1C1C2E' },
  
  // Error
  error: { color: Z_RED, fontSize: 13, textAlign: 'center', marginBottom: 12 },
  
  // Terms
  terms: { fontSize: 11, color: '#B0B0B0', textAlign: 'center', marginTop: 24 },
});
