import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { apiCall } from '../utils/api';

const BK_RED = '#D62300';
const BK_ORANGE = '#FF8732';
const BK_BROWN = '#502314';
const BK_CREAM = '#F5EBDC';
const BK_GREEN = '#509E2F';
const BK_WHITE = '#FFFFFF';
const BK_TEXT_LIGHT = '#8B6F61';

export default function NutritionDetailScreen() {
  const router = useRouter();
  const [summary, setSummary] = useState<any>(null);
  const [orders, setOrders] = useState<any[]>([]);
  const [aiSuggestion, setAiSuggestion] = useState<string>('');
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
        calories: (goals.daily_calories || 2000) - (consumed.calories || 0),
        protein: (goals.daily_protein || 150) - (consumed.protein || 0),
        carbs: (goals.daily_carbs || 200) - (consumed.carbs || 0),
        fat: (goals.daily_fat || 60) - (consumed.fat || 0)
      };

      const result = await apiCall('/ai/nutrition-advice', {
        method: 'POST',
        body: {
          consumed,
          goals,
          remaining,
          meals_count: summaryData.meals_count || 0
        }
      });
      
      setAiSuggestion(result.advice || result.suggestion || 'Keep up the good work!');
    } catch (e) {
      setAiSuggestion('Unable to generate AI suggestions at this time. Focus on balanced meals!');
    } finally {
      setAiLoading(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={BK_RED} />
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
          <Ionicons name="arrow-back" size={24} color={BK_CREAM} />
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
              { label: 'Calories', consumed: consumed.calories || 0, goal: goals.daily_calories || 2000, color: BK_RED },
              { label: 'Protein', consumed: consumed.protein || 0, goal: goals.daily_protein || 150, color: BK_RED, unit: 'g' },
              { label: 'Carbs', consumed: consumed.carbs || 0, goal: goals.daily_carbs || 200, color: '#FF9F0A', unit: 'g' },
              { label: 'Fat', consumed: consumed.fat || 0, goal: goals.daily_fat || 60, color: BK_ORANGE, unit: 'g' }
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
                  <Ionicons name="restaurant" size={18} color={BK_BROWN} />
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
              { label: 'Calories', value: remaining.calories, icon: 'flame', color: BK_RED },
              { label: 'Protein', value: remaining.protein, icon: 'barbell', color: BK_RED, unit: 'g' },
              { label: 'Carbs', value: remaining.carbs, icon: 'leaf', color: '#FF9F0A', unit: 'g' },
              { label: 'Fat', value: remaining.fat, icon: 'water', color: BK_ORANGE, unit: 'g' }
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
            <Ionicons name="sparkles" size={20} color={BK_ORANGE} />
            <Text style={styles.cardTitle}>AI Nutrition Coach</Text>
          </View>
          {aiLoading ? (
            <View style={styles.aiLoading}>
              <ActivityIndicator color={BK_ORANGE} />
              <Text style={styles.aiLoadingText}>Analyzing your nutrition...</Text>
            </View>
          ) : (
            <Text style={styles.aiSuggestion}>{aiSuggestion}</Text>
          )}
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: BK_CREAM },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: BK_BROWN,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(245,235,220,0.15)', alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '800', color: BK_CREAM, textTransform: 'uppercase' },
  
  summaryCard: { backgroundColor: BK_WHITE, margin: 16, borderRadius: 16, padding: 18, borderWidth: 2, borderColor: '#E8DDD4' },
  card: { backgroundColor: BK_WHITE, marginHorizontal: 16, marginBottom: 16, borderRadius: 16, padding: 18, borderWidth: 2, borderColor: '#E8DDD4' },
  cardTitle: { fontSize: 18, fontWeight: '800', color: BK_BROWN, marginBottom: 14, textTransform: 'uppercase' },
  
  statsRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  statBox: { alignItems: 'center' },
  statLabel: { fontSize: 10, color: BK_TEXT_LIGHT, textTransform: 'uppercase', marginBottom: 4 },
  statValue: { fontSize: 24, fontWeight: '800' },
  statGoal: { fontSize: 11, color: BK_TEXT_LIGHT, marginTop: 2 },
  mealsCount: { fontSize: 13, color: BK_TEXT_LIGHT, textAlign: 'center', marginTop: 8 },
  
  mealItem: { backgroundColor: BK_CREAM, borderRadius: 12, padding: 14, marginBottom: 12 },
  mealHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  mealTitle: { flex: 1, fontSize: 16, fontWeight: '800', color: BK_BROWN },
  mealTime: { fontSize: 12, color: BK_TEXT_LIGHT },
  itemRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  itemName: { flex: 1, fontSize: 13, color: BK_BROWN },
  itemCals: { fontSize: 13, fontWeight: '700', color: BK_RED },
  mealTotal: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#E8DDD4' },
  mealTotalLabel: { fontSize: 14, fontWeight: '700', color: BK_BROWN },
  mealTotalValue: { fontSize: 16, fontWeight: '800', color: BK_RED },
  
  remainingGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  remainingBox: { width: '47%', backgroundColor: BK_CREAM, borderRadius: 12, padding: 16, alignItems: 'center' },
  remainingValue: { fontSize: 28, fontWeight: '800', color: BK_BROWN, marginTop: 8 },
  remainingLabel: { fontSize: 11, color: BK_TEXT_LIGHT, textTransform: 'uppercase', marginTop: 4 },
  
  aiCard: { backgroundColor: '#FFF9F0', borderColor: BK_ORANGE },
  aiHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 },
  aiSuggestion: { fontSize: 14, lineHeight: 22, color: BK_BROWN },
  aiLoading: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  aiLoadingText: { fontSize: 14, color: BK_TEXT_LIGHT },
  
  emptyText: { fontSize: 14, color: BK_TEXT_LIGHT, textAlign: 'center', paddingVertical: 20 },
});
