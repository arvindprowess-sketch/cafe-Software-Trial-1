import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useFocusEffect } from 'expo-router';
import { apiCall } from '../utils/api';
import { FUEL, FONT, RADIUS, SPACE } from '../utils/theme';
import { SkeletonList } from './components/Skeleton';

// GET /meal-plans -> [{ id, name, goal, diet_preference, days:[{day, meals:[...]}], created_at }]
export default function MyPlansScreen() {
  const router = useRouter();
  const [plans, setPlans] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const p = await apiCall('/meal-plans');
      setPlans(Array.isArray(p) ? p : []);
    } catch {} finally { setLoading(false); }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const confirmDelete = (plan: any) => {
    Alert.alert('Delete plan?', `Remove "${plan.name}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          try {
            await apiCall(`/meal-plans/${plan.id}`, { method: 'DELETE' });
            setPlans(prev => prev.filter(p => p.id !== plan.id));
          } catch (e: any) { Alert.alert('Error', e?.message || 'Could not delete plan'); }
        },
      },
    ]);
  };

  const mealCount = (plan: any) =>
    (plan.days || []).reduce((n: number, d: any) => n + (d.meals?.length || 0), 0);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} testID="my-plans-back">
          <Ionicons name="arrow-back" size={22} color={FUEL.sand} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>My Plans</Text>
        <View style={{ width: 40 }} />
      </View>

      {loading ? (
        <SkeletonList count={5} />
      ) : (
        <ScrollView
          contentContainerStyle={plans.length === 0 ? styles.emptyWrap : { padding: SPACE.l, paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={FUEL.ink} />}
          testID="my-plans-list"
        >
          {plans.length === 0 ? (
            <View style={styles.empty} testID="my-plans-empty">
              <Ionicons name="bookmark-outline" size={44} color={FUEL.sandBorder} />
              <Text style={styles.emptyText}>No saved plans yet</Text>
              <Text style={styles.emptySub}>Generate a day plan and tap "Save this plan" to keep it here.</Text>
            </View>
          ) : plans.map((plan) => (
            <View key={plan.id} style={styles.planCard} testID={`plan-row-${plan.id}`}>
              <View style={styles.planIcon}><Ionicons name="restaurant" size={18} color={FUEL.limeDeep} /></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.planName} numberOfLines={1}>{plan.name}</Text>
                <Text style={styles.planMeta}>{(plan.goal || '').replace('_', ' ')} · {mealCount(plan)} items · {plan.diet_preference || 'both'}</Text>
              </View>
              <TouchableOpacity testID={`delete-plan-${plan.id}`} onPress={() => confirmDelete(plan)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="trash-outline" size={18} color={FUEL.error} />
              </TouchableOpacity>
            </View>
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: FUEL.sand },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: SPACE.l, paddingVertical: SPACE.m, backgroundColor: FUEL.ink },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: FUEL.inkSoft, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontFamily: FONT.display, fontSize: 20, color: FUEL.sand, letterSpacing: 0.5 },

  planCard: { flexDirection: 'row', alignItems: 'center', gap: SPACE.m, backgroundColor: FUEL.white, borderRadius: RADIUS.md, padding: SPACE.m, borderWidth: 1, borderColor: FUEL.sandBorder, marginBottom: SPACE.s },
  planIcon: { width: 40, height: 40, borderRadius: RADIUS.sm, backgroundColor: FUEL.limeTint, alignItems: 'center', justifyContent: 'center' },
  planName: { fontFamily: FONT.bodyExtrabold, fontSize: 14, color: FUEL.ink },
  planMeta: { fontFamily: FONT.body, fontSize: 12, color: FUEL.muted, marginTop: 2, textTransform: 'capitalize' },

  emptyWrap: { flexGrow: 1, justifyContent: 'center' },
  empty: { alignItems: 'center', padding: SPACE.xl, gap: SPACE.s },
  emptyText: { fontFamily: FONT.bodyExtrabold, fontSize: 15, color: FUEL.ink, marginTop: SPACE.s },
  emptySub: { fontFamily: FONT.body, fontSize: 12.5, color: FUEL.muted, textAlign: 'center' },
});
