import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Image,
  RefreshControl, FlatList, Dimensions, ActivityIndicator, Alert
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { apiCall, getStoredUser } from '../../utils/api';

const Z_RED = '#E23744';
const { width } = Dimensions.get('window');
const CATEGORIES = [
  { key: 'All', icon: 'grid', color: Z_RED },
  { key: 'Protein', icon: 'barbell', color: '#E23744' },
  { key: 'Carb', icon: 'leaf', color: '#FF9F0A' },
  { key: 'Fat', icon: 'water', color: '#5B5FE0' },
];

export default function HomeScreen() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [summary, setSummary] = useState<any>(null);
  const [products, setProducts] = useState<any[]>([]);
  const [banners, setBanners] = useState<any[]>([]);
  const [selectedCat, setSelectedCat] = useState('All');
  const [search, setSearch] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const bannerRef = useRef<FlatList>(null);
  const [bannerIdx, setBannerIdx] = useState(0);

  // AI Quick Meal Builder state
  const [showMealBuilder, setShowMealBuilder] = useState(false);
  const [dietPref, setDietPref] = useState('both');
  const [mealGoal, setMealGoal] = useState('');
  const [mealBudget, setMealBudget] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiMeal, setAiMeal] = useState<any>(null);

  const loadData = useCallback(async () => {
    try {
      const [u, s, p, b, pop] = await Promise.all([
        getStoredUser(), 
        apiCall('/user/nutrition-summary'), 
        apiCall('/products'), 
        apiCall('/banners'),
        apiCall('/products/popular').catch(() => []), // Popular items based on sales
      ]);
      setUser(u); setSummary(s); setProducts(pop.length > 0 ? pop : p); setBanners(b);
    } catch (e) {} finally { setLoading(false); }
  }, []);

  useEffect(() => { loadData(); }, []);
  useEffect(() => {
    if (banners.length <= 1) return;
    const timer = setInterval(() => {
      setBannerIdx(prev => {
        const next = (prev + 1) % banners.length;
        bannerRef.current?.scrollToIndex({ index: next, animated: true });
        return next;
      });
    }, 3000);
    return () => clearInterval(timer);
  }, [banners]);

  const onRefresh = async () => { setRefreshing(true); await loadData(); setRefreshing(false); };

  const filteredProducts = products.filter(p => {
    const catMatch = selectedCat === 'All' || p.category === selectedCat;
    const searchMatch = !search || p.name.toLowerCase().includes(search.toLowerCase());
    return catMatch && searchMatch && p.available_qty_grams > 0;
  });

  const consumed = summary?.consumed || {};
  const goals = summary?.goals || {};
  const calPct = goals.daily_calories ? Math.min((consumed.calories / goals.daily_calories) * 100, 100) : 0;

  // AI Quick Meal functions
  const buildMeal = async () => {
    if (!mealGoal) { Alert.alert('Select Goal', 'Choose a fitness goal first'); return; }
    setAiLoading(true); setAiMeal(null);
    try {
      const result = await apiCall('/ai/quick-meal', {
        method: 'POST',
        body: {
          diet_preference: dietPref,
          goal: mealGoal,
          budget: mealBudget ? parseFloat(mealBudget) : null,
          order_type: 'dine-in',
        },
      });
      setAiMeal(result);
    } catch (e: any) { Alert.alert('Error', e.message); }
    finally { setAiLoading(false); }
  };

  const orderAiMeal = () => {
    if (!aiMeal?.meal_items?.length) return;
    const cart = aiMeal.meal_items.map((item: any) => ({
      id: item.product_id,
      name: item.product_name,
      grams: item.grams,
      cost_per_100g: item.cost_per_100g,
      calories_per_100g: item.calories_per_100g,
      protein_per_100g: item.protein_per_100g,
      carbs_per_100g: item.carbs_per_100g,
      fat_per_100g: item.fat_per_100g,
      category: item.category,
      diet_type: item.diet_type,
      image_url: item.image_url,
    }));
    router.push({ pathname: '/customize', params: { cart: JSON.stringify(cart), orderType: 'dine-in' } });
  };

  const resetBuilder = () => { setAiMeal(null); setMealGoal(''); setMealBudget(''); setDietPref('both'); setShowMealBuilder(false); };

  if (loading) return <SafeAreaView style={styles.safe}><View style={styles.center}><ActivityIndicator size="large" color={Z_RED} /></View></SafeAreaView>;

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Z_RED} />}>
        <View style={styles.header}>
          <View>
            <View style={styles.locRow}>
              <Ionicons name="location" size={18} color={Z_RED} />
              <Text style={styles.locText}>Diet Cafe</Text>
              <Ionicons name="chevron-down" size={14} color={Z_RED} />
            </View>
            <Text style={styles.locSub}>Healthy meals, delivered fresh</Text>
          </View>
          <TouchableOpacity testID="profile-avatar-btn" style={styles.avatar} onPress={() => router.push('/(tabs)/profile')}>
            <Ionicons name="person" size={18} color={Z_RED} />
          </TouchableOpacity>
        </View>

        <View style={styles.searchBar}>
          <Ionicons name="search" size={18} color="#9C9C9C" />
          <TextInput testID="search-input" style={styles.searchInput} value={search} onChangeText={setSearch} placeholder="Search for healthy meals..." placeholderTextColor="#B0B0B0" />
        </View>

        {/* ===== AI QUICK MEAL BUILDER ===== */}
        {!showMealBuilder && !aiMeal && (
          <TouchableOpacity testID="open-meal-builder" style={styles.mealBuilderCTA} onPress={() => setShowMealBuilder(true)} activeOpacity={0.9}>
            <View style={styles.ctaLeft}>
              <View style={styles.ctaIconBg}>
                <Ionicons name="sparkles" size={20} color="#FFF" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.ctaTitle}>Build My Meal</Text>
                <Text style={styles.ctaSub}>AI picks the perfect meal for your goals</Text>
              </View>
            </View>
            <Ionicons name="arrow-forward-circle" size={28} color={Z_RED} />
          </TouchableOpacity>
        )}

        {showMealBuilder && !aiMeal && (
          <View style={styles.builderCard}>
            <View style={styles.builderHeader}>
              <View style={styles.builderTitleRow}>
                <Ionicons name="sparkles" size={18} color="#5B5FE0" />
                <Text style={styles.builderTitle}>AI Meal Builder</Text>
              </View>
              <TouchableOpacity testID="close-builder" onPress={resetBuilder}>
                <Ionicons name="close-circle" size={24} color="#D0D0D0" />
              </TouchableOpacity>
            </View>

            {/* Diet Preference */}
            <Text style={styles.builderLabel}>Diet Preference</Text>
            <View style={styles.dietRow}>
              {[
                { key: 'veg', label: 'Veg', color: '#267E3E' },
                { key: 'non-veg', label: 'Non-Veg', color: '#E23744' },
                { key: 'both', label: 'Both', color: '#FF9F0A' },
              ].map(d => (
                <TouchableOpacity
                  key={d.key} testID={`diet-${d.key}`}
                  style={[styles.dietChip, dietPref === d.key && { backgroundColor: d.color, borderColor: d.color }]}
                  onPress={() => setDietPref(d.key)}
                >
                  {d.key === 'veg' && <View style={[styles.vegIndicator, { borderColor: '#267E3E' }]}><View style={[styles.vegDotInner, { backgroundColor: '#267E3E' }]} /></View>}
                  {d.key === 'non-veg' && <View style={[styles.vegIndicator, { borderColor: '#E23744' }]}><View style={[styles.vegDotInner, { backgroundColor: '#E23744' }]} /></View>}
                  {d.key === 'both' && <Ionicons name="ellipse-outline" size={14} color={dietPref === d.key ? '#FFF' : '#FF9F0A'} />}
                  <Text style={[styles.dietText, dietPref === d.key && { color: '#FFF' }]}>{d.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Fitness Goal */}
            <Text style={styles.builderLabel}>Fitness Goal</Text>
            <View style={styles.goalRow}>
              {[
                { key: 'fat_loss', label: 'Fat Loss', icon: 'trending-down' as const, color: '#E23744' },
                { key: 'muscle_gain', label: 'Muscle Gain', icon: 'trending-up' as const, color: '#267E3E' },
                { key: 'maintenance', label: 'Maintain', icon: 'swap-horizontal' as const, color: '#5B5FE0' },
              ].map(g => (
                <TouchableOpacity
                  key={g.key} testID={`meal-goal-${g.key}`}
                  style={[styles.goalChip, mealGoal === g.key && { backgroundColor: g.color, borderColor: g.color }]}
                  onPress={() => setMealGoal(g.key)}
                >
                  <Ionicons name={g.icon} size={16} color={mealGoal === g.key ? '#FFF' : g.color} />
                  <Text style={[styles.goalText, mealGoal === g.key && { color: '#FFF' }]}>{g.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Budget */}
            <Text style={styles.builderLabel}>Budget (optional)</Text>
            <TextInput
              testID="meal-budget-input"
              style={styles.budgetInput}
              value={mealBudget}
              onChangeText={setMealBudget}
              placeholder="₹ Enter budget"
              placeholderTextColor="#B0B0B0"
              keyboardType="number-pad"
            />

            {/* Build Button */}
            <TouchableOpacity testID="build-meal-btn" style={styles.buildBtn} onPress={buildMeal} disabled={aiLoading} activeOpacity={0.85}>
              {aiLoading ? (
                <View style={styles.buildBtnContent}>
                  <ActivityIndicator color="#FFF" size="small" />
                  <Text style={styles.buildBtnText}>Building your meal...</Text>
                </View>
              ) : (
                <View style={styles.buildBtnContent}>
                  <Ionicons name="sparkles" size={18} color="#FFF" />
                  <Text style={styles.buildBtnText}>Build My Meal</Text>
                </View>
              )}
            </TouchableOpacity>
          </View>
        )}

        {/* AI Meal Result */}
        {aiMeal && aiMeal.meal_items?.length > 0 && (
          <View style={styles.mealResultCard}>
            <View style={styles.mealResultHeader}>
              <View style={styles.mealResultTitleRow}>
                <Ionicons name="sparkles" size={16} color="#5B5FE0" />
                <Text style={styles.mealResultTitle}>Your AI Meal</Text>
              </View>
              <TouchableOpacity testID="rebuild-meal" onPress={resetBuilder}>
                <View style={styles.rebuildBadge}><Ionicons name="refresh" size={14} color="#5B5FE0" /><Text style={styles.rebuildText}>New</Text></View>
              </TouchableOpacity>
            </View>
            <Text style={styles.mealSummary}>{aiMeal.summary}</Text>

            {/* Meal Items */}
            {aiMeal.meal_items.map((item: any, i: number) => (
              <View key={i} style={styles.mealItem}>
                <View style={styles.mealItemLeft}>
                  <View style={[styles.vegDot, { borderColor: item.diet_type === 'non-veg' ? '#E23744' : '#267E3E' }]}>
                    <View style={[styles.vegDotFill, { backgroundColor: item.diet_type === 'non-veg' ? '#E23744' : '#267E3E' }]} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.mealItemName}>{item.product_name}</Text>
                    <Text style={styles.mealItemReason}>{item.reason}</Text>
                  </View>
                </View>
                <View style={styles.mealItemRight}>
                  <Text style={styles.mealItemGrams}>{item.grams}g</Text>
                  <Text style={styles.mealItemPrice}>₹{Math.round(item.price)}</Text>
                </View>
              </View>
            ))}

            {/* Totals */}
            <View style={styles.mealTotals}>
              <View style={styles.totalRow}>
                <View style={styles.totalItem}>
                  <Text style={styles.totalLabel}>Calories</Text>
                  <Text style={[styles.totalValue, { color: Z_RED }]}>{Math.round(aiMeal.totals.calories)}</Text>
                </View>
                <View style={styles.totalItem}>
                  <Text style={styles.totalLabel}>Protein</Text>
                  <Text style={[styles.totalValue, { color: Z_RED }]}>{Math.round(aiMeal.totals.protein)}g</Text>
                </View>
                <View style={styles.totalItem}>
                  <Text style={styles.totalLabel}>Carbs</Text>
                  <Text style={[styles.totalValue, { color: '#FF9F0A' }]}>{Math.round(aiMeal.totals.carbs)}g</Text>
                </View>
                <View style={styles.totalItem}>
                  <Text style={styles.totalLabel}>Fat</Text>
                  <Text style={[styles.totalValue, { color: '#5B5FE0' }]}>{Math.round(aiMeal.totals.fat)}g</Text>
                </View>
              </View>
              <View style={styles.totalPriceRow}>
                <Text style={styles.totalPriceLabel}>Total</Text>
                <Text style={styles.totalPriceValue}>₹{Math.round(aiMeal.totals.price)}</Text>
              </View>
            </View>

            {/* Order Button */}
            <TouchableOpacity testID="order-ai-meal-btn" style={styles.orderMealBtn} onPress={orderAiMeal} activeOpacity={0.85}>
              <Ionicons name="cart" size={18} color="#FFF" />
              <Text style={styles.orderMealText}>Order This Meal</Text>
            </TouchableOpacity>
          </View>
        )}

        {aiMeal && (!aiMeal.meal_items || aiMeal.meal_items.length === 0) && (
          <View style={styles.mealResultCard}>
            <View style={styles.mealErrorRow}>
              <Ionicons name="alert-circle" size={24} color="#FF9F0A" />
              <Text style={styles.mealErrorText}>{aiMeal.summary || 'Could not build meal. Try again.'}</Text>
            </View>
            <TouchableOpacity style={styles.retryBtn} onPress={resetBuilder}><Text style={styles.retryText}>Try Again</Text></TouchableOpacity>
          </View>
        )}

        {banners.length > 0 && (
          <FlatList
            ref={bannerRef}
            horizontal showsHorizontalScrollIndicator={false} pagingEnabled
            data={banners} keyExtractor={item => item.id}
            style={styles.bannerList}
            onScrollToIndexFailed={() => {}}
            renderItem={({ item }) => (
              <View style={[styles.banner, { backgroundColor: item.color }]} testID={`banner-${item.id}`}>
                <View>
                  <Text style={styles.bannerTitle}>{item.title}</Text>
                  <Text style={styles.bannerSub}>{item.subtitle}</Text>
                </View>
                <Ionicons name="arrow-forward-circle" size={32} color="rgba(255,255,255,0.6)" />
              </View>
            )}
          />
        )}
        <View style={styles.dots}>
          {banners.map((_, i) => (
            <View key={i} style={[styles.dot, i === bannerIdx && styles.dotActive]} />
          ))}
        </View>

        <View style={styles.nutriCard} testID="nutrition-summary-card">
          <View style={styles.nutriHeader}>
            <Ionicons name="fitness" size={18} color={Z_RED} />
            <Text style={styles.nutriTitle}>Today's Nutrition</Text>
            <Text style={styles.nutriMeals}>{summary?.meals_count || 0} meals</Text>
          </View>
          <View style={styles.nutriRow}>
            <View style={styles.nutriMain}>
              <Text style={styles.calValue}>{Math.round(consumed.calories || 0)}</Text>
              <Text style={styles.calUnit}>/ {goals.daily_calories || 2000} kcal</Text>
            </View>
            <View style={styles.macroRow}>
              {[
                { label: 'Protein', val: consumed.protein, goal: goals.daily_protein, color: Z_RED },
                { label: 'Carbs', val: consumed.carbs, goal: goals.daily_carbs, color: '#FF9F0A' },
                { label: 'Fat', val: consumed.fat, goal: goals.daily_fat, color: '#5B5FE0' },
              ].map(m => (
                <View key={m.label} style={styles.macroItem}>
                  <Text style={[styles.macroVal, { color: m.color }]}>{Math.round(m.val || 0)}g</Text>
                  <Text style={styles.macroLabel}>{m.label}</Text>
                </View>
              ))}
            </View>
          </View>
          <View style={styles.progressBg}>
            <View style={[styles.progressFill, { width: `${calPct}%` }]} />
          </View>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.catScroll} contentContainerStyle={styles.catContent}>
          {CATEGORIES.map(c => (
            <TouchableOpacity
              key={c.key} testID={`cat-${c.key}`}
              style={[styles.catPill, selectedCat === c.key && { backgroundColor: Z_RED, borderColor: Z_RED }]}
              onPress={() => setSelectedCat(c.key)}
            >
              <Ionicons name={c.icon as any} size={16} color={selectedCat === c.key ? '#FFF' : '#696969'} />
              <Text style={[styles.catText, selectedCat === c.key && { color: '#FFF' }]}>{c.key}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <Text style={styles.sectionTitle}>Popular Items</Text>
        <View style={styles.productsGrid}>
          {filteredProducts.slice(0, 8).map(item => (
            <TouchableOpacity
              key={item.id} testID={`popular-${item.id}`} style={styles.prodCard}
              onPress={() => router.push('/(tabs)/menu')} activeOpacity={0.9}
            >
              {item.image_url ? (
                <Image source={{ uri: item.image_url }} style={styles.prodImg} />
              ) : (
                <View style={[styles.prodImg, styles.prodImgPlaceholder]}>
                  <Ionicons name="restaurant" size={28} color="#D0D0D0" />
                </View>
              )}
              <View style={styles.ratingBadge}>
                <Ionicons name="star" size={10} color="#FFF" />
                <Text style={styles.ratingText}>{item.rating || '4.2'}</Text>
              </View>
              {/* Veg/Non-Veg indicator */}
              <View style={[styles.prodVegBadge, { borderColor: item.diet_type === 'non-veg' ? '#E23744' : '#267E3E' }]}>
                <View style={[styles.prodVegDot, { backgroundColor: item.diet_type === 'non-veg' ? '#E23744' : '#267E3E' }]} />
              </View>
              <View style={styles.prodInfo}>
                <Text style={styles.prodName} numberOfLines={1}>{item.name}</Text>
                <Text style={styles.prodDesc} numberOfLines={1}>{item.description || item.category}</Text>
                <View style={styles.prodBottom}>
                  <Text style={styles.prodPrice}>₹{item.cost_per_100g}<Text style={styles.per100}>/100g</Text></Text>
                  <Text style={styles.prodCal}>{item.calories_per_100g} cal</Text>
                </View>
              </View>
            </TouchableOpacity>
          ))}
        </View>
        <View style={{ height: 24 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F8F8F8' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8, backgroundColor: '#FFF' },
  locRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  locText: { fontSize: 18, fontWeight: '700', color: '#1C1C2E' },
  locSub: { fontSize: 12, color: '#9C9C9C', marginTop: 2, marginLeft: 22 },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#FDE8EA', alignItems: 'center', justifyContent: 'center' },
  searchBar: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#F0F0F5', marginHorizontal: 16, marginTop: 10, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10 },
  searchInput: { flex: 1, fontSize: 14, color: '#1C1C2E' },

  // AI Meal Builder CTA
  mealBuilderCTA: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#FFF', marginHorizontal: 16, marginTop: 14, borderRadius: 14, padding: 16, borderWidth: 1.5, borderColor: '#5B5FE0', borderStyle: 'dashed' },
  ctaLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  ctaIconBg: { width: 40, height: 40, borderRadius: 12, backgroundColor: '#5B5FE0', alignItems: 'center', justifyContent: 'center' },
  ctaTitle: { fontSize: 16, fontWeight: '800', color: '#1C1C2E' },
  ctaSub: { fontSize: 12, color: '#9C9C9C', marginTop: 2 },

  // Builder Card
  builderCard: { backgroundColor: '#FFF', marginHorizontal: 16, marginTop: 14, borderRadius: 16, padding: 18, borderWidth: 1, borderColor: '#5B5FE0' },
  builderHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  builderTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  builderTitle: { fontSize: 17, fontWeight: '800', color: '#1C1C2E' },
  builderLabel: { fontSize: 13, fontWeight: '700', color: '#696969', marginBottom: 8, marginTop: 4 },

  // Diet preference
  dietRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  dietChip: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 11, borderRadius: 10, backgroundColor: '#FFF', borderWidth: 1.5, borderColor: '#E8E8E8' },
  dietText: { fontSize: 13, fontWeight: '700', color: '#696969' },
  vegIndicator: { width: 14, height: 14, borderRadius: 2, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  vegDotInner: { width: 7, height: 7, borderRadius: 4 },

  // Goal
  goalRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  goalChip: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 11, borderRadius: 10, backgroundColor: '#FFF', borderWidth: 1.5, borderColor: '#E8E8E8' },
  goalText: { fontSize: 11, fontWeight: '700', color: '#696969' },

  // Budget
  budgetInput: { backgroundColor: '#F5F5F5', borderRadius: 10, padding: 12, color: '#1C1C2E', fontSize: 15, fontWeight: '600', borderWidth: 1, borderColor: '#E8E8E8', marginBottom: 14 },

  // Build button
  buildBtn: { backgroundColor: '#5B5FE0', borderRadius: 12, paddingVertical: 15, alignItems: 'center', justifyContent: 'center' },
  buildBtnContent: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  buildBtnText: { color: '#FFF', fontSize: 15, fontWeight: '800' },

  // Meal Result
  mealResultCard: { backgroundColor: '#FFF', marginHorizontal: 16, marginTop: 14, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: '#EFEFEF' },
  mealResultHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  mealResultTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  mealResultTitle: { fontSize: 16, fontWeight: '800', color: '#1C1C2E' },
  rebuildBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#F0F0FF', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 },
  rebuildText: { fontSize: 12, fontWeight: '700', color: '#5B5FE0' },
  mealSummary: { color: '#696969', fontSize: 13, lineHeight: 18, marginBottom: 12 },

  // Meal items
  mealItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#F5F5F5' },
  mealItemLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  vegDot: { width: 16, height: 16, borderRadius: 2, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  vegDotFill: { width: 8, height: 8, borderRadius: 4 },
  mealItemName: { fontSize: 14, fontWeight: '700', color: '#1C1C2E' },
  mealItemReason: { fontSize: 11, color: '#9C9C9C', marginTop: 2 },
  mealItemRight: { alignItems: 'flex-end' },
  mealItemGrams: { fontSize: 14, fontWeight: '800', color: Z_RED },
  mealItemPrice: { fontSize: 12, color: '#9C9C9C', marginTop: 1 },

  // Totals
  mealTotals: { backgroundColor: '#FAFAFA', borderRadius: 10, padding: 12, marginTop: 12 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-around', marginBottom: 10 },
  totalItem: { alignItems: 'center' },
  totalLabel: { fontSize: 10, color: '#9C9C9C', marginBottom: 2 },
  totalValue: { fontSize: 16, fontWeight: '800' },
  totalPriceRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: 1, borderTopColor: '#EFEFEF', paddingTop: 8 },
  totalPriceLabel: { fontSize: 14, fontWeight: '600', color: '#696969' },
  totalPriceValue: { fontSize: 22, fontWeight: '800', color: '#1C1C2E' },

  // Order meal button
  orderMealBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: Z_RED, borderRadius: 12, paddingVertical: 14, marginTop: 14 },
  orderMealText: { color: '#FFF', fontSize: 15, fontWeight: '800' },

  // Error / retry
  mealErrorRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  mealErrorText: { flex: 1, color: '#696969', fontSize: 13, lineHeight: 18 },
  retryBtn: { backgroundColor: '#5B5FE0', borderRadius: 10, paddingVertical: 12, alignItems: 'center', marginTop: 12 },
  retryText: { color: '#FFF', fontSize: 14, fontWeight: '700' },

  // Existing styles
  bannerList: { marginTop: 14 },
  banner: { width: width - 32, marginHorizontal: 16, borderRadius: 14, padding: 20, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  bannerTitle: { fontSize: 20, fontWeight: '800', color: '#FFF' },
  bannerSub: { fontSize: 13, color: 'rgba(255,255,255,0.8)', marginTop: 4 },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: 10 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#D0D0D0' },
  dotActive: { backgroundColor: Z_RED, width: 18 },
  nutriCard: { backgroundColor: '#FFF', marginHorizontal: 16, marginTop: 14, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: '#EFEFEF' },
  nutriHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 },
  nutriTitle: { flex: 1, fontSize: 14, fontWeight: '700', color: '#1C1C2E' },
  nutriMeals: { fontSize: 12, color: '#9C9C9C' },
  nutriRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  nutriMain: { flexDirection: 'row', alignItems: 'baseline', gap: 4 },
  calValue: { fontSize: 32, fontWeight: '800', color: '#1C1C2E' },
  calUnit: { fontSize: 13, color: '#9C9C9C' },
  macroRow: { flexDirection: 'row', gap: 16 },
  macroItem: { alignItems: 'center' },
  macroVal: { fontSize: 16, fontWeight: '700' },
  macroLabel: { fontSize: 10, color: '#9C9C9C', marginTop: 1 },
  progressBg: { height: 4, backgroundColor: '#F0F0F5', borderRadius: 2, marginTop: 12, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: Z_RED, borderRadius: 2 },
  catScroll: { marginTop: 14 },
  catContent: { paddingHorizontal: 16, gap: 8 },
  catPill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20, backgroundColor: '#FFF', borderWidth: 1, borderColor: '#E8E8E8' },
  catText: { fontSize: 13, fontWeight: '600', color: '#696969' },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: '#1C1C2E', paddingHorizontal: 16, marginTop: 18, marginBottom: 12 },
  productsGrid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 12, gap: 8 },
  prodCard: { width: (width - 40) / 2, backgroundColor: '#FFF', borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: '#EFEFEF' },
  prodImg: { width: '100%', height: 120, backgroundColor: '#F5F5F5' },
  prodImgPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  ratingBadge: { position: 'absolute', top: 100, left: 8, flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: '#267E3E', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  ratingText: { fontSize: 10, fontWeight: '700', color: '#FFF' },
  prodVegBadge: { position: 'absolute', top: 8, right: 8, width: 16, height: 16, borderRadius: 2, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFF' },
  prodVegDot: { width: 8, height: 8, borderRadius: 4 },
  prodInfo: { padding: 10 },
  prodName: { fontSize: 14, fontWeight: '700', color: '#1C1C2E' },
  prodDesc: { fontSize: 11, color: '#9C9C9C', marginTop: 2 },
  prodBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 },
  prodPrice: { fontSize: 14, fontWeight: '700', color: '#1C1C2E' },
  per100: { fontSize: 10, fontWeight: '400', color: '#9C9C9C' },
  prodCal: { fontSize: 11, color: Z_RED, fontWeight: '600' },
});
