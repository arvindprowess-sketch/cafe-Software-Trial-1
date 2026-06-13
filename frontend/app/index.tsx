import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator, Alert, Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiCall } from '../utils/api';
import { FUEL, FONT, RADIUS, SPACE } from '../utils/theme';

type Step = 'phone' | 'otp' | 'name';

// Brand hero: render full-width at the artwork's natural aspect (no fixed tall
// height, no letterbox). Ratio matches brand-hero.png (989x1023) — update if the
// asset's dimensions change.
const HERO_SRC = require('../assets/images/brand-hero.png');
const HERO_ASPECT = 989 / 1023;

// P8 compliance: legal links shown under the primary CTA. Env-overridable per build.
const PRIVACY_URL = process.env.EXPO_PUBLIC_PRIVACY_URL || 'https://boraroc.in/privacy';
const TERMS_URL = process.env.EXPO_PUBLIC_TERMS_URL || 'https://boraroc.in/terms';

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
  const [mode, setMode] = useState<'login' | 'signup'>('login'); // LOGIN / SIGN UP tabs (phone step only)

  const otpRefs = useRef<(TextInput | null)[]>([]);

  const switchMode = (m: 'login' | 'signup') => {
    if (m === mode) return;
    setMode(m); setError(''); setName('');
  };

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

      // DEV-ONLY: backend returns dev_otp only when no SMS provider (MSG91) is configured
      if (result.dev_otp) {
        setDemoOtp(result.dev_otp);
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
          placeholderTextColor={FUEL.muted}
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
          <ActivityIndicator color={FUEL.ink} />
        ) : (
          <>
            <Text style={styles.primaryBtnText}>Get OTP</Text>
            <Ionicons name="arrow-forward" size={20} color={FUEL.ink} />
          </>
        )}
      </TouchableOpacity>

      <View style={styles.divider}>
        <View style={styles.dividerLine} />
        <Text style={styles.dividerText}>or</Text>
        <View style={styles.dividerLine} />
      </View>

      <TouchableOpacity style={styles.adminBtn} onPress={handleAdminLogin}>
        <Ionicons name="storefront" size={18} color={FUEL.ink} />
        <Text style={styles.adminBtnText}>Cafe Owner? Use Web Panel</Text>
      </TouchableOpacity>
    </>
  );

  // Sign Up Step (name + phone, then the SAME OTP verify flow)
  const renderSignupStep = () => {
    const phoneValid = phone.replace(/\D/g, '').length === 10;
    const valid = !!name.trim() && phoneValid;
    return (
      <>
        <Text style={styles.title}>Create your account</Text>
        <Text style={styles.subtitle}>We'll verify your number with an OTP</Text>

        <TextInput
          testID="signup-name"
          style={styles.nameInput}
          value={name}
          onChangeText={setName}
          placeholder="Your name"
          placeholderTextColor={FUEL.muted}
          autoCapitalize="words"
        />

        <View style={styles.phoneInputContainer}>
          <View style={styles.countryCode}>
            <Text style={styles.flag}>🇮🇳</Text>
            <Text style={styles.countryText}>+91</Text>
          </View>
          <TextInput
            testID="signup-phone"
            style={styles.phoneInput}
            value={phone}
            onChangeText={setPhone}
            placeholder="9876543210"
            placeholderTextColor={FUEL.muted}
            keyboardType="phone-pad"
            maxLength={10}
          />
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <TouchableOpacity
          testID="signup-submit"
          style={[styles.primaryBtn, !valid && styles.primaryBtnDisabled]}
          onPress={handleSendOtp}
          disabled={loading || !valid}
        >
          {loading ? (
            <ActivityIndicator color={FUEL.ink} />
          ) : (
            <>
              <Text style={styles.primaryBtnText}>Get OTP</Text>
              <Ionicons name="arrow-forward" size={20} color={FUEL.ink} />
            </>
          )}
        </TouchableOpacity>
      </>
    );
  };

  // OTP Input Step
  const renderOtpStep = () => (
    <>
      <TouchableOpacity style={styles.backBtn} onPress={() => { setStep('phone'); setOtp(['', '', '', '', '', '']); setError(''); }}>
        <Ionicons name="arrow-back" size={24} color={FUEL.ink} />
      </TouchableOpacity>

      <View style={styles.iconContainer}>
        <View style={styles.otpBg}>
          <Ionicons name="shield-checkmark" size={40} color={FUEL.success} />
        </View>
      </View>

      <Text style={styles.title}>Verify OTP</Text>
      <Text style={styles.subtitle}>Enter the 6-digit code sent to +91 {phone}</Text>

      {/* Demo OTP Display */}
      {demoOtp && (
        <View style={styles.demoOtpBox}>
          <Ionicons name="information-circle" size={16} color={FUEL.warning} />
          <Text style={styles.demoOtpText}>Demo OTP: <Text style={styles.demoOtpCode}>{demoOtp}</Text></Text>
        </View>
      )}

      <View style={styles.otpContainer}>
        {otp.map((digit, index) => (
          <TextInput
            key={index}
            ref={ref => { otpRefs.current[index] = ref; }}
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
          <ActivityIndicator color={FUEL.ink} />
        ) : (
          <>
            <Text style={styles.primaryBtnText}>Verify & Continue</Text>
            <Ionicons name="checkmark-circle" size={20} color={FUEL.ink} />
          </>
        )}
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.resendBtn}
        onPress={handleResendOtp}
        disabled={countdown > 0}
      >
        <Ionicons name="refresh" size={16} color={countdown > 0 ? FUEL.muted : FUEL.limeDeep} />
        <Text style={[styles.resendText, countdown > 0 && { color: FUEL.muted }]}>
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
          <Ionicons name="person" size={40} color={FUEL.fat} />
        </View>
      </View>

      <Text style={styles.title}>What's your name?</Text>
      <Text style={styles.subtitle}>Let us know what to call you</Text>

      <TextInput
        style={styles.nameInput}
        value={name}
        onChangeText={setName}
        placeholder="Enter your name"
        placeholderTextColor={FUEL.muted}
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
        <Ionicons name="arrow-forward" size={20} color={FUEL.ink} />
      </TouchableOpacity>
    </>
  );

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          {/* HERO — approved brand lockup (Option A2): full width, edge-to-edge,
              whole lockup visible (contain, natural aspect — never crop). Cream
              artwork background blends into the sand screen. The image already
              contains the logo, wordmark, tagline and ROC strip. */}
          <Image
            testID="brand-hero"
            source={HERO_SRC}
            style={[styles.heroImg, { aspectRatio: HERO_ASPECT }]}
            contentFit="contain"
          />

          {/* LOGIN / SIGN UP tabs (shown on the phone/entry step) */}
          {step === 'phone' && (
            <View style={styles.tabRow}>
              <TouchableOpacity
                testID="auth-tab-login"
                style={[styles.tab, mode === 'login' && styles.tabActive]}
                onPress={() => switchMode('login')}
              >
                <Text style={[styles.tabText, mode === 'login' && styles.tabTextActive]}>LOGIN</Text>
              </TouchableOpacity>
              <TouchableOpacity
                testID="auth-tab-signup"
                style={[styles.tab, mode === 'signup' && styles.tabActive]}
                onPress={() => switchMode('signup')}
              >
                <Text style={[styles.tabText, mode === 'signup' && styles.tabTextActive]}>SIGN UP</Text>
              </TouchableOpacity>
            </View>
          )}

          <View style={styles.formCard}>
            {step === 'phone' && (mode === 'signup' ? renderSignupStep() : renderPhoneStep())}
            {step === 'otp' && renderOtpStep()}
            {step === 'name' && renderNameStep()}
          </View>

          {/* P8 compliance: consent line with tappable legal links */}
          <Text style={styles.terms} testID="consent-line">
            By continuing you agree to our{' '}
            <Text style={styles.termsLink} onPress={() => Linking.openURL(PRIVACY_URL)}>Privacy Policy</Text>
            {' '}and{' '}
            <Text style={styles.termsLink} onPress={() => Linking.openURL(TERMS_URL)}>Terms</Text>
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: FUEL.sand },
  scroll: { flexGrow: 1, paddingBottom: SPACE.xl },

  // HERO — full-width brand lockup at natural aspect (aspectRatio applied inline)
  heroImg: { width: '100%' },

  // LOGIN / SIGN UP segmented tabs
  tabRow: { flexDirection: 'row', marginHorizontal: SPACE.xl, marginTop: SPACE.l, marginBottom: SPACE.l, backgroundColor: FUEL.white, borderRadius: RADIUS.pill, padding: 4, borderWidth: 1.5, borderColor: FUEL.sandBorder },
  tab: { flex: 1, alignItems: 'center', paddingVertical: SPACE.m, borderRadius: RADIUS.pill },
  tabActive: { backgroundColor: FUEL.ink },
  tabText: { fontFamily: FONT.display, fontSize: 15, color: FUEL.muted, letterSpacing: 0.5 },
  tabTextActive: { color: FUEL.lime },

  // Form Card
  formCard: { backgroundColor: FUEL.white, borderRadius: RADIUS.lg, padding: SPACE.l, marginHorizontal: SPACE.xl, shadowColor: FUEL.ink, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.15, shadowRadius: 20, elevation: 6 },

  // Back button
  backBtn: { position: 'absolute', top: 16, left: 16, width: 40, height: 40, borderRadius: 20, backgroundColor: FUEL.sand, alignItems: 'center', justifyContent: 'center', zIndex: 10 }, // circle

  // Icon containers
  iconContainer: { alignItems: 'center', marginBottom: SPACE.xl, marginTop: SPACE.s },
  phoneBg: { width: 80, height: 80, borderRadius: 40, backgroundColor: FUEL.limeTint, alignItems: 'center', justifyContent: 'center' }, // circle
  otpBg: { width: 80, height: 80, borderRadius: 40, backgroundColor: FUEL.limeTint, alignItems: 'center', justifyContent: 'center' }, // circle
  nameBg: { width: 80, height: 80, borderRadius: 40, backgroundColor: FUEL.fatTint, alignItems: 'center', justifyContent: 'center' }, // circle

  // Titles
  title: { fontFamily: FONT.display, fontSize: 24, color: FUEL.ink, textAlign: 'center', marginBottom: SPACE.s, textTransform: 'uppercase', letterSpacing: 0.3 },
  subtitle: { fontFamily: FONT.body, fontSize: 14, color: FUEL.muted, textAlign: 'center', marginBottom: SPACE.l },

  // Phone input
  phoneInputContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: FUEL.sand, borderRadius: RADIUS.md, overflow: 'hidden', marginBottom: SPACE.l, borderWidth: 1.5, borderColor: FUEL.sandBorder },
  countryCode: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACE.l, paddingVertical: SPACE.l, backgroundColor: FUEL.sandBorder, gap: SPACE.s },
  flag: { fontSize: 18 },
  countryText: { fontFamily: FONT.bodyBold, fontSize: 16, color: FUEL.ink },
  phoneInput: { flex: 1, fontFamily: FONT.bodySemibold, fontSize: 18, color: FUEL.ink, paddingHorizontal: SPACE.l, paddingVertical: SPACE.l, letterSpacing: 1 },

  // OTP input
  otpContainer: { flexDirection: 'row', justifyContent: 'center', gap: SPACE.m, marginBottom: SPACE.xl },
  otpInput: { width: 48, height: 56, borderRadius: RADIUS.md, backgroundColor: FUEL.sand, borderWidth: 1.5, borderColor: FUEL.sandBorder, textAlign: 'center', fontFamily: FONT.bodyExtrabold, fontSize: 22, color: FUEL.ink },
  otpInputFilled: { borderColor: FUEL.limeDeep, backgroundColor: FUEL.limeTint },

  // Demo OTP box
  demoOtpBox: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACE.s, backgroundColor: FUEL.sand, borderRadius: RADIUS.md, padding: SPACE.m, marginBottom: SPACE.l },
  demoOtpText: { fontFamily: FONT.body, fontSize: 13, color: FUEL.muted },
  demoOtpCode: { fontFamily: FONT.bodyExtrabold, fontSize: 16, letterSpacing: 2, color: FUEL.ink },

  // Name input
  nameInput: { backgroundColor: FUEL.sand, borderRadius: RADIUS.md, padding: SPACE.l, fontFamily: FONT.bodySemibold, fontSize: 18, color: FUEL.ink, marginBottom: SPACE.l, textAlign: 'center', borderWidth: 1.5, borderColor: FUEL.sandBorder },

  // Buttons (lime pill CTA)
  primaryBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACE.s, backgroundColor: FUEL.lime, borderRadius: RADIUS.pill, paddingVertical: SPACE.l, marginBottom: SPACE.m },
  primaryBtnDisabled: { backgroundColor: FUEL.sandBorder },
  primaryBtnText: { color: FUEL.ink, fontFamily: FONT.display, fontSize: 16, textTransform: 'uppercase', letterSpacing: 0.5 },

  resendBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACE.s, paddingVertical: SPACE.m },
  resendText: { fontFamily: FONT.bodyBold, fontSize: 14, color: FUEL.limeDeep },

  // Divider
  divider: { flexDirection: 'row', alignItems: 'center', marginVertical: SPACE.m },
  dividerLine: { flex: 1, height: 1, backgroundColor: FUEL.sandBorder },
  dividerText: { paddingHorizontal: SPACE.l, fontFamily: FONT.body, fontSize: 13, color: FUEL.muted },

  // Admin button
  adminBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACE.s, backgroundColor: FUEL.limeTint, borderRadius: RADIUS.md, paddingVertical: SPACE.l },
  adminBtnText: { fontFamily: FONT.bodyBold, fontSize: 14, color: FUEL.ink },

  // Staff button
  staffBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACE.s, backgroundColor: FUEL.sand, borderRadius: RADIUS.md, paddingVertical: SPACE.l, marginTop: SPACE.m },
  staffBtnText: { fontFamily: FONT.bodyBold, fontSize: 14, color: FUEL.ink },

  // Error
  error: { color: FUEL.error, fontFamily: FONT.bodySemibold, fontSize: 13, textAlign: 'center', marginBottom: SPACE.m },

  // Terms / consent line
  terms: { fontFamily: FONT.body, fontSize: 11, color: FUEL.muted, textAlign: 'center', marginTop: SPACE.xl, paddingHorizontal: SPACE.xl },
  termsLink: { fontFamily: FONT.bodySemibold, color: FUEL.ink, textDecorationLine: 'underline' },
});
