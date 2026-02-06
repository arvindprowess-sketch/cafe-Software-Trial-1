import React, { useState, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput,
  SafeAreaView, Alert, ActivityIndicator, KeyboardAvoidingView, Platform
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { apiCall, getStoredUser } from '../utils/api';

interface CartItem {
  id: string; name: string; cost_per_100g: number; category: string;
  calories_per_100g: number; protein_per_100g: number; carbs_per_100g: number;
  fat_per_100g: number; grams: number;
}

export default function CustomizeScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const initialCart: CartItem[] = params.cart ? JSON.parse(params.cart as string) : [];
  const orderType = (params.orderType as string) || 'dine-in';

  const [items, setItems] = useState<CartItem[]>(initialCart);
  const [goal, setGoal] = useState('');
  const [budget, setBudget] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiSuggestion, setAiSuggestion] = useState<any>(null);
  const [ordering, setOrdering] = useState(false);
  const [inputMode, setInputMode] = useState<Record<string, 'grams' | 'rupees'>>({});

  const updateGrams = (id: string, grams: number) => {
    setItems(items.map(i => i.id === id ? { ...i, grams: Math.max(0, grams) } : i));
  };

  const updateByRupees = (id: string, rupees: number) => {
    const item = items.find(i => i.id === id);
    if (!item) return;
    const grams = (rupees / item.cost_per_100g) * 100;
    updateGrams(id, Math.round(grams));
  };

  const removeItem = (id: string) => {
    setItems(items.filter(i => i.id !== id));
  };

  const totals = useMemo(() => {
    return items.reduce((acc, item) => {
      const factor = item.grams / 100;
      return {
        price: acc.price + factor * item.cost_per_100g,
        calories: acc.calories + factor * item.calories_per_100g,
        protein: acc.protein + factor * item.protein_per_100g,
        carbs: acc.carbs + factor * item.carbs_per_100g,
        fat: acc.fat + factor * item.fat_per_100g,
      };
    }, { price: 0, calories: 0, protein: 0, carbs: 0, fat: 0 });
  }, [items]);

  const extraCharge = orderType === 'delivery' ? 30 : orderType === 'takeaway' ? 10 : 0;

  const getAiSuggestion = async () => {
    if (!goal) { Alert.alert('Set Goal', 'Please select a fitness goal first'); return; }
    setAiLoading(true);
    setAiSuggestion(null);
    try {
      const result = await apiCall('/ai/suggest', {
        method: 'POST',
        body: {
          goal,
          budget: budget ? parseFloat(budget) : null,
          selected_items: items.map(i => ({
            product_id: i.id, product_name: i.name,
            grams: i.grams, price: (i.grams / 100) * i.cost_per_100g,
          })),
          current_nutrition: { ...totals },
        }
      });
      setAiSuggestion(result);
    } catch (e: any) {
      Alert.alert('AI Error', e.message);
    } finally { setAiLoading(false); }
  };

  const applySuggestion = (suggestion: any) => {
    const existingItem = items.find(i =>
      i.name.toLowerCase() === suggestion.product_name?.toLowerCase()
    );
    if (existingItem) {
      updateGrams(existingItem.id, suggestion.suggested_grams);
    }
    setAiSuggestion(null);
  };

  const placeOrder = async () => {
    if (items.length === 0 || items.every(i => i.grams === 0)) {
      Alert.alert('Empty Order', 'Please add items with quantities');
      return;
    }
    setOrdering(true);
    try {
      const orderItems = items.filter(i => i.grams > 0).map(i => ({
        product_id: i.id, product_name: i.name,
        grams: i.grams, price: (i.grams / 100) * i.cost_per_100g,
        calories: (i.grams / 100) * i.calories_per_100g,
        protein: (i.grams / 100) * i.protein_per_100g,
        carbs: (i.grams / 100) * i.carbs_per_100g,
        fat: (i.grams / 100) * i.fat_per_100g,
      }));
      await apiCall('/orders', {
        method: 'POST',
        body: {
          order_type: orderType, items: orderItems,
          total_price: totals.price, total_calories: totals.calories,
          total_protein: totals.protein, total_carbs: totals.carbs,
          total_fat: totals.fat, fitness_goal: goal || null,
          budget: budget ? parseFloat(budget) : null,
        }
      });
      Alert.alert('Order Placed!', `Your ${orderType} order has been confirmed.\nTotal: ₹${Math.round(totals.price + extraCharge)}`, [
        { text: 'OK', onPress: () => router.replace('/(tabs)/orders') }
      ]);
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally { setOrdering(false); }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={styles.topBar}>
          <TouchableOpacity testID="back-btn" onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={22} color="#FFF" />
          </TouchableOpacity>
          <Text style={styles.topTitle}>Customize Meal</Text>
          <View style={styles.typeBadge}>
            <Text style={styles.typeBadgeText}>{orderType}</Text>
          </View>
        </View>

        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
          <View style={styles.goalSection}>
            <Text style={styles.sectionLabel}>Fitness Goal</Text>
            <View style={styles.goalRow}>
              {['fat_loss', 'muscle_gain', 'maintenance'].map(g => (
                <TouchableOpacity
                  key={g}
                  testID={`customize-goal-${g}`}
                  style={[styles.goalChip, goal === g && styles.goalChipActive]}
                  onPress={() => setGoal(g)}
                >
                  <Text style={[styles.goalChipText, goal === g && styles.goalChipTextActive]}>
                    {g === 'fat_loss' ? 'Fat Loss' : g === 'muscle_gain' ? 'Muscle Gain' : 'Maintenance'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={styles.budgetRow}>
              <Text style={styles.budgetLabel}>Budget (optional)</Text>
              <TextInput
                testID="budget-input"
                style={styles.budgetInput}
                value={budget}
                onChangeText={setBudget}
                placeholder="₹"
                placeholderTextColor="#48484A"
                keyboardType="number-pad"
              />
            </View>
          </View>

          <Text style={styles.sectionLabel}>Your Items</Text>
          {items.map(item => {
            const mode = inputMode[item.id] || 'grams';
            const factor = item.grams / 100;
            const itemPrice = factor * item.cost_per_100g;
            const itemCal = factor * item.calories_per_100g;
            return (
              <View key={item.id} style={styles.itemCard} testID={`customize-item-${item.id}`}>
                <View style={styles.itemTop}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.itemName}>{item.name}</Text>
                    <Text style={styles.itemCat}>{item.category} • ₹{item.cost_per_100g}/100g</Text>
                  </View>
                  <TouchableOpacity testID={`remove-item-${item.id}`} onPress={() => removeItem(item.id)}>
                    <Ionicons name="close-circle" size={22} color="#FF453A" />
                  </TouchableOpacity>
                </View>

                <View style={styles.modeToggle}>
                  <TouchableOpacity
                    testID={`mode-grams-${item.id}`}
                    style={[styles.modeBtn, mode === 'grams' && styles.modeBtnActive]}
                    onPress={() => setInputMode({ ...inputMode, [item.id]: 'grams' })}
                  >
                    <Text style={[styles.modeText, mode === 'grams' && styles.modeTextActive]}>Grams</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    testID={`mode-rupees-${item.id}`}
                    style={[styles.modeBtn, mode === 'rupees' && styles.modeBtnActive]}
                    onPress={() => setInputMode({ ...inputMode, [item.id]: 'rupees' })}
                  >
                    <Text style={[styles.modeText, mode === 'rupees' && styles.modeTextActive]}>Rupees</Text>
                  </TouchableOpacity>
                </View>

                <View style={styles.quantityRow}>
                  <TouchableOpacity
                    style={styles.qtyBtn}
                    onPress={() => updateGrams(item.id, item.grams - 25)}
                  >
                    <Ionicons name="remove" size={18} color="#FFF" />
                  </TouchableOpacity>
                  <TextInput
                    testID={`qty-input-${item.id}`}
                    style={styles.qtyInput}
                    value={mode === 'grams' ? String(item.grams) : String(Math.round(itemPrice))}
                    onChangeText={v => {
                      const num = parseInt(v) || 0;
                      if (mode === 'grams') updateGrams(item.id, num);
                      else updateByRupees(item.id, num);
                    }}
                    keyboardType="number-pad"
                  />
                  <Text style={styles.qtyUnit}>{mode === 'grams' ? 'g' : '₹'}</Text>
                  <TouchableOpacity
                    style={[styles.qtyBtn, styles.qtyBtnAdd]}
                    onPress={() => updateGrams(item.id, item.grams + 25)}
                  >
                    <Ionicons name="add" size={18} color="#FFF" />
                  </TouchableOpacity>
                </View>

                <View style={styles.itemNutrition}>
                  <Text style={styles.itemNutriText}>{Math.round(itemCal)} cal</Text>
                  <Text style={styles.itemNutriText}>P: {(factor * item.protein_per_100g).toFixed(1)}g</Text>
                  <Text style={styles.itemNutriText}>C: {(factor * item.carbs_per_100g).toFixed(1)}g</Text>
                  <Text style={styles.itemNutriText}>F: {(factor * item.fat_per_100g).toFixed(1)}g</Text>
                  <Text style={styles.itemPriceText}>₹{Math.round(itemPrice)}</Text>
                </View>
              </View>
            );
          })}

          <TouchableOpacity
            testID="ai-suggest-btn"
            style={styles.aiBtn}
            onPress={getAiSuggestion}
            disabled={aiLoading}
          >
            {aiLoading ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <>
                <Ionicons name="sparkles" size={20} color="#FFF" />
                <Text style={styles.aiBtnText}>AI MEAL SUGGESTION</Text>
              </>
            )}
          </TouchableOpacity>

          {aiSuggestion && (
            <View style={styles.aiCard}>
              <Text style={styles.aiTitle}>
                <Ionicons name="sparkles" size={16} color="#007AFF" /> AI Recommendation
              </Text>
              <Text style={styles.aiSummary}>{aiSuggestion.summary}</Text>
              {aiSuggestion.suggestions?.map((s: any, i: number) => (
                <View key={i} style={styles.aiSugItem}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.aiSugName}>{s.product_name}: {s.suggested_grams}g</Text>
                    <Text style={styles.aiSugReason}>{s.reason}</Text>
                  </View>
                  <TouchableOpacity
                    testID={`apply-suggestion-${i}`}
                    style={styles.applyBtn}
                    onPress={() => applySuggestion(s)}
                  >
                    <Text style={styles.applyText}>Apply</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}

          <View style={{ height: 140 }} />
        </ScrollView>

        <View style={styles.summaryBar}>
          <View style={styles.summaryTop}>
            <View style={styles.summaryMacros}>
              <Text style={styles.sumMacro}>{Math.round(totals.calories)} cal</Text>
              <Text style={styles.sumMacroSm}>P:{Math.round(totals.protein)}g C:{Math.round(totals.carbs)}g F:{Math.round(totals.fat)}g</Text>
            </View>
            <View style={styles.summaryPrice}>
              <Text style={styles.sumPrice}>₹{Math.round(totals.price + extraCharge)}</Text>
              {extraCharge > 0 && <Text style={styles.sumExtra}>+₹{extraCharge} {orderType}</Text>}
            </View>
          </View>
          <TouchableOpacity
            testID="place-order-btn"
            style={styles.orderBtn}
            onPress={placeOrder}
            disabled={ordering}
          >
            {ordering ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <Text style={styles.orderBtnText}>PLACE ORDER</Text>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#000' },
  topBar: {
    flexDirection: 'row', alignItems: 'center', padding: 16, gap: 12,
    borderBottomWidth: 1, borderBottomColor: '#2C2C2E',
  },
  backBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#1C1C1E', alignItems: 'center', justifyContent: 'center' },
  topTitle: { flex: 1, fontSize: 20, fontWeight: '700', color: '#FFF' },
  typeBadge: { backgroundColor: 'rgba(255,59,48,0.15)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  typeBadgeText: { color: '#FF3B30', fontSize: 11, fontWeight: '700', textTransform: 'capitalize' },
  scroll: { flex: 1 },
  scrollContent: { padding: 16 },
  goalSection: { marginBottom: 20 },
  sectionLabel: { fontSize: 16, fontWeight: '700', color: '#FFF', marginBottom: 10 },
  goalRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  goalChip: {
    flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center',
    backgroundColor: '#1C1C1E', borderWidth: 1, borderColor: '#2C2C2E',
  },
  goalChipActive: { backgroundColor: '#FF3B30', borderColor: '#FF3B30' },
  goalChipText: { fontSize: 11, fontWeight: '700', color: '#8E8E93' },
  goalChipTextActive: { color: '#FFF' },
  budgetRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  budgetLabel: { color: '#8E8E93', fontSize: 13 },
  budgetInput: {
    flex: 1, backgroundColor: '#1C1C1E', borderRadius: 8, padding: 10,
    color: '#FFF', fontSize: 16, borderWidth: 1, borderColor: '#2C2C2E',
  },
  itemCard: {
    backgroundColor: '#121212', borderRadius: 14, padding: 14, marginBottom: 10,
    borderWidth: 1, borderColor: '#2C2C2E',
  },
  itemTop: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  itemName: { fontSize: 16, fontWeight: '700', color: '#FFF' },
  itemCat: { fontSize: 11, color: '#8E8E93', marginTop: 2 },
  modeToggle: { flexDirection: 'row', gap: 6, marginBottom: 10 },
  modeBtn: {
    paddingHorizontal: 14, paddingVertical: 6, borderRadius: 8,
    backgroundColor: '#1C1C1E', borderWidth: 1, borderColor: '#2C2C2E',
  },
  modeBtnActive: { backgroundColor: '#2C2C2E', borderColor: '#FF3B30' },
  modeText: { fontSize: 12, fontWeight: '600', color: '#48484A' },
  modeTextActive: { color: '#FF3B30' },
  quantityRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  qtyBtn: {
    width: 36, height: 36, borderRadius: 8, backgroundColor: '#1C1C1E',
    alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#2C2C2E',
  },
  qtyBtnAdd: { backgroundColor: '#FF3B30', borderColor: '#FF3B30' },
  qtyInput: {
    flex: 1, backgroundColor: '#1C1C1E', borderRadius: 8, padding: 10,
    color: '#FFF', fontSize: 20, fontWeight: '800', textAlign: 'center',
    borderWidth: 1, borderColor: '#2C2C2E',
  },
  qtyUnit: { color: '#8E8E93', fontSize: 14, fontWeight: '600' },
  itemNutrition: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  itemNutriText: { fontSize: 11, color: '#8E8E93' },
  itemPriceText: { fontSize: 14, fontWeight: '700', color: '#FF3B30' },
  aiBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#007AFF', borderRadius: 12, paddingVertical: 14, marginTop: 8,
    shadowColor: '#007AFF', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 8, elevation: 5,
  },
  aiBtnText: { color: '#FFF', fontSize: 14, fontWeight: '700', letterSpacing: 0.5 },
  aiCard: {
    backgroundColor: '#121212', borderRadius: 14, padding: 16, marginTop: 12,
    borderWidth: 1, borderColor: '#007AFF',
  },
  aiTitle: { fontSize: 14, fontWeight: '700', color: '#007AFF', marginBottom: 8 },
  aiSummary: { color: '#E5E5EA', fontSize: 13, lineHeight: 18, marginBottom: 12 },
  aiSugItem: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 8,
    borderTopWidth: 1, borderTopColor: '#2C2C2E',
  },
  aiSugName: { color: '#FFF', fontSize: 13, fontWeight: '600' },
  aiSugReason: { color: '#8E8E93', fontSize: 11, marginTop: 2 },
  applyBtn: {
    backgroundColor: '#007AFF', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6,
  },
  applyText: { color: '#FFF', fontSize: 12, fontWeight: '700' },
  summaryBar: {
    backgroundColor: '#121212', borderTopWidth: 1, borderTopColor: '#2C2C2E',
    padding: 16, paddingBottom: 24,
  },
  summaryTop: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  summaryMacros: {},
  sumMacro: { color: '#FFF', fontSize: 18, fontWeight: '800' },
  sumMacroSm: { color: '#8E8E93', fontSize: 11, marginTop: 2 },
  summaryPrice: { alignItems: 'flex-end' },
  sumPrice: { color: '#FF3B30', fontSize: 22, fontWeight: '800' },
  sumExtra: { color: '#8E8E93', fontSize: 10 },
  orderBtn: {
    backgroundColor: '#FF3B30', borderRadius: 12, paddingVertical: 16, alignItems: 'center',
    shadowColor: '#FF3B30', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 8, elevation: 5,
  },
  orderBtnText: { color: '#FFF', fontSize: 16, fontWeight: '700', letterSpacing: 1 },
});
