import React, { useState, useEffect, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { apiCall } from '../utils/api';
import { useCart } from '../utils/CartContext';
import { FUEL, FONT, getGoal } from '../utils/theme';

const Z_RED = '#15140F';
const GREEN = '#3FA34D';

export default function SmartFillScreen() {
  const router = useRouter();
  const { addMeal } = useCart();
  const params = useLocalSearchParams();

  const budget = (params.budget as string) || '200';
  const dietPref = (params.dietPref as string) || 'both';
  const goal = (params.goal as string) || 'maintenance';
  const orderType = (params.orderType as string) || 'dine-in';

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [summary, setSummary] = useState('');
  const [items, setItems] = useState<any[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const goalInfo = getGoal(goal);

  const loadSuggestions = async () => {
    setLoading(true); setError('');
    try {
      const result = await apiCall('/ai/quick-meal', {
        method: 'POST',
        body: { diet_preference: dietPref, goal, budget: parseFloat(budget), order_type: orderType },
      });
      if (result?.meal_items?.length > 0) {
        setItems(result.meal_items);
        setSummary(result.summary || '');
        setSelectedIds(new Set(result.meal_items.map((i: any) => i.product_id || i.id)));
      } else {
        setItems([]);
        setError(result?.summary || 'No dishes could be suggested for this budget. Try a higher budget or different filters.');
      }
    } catch (e: any) {
      setError(e?.message || 'Something went wrong while building your meal.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadSuggestions(); }, []);

  const toggle = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const selectedItems = useMemo(
    () => items.filter(i => selectedIds.has(i.product_id || i.id)),
    [items, selectedIds]
  );

  const totals = useMemo(() => selectedItems.reduce((a, i) => ({
    price: a.price + (i.price || 0),
    calories: a.calories + (i.calories || 0),
    protein: a.protein + (i.protein || 0),
    carbs: a.carbs + (i.carbs || 0),
    fat: a.fat + (i.fat || 0),
  }), { price: 0, calories: 0, protein: 0, carbs: 0, fat: 0 }), [selectedItems]);

  const reviewOrder = () => {
    const cart = selectedItems.map((item: any) => ({
      id: item.product_id || item.id,
      product_id: item.product_id || item.id,
      name: item.product_name || item.name,
      grams: item.grams || 100,
      cost_per_100g: item.cost_per_100g || 0,
      calories_per_100g: item.calories_per_100g || 0,
      protein_per_100g: item.protein_per_100g || 0,
      carbs_per_100g: item.carbs_per_100g || 0,
      fat_per_100g: item.fat_per_100g || 0,
      diet_type: item.diet_type || 'veg',
      product_type: 'single',
      category: item.category || '',
    }));
    // CORE RULE: Smart Fill meal goes to the shared CART (no direct order).
    addMeal(cart);
    router.push('/cart');
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity testID="smart-fill-back-btn" style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={20} color={FUEL.ink} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Smart Fill</Text>
          <Text style={styles.headerSub}>₹{budget} · {goalInfo?.label || goal} · {dietPref === 'both' ? 'All' : dietPref === 'veg' ? 'Veg' : 'Non-Veg'}</Text>
        </View>
        <TouchableOpacity testID="smart-fill-refresh-btn" style={styles.backBtn} onPress={loadSuggestions} disabled={loading}>
          <Ionicons name="refresh" size={18} color={FUEL.ink} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={Z_RED} />
          <Text style={styles.loadingText}>Building your ₹{budget} meal…</Text>
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Ionicons name="alert-circle" size={40} color="#D69A35" />
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity testID="smart-fill-change-btn" style={styles.changeBtn} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={16} color={FUEL.ink} />
            <Text style={styles.changeBtnText}>Change budget / filters</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
            {!!summary && (
              <View style={styles.summaryCard} testID="smart-fill-summary">
                <Ionicons name="sparkles" size={16} color={goalInfo?.color || Z_RED} />
                <Text style={styles.summaryText}>{summary}</Text>
              </View>
            )}

            <Text style={styles.sectionTitle}>Suggested Dishes ({items.length})</Text>
            <Text style={styles.sectionHint}>Tap to add or remove each dish</Text>

            {items.map((item, idx) => {
              const id = item.product_id || item.id;
              const selected = selectedIds.has(id);
              return (
                <TouchableOpacity
                  key={idx}
                  testID={`smart-fill-item-${idx}`}
                  style={[styles.dishCard, selected && styles.dishCardActive]}
                  onPress={() => toggle(id)}
                  activeOpacity={0.85}
                >
                  {item.image_url ? (
                    <Image source={{ uri: item.image_url }} style={styles.dishImg} />
                  ) : (
                    <View style={[styles.dishImg, styles.dishImgPlaceholder]}>
                      <Ionicons name="restaurant" size={22} color="#D0D0D0" />
                    </View>
                  )}
                  <View style={styles.dishInfo}>
                    <View style={styles.dishNameRow}>
                      <View style={[styles.vegBox, { borderColor: item.diet_type === 'non-veg' ? Z_RED : GREEN }]}>
                        <View style={[styles.vegDot, { backgroundColor: item.diet_type === 'non-veg' ? Z_RED : GREEN }]} />
                      </View>
                      <Text style={styles.dishName} numberOfLines={1}>{item.product_name || item.name}</Text>
                    </View>
                    {!!item.reason && <Text style={styles.dishReason} numberOfLines={2}>{item.reason}</Text>}
                    <Text style={styles.dishMeta}>{item.grams}g · {Math.round(item.calories || 0)} cal · P:{Math.round(item.protein || 0)}g</Text>
                  </View>
                  <View style={styles.dishRight}>
                    <Text style={styles.dishPrice}>₹{Math.round(item.price || 0)}</Text>
                    <View style={[styles.toggleCircle, selected && styles.toggleCircleActive]}>
                      <Ionicons name={selected ? 'checkmark' : 'add'} size={18} color={selected ? FUEL.ink : '#9C9C9C'} />
                    </View>
                  </View>
                </TouchableOpacity>
              );
            })}

            <View style={{ height: 130 }} />
          </ScrollView>

          {/* Bottom bar */}
          <View style={styles.bottomBar}>
            <View style={styles.bottomLeft}>
              <Text style={styles.bottomTotal}>₹{Math.round(totals.price)}</Text>
              <Text style={styles.bottomItems}>{selectedItems.length} dishes · {Math.round(totals.calories)} cal</Text>
            </View>
            <TouchableOpacity
              testID="smart-fill-review-btn"
              style={[styles.reviewBtn, selectedItems.length === 0 && styles.reviewBtnDisabled]}
              onPress={reviewOrder}
              disabled={selectedItems.length === 0}
            >
              <Text style={styles.reviewText}>Review Order</Text>
              <Ionicons name="arrow-forward" size={18} color={FUEL.ink} />
            </TouchableOpacity>
          </View>
        </>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: FUEL.sand },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12, backgroundColor: '#FFF', borderBottomWidth: 1, borderBottomColor: '#E6E1D4' },
  backBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: FUEL.sand, alignItems: 'center', justifyContent: 'center' },
  headerCenter: { flex: 1 },
  headerTitle: { fontFamily: FONT.display, fontSize: 20, color: FUEL.ink, textTransform: 'uppercase', letterSpacing: 0.5 },
  headerSub: { fontSize: 12, color: '#6B6A5E', marginTop: 2, fontWeight: '600' },

  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, gap: 14 },
  loadingText: { fontSize: 14, color: '#6B6A5E', fontWeight: '600' },
  errorText: { fontSize: 14, color: '#6B6A5E', textAlign: 'center', lineHeight: 20 },
  changeBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: FUEL.lime, borderRadius: 14, paddingHorizontal: 18, paddingVertical: 12, marginTop: 6 },
  changeBtnText: { fontSize: 14, fontWeight: '800', color: FUEL.ink },

  scroll: { padding: 16 },
  summaryCard: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#FFF', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: '#E6E1D4', marginBottom: 16 },
  summaryText: { flex: 1, fontSize: 13, color: '#15140F', lineHeight: 18, fontWeight: '600' },
  sectionTitle: { fontFamily: FONT.display, fontSize: 18, color: FUEL.ink, textTransform: 'uppercase', letterSpacing: 0.3 },
  sectionHint: { fontSize: 12, color: '#6B6A5E', marginTop: 2, marginBottom: 12 },

  dishCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#FFF', borderRadius: 16, padding: 12, marginBottom: 10, borderWidth: 2, borderColor: '#E6E1D4' },
  dishCardActive: { borderColor: FUEL.lime, backgroundColor: '#FCFEF6' },
  dishImg: { width: 56, height: 56, borderRadius: 12, backgroundColor: FUEL.sand },
  dishImgPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  dishInfo: { flex: 1 },
  dishNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  vegBox: { width: 14, height: 14, borderRadius: 2, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  vegDot: { width: 7, height: 7, borderRadius: 4 },
  dishName: { flex: 1, fontSize: 15, fontWeight: '800', color: '#15140F' },
  dishReason: { fontSize: 11, color: '#8E6FB8', marginTop: 3, lineHeight: 15 },
  dishMeta: { fontSize: 11, color: '#6B6A5E', marginTop: 3 },
  dishRight: { alignItems: 'flex-end', gap: 8 },
  dishPrice: { fontSize: 16, fontWeight: '800', color: '#15140F' },
  toggleCircle: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#F4F1E9', borderWidth: 1.5, borderColor: '#E0DACB', alignItems: 'center', justifyContent: 'center' },
  toggleCircleActive: { backgroundColor: FUEL.lime, borderColor: FUEL.lime },

  bottomBar: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: '#FFF', borderTopWidth: 1, borderTopColor: '#E6E1D4', padding: 16, paddingBottom: 28, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  bottomLeft: {},
  bottomTotal: { fontSize: 22, fontWeight: '800', color: '#15140F' },
  bottomItems: { fontSize: 11, color: '#6B6A5E', marginTop: 2 },
  reviewBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: FUEL.lime, borderRadius: 14, paddingHorizontal: 24, paddingVertical: 14 },
  reviewBtnDisabled: { backgroundColor: '#E0DACB' },
  reviewText: { fontSize: 15, fontWeight: '800', color: FUEL.ink, textTransform: 'uppercase', letterSpacing: 0.3 },
});
