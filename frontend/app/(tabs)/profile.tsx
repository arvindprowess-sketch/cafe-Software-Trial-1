import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput,
  SafeAreaView, Alert, KeyboardAvoidingView, Platform
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { apiCall, getStoredUser, logout } from '../../utils/api';

const GOALS = [
  { key: 'fat_loss', label: 'Fat Loss', icon: 'trending-down' as const, desc: 'High protein, low carb' },
  { key: 'muscle_gain', label: 'Muscle Gain', icon: 'trending-up' as const, desc: 'High protein, surplus' },
  { key: 'maintenance', label: 'Maintenance', icon: 'swap-horizontal' as const, desc: 'Balanced macros' },
];

export default function ProfileScreen() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [goal, setGoal] = useState('maintenance');
  const [calories, setCalories] = useState('2000');
  const [protein, setProtein] = useState('100');
  const [carbs, setCarbs] = useState('250');
  const [fat, setFat] = useState('65');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const u = await getStoredUser();
      if (u) {
        setUser(u);
        setGoal(u.fitness_goal || 'maintenance');
        setCalories(String(u.daily_calories || 2000));
        setProtein(String(u.daily_protein || 100));
        setCarbs(String(u.daily_carbs || 250));
        setFat(String(u.daily_fat || 65));
      }
    })();
  }, []);

  const saveGoals = async () => {
    setSaving(true);
    try {
      await apiCall('/user/goals', {
        method: 'PUT',
        body: {
          fitness_goal: goal,
          daily_calories: parseInt(calories) || 2000,
          daily_protein: parseInt(protein) || 100,
          daily_carbs: parseInt(carbs) || 250,
          daily_fat: parseInt(fat) || 65,
        }
      });
      Alert.alert('Saved', 'Your goals have been updated!');
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally { setSaving(false); }
  };

  const handleLogout = async () => {
    await logout();
    router.replace('/');
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView style={styles.container} contentContainerStyle={styles.content}>
          <Text style={styles.title}>Profile</Text>

          <View style={styles.userCard}>
            <View style={styles.avatar}>
              <Ionicons name="person" size={28} color="#FF3B30" />
            </View>
            <View>
              <Text style={styles.userName}>{user?.name || 'User'}</Text>
              <Text style={styles.userEmail}>{user?.email || ''}</Text>
            </View>
          </View>

          <Text style={styles.sectionTitle}>Fitness Goal</Text>
          <View style={styles.goalsRow}>
            {GOALS.map(g => (
              <TouchableOpacity
                key={g.key}
                testID={`goal-${g.key}`}
                style={[styles.goalCard, goal === g.key && styles.goalCardActive]}
                onPress={() => setGoal(g.key)}
              >
                <Ionicons name={g.icon} size={24} color={goal === g.key ? '#FFF' : '#8E8E93'} />
                <Text style={[styles.goalLabel, goal === g.key && styles.goalLabelActive]}>{g.label}</Text>
                <Text style={styles.goalDesc}>{g.desc}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.sectionTitle}>Daily Targets</Text>
          <View style={styles.targetsGrid}>
            {[
              { label: 'Calories', val: calories, set: setCalories, unit: 'kcal', color: '#FF3B30' },
              { label: 'Protein', val: protein, set: setProtein, unit: 'g', color: '#FF3B30' },
              { label: 'Carbs', val: carbs, set: setCarbs, unit: 'g', color: '#FF9F0A' },
              { label: 'Fat', val: fat, set: setFat, unit: 'g', color: '#007AFF' },
            ].map(t => (
              <View key={t.label} style={styles.targetItem}>
                <Text style={[styles.targetLabel, { color: t.color }]}>{t.label}</Text>
                <View style={styles.targetInputRow}>
                  <TextInput
                    testID={`target-${t.label.toLowerCase()}`}
                    style={styles.targetInput}
                    value={t.val}
                    onChangeText={t.set}
                    keyboardType="number-pad"
                    placeholderTextColor="#48484A"
                  />
                  <Text style={styles.targetUnit}>{t.unit}</Text>
                </View>
              </View>
            ))}
          </View>

          <TouchableOpacity
            testID="save-goals-btn"
            style={styles.saveBtn}
            onPress={saveGoals}
            disabled={saving}
          >
            <Text style={styles.saveBtnText}>{saving ? 'SAVING...' : 'SAVE GOALS'}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            testID="logout-btn"
            style={styles.logoutBtn}
            onPress={handleLogout}
          >
            <Ionicons name="log-out" size={18} color="#FF453A" />
            <Text style={styles.logoutText}>Logout</Text>
          </TouchableOpacity>

          <View style={{ height: 40 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#000' },
  container: { flex: 1 },
  content: { padding: 16 },
  title: { fontSize: 28, fontWeight: '800', color: '#FFF', marginBottom: 20, marginTop: 8 },
  userCard: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: '#121212', borderRadius: 16, padding: 16,
    borderWidth: 1, borderColor: '#2C2C2E', marginBottom: 24,
  },
  avatar: {
    width: 52, height: 52, borderRadius: 26, backgroundColor: 'rgba(255,59,48,0.15)',
    alignItems: 'center', justifyContent: 'center',
  },
  userName: { fontSize: 18, fontWeight: '700', color: '#FFF' },
  userEmail: { fontSize: 13, color: '#8E8E93', marginTop: 2 },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: '#FFF', marginBottom: 12 },
  goalsRow: { flexDirection: 'row', gap: 10, marginBottom: 24 },
  goalCard: {
    flex: 1, backgroundColor: '#121212', borderRadius: 14, padding: 14,
    alignItems: 'center', borderWidth: 1, borderColor: '#2C2C2E', gap: 6,
  },
  goalCardActive: { backgroundColor: '#FF3B30', borderColor: '#FF3B30' },
  goalLabel: { fontSize: 12, fontWeight: '700', color: '#8E8E93' },
  goalLabelActive: { color: '#FFF' },
  goalDesc: { fontSize: 9, color: '#48484A', textAlign: 'center' },
  targetsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 24 },
  targetItem: {
    width: '48%', backgroundColor: '#121212', borderRadius: 12, padding: 14,
    borderWidth: 1, borderColor: '#2C2C2E',
  },
  targetLabel: { fontSize: 12, fontWeight: '600', marginBottom: 6 },
  targetInputRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  targetInput: {
    flex: 1, backgroundColor: '#1C1C1E', borderRadius: 8, padding: 10,
    color: '#FFF', fontSize: 18, fontWeight: '700',
  },
  targetUnit: { color: '#48484A', fontSize: 12, fontWeight: '600' },
  saveBtn: {
    backgroundColor: '#FF3B30', borderRadius: 12, paddingVertical: 16,
    alignItems: 'center', marginBottom: 16,
    shadowColor: '#FF3B30', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 8, elevation: 5,
  },
  saveBtnText: { color: '#FFF', fontSize: 16, fontWeight: '700', letterSpacing: 1 },
  logoutBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 14, borderRadius: 12, backgroundColor: '#1C1C1E',
    borderWidth: 1, borderColor: '#2C2C2E',
  },
  logoutText: { color: '#FF453A', fontSize: 14, fontWeight: '600' },
});
