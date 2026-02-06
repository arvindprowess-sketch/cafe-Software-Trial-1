import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Alert, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { apiCall } from '../utils/api';

const Z_RED = '#E23744';

export default function CustomizeScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const initialCart = params.cart ? JSON.parse(params.cart as string) : [];
  const orderType = (params.orderType as string) || 'dine-in';

  const [items, setItems] = useState<any[]>(initialCart);
  const [goal, setGoal] = useState('');
  const [budget, setBudget] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiSuggestion, setAiSuggestion] = useState<any>(null);
  const [ordering, setOrdering] = useState(false);
  const [inputMode, setInputMode] = useState<Record<string, 'grams' | 'rupees'>>({});

  const updateGrams = (id: string, grams: number) => setItems(items.map(i => i.id === id ? { ...i, grams: Math.max(0, grams) } : i));
  const updateByRupees = (id: string, rupees: number) => { const item = items.find(i => i.id === id); if (item) updateGrams(id, Math.round((rupees / item.cost_per_100g) * 100)); };
  const removeItem = (id: string) => setItems(items.filter(i => i.id !== id));

  const totals = useMemo(() => items.reduce((a, i) => {
    const f = i.grams / 100;
    return { price: a.price + f * i.cost_per_100g, calories: a.calories + f * i.calories_per_100g, protein: a.protein + f * i.protein_per_100g, carbs: a.carbs + f * i.carbs_per_100g, fat: a.fat + f * i.fat_per_100g };
  }, { price: 0, calories: 0, protein: 0, carbs: 0, fat: 0 }), [items]);

  const extra = orderType === 'delivery' ? 30 : orderType === 'takeaway' ? 10 : 0;

  const getAiSuggestion = async () => {
    if (!goal) { Alert.alert('Set Goal', 'Select a fitness goal first'); return; }
    setAiLoading(true); setAiSuggestion(null);
    try {
      const result = await apiCall('/ai/suggest', { method: 'POST', body: { goal, budget: budget ? parseFloat(budget) : null, selected_items: items.map(i => ({ product_id: i.id, product_name: i.name, grams: i.grams, price: (i.grams / 100) * i.cost_per_100g })), current_nutrition: { ...totals } } });
      setAiSuggestion(result);
    } catch (e: any) { Alert.alert('Error', e.message); } finally { setAiLoading(false); }
  };

  const applySuggestion = (s: any) => {
    const item = items.find(i => i.name.toLowerCase() === s.product_name?.toLowerCase());
    if (item) updateGrams(item.id, s.suggested_grams);
    setAiSuggestion(null);
  };

  const placeOrder = async () => {
    if (items.length === 0 || items.every(i => i.grams === 0)) { Alert.alert('Empty', 'Add items with quantities'); return; }
    setOrdering(true);
    try {
      const orderItems = items.filter(i => i.grams > 0).map(i => ({ product_id: i.id, product_name: i.name, grams: i.grams, price: (i.grams / 100) * i.cost_per_100g, calories: (i.grams / 100) * i.calories_per_100g, protein: (i.grams / 100) * i.protein_per_100g, carbs: (i.grams / 100) * i.carbs_per_100g, fat: (i.grams / 100) * i.fat_per_100g }));
      await apiCall('/orders', { method: 'POST', body: { order_type: orderType, items: orderItems, total_price: totals.price, total_calories: totals.calories, total_protein: totals.protein, total_carbs: totals.carbs, total_fat: totals.fat, fitness_goal: goal || null, budget: budget ? parseFloat(budget) : null } });
      Alert.alert('Order Placed!', `Total: ₹${Math.round(totals.price + extra)}`);
      setTimeout(() => router.replace('/(tabs)/orders'), 1500);
    } catch (e: any) { Alert.alert('Error', e.message); } finally { setOrdering(false); }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={styles.topBar}>
          <TouchableOpacity testID="back-btn" onPress={() => router.back()} style={styles.backBtn}><Ionicons name="arrow-back" size={20} color="#1C1C2E" /></TouchableOpacity>
          <Text style={styles.topTitle}>Customize Meal</Text>
          <View style={styles.typeBadge}><Text style={styles.typeBadgeText}>{orderType}</Text></View>
        </View>

        <ScrollView contentContainerStyle={styles.scroll}>
          <Text style={styles.section}>Fitness Goal</Text>
          <View style={styles.goalRow}>
            {['fat_loss', 'muscle_gain', 'maintenance'].map(g => (
              <TouchableOpacity key={g} testID={`customize-goal-${g}`} style={[styles.goalChip, goal === g && styles.goalActive]} onPress={() => setGoal(g)}>
                <Text style={[styles.goalText, goal === g && { color: '#FFF' }]}>{g === 'fat_loss' ? 'Fat Loss' : g === 'muscle_gain' ? 'Muscle Gain' : 'Maintain'}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <View style={styles.budgetRow}>
            <Text style={styles.budgetLabel}>Budget</Text>
            <TextInput testID="budget-input" style={styles.budgetInput} value={budget} onChangeText={setBudget} placeholder="₹ optional" placeholderTextColor="#B0B0B0" keyboardType="number-pad" />
          </View>

          <Text style={styles.section}>Your Items</Text>
          {items.map(item => {
            const mode = inputMode[item.id] || 'grams';
            const f = item.grams / 100;
            return (
              <View key={item.id} style={styles.itemCard} testID={`customize-item-${item.id}`}>
                <View style={styles.itemTop}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.itemName}>{item.name}</Text>
                    <Text style={styles.itemMeta}>{item.category} • ₹{item.cost_per_100g}/100g</Text>
                  </View>
                  <TouchableOpacity testID={`remove-item-${item.id}`} onPress={() => removeItem(item.id)}><Ionicons name="close-circle" size={22} color="#D0D0D0" /></TouchableOpacity>
                </View>
                <View style={styles.modeRow}>
                  {(['grams', 'rupees'] as const).map(m => (
                    <TouchableOpacity key={m} testID={`mode-${m}-${item.id}`} style={[styles.modeBtn, mode === m && styles.modeBtnActive]} onPress={() => setInputMode({ ...inputMode, [item.id]: m })}>
                      <Text style={[styles.modeText, mode === m && { color: Z_RED }]}>{m === 'grams' ? 'Grams' : 'Rupees'}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <View style={styles.qtyRow}>
                  <TouchableOpacity style={styles.qtyBtn} onPress={() => updateGrams(item.id, item.grams - 25)}><Ionicons name="remove" size={16} color={Z_RED} /></TouchableOpacity>
                  <TextInput testID={`qty-input-${item.id}`} style={styles.qtyInput}
                    value={mode === 'grams' ? String(item.grams) : String(Math.round(f * item.cost_per_100g))}
                    onChangeText={v => { const n = parseInt(v) || 0; mode === 'grams' ? updateGrams(item.id, n) : updateByRupees(item.id, n); }}
                    keyboardType="number-pad" />
                  <Text style={styles.qtyUnit}>{mode === 'grams' ? 'g' : '₹'}</Text>
                  <TouchableOpacity style={[styles.qtyBtn, { backgroundColor: Z_RED }]} onPress={() => updateGrams(item.id, item.grams + 25)}><Ionicons name="add" size={16} color="#FFF" /></TouchableOpacity>
                </View>
                <View style={styles.nutriRow}>
                  <Text style={styles.nutriText}>{Math.round(f * item.calories_per_100g)} cal</Text>
                  <Text style={styles.nutriText}>P: {(f * item.protein_per_100g).toFixed(1)}g</Text>
                  <Text style={styles.nutriText}>C: {(f * item.carbs_per_100g).toFixed(1)}g</Text>
                  <Text style={styles.nutriText}>F: {(f * item.fat_per_100g).toFixed(1)}g</Text>
                  <Text style={styles.priceText}>₹{Math.round(f * item.cost_per_100g)}</Text>
                </View>
              </View>
            );
          })}

          <TouchableOpacity testID="ai-suggest-btn" style={styles.aiBtn} onPress={getAiSuggestion} disabled={aiLoading}>
            {aiLoading ? <ActivityIndicator color="#FFF" /> : <><Ionicons name="sparkles" size={18} color="#FFF" /><Text style={styles.aiBtnText}>AI Meal Suggestion</Text></>}
          </TouchableOpacity>

          {aiSuggestion && (
            <View style={styles.aiCard}>
              <Text style={styles.aiTitle}><Ionicons name="sparkles" size={14} color="#5B5FE0" /> AI Recommendation</Text>
              <Text style={styles.aiSummary}>{aiSuggestion.summary}</Text>
              {aiSuggestion.suggestions?.map((s: any, i: number) => (
                <View key={i} style={styles.aiSugRow}>
                  <View style={{ flex: 1 }}><Text style={styles.aiSugName}>{s.product_name}: {s.suggested_grams}g</Text><Text style={styles.aiSugReason}>{s.reason}</Text></View>
                  <TouchableOpacity testID={`apply-suggestion-${i}`} style={styles.applyBtn} onPress={() => applySuggestion(s)}><Text style={styles.applyText}>Apply</Text></TouchableOpacity>
                </View>
              ))}
            </View>
          )}
          <View style={{ height: 120 }} />
        </ScrollView>

        <View style={styles.bottomBar}>
          <View style={styles.bottomInfo}>
            <View style={styles.bottomRow}>
              <Text style={styles.bottomCal}>{Math.round(totals.calories)} cal</Text>
              <Text style={styles.bottomMacro}>P:{Math.round(totals.protein)}g C:{Math.round(totals.carbs)}g F:{Math.round(totals.fat)}g</Text>
            </View>
            <View style={styles.bottomRow}>
              <Text style={styles.bottomPrice}>₹{Math.round(totals.price + extra)}</Text>
              {extra > 0 && <Text style={styles.extraText}>incl. ₹{extra} {orderType}</Text>}
            </View>
          </View>
          <TouchableOpacity testID="place-order-btn" style={styles.orderBtn} onPress={placeOrder} disabled={ordering}>
            {ordering ? <ActivityIndicator color="#FFF" /> : <Text style={styles.orderBtnText}>Place Order</Text>}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F8F8F8' },
  topBar: { flexDirection: 'row', alignItems: 'center', padding: 16, gap: 12, backgroundColor: '#FFF', borderBottomWidth: 1, borderBottomColor: '#EFEFEF' },
  backBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#F5F5F5', alignItems: 'center', justifyContent: 'center' },
  topTitle: { flex: 1, fontSize: 18, fontWeight: '700', color: '#1C1C2E' },
  typeBadge: { backgroundColor: '#FDE8EA', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  typeBadgeText: { color: Z_RED, fontSize: 11, fontWeight: '700', textTransform: 'capitalize' },
  scroll: { padding: 16 },
  section: { fontSize: 16, fontWeight: '700', color: '#1C1C2E', marginBottom: 8, marginTop: 4 },
  goalRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  goalChip: { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center', backgroundColor: '#FFF', borderWidth: 1, borderColor: '#E8E8E8' },
  goalActive: { backgroundColor: Z_RED, borderColor: Z_RED },
  goalText: { fontSize: 12, fontWeight: '600', color: '#696969' },
  budgetRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16 },
  budgetLabel: { color: '#696969', fontSize: 13, fontWeight: '600' },
  budgetInput: { flex: 1, backgroundColor: '#FFF', borderRadius: 8, padding: 10, color: '#1C1C2E', fontSize: 15, borderWidth: 1, borderColor: '#E8E8E8' },
  itemCard: { backgroundColor: '#FFF', borderRadius: 12, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: '#EFEFEF' },
  itemTop: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  itemName: { fontSize: 15, fontWeight: '700', color: '#1C1C2E' },
  itemMeta: { fontSize: 11, color: '#9C9C9C', marginTop: 2 },
  modeRow: { flexDirection: 'row', gap: 6, marginBottom: 10 },
  modeBtn: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 6, backgroundColor: '#F5F5F5' },
  modeBtnActive: { backgroundColor: '#FDE8EA' },
  modeText: { fontSize: 12, fontWeight: '600', color: '#9C9C9C' },
  qtyRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  qtyBtn: { width: 36, height: 36, borderRadius: 8, backgroundColor: '#FDE8EA', alignItems: 'center', justifyContent: 'center' },
  qtyInput: { flex: 1, backgroundColor: '#F5F5F5', borderRadius: 8, padding: 10, color: '#1C1C2E', fontSize: 20, fontWeight: '800', textAlign: 'center' },
  qtyUnit: { color: '#9C9C9C', fontSize: 14, fontWeight: '600' },
  nutriRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  nutriText: { fontSize: 11, color: '#9C9C9C' },
  priceText: { fontSize: 14, fontWeight: '700', color: Z_RED },
  aiBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#5B5FE0', borderRadius: 12, paddingVertical: 14, marginTop: 8 },
  aiBtnText: { color: '#FFF', fontSize: 14, fontWeight: '700' },
  aiCard: { backgroundColor: '#FFF', borderRadius: 12, padding: 14, marginTop: 12, borderWidth: 1, borderColor: '#5B5FE0' },
  aiTitle: { fontSize: 14, fontWeight: '700', color: '#5B5FE0', marginBottom: 6 },
  aiSummary: { color: '#696969', fontSize: 13, lineHeight: 18, marginBottom: 10 },
  aiSugRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderTopWidth: 1, borderTopColor: '#EFEFEF' },
  aiSugName: { color: '#1C1C2E', fontSize: 13, fontWeight: '600' },
  aiSugReason: { color: '#9C9C9C', fontSize: 11, marginTop: 2 },
  applyBtn: { backgroundColor: '#5B5FE0', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6 },
  applyText: { color: '#FFF', fontSize: 12, fontWeight: '700' },
  bottomBar: { backgroundColor: '#FFF', borderTopWidth: 1, borderTopColor: '#EFEFEF', padding: 16, paddingBottom: 24, flexDirection: 'row', alignItems: 'center', gap: 14 },
  bottomInfo: { flex: 1 },
  bottomRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  bottomCal: { fontSize: 14, fontWeight: '700', color: '#1C1C2E' },
  bottomMacro: { fontSize: 11, color: '#9C9C9C' },
  bottomPrice: { fontSize: 20, fontWeight: '800', color: '#1C1C2E' },
  extraText: { fontSize: 10, color: '#9C9C9C' },
  orderBtn: { backgroundColor: Z_RED, borderRadius: 12, paddingVertical: 14, paddingHorizontal: 28, alignItems: 'center' },
  orderBtnText: { color: '#FFF', fontSize: 15, fontWeight: '700' },
});
