import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { apiCall, getStoredUser, logout } from '../../utils/api';
import { GOALS as FUEL_GOALS } from '../../utils/theme';

// UPDATED: 2026-06-05 - Profile goals now use the canonical shared GOALS (theme.ts)
// so the value sent to the backend matches GOAL_CAL_FACTOR / GOAL_PROTEIN_PER_KG keys.
const Z_RED = '#15140F';
const GOALS = FUEL_GOALS;

export default function ProfileScreen() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [goal, setGoal] = useState('maintenance');
  const [calories, setCalories] = useState('2000');
  const [protein, setProtein] = useState('100');
  const [carbs, setCarbs] = useState('250');
  const [fat, setFat] = useState('65');
  const [saving, setSaving] = useState(false);
  const [target, setTarget] = useState<any>(null);

  const loadTarget = async () => {
    try { setTarget(await apiCall('/user/daily-target')); } catch {}
  };

  // Log to verify goals array
  console.log('GOALS array length:', GOALS.length);
  console.log('GOALS:', GOALS.map(g => g.key));

  useEffect(() => {
    (async () => {
      const u = await getStoredUser();
      if (u) { setUser(u); setGoal(u.fitness_goal || 'maintenance'); setCalories(String(u.daily_calories || 2000)); setProtein(String(u.daily_protein || 100)); setCarbs(String(u.daily_carbs || 250)); setFat(String(u.daily_fat || 65)); }
      loadTarget();
    })();
  }, []);

  const saveGoals = async () => {
    setSaving(true);
    try {
      await apiCall('/user/goals', { method: 'PUT', body: { fitness_goal: goal, daily_calories: parseInt(calories) || 2000, daily_protein: parseInt(protein) || 100, daily_carbs: parseInt(carbs) || 250, daily_fat: parseInt(fat) || 65 } });
      await loadTarget();
      Alert.alert('Saved!', 'Your fitness goals have been updated');
    } catch (e: any) { Alert.alert('Error', e.message); }
    finally { setSaving(false); }
  };

  const handleLogout = async () => { await logout(); router.replace('/'); };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.title}>Profile</Text>

          <View style={styles.userCard}>
            <View style={styles.avatar}><Ionicons name="person" size={24} color={Z_RED} /></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.userName}>{user?.name || 'User'}</Text>
              <Text style={styles.userEmail}>{user?.email || ''}</Text>
            </View>
            <TouchableOpacity testID="logout-btn" onPress={handleLogout} style={styles.logoutBtn}>
              <Ionicons name="log-out-outline" size={20} color={Z_RED} />
            </TouchableOpacity>
          </View>

          <Text style={styles.section}>Fitness Goal ({GOALS.length} options)</Text>
          <View style={styles.goalsRow}>
            {GOALS.map(g => (
              <TouchableOpacity key={g.key} testID={`goal-${g.key}`} style={[styles.goalCard, goal === g.key && { borderColor: g.color, backgroundColor: `${g.color}10` }]} onPress={() => setGoal(g.key)}>
                <View style={[styles.goalIcon, { backgroundColor: goal === g.key ? g.color : '#F4F1E9' }]}>
                  <Ionicons name={g.icon as any} size={20} color={goal === g.key ? '#FFF' : '#6B6A5E'} />
                </View>
                <Text style={[styles.goalLabel, goal === g.key && { color: g.color, fontWeight: '700' }]}>{g.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.section}>Daily Targets</Text>
          {/* Phase 2: personalized target from body stats (auto-computed) */}
          {target?.has_body_stats ? (
            <View style={styles.targetHero} testID="profile-daily-target">
              <View style={styles.targetHeroRow}>
                <View>
                  <Text style={styles.targetHeroLabel}>PERSONALIZED TARGET</Text>
                  <Text style={styles.targetHeroValue} testID="profile-target-calories">{target.daily_calories} kcal · <Text style={{ color: '#E2603F' }} >{target.daily_protein}g protein</Text></Text>
                  <Text style={styles.targetHeroSub}>BMR ~{target.bmr} · TDEE ~{target.tdee} · {target.weight_kg}kg</Text>
                </View>
                <TouchableOpacity testID="profile-edit-stats" style={styles.editStatsBtn} onPress={() => router.push({ pathname: '/goal-setup', params: { goal: goal, next: 'home' } })}>
                  <Ionicons name="create-outline" size={16} color="#15140F" />
                  <Text style={styles.editStatsText}>Edit</Text>
                </TouchableOpacity>
              </View>
              <TouchableOpacity testID="profile-plan-meals" style={styles.planMealsBtn} onPress={() => router.push('/meal-plan')}>
                <Ionicons name="restaurant" size={15} color="#15140F" />
                <Text style={styles.planMealsText}>Plan my meals</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity testID="profile-setup-target" style={styles.setupTargetBtn} onPress={() => router.push({ pathname: '/goal-setup', params: { goal: goal, next: 'home' } })}>
              <Ionicons name="sparkles" size={16} color="#A6D62E" />
              <Text style={styles.setupTargetText}>Get a personalized target from your body stats</Text>
              <Ionicons name="chevron-forward" size={16} color="#6B6A5E" />
            </TouchableOpacity>
          )}
          <TouchableOpacity testID="profile-progress-link" style={styles.progressRow} onPress={() => router.push('/progress')}>
            <Ionicons name="stats-chart" size={18} color="#15140F" />
            <Text style={styles.progressRowText}>View my progress & weight log</Text>
            <Ionicons name="chevron-forward" size={16} color="#6B6A5E" />
          </TouchableOpacity>
          <Text style={styles.subLabel}>You can fine-tune the numbers below anytime.</Text>
          <View style={styles.targetsGrid}>
            {[
              { label: 'Calories (kcal)', val: calories, set: setCalories, color: Z_RED },
              { label: 'Protein (g)', val: protein, set: setProtein, color: Z_RED },
              { label: 'Carbs (g)', val: carbs, set: setCarbs, color: '#D69A35' },
              { label: 'Fat (g)', val: fat, set: setFat, color: '#15140F' },
            ].map(t => (
              <View key={t.label} style={styles.targetCard}>
                <Text style={[styles.targetLabel, { color: t.color }]}>{t.label}</Text>
                <TextInput testID={`target-${t.label.split(' ')[0].toLowerCase()}`} style={styles.targetInput} value={t.val} onChangeText={t.set} keyboardType="number-pad" />
              </View>
            ))}
          </View>

          <TouchableOpacity testID="save-goals-btn" style={styles.saveBtn} onPress={saveGoals} disabled={saving}>
            <Text style={styles.saveBtnText}>{saving ? 'Saving...' : 'Save Goals'}</Text>
          </TouchableOpacity>
          <View style={{ height: 40 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F4F1E9' },
  content: { padding: 16 },
  title: { fontSize: 24, fontWeight: '800', color: '#15140F', marginBottom: 16, marginTop: 8 },
  userCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#FFF', borderRadius: 14, padding: 16, borderWidth: 1, borderColor: '#E6E1D4', marginBottom: 20 },
  avatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#F1E7E1', alignItems: 'center', justifyContent: 'center' },
  userName: { fontSize: 17, fontWeight: '700', color: '#15140F' },
  userEmail: { fontSize: 13, color: '#6B6A5E', marginTop: 2 },
  logoutBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#F1E7E1', alignItems: 'center', justifyContent: 'center' },
  section: { fontSize: 17, fontWeight: '700', color: '#15140F', marginBottom: 10 },
  subLabel: { fontSize: 12.5, color: '#6B6A5E', marginBottom: 12, marginTop: -4 },
  targetHero: { backgroundColor: '#15140F', borderRadius: 16, padding: 16, marginBottom: 14 },
  targetHeroRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  targetHeroLabel: { fontSize: 10.5, color: '#F4F1E9', opacity: 0.7, letterSpacing: 1, fontWeight: '700' },
  targetHeroValue: { fontSize: 18, color: '#C7F24E', fontWeight: '800', marginTop: 4 },
  targetHeroSub: { fontSize: 11.5, color: '#F4F1E9', opacity: 0.6, marginTop: 4 },
  editStatsBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#C7F24E', borderRadius: 18, paddingHorizontal: 12, paddingVertical: 7 },
  editStatsText: { fontSize: 12.5, fontWeight: '800', color: '#15140F' },
  planMealsBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#C7F24E', borderRadius: 12, paddingVertical: 11, marginTop: 14 },
  planMealsText: { fontSize: 14, fontWeight: '800', color: '#15140F' },
  setupTargetBtn: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#FFF', borderRadius: 14, padding: 14, borderWidth: 1.5, borderColor: '#E6E1D4', marginBottom: 14 },
  setupTargetText: { flex: 1, fontSize: 13.5, fontWeight: '700', color: '#15140F' },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#FFF', borderRadius: 14, padding: 14, borderWidth: 1.5, borderColor: '#E6E1D4', marginBottom: 14 },
  progressRowText: { flex: 1, fontSize: 14, fontWeight: '700', color: '#15140F' },
  goalsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 20, justifyContent: 'flex-start' },
  goalCard: { width: '30.5%', alignItems: 'center', gap: 8, backgroundColor: '#FFF', borderRadius: 12, padding: 14, borderWidth: 1.5, borderColor: '#E6E1D4' },
  goalIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  goalLabel: { fontSize: 12, fontWeight: '600', color: '#6B6A5E' },
  targetsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 20 },
  targetCard: { width: '48%', backgroundColor: '#FFF', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: '#E6E1D4' },
  targetLabel: { fontSize: 12, fontWeight: '600', marginBottom: 6 },
  targetInput: { backgroundColor: '#F4F1E9', borderRadius: 8, padding: 10, color: '#15140F', fontSize: 18, fontWeight: '700' },
  saveBtn: { backgroundColor: Z_RED, borderRadius: 12, paddingVertical: 15, alignItems: 'center' },
  saveBtnText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
});
