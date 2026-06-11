import React, { useState, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Animated, Dimensions, ActivityIndicator, Alert } from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { apiCall } from '../utils/api';
import { useCart } from '../utils/CartContext';
import { GOALS as FUEL_GOALS, FUEL, FONT, IMG_PLACEHOLDER, RADIUS, SPACE } from '../utils/theme';
import PressableScale from './components/PressableScale';

const { width: SCREEN_W } = Dimensions.get('window');
const Z_RED = '#15140F';
const GREEN = '#3FA34D';
const PURPLE = '#15140F';
const DARK = '#15140F';

const BUDGETS = [100, 150, 200, 250, 300, 400, 500];
// 6 canonical goals from the shared source of truth (utils/theme).
const GOALS = FUEL_GOALS.map(g => ({
  key: g.key,
  label: g.label,
  icon: g.icon,
  desc: g.desc,
  color: g.color,
  bg: `${g.color}18`,
}));
const DIETS = [
  { key: 'veg', label: 'Vegetarian', icon: 'leaf', color: GREEN },
  { key: 'non-veg', label: 'Non-Veg', icon: 'restaurant', color: Z_RED },
  { key: 'both', label: 'Both', icon: 'nutrition', color: PURPLE },
];

export default function ComboBuilderScreen() {
  const router = useRouter();
  const { addMeal } = useCart();
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
    console.log('[Combo Builder] Order button clicked, combo items:', combo.meal_items.length);
    
    try {
      // Normalize cart items with all required fields
      // IMPORTANT: Remove image_url to prevent URL being too large
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
        // Exclude image_url to prevent huge URL with base64 data
        product_type: 'single',
        category: item.category || '',
      }));
      
      console.log('[Combo Builder] Normalized cart items:', cart.length);
      // CORE RULE: AI combo goes to the shared CART (no direct order).
      addMeal(cart);
      router.push('/cart');
      console.log('[Combo Builder] Navigation triggered to customize screen');
    } catch (error) {
      console.error('[Combo Builder] Error during order:', error);
      Alert.alert('Error', 'Failed to proceed to checkout. Please try again.');
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
                  <Text style={[s.nutritionValue, { color: '#D69A35' }]}>{Math.round(combo.totals.carbs)}g</Text>
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
                    <Image source={{ uri: item.image_url }} style={s.itemImg} cachePolicy="memory-disk" transition={200} placeholder={IMG_PLACEHOLDER} />
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
          <PressableScale
            haptic
            testID="combo-next-btn"
            style={[s.nextBtn, { backgroundColor: step === 2 ? PURPLE : DARK }]}
            onPress={() => step < 2 ? animateStep(step + 1) : generateCombo()}
          >
            <Text style={s.nextText}>{step === 2 ? 'Generate My Combo' : 'Next'}</Text>
            <Ionicons name={step === 2 ? 'sparkles' : 'arrow-forward'} size={18} color="#FFF" />
          </PressableScale>
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
  safe: { flex: 1, backgroundColor: FUEL.sand },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACE.l, paddingVertical: SPACE.m, backgroundColor: '#FFF', borderBottomWidth: 1, borderBottomColor: FUEL.sandBorder },
  backBtn: { width: 36, height: 36, borderRadius: RADIUS.lg, backgroundColor: FUEL.sand, alignItems: 'center', justifyContent: 'center' },
  headerCenter: { flex: 1, alignItems: 'center' },
  headerTitle: { fontSize: 17, fontFamily: FONT.bodyBold, color: DARK },
  stepDots: { flexDirection: 'row', gap: SPACE.s, marginTop: SPACE.s },
  dot: { width: 8, height: 8, borderRadius: RADIUS.xs, backgroundColor: FUEL.sandBorder },
  dotActive: { width: 24, backgroundColor: PURPLE },
  dotDone: { backgroundColor: GREEN },
  content: { flex: 1 },
  stepContent: { padding: SPACE.xl, alignItems: 'center' },
  stepIcon: { width: 72, height: 72, borderRadius: RADIUS.pill, backgroundColor: FUEL.limeTint, alignItems: 'center', justifyContent: 'center', marginBottom: SPACE.xl, marginTop: SPACE.xl },
  stepTitle: { fontSize: 26, fontFamily: FONT.bodyExtrabold, color: DARK, textAlign: 'center' },
  stepDesc: { fontSize: 14, color: FUEL.muted, textAlign: 'center', marginTop: SPACE.s, marginBottom: SPACE.xxl },

  // Budget
  budgetGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.m, justifyContent: 'center', marginBottom: SPACE.xl },
  budgetChip: { paddingHorizontal: SPACE.xl, paddingVertical: SPACE.l, borderRadius: RADIUS.md, backgroundColor: '#FFF', borderWidth: 1.5, borderColor: FUEL.sandBorder },
  budgetChipActive: { backgroundColor: DARK, borderColor: DARK },
  budgetText: { fontSize: 18, fontFamily: FONT.bodyBold, color: DARK },
  budgetTextActive: { color: '#FFF' },
  selectedBudget: { alignItems: 'center', padding: SPACE.l, backgroundColor: '#FFF', borderRadius: RADIUS.md, borderWidth: 1, borderColor: FUEL.sandBorder, width: '100%' },
  selectedLabel: { fontSize: 12, color: FUEL.muted },
  selectedValue: { fontSize: 36, fontFamily: FONT.bodyExtrabold, color: DARK },

  // Goal
  goalList: { width: '100%', gap: SPACE.m },
  goalCard: { flexDirection: 'row', alignItems: 'center', gap: SPACE.l, backgroundColor: '#FFF', borderRadius: RADIUS.md, padding: SPACE.l, borderWidth: 1.5, borderColor: FUEL.sandBorder },
  goalIconBg: { width: 48, height: 48, borderRadius: RADIUS.md, alignItems: 'center', justifyContent: 'center' },
  goalLabel: { fontSize: 16, fontFamily: FONT.bodyBold, color: DARK },
  goalDesc: { fontSize: 12, color: FUEL.muted, marginTop: 2 },
  checkCircle: { width: 24, height: 24, borderRadius: RADIUS.md, alignItems: 'center', justifyContent: 'center' },

  // Diet
  dietRow: { flexDirection: 'row', gap: SPACE.m, width: '100%', marginBottom: SPACE.xl },
  dietCard: { flex: 1, alignItems: 'center', paddingVertical: SPACE.xl, backgroundColor: '#FFF', borderRadius: RADIUS.md, borderWidth: 1.5, borderColor: FUEL.sandBorder, gap: SPACE.m },
  dietLabel: { fontSize: 13, fontFamily: FONT.bodyBold, color: DARK },
  errorBox: { flexDirection: 'row', alignItems: 'center', gap: SPACE.s, backgroundColor: '#F7F4EC', borderRadius: RADIUS.md, padding: SPACE.l, width: '100%', marginBottom: SPACE.m },
  errorText: { fontSize: 13, color: Z_RED, flex: 1 },
  summaryCard: { width: '100%', backgroundColor: '#FFF', borderRadius: RADIUS.md, padding: SPACE.l, borderWidth: 1, borderColor: FUEL.sandBorder },
  summaryTitle: { fontSize: 14, fontFamily: FONT.bodyBold, color: DARK, marginBottom: SPACE.m },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: SPACE.s },
  summaryLabel: { fontSize: 14, color: FUEL.muted },
  summaryVal: { fontSize: 14, fontFamily: FONT.bodyBold, color: DARK },

  // Loading
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: SPACE.xl },
  loadingCircle: { width: 100, height: 100, borderRadius: RADIUS.pill, backgroundColor: FUEL.limeTint, alignItems: 'center', justifyContent: 'center', marginBottom: SPACE.xl },
  loadingTitle: { fontSize: 22, fontFamily: FONT.bodyExtrabold, color: DARK },
  loadingDesc: { fontSize: 14, color: FUEL.muted, textAlign: 'center', marginTop: SPACE.s },
  loadingSteps: { marginTop: SPACE.xxl, gap: SPACE.l },
  loadingStep: { flexDirection: 'row', alignItems: 'center', gap: SPACE.m },
  loadingStepText: { fontSize: 14, color: FUEL.muted },

  // Result
  resultContent: { padding: SPACE.l },
  resultHero: { borderRadius: RADIUS.lg, padding: SPACE.xl, marginBottom: SPACE.l },
  resultHeroTitle: { fontSize: 22, fontFamily: FONT.bodyExtrabold, color: '#FFF', marginTop: SPACE.s },
  resultHeroSummary: { fontSize: 13, color: 'rgba(255,255,255,0.85)', marginTop: SPACE.s },
  nutritionCard: { backgroundColor: '#FFF', borderRadius: RADIUS.md, padding: SPACE.l, marginBottom: SPACE.l, borderWidth: 1, borderColor: FUEL.sandBorder },
  nutritionGrid: { flexDirection: 'row', justifyContent: 'space-around' },
  nutritionItem: { alignItems: 'center' },
  nutritionValue: { fontSize: 22, fontFamily: FONT.bodyExtrabold },
  nutritionLabel: { fontSize: 10, color: FUEL.muted, marginTop: SPACE.xs },
  itemsTitle: { fontSize: 16, fontFamily: FONT.bodyBold, color: DARK, marginBottom: SPACE.m },
  itemCard: { backgroundColor: '#FFF', borderRadius: RADIUS.md, padding: SPACE.l, marginBottom: SPACE.s, borderWidth: 1, borderColor: FUEL.sandBorder },
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: SPACE.m },
  itemImg: { width: 52, height: 52, borderRadius: RADIUS.sm, backgroundColor: FUEL.sand },
  imgPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  itemInfo: { flex: 1 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: SPACE.s },
  vegBox: { width: 12, height: 12, borderRadius: RADIUS.xs, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  vegDot: { width: 6, height: 6, borderRadius: RADIUS.xs },
  itemName: { fontSize: 14, fontFamily: FONT.bodyBold, color: DARK },
  itemReason: { fontSize: 11, color: PURPLE, marginTop: 3, fontStyle: 'italic' },
  itemMeta: { fontSize: 11, color: FUEL.muted, marginTop: 2 },
  itemRight: { alignItems: 'flex-end' },
  itemGrams: { fontSize: 16, fontFamily: FONT.bodyExtrabold, color: DARK },
  itemPrice: { fontSize: 12, color: FUEL.muted, marginTop: 2 },
  priceCard: { backgroundColor: '#FFF', borderRadius: RADIUS.md, padding: SPACE.l, marginTop: SPACE.xs, borderWidth: 1, borderColor: FUEL.sandBorder },
  priceRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: SPACE.s },
  priceLabel: { fontSize: 14, color: FUEL.muted },
  priceValue: { fontSize: 22, fontFamily: FONT.bodyExtrabold, color: DARK },
  priceBudget: { fontSize: 14, color: FUEL.muted },
  underBudget: { flexDirection: 'row', alignItems: 'center', gap: SPACE.s, backgroundColor: FUEL.limeTint, borderRadius: RADIUS.sm, padding: SPACE.m, marginTop: SPACE.s },
  underBudgetText: { fontSize: 14, fontFamily: FONT.bodyBold, color: GREEN },

  // Bottom
  bottomBar: { flexDirection: 'row', gap: SPACE.m, padding: SPACE.l, paddingBottom: SPACE.xxl, backgroundColor: '#FFF', borderTopWidth: 1, borderTopColor: FUEL.sandBorder },
  nextBtn: { flex: 1, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: SPACE.s, borderRadius: RADIUS.md, paddingVertical: SPACE.l },
  nextText: { fontSize: 16, fontFamily: FONT.bodyBold, color: '#FFF' },
  retryBtn: { width: 52, height: 52, borderRadius: RADIUS.md, backgroundColor: FUEL.sand, alignItems: 'center', justifyContent: 'center' },
  orderBtn: { flex: 1, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: SPACE.s, backgroundColor: PURPLE, borderRadius: RADIUS.md, paddingVertical: SPACE.l },
  orderText: { fontSize: 16, fontFamily: FONT.bodyBold, color: '#FFF' },
});
