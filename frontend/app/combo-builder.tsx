import React, { useState, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Animated, Dimensions, Image, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { apiCall } from '../utils/api';

const { width: SCREEN_W } = Dimensions.get('window');
const Z_RED = '#D62300';
const GREEN = '#509E2F';
const PURPLE = '#FF8732';
const DARK = '#502314';

const BUDGETS = [100, 150, 200, 250, 300, 400, 500];
const GOALS = [
  { key: 'muscle_gain', label: 'Muscle Gain', icon: 'trending-up', desc: 'High protein, moderate carbs', color: GREEN, bg: '#E8F5E9' },
  { key: 'fat_loss', label: 'Fat Loss', icon: 'flame', desc: 'Low cal, lean protein focus', color: Z_RED, bg: '#FDE8E4' },
  { key: 'maintenance', label: 'Maintenance', icon: 'swap-horizontal', desc: 'Balanced macros, good variety', color: PURPLE, bg: '#EDE7F6' },
];
const DIETS = [
  { key: 'veg', label: 'Vegetarian', icon: 'leaf', color: GREEN },
  { key: 'non-veg', label: 'Non-Veg', icon: 'restaurant', color: Z_RED },
  { key: 'both', label: 'Both', icon: 'nutrition', color: PURPLE },
];

export default function ComboBuilderScreen() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [budget, setBudget] = useState(200);
  const [goal, setGoal] = useState('muscle_gain');
  const [diet, setDiet] = useState('both');
  const [loading, setLoading] = useState(false);
  const [combo, setCombo] = useState<any>(null);
  const [error, setError] = useState('');

  const fadeAnim = useRef(new Animated.Value(1)).current;
  const slideAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (loading) {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.05, duration: 800, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 0.95, duration: 800, useNativeDriver: true }),
        ])
      );
      pulse.start();
      return () => pulse.stop();
    }
  }, [loading]);

  const animateStep = (next: number) => {
    Animated.timing(fadeAnim, { toValue: 0, duration: 150, useNativeDriver: true }).start(() => {
      setStep(next);
      slideAnim.setValue(30);
      Animated.parallel([
        Animated.timing(fadeAnim, { toValue: 1, duration: 250, useNativeDriver: true }),
        Animated.timing(slideAnim, { toValue: 0, duration: 250, useNativeDriver: true }),
      ]).start();
    });
  };

  const generateCombo = async () => {
    setLoading(true);
    setError('');
    animateStep(3);
    try {
      const result = await apiCall('/ai/quick-meal', {
        method: 'POST',
        body: { budget, goal, diet_preference: diet },
      });
      if (result.meal_items?.length > 0) {
        setCombo(result);
        animateStep(4);
      } else {
        setError(result.summary || 'No combo could be generated. Try different options.');
        animateStep(2);
      }
    } catch (e: any) {
      setError(e.message || 'Something went wrong');
      animateStep(2);
    } finally {
      setLoading(false);
    }
  };

  const orderCombo = () => {
    if (!combo?.meal_items) return;
    console.log('[Combo Builder] Order button clicked, combo items:', combo.meal_items);
    
    try {
      // Normalize cart items with all required fields
      const cart = combo.meal_items.map((item: any) => ({
        id: item.product_id || item.id,
        product_id: item.product_id || item.id,
        name: item.product_name || item.name,
        grams: item.grams || 100,
        cost_per_100g: item.cost_per_100g || 0,
        calories_per_100g: item.calories_per_100g || item.calories || 0,
        protein_per_100g: item.protein_per_100g || item.protein || 0,
        carbs_per_100g: item.carbs_per_100g || item.carbs || 0,
        fat_per_100g: item.fat_per_100g || item.fat || 0,
        diet_type: item.diet_type || 'veg',
        image_url: item.image_url,
        product_type: 'single',
        category: item.category || '',
      }));
      
      console.log('[Combo Builder] Normalized cart:', cart);
      const cartString = JSON.stringify(cart);
      console.log('[Combo Builder] Cart string length:', cartString.length);
      
      router.push({ 
        pathname: '/customize', 
        params: { 
          cart: cartString, 
          orderType: 'dine-in' 
        } 
      });
      console.log('[Combo Builder] Navigation triggered to customize screen');
    } catch (error) {
      console.error('[Combo Builder] Error during order:', error);
      alert('Failed to proceed to checkout. Please try again.');
    }
  };

  const goalInfo = GOALS.find(g => g.key === goal) || GOALS[0];

  return (
    <SafeAreaView style={s.safe}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity testID="back-btn" onPress={() => step > 0 && step < 3 ? animateStep(step - 1) : router.back()} style={s.backBtn}>
          <Ionicons name={step > 0 && step < 4 ? 'arrow-back' : 'close'} size={20} color={DARK} />
        </TouchableOpacity>
        <View style={s.headerCenter}>
          <Text style={s.headerTitle}>Combo Builder</Text>
          {step < 3 && (
            <View style={s.stepDots}>
              {[0, 1, 2].map(i => (
                <View key={i} style={[s.dot, i === step && s.dotActive, i < step && s.dotDone]} />
              ))}
            </View>
          )}
        </View>
        <View style={{ width: 36 }} />
      </View>

      <Animated.View style={[s.content, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
        {/* STEP 0: Budget */}
        {step === 0 && (
          <ScrollView contentContainerStyle={s.stepContent}>
            <View style={s.stepIcon}>
              <Ionicons name="wallet" size={36} color={PURPLE} />
            </View>
            <Text style={s.stepTitle}>What's your budget?</Text>
            <Text style={s.stepDesc}>AI will build the best meal within your budget</Text>
            <View style={s.budgetGrid}>
              {BUDGETS.map(b => (
                <TouchableOpacity
                  key={b}
                  testID={`budget-${b}`}
                  style={[s.budgetChip, budget === b && s.budgetChipActive]}
                  onPress={() => setBudget(b)}
                >
                  <Text style={[s.budgetText, budget === b && s.budgetTextActive]}>₹{b}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={s.selectedBudget}>
              <Text style={s.selectedLabel}>Selected</Text>
              <Text style={s.selectedValue}>₹{budget}</Text>
            </View>
          </ScrollView>
        )}

        {/* STEP 1: Goal */}
        {step === 1 && (
          <ScrollView contentContainerStyle={s.stepContent}>
            <View style={s.stepIcon}>
              <Ionicons name="fitness" size={36} color={Z_RED} />
            </View>
            <Text style={s.stepTitle}>What's your goal?</Text>
            <Text style={s.stepDesc}>This shapes the macro balance of your combo</Text>
            <View style={s.goalList}>
              {GOALS.map(g => (
                <TouchableOpacity
                  key={g.key}
                  testID={`goal-${g.key}`}
                  style={[s.goalCard, goal === g.key && { borderColor: g.color, borderWidth: 2 }]}
                  onPress={() => setGoal(g.key)}
                >
                  <View style={[s.goalIconBg, { backgroundColor: g.bg }]}>
                    <Ionicons name={g.icon as any} size={24} color={g.color} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.goalLabel}>{g.label}</Text>
                    <Text style={s.goalDesc}>{g.desc}</Text>
                  </View>
                  {goal === g.key && (
                    <View style={[s.checkCircle, { backgroundColor: g.color }]}>
                      <Ionicons name="checkmark" size={14} color="#FFF" />
                    </View>
                  )}
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
        )}

        {/* STEP 2: Diet */}
        {step === 2 && (
          <ScrollView contentContainerStyle={s.stepContent}>
            <View style={s.stepIcon}>
              <Ionicons name="leaf" size={36} color={GREEN} />
            </View>
            <Text style={s.stepTitle}>Diet preference?</Text>
            <Text style={s.stepDesc}>We'll pick items matching your preference</Text>
            <View style={s.dietRow}>
              {DIETS.map(d => (
                <TouchableOpacity
                  key={d.key}
                  testID={`diet-${d.key}`}
                  style={[s.dietCard, diet === d.key && { borderColor: d.color, borderWidth: 2, backgroundColor: `${d.color}08` }]}
                  onPress={() => setDiet(d.key)}
                >
                  <Ionicons name={d.icon as any} size={28} color={d.color} />
                  <Text style={[s.dietLabel, diet === d.key && { color: d.color }]}>{d.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            {error ? (
              <View style={s.errorBox}>
                <Ionicons name="alert-circle" size={16} color={Z_RED} />
                <Text style={s.errorText}>{error}</Text>
              </View>
            ) : null}
            <View style={s.summaryCard}>
              <Text style={s.summaryTitle}>Your combo specs</Text>
              <View style={s.summaryRow}><Text style={s.summaryLabel}>Budget</Text><Text style={s.summaryVal}>₹{budget}</Text></View>
              <View style={s.summaryRow}><Text style={s.summaryLabel}>Goal</Text><Text style={[s.summaryVal, { color: goalInfo.color }]}>{goalInfo.label}</Text></View>
              <View style={s.summaryRow}><Text style={s.summaryLabel}>Diet</Text><Text style={s.summaryVal}>{DIETS.find(d => d.key === diet)?.label}</Text></View>
            </View>
          </ScrollView>
        )}

        {/* STEP 3: Loading */}
        {step === 3 && (
          <View style={s.loadingContainer}>
            <Animated.View style={[s.loadingCircle, { transform: [{ scale: pulseAnim }] }]}>
              <Ionicons name="sparkles" size={48} color={PURPLE} />
            </Animated.View>
            <Text style={s.loadingTitle}>Building your combo...</Text>
            <Text style={s.loadingDesc}>AI is crafting the perfect ₹{budget} {goalInfo.label.toLowerCase()} meal</Text>
            <View style={s.loadingSteps}>
              {['Analyzing menu items', 'Optimizing macros', 'Calculating portions'].map((t, i) => (
                <View key={i} style={s.loadingStep}>
                  <ActivityIndicator size="small" color={PURPLE} />
                  <Text style={s.loadingStepText}>{t}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* STEP 4: Result */}
        {step === 4 && combo && (
          <ScrollView contentContainerStyle={s.resultContent}>
            <View style={[s.resultHero, { backgroundColor: goalInfo.color }]}>
              <Ionicons name="sparkles" size={20} color="rgba(255,255,255,0.6)" />
              <Text style={s.resultHeroTitle}>AI Combo Ready</Text>
              <Text style={s.resultHeroSummary}>{combo.summary}</Text>
            </View>

            {/* Nutrition Ring */}
            <View style={s.nutritionCard} testID="combo-nutrition">
              <View style={s.nutritionGrid}>
                <View style={s.nutritionItem}>
                  <Text style={[s.nutritionValue, { color: Z_RED }]}>{Math.round(combo.totals.calories)}</Text>
                  <Text style={s.nutritionLabel}>Calories</Text>
                </View>
                <View style={s.nutritionItem}>
                  <Text style={[s.nutritionValue, { color: Z_RED }]}>{Math.round(combo.totals.protein)}g</Text>
                  <Text style={s.nutritionLabel}>Protein</Text>
                </View>
                <View style={s.nutritionItem}>
                  <Text style={[s.nutritionValue, { color: '#FF9F0A' }]}>{Math.round(combo.totals.carbs)}g</Text>
                  <Text style={s.nutritionLabel}>Carbs</Text>
                </View>
                <View style={s.nutritionItem}>
                  <Text style={[s.nutritionValue, { color: PURPLE }]}>{Math.round(combo.totals.fat)}g</Text>
                  <Text style={s.nutritionLabel}>Fat</Text>
                </View>
              </View>
            </View>

            {/* Items */}
            <Text style={s.itemsTitle}>{combo.meal_items.length} items in your combo</Text>
            {combo.meal_items.map((item: any, idx: number) => (
              <View key={idx} style={s.itemCard} testID={`combo-item-${idx}`}>
                <View style={s.itemRow}>
                  {item.image_url ? (
                    <Image source={{ uri: item.image_url }} style={s.itemImg} />
                  ) : (
                    <View style={[s.itemImg, s.imgPlaceholder]}>
                      <Ionicons name="restaurant" size={20} color="#D0D0D0" />
                    </View>
                  )}
                  <View style={s.itemInfo}>
                    <View style={s.nameRow}>
                      <View style={[s.vegBox, { borderColor: item.diet_type === 'non-veg' ? Z_RED : GREEN }]}>
                        <View style={[s.vegDot, { backgroundColor: item.diet_type === 'non-veg' ? Z_RED : GREEN }]} />
                      </View>
                      <Text style={s.itemName}>{item.product_name}</Text>
                    </View>
                    <Text style={s.itemReason}>{item.reason}</Text>
                    <Text style={s.itemMeta}>{Math.round(item.calories)} cal | P:{Math.round(item.protein)}g</Text>
                  </View>
                  <View style={s.itemRight}>
                    <Text style={s.itemGrams}>{item.grams}g</Text>
                    <Text style={s.itemPrice}>₹{Math.round(item.price)}</Text>
                  </View>
                </View>
              </View>
            ))}

            {/* Price */}
            <View style={s.priceCard} testID="combo-price">
              <View style={s.priceRow}>
                <Text style={s.priceLabel}>Total</Text>
                <Text style={s.priceValue}>₹{Math.round(combo.totals.price)}</Text>
              </View>
              <View style={s.priceRow}>
                <Text style={s.priceLabel}>Budget</Text>
                <Text style={s.priceBudget}>₹{budget}</Text>
              </View>
              {combo.totals.price <= budget && (
                <View style={s.underBudget}>
                  <Ionicons name="checkmark-circle" size={16} color={GREEN} />
                  <Text style={s.underBudgetText}>₹{Math.round(budget - combo.totals.price)} under budget!</Text>
                </View>
              )}
            </View>

            <View style={{ height: 100 }} />
          </ScrollView>
        )}
      </Animated.View>

      {/* Bottom CTA */}
      {step < 3 && (
        <View style={s.bottomBar}>
          <TouchableOpacity
            testID="combo-next-btn"
            style={[s.nextBtn, { backgroundColor: step === 2 ? PURPLE : DARK }]}
            onPress={() => step < 2 ? animateStep(step + 1) : generateCombo()}
          >
            <Text style={s.nextText}>{step === 2 ? 'Generate My Combo' : 'Next'}</Text>
            <Ionicons name={step === 2 ? 'sparkles' : 'arrow-forward'} size={18} color="#FFF" />
          </TouchableOpacity>
        </View>
      )}

      {step === 4 && (
        <View style={s.bottomBar}>
          <TouchableOpacity testID="combo-retry-btn" style={s.retryBtn} onPress={() => { setCombo(null); generateCombo(); }}>
            <Ionicons name="refresh" size={18} color={DARK} />
          </TouchableOpacity>
          <TouchableOpacity testID="combo-order-btn" style={s.orderBtn} onPress={orderCombo}>
            <Ionicons name="cart" size={18} color="#FFF" />
            <Text style={s.orderText}>Order Combo  ₹{Math.round(combo?.totals?.price || 0)}</Text>
          </TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#FAFAFA' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: '#FFF', borderBottomWidth: 1, borderBottomColor: '#E8DDD4' },
  backBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#F5EBDC', alignItems: 'center', justifyContent: 'center' },
  headerCenter: { flex: 1, alignItems: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '700', color: DARK },
  stepDots: { flexDirection: 'row', gap: 6, marginTop: 6 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#E0E0E0' },
  dotActive: { width: 24, backgroundColor: PURPLE },
  dotDone: { backgroundColor: GREEN },
  content: { flex: 1 },
  stepContent: { padding: 24, alignItems: 'center' },
  stepIcon: { width: 72, height: 72, borderRadius: 36, backgroundColor: '#F0EEFF', alignItems: 'center', justifyContent: 'center', marginBottom: 20, marginTop: 20 },
  stepTitle: { fontSize: 26, fontWeight: '800', color: DARK, textAlign: 'center' },
  stepDesc: { fontSize: 14, color: '#8B6F61', textAlign: 'center', marginTop: 6, marginBottom: 28 },

  // Budget
  budgetGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'center', marginBottom: 24 },
  budgetChip: { paddingHorizontal: 24, paddingVertical: 14, borderRadius: 14, backgroundColor: '#FFF', borderWidth: 1.5, borderColor: '#E8DDD4' },
  budgetChipActive: { backgroundColor: DARK, borderColor: DARK },
  budgetText: { fontSize: 18, fontWeight: '700', color: DARK },
  budgetTextActive: { color: '#FFF' },
  selectedBudget: { alignItems: 'center', padding: 16, backgroundColor: '#FFF', borderRadius: 14, borderWidth: 1, borderColor: '#E8DDD4', width: '100%' },
  selectedLabel: { fontSize: 12, color: '#8B6F61' },
  selectedValue: { fontSize: 36, fontWeight: '800', color: DARK },

  // Goal
  goalList: { width: '100%', gap: 10 },
  goalCard: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: '#FFF', borderRadius: 16, padding: 18, borderWidth: 1.5, borderColor: '#E8DDD4' },
  goalIconBg: { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  goalLabel: { fontSize: 16, fontWeight: '700', color: DARK },
  goalDesc: { fontSize: 12, color: '#8B6F61', marginTop: 2 },
  checkCircle: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },

  // Diet
  dietRow: { flexDirection: 'row', gap: 10, width: '100%', marginBottom: 20 },
  dietCard: { flex: 1, alignItems: 'center', paddingVertical: 24, backgroundColor: '#FFF', borderRadius: 16, borderWidth: 1.5, borderColor: '#E8DDD4', gap: 10 },
  dietLabel: { fontSize: 13, fontWeight: '700', color: DARK },
  errorBox: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#FFF5F5', borderRadius: 12, padding: 14, width: '100%', marginBottom: 12 },
  errorText: { fontSize: 13, color: Z_RED, flex: 1 },
  summaryCard: { width: '100%', backgroundColor: '#FFF', borderRadius: 16, padding: 18, borderWidth: 1, borderColor: '#E8DDD4' },
  summaryTitle: { fontSize: 14, fontWeight: '700', color: DARK, marginBottom: 12 },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8 },
  summaryLabel: { fontSize: 14, color: '#8B6F61' },
  summaryVal: { fontSize: 14, fontWeight: '700', color: DARK },

  // Loading
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  loadingCircle: { width: 100, height: 100, borderRadius: 50, backgroundColor: '#F0EEFF', alignItems: 'center', justifyContent: 'center', marginBottom: 24 },
  loadingTitle: { fontSize: 22, fontWeight: '800', color: DARK },
  loadingDesc: { fontSize: 14, color: '#8B6F61', textAlign: 'center', marginTop: 6 },
  loadingSteps: { marginTop: 32, gap: 16 },
  loadingStep: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  loadingStepText: { fontSize: 14, color: '#8B6F61' },

  // Result
  resultContent: { padding: 16 },
  resultHero: { borderRadius: 18, padding: 20, marginBottom: 16 },
  resultHeroTitle: { fontSize: 22, fontWeight: '800', color: '#FFF', marginTop: 8 },
  resultHeroSummary: { fontSize: 13, color: 'rgba(255,255,255,0.85)', marginTop: 6 },
  nutritionCard: { backgroundColor: '#FFF', borderRadius: 16, padding: 18, marginBottom: 16, borderWidth: 1, borderColor: '#E8DDD4' },
  nutritionGrid: { flexDirection: 'row', justifyContent: 'space-around' },
  nutritionItem: { alignItems: 'center' },
  nutritionValue: { fontSize: 22, fontWeight: '800' },
  nutritionLabel: { fontSize: 10, color: '#8B6F61', marginTop: 4 },
  itemsTitle: { fontSize: 16, fontWeight: '700', color: DARK, marginBottom: 10 },
  itemCard: { backgroundColor: '#FFF', borderRadius: 14, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: '#E8DDD4' },
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  itemImg: { width: 52, height: 52, borderRadius: 10, backgroundColor: '#F5EBDC' },
  imgPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  itemInfo: { flex: 1 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  vegBox: { width: 12, height: 12, borderRadius: 2, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  vegDot: { width: 6, height: 6, borderRadius: 3 },
  itemName: { fontSize: 14, fontWeight: '700', color: DARK },
  itemReason: { fontSize: 11, color: PURPLE, marginTop: 3, fontStyle: 'italic' },
  itemMeta: { fontSize: 11, color: '#8B6F61', marginTop: 2 },
  itemRight: { alignItems: 'flex-end' },
  itemGrams: { fontSize: 16, fontWeight: '800', color: DARK },
  itemPrice: { fontSize: 12, color: '#8B6F61', marginTop: 2 },
  priceCard: { backgroundColor: '#FFF', borderRadius: 14, padding: 16, marginTop: 4, borderWidth: 1, borderColor: '#E8DDD4' },
  priceRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 },
  priceLabel: { fontSize: 14, color: '#8B6F61' },
  priceValue: { fontSize: 22, fontWeight: '800', color: DARK },
  priceBudget: { fontSize: 14, color: '#8B6F61' },
  underBudget: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#E8F5E9', borderRadius: 10, padding: 12, marginTop: 8 },
  underBudgetText: { fontSize: 14, fontWeight: '700', color: GREEN },

  // Bottom
  bottomBar: { flexDirection: 'row', gap: 10, padding: 16, paddingBottom: 28, backgroundColor: '#FFF', borderTopWidth: 1, borderTopColor: '#E8DDD4' },
  nextBtn: { flex: 1, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8, borderRadius: 14, paddingVertical: 16 },
  nextText: { fontSize: 16, fontWeight: '700', color: '#FFF' },
  retryBtn: { width: 52, height: 52, borderRadius: 14, backgroundColor: '#F5EBDC', alignItems: 'center', justifyContent: 'center' },
  orderBtn: { flex: 1, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8, backgroundColor: PURPLE, borderRadius: 14, paddingVertical: 16 },
  orderText: { fontSize: 16, fontWeight: '700', color: '#FFF' },
});
