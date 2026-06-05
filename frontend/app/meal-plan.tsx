import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Image,
  ActivityIndicator, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { apiCall } from '../utils/api';
import { FUEL, FONT, getGoal } from '../utils/theme';
import { useCart } from '../utils/CartContext';

const MEAL_COUNTS = [3, 4, 5, 6];

// Phase 3 — Meal split + goal-fit dishes + remaining-macros tracker (customer app only).
export default function MealPlanScreen() {
  const router = useRouter();
  const cart = useCart();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [hasStats, setHasStats] = useState(true);
  const [target, setTarget] = useState<any>(null);
  const [consumed, setConsumed] = useState<any>({ calories: 0, protein: 0, carbs: 0, fat: 0 });
  const [mealsCount, setMealsCount] = useState(4);
  const [plan, setPlan] = useState<any>(null);
  const [planning, setPlanning] = useState(false);

  const loadPlan = useCallback(async (count: number, remCal?: number, remPro?: number) => {
    setPlanning(true);
    try {
      const res = await apiCall('/nutrition/meal-plan', {
        method: 'POST',
        body: { meals_count: count, remaining_calories: remCal ?? null, remaining_protein: remPro ?? null },
      });
      setPlan(res);
    } catch (e) {}
    finally { setPlanning(false); }
  }, []);

  const load = useCallback(async () => {
    try {
      const [t, summary] = await Promise.all([
        apiCall('/user/daily-target'),
        apiCall('/user/nutrition-summary').catch(() => null),
      ]);
      setTarget(t);
      setHasStats(!!t?.has_body_stats);
      const cnt = t?.meals_per_day || 4;
      setMealsCount(cnt);
      const cons = summary?.consumed || { calories: 0, protein: 0, carbs: 0, fat: 0 };
      setConsumed(cons);
      if (t?.has_body_stats) {
        const remCal = Math.max(0, (t.daily_calories || 0) - (cons.calories || 0));
        const remPro = Math.max(0, (t.daily_protein || 0) - (cons.protein || 0));
        await loadPlan(cnt, remCal, remPro);
      }
    } catch (e) {}
    finally { setLoading(false); }
  }, [loadPlan]);

  useEffect(() => { load(); }, []);

  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const changeCount = (c: number) => {
    setMealsCount(c);
    const remCal = Math.max(0, (target?.daily_calories || 0) - (consumed.calories || 0));
    const remPro = Math.max(0, (target?.daily_protein || 0) - (consumed.protein || 0));
    loadPlan(c, remCal, remPro);
  };

  const goalInfo = getGoal(target?.fitness_goal);
  const remCalories = Math.max(0, Math.round((target?.daily_calories || 0) - (consumed.calories || 0)));
  const remProtein = Math.max(0, Math.round((target?.daily_protein || 0) - (consumed.protein || 0)));
  const pct = target?.daily_calories ? Math.min(100, ((consumed.calories || 0) / target.daily_calories) * 100) : 0;

  const dishPrice = (d: any) => d.product_type === 'ready_made'
    ? (d.fixed_price || Math.round((d.cost_per_100g || 0) * (d.serving_grams || 300) / 100))
    : d.cost_per_100g;

  const renderDish = (d: any, key: string) => (
    <View key={key} style={styles.dishCard} testID={`mealplan-dish-${d.id}`}>
      {d.image_url ? <Image source={{ uri: d.image_url }} style={styles.dishImg} /> :
        <View style={[styles.dishImg, styles.dishImgPh]}><Ionicons name="restaurant" size={20} color="#CFC9B6" /></View>}
      <View style={{ flex: 1 }}>
        <Text style={styles.dishName} numberOfLines={1}>{d.name}</Text>
        <Text style={styles.dishMacro}>{Math.round(d.protein_per_100g || 0)}g P · {Math.round(d.calories_per_100g || 0)} kcal{d.product_type === 'ready_made' ? '' : '/100g'}</Text>
        {d.goal_fit ? (
          <View style={styles.fitPill}><Ionicons name="checkmark-circle" size={11} color={FUEL.limeDeep} /><Text style={styles.fitPillText}>Fits your goal</Text></View>
        ) : null}
      </View>
      <View style={styles.dishRight}>
        <Text style={styles.dishPrice}>₹{dishPrice(d)}</Text>
        <TouchableOpacity testID={`mealplan-add-${d.id}`} style={styles.dishAdd} onPress={() => cart.addItem(d)}>
          <Ionicons name="add" size={16} color={FUEL.ink} />
        </TouchableOpacity>
      </View>
    </View>
  );

  if (loading) {
    return <SafeAreaView style={styles.safe}><View style={styles.center}><ActivityIndicator size="large" color={FUEL.ink} /></View></SafeAreaView>;
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity testID="mealplan-back" style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={22} color={FUEL.sand} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Meal Plan</Text>
        <View style={{ width: 40 }} />
      </View>

      {!hasStats ? (
        <View style={styles.emptyWrap} testID="mealplan-no-stats">
          <Ionicons name="body" size={48} color={FUEL.limeDeep} />
          <Text style={styles.emptyTitle}>Set your target first</Text>
          <Text style={styles.emptySub}>Add a few body stats and we'll split your day into balanced meals that fit your goal.</Text>
          <TouchableOpacity testID="mealplan-setup-cta" style={styles.cta} onPress={() => router.replace({ pathname: '/goal-setup', params: { goal: target?.fitness_goal || 'maintenance', next: 'meal-plan' } })}>
            <Text style={styles.ctaText}>Set up my target</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>

          {/* Goal + daily target */}
          <View style={[styles.goalPill, { backgroundColor: (goalInfo?.color || FUEL.ink) + '18', borderColor: goalInfo?.color || FUEL.ink }]}>
            <Ionicons name={(goalInfo?.icon as any) || 'flag'} size={15} color={goalInfo?.color || FUEL.ink} />
            <Text style={[styles.goalPillText, { color: goalInfo?.color || FUEL.ink }]}>{goalInfo?.label || 'Goal'}</Text>
          </View>

          {/* Remaining-macros tracker */}
          <View style={styles.remainCard} testID="mealplan-remaining">
            <Text style={styles.remainTitle}>Left for today</Text>
            <View style={styles.remainRow}>
              <View style={styles.remainBox}>
                <Text style={styles.remainBig} testID="mealplan-remaining-calories">{remCalories}</Text>
                <Text style={styles.remainLbl}>kcal left</Text>
              </View>
              <View style={styles.remainDivider} />
              <View style={styles.remainBox}>
                <Text style={[styles.remainBig, { color: FUEL.protein }]} testID="mealplan-remaining-protein">{remProtein}g</Text>
                <Text style={styles.remainLbl}>protein left</Text>
              </View>
            </View>
            <View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${pct}%` }]} /></View>
            <Text style={styles.remainSub}>{Math.round(consumed.calories || 0)} / {target?.daily_calories} kcal eaten today</Text>
          </View>

          {/* Meal-count selector */}
          <Text style={styles.sectionTitle}>How many meals?</Text>
          <View style={styles.countRow}>
            {MEAL_COUNTS.map(c => (
              <TouchableOpacity key={c} testID={`mealplan-count-${c}`}
                style={[styles.countChip, mealsCount === c && styles.countChipActive]}
                onPress={() => changeCount(c)}>
                <Text style={[styles.countText, mealsCount === c && styles.countTextActive]}>{c}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {planning ? <ActivityIndicator color={FUEL.ink} style={{ marginVertical: 20 }} /> : (
            <>
              {/* Per-meal targets + goal-fit suggestions */}
              {(plan?.meals || []).map((m: any) => (
                <View key={m.index} style={styles.mealCard} testID={`mealplan-meal-${m.index}`}>
                  <View style={styles.mealHead}>
                    <Text style={styles.mealLabel}>{m.label}</Text>
                    <Text style={styles.mealTarget}>{m.calories} kcal · {m.protein}g P</Text>
                  </View>
                  <Text style={styles.mealSubMacro}>Carbs {m.carbs}g · Fat {m.fat}g</Text>
                  {(m.suggestions || []).map((d: any, i: number) => renderDish(d, `${m.index}-${d.id}-${i}`))}
                </View>
              ))}

              {/* Fits the remainder */}
              {remCalories > 0 && (plan?.remaining_suggestions?.length > 0) && (
                <View style={styles.mealCard} testID="mealplan-remaining-suggestions">
                  <View style={styles.mealHead}>
                    <Text style={styles.mealLabel}>Fill the gap</Text>
                    <Text style={styles.mealTarget}>{remCalories} kcal left</Text>
                  </View>
                  <Text style={styles.mealSubMacro}>Goal-fit dishes that fit what's left of your day</Text>
                  {plan.remaining_suggestions.map((d: any, i: number) => renderDish(d, `rem-${d.id}-${i}`))}
                </View>
              )}

              <Text style={styles.disclaimer}>{plan?.disclaimer}</Text>

              <TouchableOpacity testID="mealplan-edit-stats" style={styles.secondaryCta}
                onPress={() => router.push({ pathname: '/goal-setup', params: { goal: target?.fitness_goal || 'maintenance', next: 'meal-plan' } })}>
                <Ionicons name="create-outline" size={16} color={FUEL.muted} />
                <Text style={styles.secondaryCtaText}>Edit my stats / goal</Text>
              </TouchableOpacity>
              <View style={{ height: 40 }} />
            </>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: FUEL.sand },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: FUEL.ink, paddingHorizontal: 12, paddingVertical: 12 },
  backBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontFamily: FONT.display, fontSize: 20, color: FUEL.sand, textTransform: 'uppercase', letterSpacing: 1 },
  content: { padding: 16 },
  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 30, gap: 12 },
  emptyTitle: { fontFamily: FONT.display, fontSize: 24, color: FUEL.ink, textTransform: 'uppercase' },
  emptySub: { fontSize: 14, color: FUEL.muted, textAlign: 'center', lineHeight: 20 },
  goalPill: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1.5, marginBottom: 14 },
  goalPillText: { fontSize: 12.5, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 },
  remainCard: { backgroundColor: FUEL.ink, borderRadius: 18, padding: 18, marginBottom: 18 },
  remainTitle: { fontSize: 13, color: FUEL.sand, opacity: 0.8, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 },
  remainRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  remainBox: { flex: 1, alignItems: 'center' },
  remainDivider: { width: 1, height: 40, backgroundColor: '#2C2B22' },
  remainBig: { fontFamily: FONT.display, fontSize: 38, color: FUEL.lime, lineHeight: 40 },
  remainLbl: { fontSize: 12, color: FUEL.sand, opacity: 0.7, marginTop: 2 },
  progressTrack: { height: 7, borderRadius: 4, backgroundColor: '#2C2B22', marginTop: 14, overflow: 'hidden' },
  progressFill: { height: 7, borderRadius: 4, backgroundColor: FUEL.lime },
  remainSub: { fontSize: 11.5, color: FUEL.sand, opacity: 0.6, marginTop: 8, textAlign: 'center' },
  sectionTitle: { fontFamily: FONT.display, fontSize: 18, color: FUEL.ink, textTransform: 'uppercase', marginBottom: 10 },
  countRow: { flexDirection: 'row', gap: 10, marginBottom: 18 },
  countChip: { flex: 1, alignItems: 'center', paddingVertical: 14, borderRadius: 12, backgroundColor: FUEL.white, borderWidth: 1.5, borderColor: FUEL.sandBorder },
  countChipActive: { backgroundColor: FUEL.lime, borderColor: FUEL.lime },
  countText: { fontFamily: FONT.display, fontSize: 22, color: FUEL.muted },
  countTextActive: { color: FUEL.ink },
  mealCard: { backgroundColor: FUEL.white, borderRadius: 16, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: FUEL.sandBorder },
  mealHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  mealLabel: { fontSize: 16, fontWeight: '800', color: FUEL.ink },
  mealTarget: { fontSize: 13, fontWeight: '700', color: FUEL.limeDeep },
  mealSubMacro: { fontSize: 12, color: FUEL.muted, marginTop: 2, marginBottom: 10 },
  dishCard: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderTopWidth: 1, borderTopColor: '#F0ECE0' },
  dishImg: { width: 44, height: 44, borderRadius: 10 },
  dishImgPh: { backgroundColor: '#F4F1E9', alignItems: 'center', justifyContent: 'center' },
  dishName: { fontSize: 14, fontWeight: '700', color: FUEL.ink },
  dishMacro: { fontSize: 12, color: FUEL.muted, marginTop: 1 },
  fitPill: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 4, alignSelf: 'flex-start', backgroundColor: FUEL.limeTint, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 10 },
  fitPillText: { fontSize: 10.5, fontWeight: '800', color: '#4F5A2E' },
  dishRight: { alignItems: 'center', gap: 6 },
  dishPrice: { fontSize: 13, fontWeight: '800', color: FUEL.ink },
  dishAdd: { width: 30, height: 30, borderRadius: 15, backgroundColor: FUEL.lime, alignItems: 'center', justifyContent: 'center' },
  disclaimer: { fontSize: 11.5, color: '#9C9883', lineHeight: 16, fontStyle: 'italic', marginTop: 6, marginBottom: 14 },
  cta: { backgroundColor: FUEL.lime, borderRadius: 14, paddingVertical: 15, paddingHorizontal: 30, alignItems: 'center', marginTop: 10 },
  ctaText: { fontFamily: FONT.display, fontSize: 17, color: FUEL.ink, textTransform: 'uppercase', letterSpacing: 1 },
  secondaryCta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12 },
  secondaryCtaText: { fontSize: 14, fontWeight: '700', color: FUEL.muted },
});
