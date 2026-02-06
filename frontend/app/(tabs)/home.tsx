import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl, SafeAreaView
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { apiCall, getStoredUser } from '../../utils/api';

export default function HomeScreen() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [summary, setSummary] = useState<any>(null);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const u = await getStoredUser();
      setUser(u);
      const s = await apiCall('/user/nutrition-summary');
      setSummary(s);
    } catch (e) {}
  }, []);

  useEffect(() => { loadData(); }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const goals = summary?.goals || {};
  const consumed = summary?.consumed || {};
  const calPct = goals.daily_calories ? Math.min((consumed.calories / goals.daily_calories) * 100, 100) : 0;
  const protPct = goals.daily_protein ? Math.min((consumed.protein / goals.daily_protein) * 100, 100) : 0;
  const carbPct = goals.daily_carbs ? Math.min((consumed.carbs / goals.daily_carbs) * 100, 100) : 0;
  const fatPct = goals.daily_fat ? Math.min((consumed.fat / goals.daily_fat) * 100, 100) : 0;

  const goalLabels: Record<string, string> = {
    fat_loss: 'Fat Loss', muscle_gain: 'Muscle Gain', maintenance: 'Maintenance'
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        style={styles.container}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#FF3B30" />}
      >
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.greeting}>Hello, {user?.name || 'there'}</Text>
            <Text style={styles.subGreeting}>{summary?.date || 'Today'}</Text>
          </View>
          <View style={styles.goalBadge}>
            <Ionicons name="fitness" size={14} color="#FF3B30" />
            <Text style={styles.goalText}>{goalLabels[goals.fitness_goal] || 'Maintenance'}</Text>
          </View>
        </View>

        <View style={styles.calorieCard}>
          <View style={styles.calorieHeader}>
            <Ionicons name="flame" size={24} color="#FF3B30" />
            <Text style={styles.calorieTitle}>Daily Calories</Text>
          </View>
          <View style={styles.calorieMain}>
            <Text style={styles.calorieValue}>{Math.round(consumed.calories || 0)}</Text>
            <Text style={styles.calorieGoal}> / {goals.daily_calories || 2000} kcal</Text>
          </View>
          <View style={styles.progressBg}>
            <View style={[styles.progressFill, { width: `${calPct}%` }]} />
          </View>
          <Text style={styles.remainText}>
            {Math.max(0, Math.round((goals.daily_calories || 2000) - (consumed.calories || 0)))} kcal remaining
          </Text>
        </View>

        <Text style={styles.sectionTitle}>Macros Breakdown</Text>
        <View style={styles.macroRow}>
          {[
            { label: 'Protein', val: consumed.protein, goal: goals.daily_protein, pct: protPct, color: '#FF3B30', icon: 'barbell' as const },
            { label: 'Carbs', val: consumed.carbs, goal: goals.daily_carbs, pct: carbPct, color: '#FF9F0A', icon: 'leaf' as const },
            { label: 'Fat', val: consumed.fat, goal: goals.daily_fat, pct: fatPct, color: '#007AFF', icon: 'water' as const },
          ].map((m) => (
            <View key={m.label} style={styles.macroCard}>
              <Ionicons name={m.icon} size={20} color={m.color} />
              <Text style={styles.macroLabel}>{m.label}</Text>
              <Text style={styles.macroValue}>{Math.round(m.val || 0)}g</Text>
              <View style={styles.macroBg}>
                <View style={[styles.macroFill, { width: `${m.pct}%`, backgroundColor: m.color }]} />
              </View>
              <Text style={styles.macroGoal}>/ {m.goal || 0}g</Text>
            </View>
          ))}
        </View>

        <Text style={styles.sectionTitle}>Quick Actions</Text>
        <View style={styles.actionsRow}>
          <TouchableOpacity
            testID="quick-order-btn"
            style={styles.actionCard}
            onPress={() => router.push('/(tabs)/menu')}
          >
            <Ionicons name="restaurant" size={28} color="#FF3B30" />
            <Text style={styles.actionText}>Order Meal</Text>
          </TouchableOpacity>
          <TouchableOpacity
            testID="quick-history-btn"
            style={styles.actionCard}
            onPress={() => router.push('/(tabs)/orders')}
          >
            <Ionicons name="time" size={28} color="#FF9F0A" />
            <Text style={styles.actionText}>History</Text>
          </TouchableOpacity>
          <TouchableOpacity
            testID="quick-goals-btn"
            style={styles.actionCard}
            onPress={() => router.push('/(tabs)/profile')}
          >
            <Ionicons name="trophy" size={28} color="#32D74B" />
            <Text style={styles.actionText}>Goals</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.mealsCard}>
          <Text style={styles.mealsTitle}>
            <Ionicons name="nutrition" size={16} color="#8E8E93" /> Meals Today: {summary?.meals_count || 0}
          </Text>
        </View>

        <View style={{ height: 32 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#000' },
  container: { flex: 1, backgroundColor: '#000', padding: 16 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, marginTop: 8 },
  greeting: { fontSize: 28, fontWeight: '800', color: '#FFF' },
  subGreeting: { fontSize: 14, color: '#8E8E93', marginTop: 2 },
  goalBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(255,59,48,0.15)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20,
  },
  goalText: { color: '#FF3B30', fontSize: 12, fontWeight: '700' },
  calorieCard: {
    backgroundColor: '#121212', borderRadius: 20, padding: 20,
    borderWidth: 1, borderColor: '#2C2C2E', marginBottom: 24,
  },
  calorieHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  calorieTitle: { color: '#8E8E93', fontSize: 14, fontWeight: '600' },
  calorieMain: { flexDirection: 'row', alignItems: 'baseline', marginBottom: 12 },
  calorieValue: { fontSize: 42, fontWeight: '800', color: '#FFF' },
  calorieGoal: { fontSize: 16, color: '#48484A' },
  progressBg: { height: 8, backgroundColor: '#2C2C2E', borderRadius: 4, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: '#FF3B30', borderRadius: 4 },
  remainText: { color: '#8E8E93', fontSize: 12, marginTop: 8, textAlign: 'right' },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: '#FFF', marginBottom: 12 },
  macroRow: { flexDirection: 'row', gap: 10, marginBottom: 24 },
  macroCard: {
    flex: 1, backgroundColor: '#121212', borderRadius: 16, padding: 14,
    alignItems: 'center', borderWidth: 1, borderColor: '#2C2C2E',
  },
  macroLabel: { color: '#8E8E93', fontSize: 11, fontWeight: '600', marginTop: 6 },
  macroValue: { color: '#FFF', fontSize: 20, fontWeight: '800', marginTop: 4 },
  macroBg: { width: '100%', height: 4, backgroundColor: '#2C2C2E', borderRadius: 2, marginTop: 8, overflow: 'hidden' },
  macroFill: { height: '100%', borderRadius: 2 },
  macroGoal: { color: '#48484A', fontSize: 10, marginTop: 4 },
  actionsRow: { flexDirection: 'row', gap: 12, marginBottom: 24 },
  actionCard: {
    flex: 1, backgroundColor: '#121212', borderRadius: 16, padding: 16,
    alignItems: 'center', borderWidth: 1, borderColor: '#2C2C2E', gap: 8,
  },
  actionText: { color: '#FFF', fontSize: 12, fontWeight: '600' },
  mealsCard: {
    backgroundColor: '#121212', borderRadius: 16, padding: 16,
    borderWidth: 1, borderColor: '#2C2C2E',
  },
  mealsTitle: { color: '#8E8E93', fontSize: 14, fontWeight: '600' },
});
