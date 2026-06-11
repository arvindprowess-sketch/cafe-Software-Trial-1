import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { apiCall } from '../utils/api';
import { FUEL, FONT, RADIUS, SPACE } from '../utils/theme';

export default function NutritionDetailScreen() {
  const router = useRouter();
  const [summary, setSummary] = useState<any>(null);
  const [orders, setOrders] = useState<any[]>([]);
  const [aiSuggestion, setAiSuggestion] = useState<string>('');
  const [recommendedItems, setRecommendedItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [aiLoading, setAiLoading] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [summaryData, ordersData] = await Promise.all([
        apiCall('/user/nutrition-summary'),
        apiCall('/orders/today').catch(() => [])
      ]);
      setSummary(summaryData);
      setOrders(ordersData);

      // Get AI suggestion for remaining calories
      if (summaryData) {
        getAiSuggestion(summaryData);
      }
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to load nutrition data');
    } finally {
      setLoading(false);
    }
  };

  const getAiSuggestion = async (summaryData: any) => {
    setAiLoading(true);
    try {
      const consumed = summaryData.consumed || {};
      const goals = summaryData.goals || {};
      const remaining = {
        calories: Math.max(0, (goals.daily_calories || 2000) - (consumed.calories || 0)),
        protein: Math.max(0, (goals.daily_protein || 150) - (consumed.protein || 0)),
        carbs: Math.max(0, (goals.daily_carbs || 200) - (consumed.carbs || 0)),
        fat: Math.max(0, (goals.daily_fat || 60) - (consumed.fat || 0))
      };

      // Get available menu items
      const products = await apiCall('/products');

      // Generate suggestion message
      let suggestion = '';
      if (remaining.calories <= 0) {
        suggestion = `🎯 You've reached your daily calorie goal of ${goals.daily_calories || 2000} calories! Great job staying on track.`;
      } else if (remaining.calories < 200) {
        suggestion = `✨ You're almost there! Only ${Math.round(remaining.calories)} calories remaining. Consider a light snack to complete your goals.`;
      } else {
        suggestion = `📊 You have ${Math.round(remaining.calories)} calories remaining for today.\n\n`;

        if (remaining.protein > 20) {
          suggestion += `💪 Focus on protein-rich foods (${Math.round(remaining.protein)}g protein needed).\n`;
        }
        if (remaining.carbs > 30) {
          suggestion += `🌾 Add some healthy carbs (${Math.round(remaining.carbs)}g remaining).\n`;
        }
        if (remaining.fat > 10) {
          suggestion += `🥑 Include healthy fats (${Math.round(remaining.fat)}g remaining).\n`;
        }

        suggestion += `\n👇 Here are some items from our menu that can help:`;
      }

      setAiSuggestion(suggestion);

      // Smart recommendation: Find items that match remaining macros
      const availableProducts = products.filter((p: any) =>
        p.available_qty_grams > 0 || p.product_type === 'ready_made'
      );

      let recommended = [];

      // If high protein needed, prioritize protein items
      if (remaining.protein > 20) {
        const proteinItems = availableProducts
          .filter((p: any) => p.protein_per_100g >= 15)
          .sort((a: any, b: any) => b.protein_per_100g - a.protein_per_100g)
          .slice(0, 2);
        recommended.push(...proteinItems.map((p: any) => ({
          ...p,
          suggested_grams: Math.min(150, Math.round((remaining.protein / p.protein_per_100g) * 100)),
          reason: `High protein (${p.protein_per_100g}g per 100g)`
        })));
      }

      // Add a carb source if needed
      if (remaining.carbs > 30 && recommended.length < 3) {
        const carbItems = availableProducts
          .filter((p: any) => p.carbs_per_100g >= 20 && !recommended.find(r => r.id === p.id))
          .sort((a: any, b: any) => b.carbs_per_100g - a.carbs_per_100g)
          .slice(0, 1);
        recommended.push(...carbItems.map((p: any) => ({
          ...p,
          suggested_grams: 100,
          reason: `Good carb source (${p.carbs_per_100g}g per 100g)`
        })));
      }

      // Fill remaining slots with balanced items
      if (recommended.length < 3) {
        const balanced = availableProducts
          .filter((p: any) => !recommended.find(r => r.id === p.id))
          .sort((a: any, b: any) => {
            const aScore = a.protein_per_100g * 2 + a.calories_per_100g;
            const bScore = b.protein_per_100g * 2 + b.calories_per_100g;
            return bScore - aScore;
          })
          .slice(0, 3 - recommended.length);
        recommended.push(...balanced.map((p: any) => ({
          ...p,
          suggested_grams: 100,
          reason: 'Balanced nutrition'
        })));
      }

      setRecommendedItems(recommended.slice(0, 3));

    } catch (e) {
      console.error('Error generating suggestion:', e);
      setAiSuggestion('Focus on balanced meals with adequate protein, carbs, and healthy fats to reach your goals!');
      setRecommendedItems([]);
    } finally {
      setAiLoading(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={FUEL.ink} />
        </View>
      </SafeAreaView>
    );
  }

  const consumed = summary?.consumed || {};
  const goals = summary?.goals || {};
  const remaining = {
    calories: Math.max(0, (goals.daily_calories || 2000) - (consumed.calories || 0)),
    protein: Math.max(0, (goals.daily_protein || 150) - (consumed.protein || 0)),
    carbs: Math.max(0, (goals.daily_carbs || 200) - (consumed.carbs || 0)),
    fat: Math.max(0, (goals.daily_fat || 60) - (consumed.fat || 0))
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={FUEL.sand} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Today's Nutrition</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Summary Card */}
        <View style={styles.summaryCard}>
          <Text style={styles.cardTitle}>Today's Intake</Text>
          <View style={styles.statsRow}>
            {[
              { label: 'Calories', consumed: consumed.calories || 0, goal: goals.daily_calories || 2000, color: FUEL.ink },
              { label: 'Protein', consumed: consumed.protein || 0, goal: goals.daily_protein || 150, color: FUEL.protein, unit: 'g' },
              { label: 'Carbs', consumed: consumed.carbs || 0, goal: goals.daily_carbs || 200, color: FUEL.carbs, unit: 'g' },
              { label: 'Fat', consumed: consumed.fat || 0, goal: goals.daily_fat || 60, color: FUEL.fat, unit: 'g' }
            ].map(stat => (
              <View key={stat.label} style={styles.statBox}>
                <Text style={styles.statLabel}>{stat.label}</Text>
                <Text style={[styles.statValue, { color: stat.color }]}>
                  {Math.round(stat.consumed)}{stat.unit || ''}
                </Text>
                <Text style={styles.statGoal}>/ {stat.goal}{stat.unit || ''}</Text>
              </View>
            ))}
          </View>
          <Text style={styles.mealsCount}>📊 {summary?.meals_count || 0} meals consumed today</Text>
        </View>

        {/* Today's Meals Breakdown */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Meal Breakdown</Text>
          {orders.length > 0 ? (
            orders.map((order, idx) => (
              <View key={order.id || idx} style={styles.mealItem}>
                <View style={styles.mealHeader}>
                  <Ionicons name="restaurant" size={18} color={FUEL.ink} />
                  <Text style={styles.mealTitle}>Meal {idx + 1}</Text>
                  <Text style={styles.mealTime}>{new Date(order.created_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</Text>
                </View>
                {order.items?.map((item: any, i: number) => (
                  <View key={i} style={styles.itemRow}>
                    <Text style={styles.itemName}>• {item.name} ({item.grams || item.quantity}g)</Text>
                    <Text style={styles.itemCals}>{Math.round((item.calories || item.calories_per_100g * item.grams / 100))} cal</Text>
                  </View>
                ))}
                <View style={styles.mealTotal}>
                  <Text style={styles.mealTotalLabel}>Meal Total:</Text>
                  <Text style={styles.mealTotalValue}>{Math.round(order.total_calories || 0)} cal</Text>
                </View>
              </View>
            ))
          ) : (
            <Text style={styles.emptyText}>No meals logged today yet</Text>
          )}
        </View>

        {/* Remaining Goals */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Remaining Goals</Text>
          <View style={styles.remainingGrid}>
            {[
              { label: 'Calories', value: remaining.calories, icon: 'flame', color: FUEL.ink },
              { label: 'Protein', value: remaining.protein, icon: 'barbell', color: FUEL.protein, unit: 'g' },
              { label: 'Carbs', value: remaining.carbs, icon: 'leaf', color: FUEL.carbs, unit: 'g' },
              { label: 'Fat', value: remaining.fat, icon: 'water', color: FUEL.fat, unit: 'g' }
            ].map(rem => (
              <View key={rem.label} style={styles.remainingBox}>
                <Ionicons name={rem.icon as any} size={24} color={rem.color} />
                <Text style={styles.remainingValue}>{Math.round(rem.value)}{rem.unit || ''}</Text>
                <Text style={styles.remainingLabel}>{rem.label} left</Text>
              </View>
            ))}
          </View>
        </View>

        {/* AI Suggestions */}
        <View style={[styles.card, styles.aiCard]}>
          <View style={styles.aiHeader}>
            <Ionicons name="sparkles" size={20} color={FUEL.limeDeep} />
            <Text style={styles.cardTitle}>AI Nutrition Coach</Text>
          </View>
          {aiLoading ? (
            <View style={styles.aiLoading}>
              <ActivityIndicator color={FUEL.limeDeep} />
              <Text style={styles.aiLoadingText}>Analyzing your nutrition...</Text>
            </View>
          ) : (
            <>
              <Text style={styles.aiSuggestion}>{aiSuggestion}</Text>

              {/* Recommended Menu Items */}
              {recommendedItems.length > 0 && (
                <View style={styles.recommendedSection}>
                  <Text style={styles.recommendedTitle}>💡 Recommended Items to Complete Your Goals:</Text>
                  {recommendedItems.map((item, idx) => {
                    const itemCals = Math.round((item.calories_per_100g * (item.suggested_grams || 100)) / 100);
                    const itemProtein = Math.round((item.protein_per_100g * (item.suggested_grams || 100)) / 100);

                    return (
                      <TouchableOpacity
                        key={item.id}
                        style={styles.recommendedItem}
                        onPress={() => {
                          router.back();
                          router.push('/(tabs)/menu');
                        }}
                        activeOpacity={0.8}
                      >
                        <View style={styles.recommendedLeft}>
                          <View style={[styles.dietDot, { borderColor: item.diet_type === 'non-veg' ? FUEL.nonVeg : FUEL.veg }]}>
                            <View style={[styles.dietDotFill, { backgroundColor: item.diet_type === 'non-veg' ? FUEL.nonVeg : FUEL.veg }]} />
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.recommendedName}>{item.name}</Text>
                            <Text style={styles.recommendedReason}>{item.reason || 'Helps reach your goals'}</Text>
                            <Text style={styles.recommendedNutrition}>
                              {itemCals} cal • {itemProtein}g protein • {item.suggested_grams}g
                            </Text>
                          </View>
                        </View>
                        <View style={styles.recommendedRight}>
                          <Ionicons name="add-circle" size={32} color={FUEL.success} />
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                  <TouchableOpacity
                    style={styles.goToMenuBtn}
                    onPress={() => {
                      router.back();
                      router.push('/(tabs)/menu');
                    }}
                  >
                    <Text style={styles.goToMenuText}>Browse Full Menu</Text>
                    <Ionicons name="arrow-forward" size={18} color={FUEL.ink} />
                  </TouchableOpacity>
                </View>
              )}
            </>
          )}
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: FUEL.sand },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: FUEL.ink,
    paddingHorizontal: SPACE.l,
    paddingVertical: SPACE.l,
  },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: FUEL.inkSoft, alignItems: 'center', justifyContent: 'center' }, // circle
  headerTitle: { fontFamily: FONT.display, fontSize: 18, color: FUEL.sand, textTransform: 'uppercase' },

  summaryCard: { backgroundColor: FUEL.white, margin: SPACE.l, borderRadius: RADIUS.md, padding: SPACE.l, borderWidth: 1, borderColor: FUEL.sandBorder },
  card: { backgroundColor: FUEL.white, marginHorizontal: SPACE.l, marginBottom: SPACE.l, borderRadius: RADIUS.md, padding: SPACE.l, borderWidth: 1, borderColor: FUEL.sandBorder },
  cardTitle: { fontFamily: FONT.display, fontSize: 18, color: FUEL.ink, marginBottom: SPACE.l, textTransform: 'uppercase' },

  statsRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: SPACE.m },
  statBox: { alignItems: 'center' },
  statLabel: { fontFamily: FONT.bodyMedium, fontSize: 10, color: FUEL.muted, textTransform: 'uppercase', marginBottom: SPACE.xs },
  statValue: { fontFamily: FONT.display, fontSize: 24 },
  statGoal: { fontFamily: FONT.body, fontSize: 11, color: FUEL.muted, marginTop: 2 },
  mealsCount: { fontFamily: FONT.body, fontSize: 13, color: FUEL.muted, textAlign: 'center', marginTop: SPACE.s },

  mealItem: { backgroundColor: FUEL.sand, borderRadius: RADIUS.md, padding: SPACE.l, marginBottom: SPACE.m },
  mealHeader: { flexDirection: 'row', alignItems: 'center', gap: SPACE.s, marginBottom: SPACE.m },
  mealTitle: { flex: 1, fontFamily: FONT.bodyExtrabold, fontSize: 16, color: FUEL.ink },
  mealTime: { fontFamily: FONT.body, fontSize: 12, color: FUEL.muted },
  itemRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: SPACE.xs },
  itemName: { flex: 1, fontFamily: FONT.body, fontSize: 13, color: FUEL.ink },
  itemCals: { fontFamily: FONT.bodyBold, fontSize: 13, color: FUEL.ink },
  mealTotal: { flexDirection: 'row', justifyContent: 'space-between', marginTop: SPACE.s, paddingTop: SPACE.s, borderTopWidth: 1, borderTopColor: FUEL.sandBorder },
  mealTotalLabel: { fontFamily: FONT.bodyBold, fontSize: 14, color: FUEL.ink },
  mealTotalValue: { fontFamily: FONT.display, fontSize: 16, color: FUEL.ink },

  remainingGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.m },
  remainingBox: { width: '47%', backgroundColor: FUEL.sand, borderRadius: RADIUS.md, padding: SPACE.l, alignItems: 'center' },
  remainingValue: { fontFamily: FONT.display, fontSize: 28, color: FUEL.ink, marginTop: SPACE.s },
  remainingLabel: { fontFamily: FONT.bodyMedium, fontSize: 11, color: FUEL.muted, textTransform: 'uppercase', marginTop: SPACE.xs },

  aiCard: { backgroundColor: FUEL.limeTint, borderColor: FUEL.limeDeep },
  aiHeader: { flexDirection: 'row', alignItems: 'center', gap: SPACE.s, marginBottom: SPACE.l },
  aiSuggestion: { fontFamily: FONT.body, fontSize: 14, lineHeight: 22, color: FUEL.ink, marginBottom: SPACE.l },
  aiLoading: { flexDirection: 'row', alignItems: 'center', gap: SPACE.m },
  aiLoadingText: { fontFamily: FONT.body, fontSize: 14, color: FUEL.muted },

  recommendedSection: { marginTop: SPACE.s },
  recommendedTitle: { fontFamily: FONT.bodyExtrabold, fontSize: 14, color: FUEL.ink, marginBottom: SPACE.m },
  recommendedItem: {
    flexDirection: 'row',
    backgroundColor: FUEL.white,
    borderRadius: RADIUS.md,
    padding: SPACE.l,
    marginBottom: SPACE.m,
    borderWidth: 1,
    borderColor: FUEL.sandBorder,
    alignItems: 'center'
  },
  recommendedLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: SPACE.m },
  dietDot: { width: 16, height: 16, borderRadius: RADIUS.xs, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  dietDotFill: { width: 8, height: 8, borderRadius: 4 }, // circle
  recommendedName: { fontFamily: FONT.bodyExtrabold, fontSize: 15, color: FUEL.ink, marginBottom: 2 },
  recommendedReason: { fontFamily: FONT.body, fontSize: 12, color: FUEL.muted, fontStyle: 'italic', marginBottom: SPACE.xs },
  recommendedNutrition: { fontFamily: FONT.bodyBold, fontSize: 11, color: FUEL.success },
  recommendedRight: {},
  goToMenuBtn: {
    backgroundColor: FUEL.lime,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACE.s,
    paddingVertical: SPACE.l,
    borderRadius: RADIUS.pill,
    marginTop: SPACE.s
  },
  goToMenuText: { fontFamily: FONT.display, fontSize: 15, color: FUEL.ink, textTransform: 'uppercase' },

  emptyText: { fontFamily: FONT.body, fontSize: 14, color: FUEL.muted, textAlign: 'center', paddingVertical: SPACE.xl },
});
