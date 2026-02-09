import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { apiCall, getStoredUser, logout } from '../../utils/api';

const Z_RED = '#D62300';
const GOALS = [
  { key: 'fat_loss', label: 'Fat Loss', icon: 'trending-down' as const, color: '#D62300' },
  { key: 'muscle_gain', label: 'Muscle Gain', icon: 'trending-up' as const, color: '#509E2F' },
  { key: 'maintenance', label: 'Maintain', icon: 'swap-horizontal' as const, color: '#FF8732' },
  { key: 'beginner', label: 'Beginner Phase', icon: 'ribbon' as const, color: '#5B5FE0' },
  { key: 'recovery', label: 'Recovery Phase', icon: 'heart' as const, color: '#FF6B9D' },
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
      if (u) { setUser(u); setGoal(u.fitness_goal || 'maintenance'); setCalories(String(u.daily_calories || 2000)); setProtein(String(u.daily_protein || 100)); setCarbs(String(u.daily_carbs || 250)); setFat(String(u.daily_fat || 65)); }
    })();
  }, []);

  const saveGoals = async () => {
    setSaving(true);
    try {
      await apiCall('/user/goals', { method: 'PUT', body: { fitness_goal: goal, daily_calories: parseInt(calories) || 2000, daily_protein: parseInt(protein) || 100, daily_carbs: parseInt(carbs) || 250, daily_fat: parseInt(fat) || 65 } });
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

          <Text style={styles.section}>Fitness Goal</Text>
          <View style={styles.goalsRow}>
            {GOALS.map(g => (
              <TouchableOpacity key={g.key} testID={`goal-${g.key}`} style={[styles.goalCard, goal === g.key && { borderColor: g.color, backgroundColor: `${g.color}10` }]} onPress={() => setGoal(g.key)}>
                <View style={[styles.goalIcon, { backgroundColor: goal === g.key ? g.color : '#F5EBDC' }]}>
                  <Ionicons name={g.icon} size={20} color={goal === g.key ? '#FFF' : '#8B6F61'} />
                </View>
                <Text style={[styles.goalLabel, goal === g.key && { color: g.color, fontWeight: '700' }]}>{g.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.section}>Daily Targets</Text>
          <View style={styles.targetsGrid}>
            {[
              { label: 'Calories (kcal)', val: calories, set: setCalories, color: Z_RED },
              { label: 'Protein (g)', val: protein, set: setProtein, color: Z_RED },
              { label: 'Carbs (g)', val: carbs, set: setCarbs, color: '#FF9F0A' },
              { label: 'Fat (g)', val: fat, set: setFat, color: '#FF8732' },
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
  safe: { flex: 1, backgroundColor: '#F5EBDC' },
  content: { padding: 16 },
  title: { fontSize: 24, fontWeight: '800', color: '#502314', marginBottom: 16, marginTop: 8 },
  userCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#FFF', borderRadius: 14, padding: 16, borderWidth: 1, borderColor: '#E8DDD4', marginBottom: 20 },
  avatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#FDE8E4', alignItems: 'center', justifyContent: 'center' },
  userName: { fontSize: 17, fontWeight: '700', color: '#502314' },
  userEmail: { fontSize: 13, color: '#8B6F61', marginTop: 2 },
  logoutBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#FDE8E4', alignItems: 'center', justifyContent: 'center' },
  section: { fontSize: 17, fontWeight: '700', color: '#502314', marginBottom: 10 },
  goalsRow: { flexDirection: 'row', gap: 10, marginBottom: 20 },
  goalCard: { flex: 1, alignItems: 'center', gap: 8, backgroundColor: '#FFF', borderRadius: 12, padding: 14, borderWidth: 1.5, borderColor: '#E8DDD4' },
  goalIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  goalLabel: { fontSize: 12, fontWeight: '600', color: '#8B6F61' },
  targetsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 20 },
  targetCard: { width: '48%', backgroundColor: '#FFF', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: '#E8DDD4' },
  targetLabel: { fontSize: 12, fontWeight: '600', marginBottom: 6 },
  targetInput: { backgroundColor: '#F5EBDC', borderRadius: 8, padding: 10, color: '#502314', fontSize: 18, fontWeight: '700' },
  saveBtn: { backgroundColor: Z_RED, borderRadius: 12, paddingVertical: 15, alignItems: 'center' },
  saveBtnText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
});
