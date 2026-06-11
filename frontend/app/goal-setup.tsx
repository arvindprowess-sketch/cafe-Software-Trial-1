import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput,
  ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiCall } from '../utils/api';
import { FUEL, FONT, getGoal, RADIUS, SPACE } from '../utils/theme';
import { ACTIVITY_LEVELS, GENDERS } from '../utils/goalFit';

// Phase 2 — Goal personalization: collect body stats, compute the daily target.
export default function GoalSetupScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const goalKey = (params.goal as string) || 'maintenance';
  const next = (params.next as string) || 'home';
  const goalInfo = getGoal(goalKey);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [step, setStep] = useState<'form' | 'result'>('form');
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState('');

  const [height, setHeight] = useState('');
  const [weight, setWeight] = useState('');
  const [age, setAge] = useState('');
  const [gender, setGender] = useState('male');
  const [activity, setActivity] = useState('light');
  const [targetWeight, setTargetWeight] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const d = await apiCall('/user/daily-target');
        if (d?.height_cm) setHeight(String(d.height_cm));
        if (d?.weight_kg) setWeight(String(d.weight_kg));
        if (d?.age) setAge(String(d.age));
        if (d?.gender) setGender(d.gender);
        if (d?.activity_level) setActivity(d.activity_level);
        if (d?.target_weight_kg) setTargetWeight(String(d.target_weight_kg));
      } catch {}
      finally { setLoading(false); }
    })();
  }, []);

  const save = async () => {
    setError('');
    const h = parseFloat(height), w = parseFloat(weight), a = parseInt(age);
    if (!h || !w || !a) { setError('Please add your height, weight and age to personalize your plan.'); return; }
    if (h < 90 || h > 250) { setError('Please enter a valid height in cm (90–250).'); return; }
    if (w < 25 || w > 350) { setError('Please enter a valid weight in kg (25–350).'); return; }
    if (a < 13 || a > 100) { setError('Please enter a valid age (13–100).'); return; }
    setSaving(true);
    try {
      const res = await apiCall('/user/daily-target', {
        method: 'POST',
        body: {
          height_cm: h, weight_kg: w, age: a, gender, activity_level: activity,
          target_weight_kg: targetWeight ? parseFloat(targetWeight) : null,
          fitness_goal: goalKey,
        },
      });
      // refresh cached user so other screens see the new target immediately
      try {
        const stored = await AsyncStorage.getItem('user_data');
        const u = stored ? JSON.parse(stored) : {};
        await AsyncStorage.setItem('user_data', JSON.stringify({
          ...u, fitness_goal: goalKey, has_body_stats: true,
          height_cm: h, weight_kg: w, age: a, gender, activity_level: activity,
          target_weight_kg: targetWeight ? parseFloat(targetWeight) : null,
          daily_calories: res.daily_calories, daily_protein: res.daily_protein,
          daily_carbs: res.daily_carbs, daily_fat: res.daily_fat,
        }));
      } catch {}
      setResult(res);
      setStep('result');
    } catch (e: any) { setError(e.message || 'Something went wrong. Please try again.'); }
    finally { setSaving(false); }
  };

  const goNext = () => {
    if (next === 'meal-plan') router.replace('/meal-plan');
    else router.replace('/(tabs)/home');
  };

  if (loading) {
    return <SafeAreaView style={styles.safe}><View style={styles.center}><ActivityIndicator size="large" color={FUEL.ink} /></View></SafeAreaView>;
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity testID="goal-setup-back" style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={22} color={FUEL.sand} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{step === 'form' ? 'Personalize' : 'Your Target'}</Text>
        <View style={{ width: 40 }} />
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {step === 'form' ? (
            <>
              <View style={[styles.goalPill, { backgroundColor: (goalInfo?.color || FUEL.ink) + '18', borderColor: goalInfo?.color || FUEL.ink }]}>
                <Ionicons name={(goalInfo?.icon as any) || 'flag'} size={16} color={goalInfo?.color || FUEL.ink} />
                <Text style={[styles.goalPillText, { color: goalInfo?.color || FUEL.ink }]}>{goalInfo?.label || 'Goal'}</Text>
              </View>
              <Text style={styles.title}>Let's tailor this to you</Text>
              <Text style={styles.subtitle}>A few quick details and we'll set a daily target that fits your goal. No judgement — just a starting point you can adjust anytime.</Text>

              <View style={styles.row}>
                <View style={styles.inputCol}>
                  <Text style={styles.label}>Height (cm)</Text>
                  <TextInput testID="gs-height" style={styles.input} value={height} onChangeText={setHeight} keyboardType="decimal-pad" placeholder="175" placeholderTextColor="#B8B4A6" />
                </View>
                <View style={styles.inputCol}>
                  <Text style={styles.label}>Weight (kg)</Text>
                  <TextInput testID="gs-weight" style={styles.input} value={weight} onChangeText={setWeight} keyboardType="decimal-pad" placeholder="70" placeholderTextColor="#B8B4A6" />
                </View>
              </View>

              <View style={styles.row}>
                <View style={styles.inputCol}>
                  <Text style={styles.label}>Age</Text>
                  <TextInput testID="gs-age" style={styles.input} value={age} onChangeText={setAge} keyboardType="number-pad" placeholder="28" placeholderTextColor="#B8B4A6" />
                </View>
                <View style={styles.inputCol}>
                  <Text style={styles.label}>Target weight (kg) · optional</Text>
                  <TextInput testID="gs-target-weight" style={styles.input} value={targetWeight} onChangeText={setTargetWeight} keyboardType="decimal-pad" placeholder="65" placeholderTextColor="#B8B4A6" />
                </View>
              </View>

              <Text style={styles.label}>Gender</Text>
              <View style={styles.chipRow}>
                {GENDERS.map(gn => (
                  <TouchableOpacity key={gn.key} testID={`gs-gender-${gn.key}`}
                    style={[styles.chip, gender === gn.key && styles.chipActive]}
                    onPress={() => setGender(gn.key)}>
                    <Text style={[styles.chipText, gender === gn.key && styles.chipTextActive]}>{gn.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.label}>Activity level</Text>
              <View style={styles.activityWrap}>
                {ACTIVITY_LEVELS.map(al => (
                  <TouchableOpacity key={al.key} testID={`gs-activity-${al.key}`}
                    style={[styles.activityRow, activity === al.key && styles.activityRowActive]}
                    onPress={() => setActivity(al.key)}>
                    <Ionicons name={activity === al.key ? 'radio-button-on' : 'radio-button-off'} size={18} color={activity === al.key ? FUEL.limeDeep : '#9C9883'} />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.activityLabel, activity === al.key && { color: FUEL.ink }]}>{al.label}</Text>
                      <Text style={styles.activityDesc}>{al.desc}</Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </View>

              <View style={styles.consentBox} testID="gs-consent">
                <Ionicons name="shield-checkmark" size={16} color={FUEL.limeDeep} />
                <Text style={styles.consentText}>This is health data. We store it only to personalize your meals — never shared. You can edit or clear it anytime.</Text>
              </View>

              {error ? <Text style={styles.error} testID="gs-error">{error}</Text> : null}

              <TouchableOpacity testID="gs-save" style={styles.cta} onPress={save} disabled={saving}>
                <Text style={styles.ctaText}>{saving ? 'Calculating…' : 'Calculate my target'}</Text>
              </TouchableOpacity>
              <View style={{ height: 40 }} />
            </>
          ) : (
            <View testID="gs-result">
              <Text style={styles.resultHi}>You're all set! 🎯</Text>
              <Text style={styles.subtitle}>Here's a daily target for your {goalInfo?.label?.toLowerCase() || 'goal'}. Hit it most days and you'll be moving in the right direction — progress over perfection.</Text>

              <View style={styles.targetCard}>
                <View style={styles.targetMain}>
                  <Text style={styles.targetBig} testID="gs-result-calories">{result?.daily_calories}</Text>
                  <Text style={styles.targetUnit}>kcal / day</Text>
                </View>
                <View style={styles.macroRow}>
                  <View style={styles.macroBox}>
                    <Text style={[styles.macroVal, { color: FUEL.protein }]} testID="gs-result-protein">{result?.daily_protein}g</Text>
                    <Text style={styles.macroLbl}>Protein</Text>
                  </View>
                  <View style={styles.macroBox}>
                    <Text style={[styles.macroVal, { color: FUEL.carbs }]}>{result?.daily_carbs}g</Text>
                    <Text style={styles.macroLbl}>Carbs</Text>
                  </View>
                  <View style={styles.macroBox}>
                    <Text style={[styles.macroVal, { color: FUEL.fat }]}>{result?.daily_fat}g</Text>
                    <Text style={styles.macroLbl}>Fat</Text>
                  </View>
                </View>
                <View style={styles.bmrRow}>
                  <Text style={styles.bmrText}>BMR ~{result?.bmr} · TDEE ~{result?.tdee} kcal</Text>
                </View>
              </View>

              {Array.isArray(result?.notes) && result.notes.map((n: string, i: number) => (
                <View key={i} style={styles.noteRow}>
                  <Ionicons name="information-circle" size={15} color={FUEL.muted} />
                  <Text style={styles.noteText}>{n}</Text>
                </View>
              ))}

              <Text style={styles.disclaimer}>{result?.disclaimer}</Text>

              <TouchableOpacity testID="gs-plan-meals" style={styles.cta} onPress={() => router.replace('/meal-plan')}>
                <Text style={styles.ctaText}>Plan my meals</Text>
              </TouchableOpacity>
              <TouchableOpacity testID="gs-done" style={styles.secondaryCta} onPress={goNext}>
                <Text style={styles.secondaryCtaText}>Done</Text>
              </TouchableOpacity>
              <View style={{ height: 40 }} />
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: FUEL.sand },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: FUEL.ink, paddingHorizontal: SPACE.m, paddingVertical: SPACE.m },
  backBtn: { width: 40, height: 40, borderRadius: RADIUS.lg, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontFamily: FONT.display, fontSize: 20, color: FUEL.sand, textTransform: 'uppercase', letterSpacing: 1 },
  content: { padding: SPACE.l },
  goalPill: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: SPACE.s, paddingHorizontal: SPACE.m, paddingVertical: SPACE.s, borderRadius: RADIUS.lg, borderWidth: 1.5, marginBottom: SPACE.l },
  goalPillText: { fontSize: 13, fontFamily: FONT.bodyExtrabold, textTransform: 'uppercase', letterSpacing: 0.5 },
  title: { fontFamily: FONT.display, fontSize: 28, color: FUEL.ink, textTransform: 'uppercase', lineHeight: 30, marginBottom: SPACE.s },
  subtitle: { fontSize: 14, color: FUEL.muted, lineHeight: 20, marginBottom: SPACE.xl },
  row: { flexDirection: 'row', gap: SPACE.m },
  inputCol: { flex: 1, marginBottom: SPACE.l },
  label: { fontSize: 13, fontFamily: FONT.bodyBold, color: FUEL.ink, marginBottom: SPACE.s },
  input: { backgroundColor: FUEL.white, borderRadius: RADIUS.md, borderWidth: 1.5, borderColor: FUEL.sandBorder, padding: SPACE.m, fontSize: 18, fontFamily: FONT.bodyBold, color: FUEL.ink },
  chipRow: { flexDirection: 'row', gap: SPACE.m, marginBottom: SPACE.l },
  chip: { flex: 1, alignItems: 'center', paddingVertical: SPACE.m, borderRadius: RADIUS.md, backgroundColor: FUEL.white, borderWidth: 1.5, borderColor: FUEL.sandBorder },
  chipActive: { backgroundColor: FUEL.ink, borderColor: FUEL.ink },
  chipText: { fontSize: 14, fontFamily: FONT.bodyBold, color: FUEL.muted },
  chipTextActive: { color: FUEL.sand },
  activityWrap: { gap: SPACE.s, marginBottom: SPACE.l },
  activityRow: { flexDirection: 'row', alignItems: 'center', gap: SPACE.m, padding: SPACE.m, borderRadius: RADIUS.md, backgroundColor: FUEL.white, borderWidth: 1.5, borderColor: FUEL.sandBorder },
  activityRowActive: { borderColor: FUEL.limeDeep, backgroundColor: FUEL.limeTint },
  activityLabel: { fontSize: 14, fontFamily: FONT.bodyBold, color: FUEL.muted },
  activityDesc: { fontSize: 12, color: FUEL.muted, marginTop: 1 },
  consentBox: { flexDirection: 'row', alignItems: 'flex-start', gap: SPACE.s, backgroundColor: FUEL.limeTint, borderRadius: RADIUS.md, padding: SPACE.m, marginBottom: SPACE.l },
  consentText: { flex: 1, fontSize: 12, color: '#4F5A2E', lineHeight: 17 },
  error: { color: FUEL.error, fontSize: 13, fontFamily: FONT.bodySemibold, marginBottom: SPACE.m },
  cta: { backgroundColor: FUEL.lime, borderRadius: RADIUS.md, paddingVertical: SPACE.l, alignItems: 'center' },
  ctaText: { fontFamily: FONT.display, fontSize: 18, color: FUEL.ink, textTransform: 'uppercase', letterSpacing: 1 },
  secondaryCta: { paddingVertical: SPACE.l, alignItems: 'center', marginTop: SPACE.s },
  secondaryCtaText: { fontSize: 15, fontFamily: FONT.bodyBold, color: FUEL.muted },
  resultHi: { fontFamily: FONT.display, fontSize: 30, color: FUEL.ink, textTransform: 'uppercase', marginBottom: SPACE.s },
  targetCard: { backgroundColor: FUEL.ink, borderRadius: RADIUS.lg, padding: SPACE.xl, marginBottom: SPACE.l },
  targetMain: { alignItems: 'center', marginBottom: SPACE.l },
  targetBig: { fontFamily: FONT.display, fontSize: 56, color: FUEL.lime, lineHeight: 58 },
  targetUnit: { fontSize: 14, color: FUEL.sand, opacity: 0.8, letterSpacing: 1, textTransform: 'uppercase' },
  macroRow: { flexDirection: 'row', justifyContent: 'space-around', borderTopWidth: 1, borderTopColor: '#2C2B22', paddingTop: SPACE.l },
  macroBox: { alignItems: 'center' },
  macroVal: { fontSize: 22, fontFamily: FONT.bodyExtrabold },
  macroLbl: { fontSize: 12, color: FUEL.sand, opacity: 0.7, marginTop: 2 },
  bmrRow: { alignItems: 'center', marginTop: SPACE.l },
  bmrText: { fontSize: 12, color: FUEL.sand, opacity: 0.6 },
  noteRow: { flexDirection: 'row', alignItems: 'flex-start', gap: SPACE.s, marginBottom: SPACE.s },
  noteText: { flex: 1, fontSize: 12.5, color: FUEL.muted, lineHeight: 17 },
  disclaimer: { fontSize: 11.5, color: '#9C9883', lineHeight: 16, fontStyle: 'italic', marginTop: SPACE.s, marginBottom: SPACE.l },
});
