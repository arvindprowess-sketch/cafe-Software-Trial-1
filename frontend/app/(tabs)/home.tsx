import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Image,
  RefreshControl, FlatList, Dimensions, ActivityIndicator, Alert
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { apiCall, getStoredUser } from '../../utils/api';
import SideDrawer from '../components/SideDrawer';

// BK Design System Colors
const BK_RED = '#D62300';
const BK_ORANGE = '#FF8732';
const BK_BROWN = '#502314';
const BK_CREAM = '#F5EBDC';
const BK_GREEN = '#509E2F';
const BK_WHITE = '#FFFFFF';
const BK_TEXT_LIGHT = '#8B6F61';
const Z_RED = BK_RED;
const GREEN = BK_GREEN;
const { width } = Dimensions.get('window');

// Category grid for BK-style menu
const MENU_CATEGORIES = [
  { key: 'Protein', label: 'High Protein', icon: 'barbell', color: BK_RED, image: 'https://images.unsplash.com/photo-1632778149955-e80f8ceca2e8?w=100&h=100&fit=crop' },
  { key: 'Carb', label: 'Healthy Carbs', icon: 'leaf', color: '#FF9F0A', image: 'https://images.unsplash.com/photo-1536304929831-ee1ca9d44726?w=100&h=100&fit=crop' },
  { key: 'Fat', label: 'Good Fats', icon: 'water', color: BK_ORANGE, image: 'https://images.unsplash.com/photo-1523049673857-eb18f1d7b578?w=100&h=100&fit=crop' },
  { key: 'Meal', label: 'Ready Meals', icon: 'restaurant', color: '#267E3E', image: 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=100&h=100&fit=crop' },
  { key: 'veg', label: 'Veg Only', icon: 'nutrition', color: '#4CAF50', image: 'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=100&h=100&fit=crop' },
  { key: 'non-veg', label: 'Non-Veg', icon: 'flame', color: BK_RED, image: 'https://images.unsplash.com/photo-1467003909585-2f8a72700288?w=100&h=100&fit=crop' },
  { key: 'budget', label: 'Budget Meals', icon: 'wallet', color: '#FF6B35', image: 'https://images.unsplash.com/photo-1490818387583-1baba5e638af?w=100&h=100&fit=crop' },
  { key: 'ai', label: 'AI Picks', icon: 'sparkles', color: BK_ORANGE, image: null },
];

export default function HomeScreen() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [summary, setSummary] = useState<any>(null);
  const [products, setProducts] = useState<any[]>([]);
  const [banners, setBanners] = useState<any[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const bannerRef = useRef<FlatList>(null);
  const [bannerIdx, setBannerIdx] = useState(0);
  
  // Side drawer state
  const [drawerVisible, setDrawerVisible] = useState(false);
  
  // Order type toggle
  const [orderType, setOrderType] = useState<'delivery' | 'dine-in'>('dine-in');

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
        apiCall('/user/nutrition-summary').catch(() => null), 
        apiCall('/products'), 
        apiCall('/banners'),
        apiCall('/products/popular').catch(() => []),
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

  const consumed = summary?.consumed || {};
  const goals = summary?.goals || {};
  const calPct = goals.daily_calories ? (consumed.calories / goals.daily_calories) * 100 : 0;
  const isCalorieOver = calPct > 100;
  const caloriesOverAmount = Math.round((consumed.calories || 0) - (goals.daily_calories || 2000));

  // Memoize popular products to prevent re-computation
  const popularProducts = useMemo(() => products.slice(0, 10), [products]);

  // AI Quick Meal functions
  const buildMeal = async () => {
    if (!mealGoal) { Alert.alert('Select Goal', 'Choose a fitness goal first'); return; }
    setAiLoading(true); setAiMeal(null);
    try {
      const result = await apiCall('/ai/quick-meal', {
        method: 'POST',
        body: { diet_preference: dietPref, goal: mealGoal, budget: mealBudget ? parseFloat(mealBudget) : null, order_type: orderType },
      });
      setAiMeal(result);
    } catch (e: any) { Alert.alert('Error', e.message); }
    finally { setAiLoading(false); }
  };

  const orderAiMeal = () => {
    if (!aiMeal?.meal_items?.length) return;
    const cart = aiMeal.meal_items.map((item: any) => ({
      id: item.product_id, name: item.product_name, grams: item.grams,
      cost_per_100g: item.cost_per_100g, calories_per_100g: item.calories_per_100g,
      protein_per_100g: item.protein_per_100g, carbs_per_100g: item.carbs_per_100g,
      fat_per_100g: item.fat_per_100g, category: item.category,
      diet_type: item.diet_type, image_url: item.image_url,
    }));
    router.push({ pathname: '/customize', params: { cart: JSON.stringify(cart), orderType } });
  };

  const resetBuilder = () => { setAiMeal(null); setMealGoal(''); setMealBudget(''); setDietPref('both'); setShowMealBuilder(false); };

  const handleCategoryPress = (cat: any) => {
    if (cat.key === 'ai') {
      setShowMealBuilder(true);
    } else if (cat.key === 'budget') {
      router.push('/(tabs)/budget-meal');
    } else if (cat.key === 'veg' || cat.key === 'non-veg') {
      router.push({ pathname: '/(tabs)/menu', params: { dietFilter: cat.key } });
    } else {
      router.push({ pathname: '/(tabs)/menu', params: { category: cat.key } });
    }
  };

  if (loading) return <SafeAreaView style={styles.safe}><View style={styles.center}><ActivityIndicator size="large" color={Z_RED} /></View></SafeAreaView>;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Side Drawer */}
      <SideDrawer visible={drawerVisible} onClose={() => setDrawerVisible(false)} user={user} />
      
      <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Z_RED} />} showsVerticalScrollIndicator={false}>
        {/* ===== HEADER WITH HAMBURGER & ORDER TYPE TOGGLE ===== */}
        <View style={styles.header}>
          <TouchableOpacity testID="menu-drawer-btn" style={styles.menuBtn} onPress={() => setDrawerVisible(true)}>
            <Ionicons name="menu" size={24} color="#F5EBDC" />
          </TouchableOpacity>
          
          {/* Delivery / Dine-in Toggle */}
          <View style={styles.orderToggle}>
            <TouchableOpacity 
              testID="order-delivery-toggle"
              style={[styles.toggleBtn, orderType === 'delivery' && styles.toggleBtnActive]}
              onPress={() => setOrderType('delivery')}
            >
              <Text style={[styles.toggleText, orderType === 'delivery' && styles.toggleTextActive]}>DELIVERY</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              testID="order-dinein-toggle"
              style={[styles.toggleBtn, orderType === 'dine-in' && styles.toggleBtnActive]}
              onPress={() => setOrderType('dine-in')}
            >
              <Text style={[styles.toggleText, orderType === 'dine-in' && styles.toggleTextActive]}>DINE-IN</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Location Bar */}
        {orderType === 'dine-in' && (
          <TouchableOpacity style={styles.locationBar} onPress={() => router.push('/scan-table')}>
            <Ionicons name="restaurant" size={18} color={Z_RED} />
            <Text style={styles.locationText}>DINE-IN AT:</Text>
            <View style={styles.locationValue}>
              <Text style={styles.locationName}>Diet Cafe • Scan Table</Text>
              <Ionicons name="chevron-down" size={16} color="#9C9C9C" />
            </View>
          </TouchableOpacity>
        )}
        
        {orderType === 'delivery' && (
          <View style={styles.locationBar}>
            <Ionicons name="bicycle" size={18} color={Z_RED} />
            <Text style={styles.locationText}>DELIVER TO:</Text>
            <View style={styles.locationValue}>
              <Text style={styles.locationName}>Select Address</Text>
              <Ionicons name="chevron-down" size={16} color="#9C9C9C" />
            </View>
          </View>
        )}

        {/* ===== PROMOTIONAL BANNERS (ENHANCED) ===== */}
        {banners.length > 0 && (
          <FlatList
            ref={bannerRef}
            horizontal showsHorizontalScrollIndicator={false} pagingEnabled
            data={banners} keyExtractor={item => item.id}
            style={styles.bannerList}
            onScrollToIndexFailed={() => {}}
            removeClippedSubviews={true}
            maxToRenderPerBatch={3}
            windowSize={5}
            renderItem={({ item }) => (
              <TouchableOpacity
                activeOpacity={0.85}
                testID={`banner-${item.id}`}
                onPress={() => {
                  if (item.type === 'offer' && item.offer_id) {
                    router.push({ pathname: '/offer-detail', params: { offerId: item.offer_id } });
                  } else if (item.type === 'pack' && item.pack_id) {
                    router.push({ pathname: '/pack-detail', params: { packId: item.pack_id } });
                  }
                }}
              >
                <View style={[styles.banner, { backgroundColor: item.color }]}>
                  <View style={styles.bannerContent}>
                    <Text style={styles.bannerTitle}>{item.title}</Text>
                    <Text style={styles.bannerSub}>{item.subtitle}</Text>
                    {item.type === 'offer' && (
                      <View style={styles.bannerDiscountCircle}>
                        <Text style={styles.bannerDiscountPercent}>
                          {item.discount_type === 'percentage' ? `${item.discount_value}%` : `₹${item.discount_value}`}
                        </Text>
                        <Text style={styles.bannerDiscountLabel}>OFF</Text>
                      </View>
                    )}
                    {item.type === 'pack' && (
                      <View style={[styles.bannerBadge, { backgroundColor: 'rgba(255,255,255,0.25)' }]}>
                        <Ionicons name="nutrition" size={12} color="#FFF" />
                        <Text style={styles.bannerBadgeText}>View Pack</Text>
                      </View>
                    )}
                  </View>
                  <View style={styles.bannerImagePlaceholder}>
                    <Ionicons name={item.type === 'pack' ? 'fitness' : item.type === 'offer' ? 'pricetag' : 'fast-food'} size={60} color="rgba(255,255,255,0.4)" />
                  </View>
                </View>
              </TouchableOpacity>
            )}
          />
        )}
        <View style={styles.dots}>
          {banners.map((_, i) => (
            <View key={i} style={[styles.dot, i === bannerIdx && styles.dotActive]} />
          ))}
        </View>

        {/* ===== CATEGORY GRID (ENHANCED) ===== */}
        <Text style={styles.sectionTitle}>Our Menu</Text>
        <View style={styles.categoryGrid}>
          {MENU_CATEGORIES.map((cat) => (
            <TouchableOpacity
              key={cat.key}
              testID={`cat-grid-${cat.key}`}
              style={styles.categoryCard}
              onPress={() => handleCategoryPress(cat)}
              activeOpacity={0.8}
            >
              {cat.image ? (
                <Image source={{ uri: cat.image }} style={styles.categoryImage} />
              ) : (
                <View style={[styles.categoryImage, styles.categoryIconBg, { backgroundColor: cat.color }]}>
                  <Ionicons name={cat.icon as any} size={32} color="#FFF" />
                </View>
              )}
              <Text style={styles.categoryLabel} numberOfLines={2}>{cat.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* ===== TODAY'S NUTRITION CARD (CLICKABLE) ===== */}
        <TouchableOpacity 
          style={styles.nutriCard} 
          testID="nutrition-summary-card"
          onPress={() => router.push('/nutrition-detail')}
          activeOpacity={0.8}
        >
          <View style={styles.nutriHeader}>
            <Ionicons name="fitness" size={18} color={isCalorieOver ? '#FF6B6B' : Z_RED} />
            <Text style={styles.nutriTitle}>Today's Nutrition</Text>
            <Text style={styles.nutriMeals}>{summary?.meals_count || 0} meals</Text>
            <Ionicons name="chevron-forward" size={18} color={BK_TEXT_LIGHT} style={{ marginLeft: 'auto' }} />
          </View>
          <View style={styles.nutriRow}>
            <View style={styles.nutriMain}>
              <Text style={[styles.calValue, isCalorieOver && { color: BK_RED }]}>{Math.round(consumed.calories || 0)}</Text>
              <Text style={styles.calUnit}>/ {goals.daily_calories || 2000} kcal</Text>
            </View>
            <View style={styles.macroRow}>
              {[
                { label: 'Protein', val: consumed.protein, goal: goals.daily_protein, color: Z_RED },
                { label: 'Carbs', val: consumed.carbs, goal: goals.daily_carbs, color: '#FF9F0A' },
                { label: 'Fat', val: consumed.fat, goal: goals.daily_fat, color: BK_ORANGE },
              ].map(m => (
                <View key={m.label} style={styles.macroItem}>
                  <Text style={[styles.macroVal, { color: m.color }]}>{Math.round(m.val || 0)}g</Text>
                  <Text style={styles.macroLabel}>{m.label}</Text>
                </View>
              ))}
            </View>
          </View>
          <View style={styles.progressBg}>
            <View style={[styles.progressFill, { width: `${Math.min(calPct, 100)}%` }, isCalorieOver && styles.progressFillOver]} />
          </View>
          {isCalorieOver && (
            <View style={styles.overGoalBanner} testID="calorie-over-banner">
              <Ionicons name="information-circle" size={14} color={BK_RED} />
              <Text style={styles.overGoalText}>
                {caloriesOverAmount} cal over your daily goal — you're in control!
              </Text>
            </View>
          )}
        </TouchableOpacity>

        {/* ===== SCAN TABLE QR (For dine-in) ===== */}
        {orderType === 'dine-in' && (
          <TouchableOpacity style={styles.scanTableCTA} onPress={() => router.push('/scan-table')} activeOpacity={0.9}>
            <View style={styles.scanCtaLeft}>
              <View style={styles.scanCtaIconBg}>
                <Ionicons name="qr-code" size={20} color="#FFF" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.scanCtaTitle}>Scan Table QR</Text>
                <Text style={styles.scanCtaSub}>Order from your seat</Text>
              </View>
            </View>
            <Ionicons name="scan" size={24} color={GREEN} />
          </TouchableOpacity>
        )}

        {/* ===== AI QUICK MEAL BUILDER ===== */}
        {!showMealBuilder && !aiMeal && (
          <TouchableOpacity testID="open-meal-builder" style={styles.mealBuilderCTA} onPress={() => router.push('/combo-builder')} activeOpacity={0.9}>
            <View style={styles.ctaLeft}>
              <View style={styles.ctaIconBg}>
                <Ionicons name="sparkles" size={20} color="#FFF" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.ctaTitle}>AI Combo Builder</Text>
                <Text style={styles.ctaSub}>Budget + Goal = Perfect meal in seconds</Text>
              </View>
            </View>
            <Ionicons name="arrow-forward-circle" size={28} color={BK_ORANGE} />
          </TouchableOpacity>
        )}

        {/* ===== SCHEDULE FOR LATER ===== */}
        <TouchableOpacity testID="schedule-for-later" style={styles.scheduleCTA} onPress={() => router.push('/(tabs)/menu')} activeOpacity={0.9}>
          <View style={styles.ctaLeft}>
            <View style={[styles.ctaIconBg, { backgroundColor: BK_GREEN }]}>
              <Ionicons name="time" size={20} color="#FFF" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.ctaTitle}>Schedule for Later</Text>
              <Text style={styles.ctaSub}>Pre-order your meals in advance</Text>
            </View>
          </View>
          <Ionicons name="calendar" size={28} color={BK_GREEN} />
        </TouchableOpacity>

        {showMealBuilder && !aiMeal && (
          <View style={styles.builderCard}>
            <View style={styles.builderHeader}>
              <View style={styles.builderTitleRow}>
                <Ionicons name="sparkles" size={18} color={BK_ORANGE} />
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
                { key: 'veg', label: 'Veg', color: GREEN },
                { key: 'non-veg', label: 'Non-Veg', color: Z_RED },
                { key: 'both', label: 'Both', color: '#FF9F0A' },
              ].map(d => (
                <TouchableOpacity
                  key={d.key} testID={`diet-${d.key}`}
                  style={[styles.dietChip, dietPref === d.key && { backgroundColor: d.color, borderColor: d.color }]}
                  onPress={() => setDietPref(d.key)}
                >
                  {d.key === 'veg' && <View style={[styles.vegIndicator, { borderColor: GREEN }]}><View style={[styles.vegDotInner, { backgroundColor: GREEN }]} /></View>}
                  {d.key === 'non-veg' && <View style={[styles.vegIndicator, { borderColor: Z_RED }]}><View style={[styles.vegDotInner, { backgroundColor: Z_RED }]} /></View>}
                  {d.key === 'both' && <Ionicons name="ellipse-outline" size={14} color={dietPref === d.key ? '#FFF' : '#FF9F0A'} />}
                  <Text style={[styles.dietText, dietPref === d.key && { color: '#FFF' }]}>{d.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Fitness Goal */}
            <Text style={styles.builderLabel}>Fitness Goal</Text>
            <View style={styles.goalRow}>
              {[
                { key: 'fat_loss', label: 'Fat Loss', icon: 'trending-down' as const, color: Z_RED },
                { key: 'muscle_gain', label: 'Muscle Gain', icon: 'trending-up' as const, color: GREEN },
                { key: 'maintenance', label: 'Maintain', icon: 'swap-horizontal' as const, color: BK_ORANGE },
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
                <Ionicons name="sparkles" size={16} color={BK_ORANGE} />
                <Text style={styles.mealResultTitle}>Your AI Meal</Text>
              </View>
              <TouchableOpacity testID="rebuild-meal" onPress={resetBuilder}>
                <View style={styles.rebuildBadge}><Ionicons name="refresh" size={14} color={BK_ORANGE} /><Text style={styles.rebuildText}>New</Text></View>
              </TouchableOpacity>
            </View>
            <Text style={styles.mealSummary}>{aiMeal.summary}</Text>

            {aiMeal.meal_items.map((item: any, i: number) => (
              <View key={i} style={styles.mealItem}>
                <View style={styles.mealItemLeft}>
                  <View style={[styles.vegDot, { borderColor: item.diet_type === 'non-veg' ? Z_RED : GREEN }]}>
                    <View style={[styles.vegDotFill, { backgroundColor: item.diet_type === 'non-veg' ? Z_RED : GREEN }]} />
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

            <View style={styles.mealTotals}>
              <View style={styles.totalRow}>
                {[
                  { label: 'Calories', val: aiMeal.totals.calories, color: Z_RED },
                  { label: 'Protein', val: `${Math.round(aiMeal.totals.protein)}g`, color: Z_RED },
                  { label: 'Carbs', val: `${Math.round(aiMeal.totals.carbs)}g`, color: '#FF9F0A' },
                  { label: 'Fat', val: `${Math.round(aiMeal.totals.fat)}g`, color: BK_ORANGE },
                ].map(t => (
                  <View key={t.label} style={styles.totalItem}>
                    <Text style={styles.totalLabel}>{t.label}</Text>
                    <Text style={[styles.totalValue, { color: t.color }]}>{typeof t.val === 'number' ? Math.round(t.val) : t.val}</Text>
                  </View>
                ))}
              </View>
              <View style={styles.totalPriceRow}>
                <Text style={styles.totalPriceLabel}>Total</Text>
                <Text style={styles.totalPriceValue}>₹{Math.round(aiMeal.totals.price)}</Text>
              </View>
            </View>

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

        {/* ===== POPULAR ITEMS (ENHANCED) ===== */}
        <Text style={styles.sectionTitle}>Popular Items</Text>
        <ScrollView 
          horizontal 
          showsHorizontalScrollIndicator={false} 
          contentContainerStyle={styles.popularScroll}
          removeClippedSubviews={true}
          maxToRenderPerBatch={5}
        >
          {popularProducts.map((item, idx) => {
            const isHighProtein = item.protein_per_100g >= 20;
            const isUnderBudget = item.cost_per_100g <= 50;
            const isPopular = idx < 3;
            
            return (
              <TouchableOpacity
                key={item.id} testID={`popular-${item.id}`} style={styles.popularCard}
                onPress={() => router.push('/(tabs)/menu')} activeOpacity={0.9}
              >
                {item.image_url ? (
                  <Image 
                    source={{ uri: item.image_url }} 
                    style={styles.popularImg}
                    resizeMode="cover"
                    defaultSource={require('../../assets/images/icon.png')}
                  />
                ) : (
                  <View style={[styles.popularImg, styles.popularImgPlaceholder]}>
                    <Ionicons name="restaurant" size={32} color="#D0D0D0" />
                  </View>
                )}
                
                {/* Smart Badges */}
                {isPopular && (
                  <View style={styles.popularBadge}>
                    <Ionicons name="flame" size={10} color="#FFF" />
                    <Text style={styles.popularBadgeText}>POPULAR</Text>
                  </View>
                )}
                {isHighProtein && !isPopular && (
                  <View style={[styles.popularBadge, { backgroundColor: BK_BROWN }]}>
                    <Ionicons name="barbell" size={10} color="#FFF" />
                    <Text style={styles.popularBadgeText}>HIGH PROTEIN</Text>
                  </View>
                )}
                {isUnderBudget && !isPopular && !isHighProtein && (
                  <View style={[styles.popularBadge, { backgroundColor: BK_GREEN }]}>
                    <Ionicons name="wallet" size={10} color="#FFF" />
                    <Text style={styles.popularBadgeText}>BUDGET</Text>
                  </View>
                )}
                
                {/* Protein Badge */}
                <View style={styles.proteinBadge}>
                  <Text style={styles.proteinText}>{item.protein_per_100g}g</Text>
                  <Text style={styles.proteinLabel}>Protein</Text>
                </View>
                
                {/* Veg/Non-Veg indicator */}
                <View style={[styles.vegBadge, { borderColor: item.diet_type === 'non-veg' ? Z_RED : GREEN }]}>
                  <View style={[styles.vegBadgeDot, { backgroundColor: item.diet_type === 'non-veg' ? Z_RED : GREEN }]} />
                </View>
                
                <View style={styles.popularInfo}>
                  <Text style={styles.popularName} numberOfLines={1}>{item.name}</Text>
                  <Text style={styles.popularDesc} numberOfLines={1}>{item.description || item.category}</Text>
                  <View style={styles.popularBottom}>
                    <Text style={styles.popularPrice}>₹{item.cost_per_100g}<Text style={styles.per100}>/100g</Text></Text>
                    <TouchableOpacity style={styles.addBtn} onPress={() => router.push('/(tabs)/menu')}>
                      <Text style={styles.addBtnText}>Add +</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Floating AI Chat Button */}
      <TouchableOpacity 
        style={styles.floatingAiBtn}
        onPress={() => router.push('/ai-chat')}
        activeOpacity={0.9}
        testID="floating-ai-chat-btn"
      >
        <View style={styles.floatingAiInner}>
          <Ionicons name="chatbubbles" size={22} color="#FFF" />
        </View>
        <View style={styles.floatingAiBadge}>
          <Ionicons name="sparkles" size={10} color="#FFF" />
        </View>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: BK_CREAM },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  
  // Header (BK Dark Brown)
  header: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center', 
    paddingHorizontal: 16, 
    paddingTop: 8, 
    paddingBottom: 12, 
    backgroundColor: BK_BROWN,
  },
  menuBtn: { 
    width: 44, 
    height: 44, 
    borderRadius: 12, 
    backgroundColor: 'rgba(245,235,220,0.15)', 
    alignItems: 'center', 
    justifyContent: 'center' 
  },
  avatar: { 
    width: 44, 
    height: 44, 
    borderRadius: 22, 
    backgroundColor: 'rgba(245,235,220,0.15)', 
    alignItems: 'center', 
    justifyContent: 'center' 
  },
  
  // Order type toggle (BK)
  orderToggle: { 
    flexDirection: 'row', 
    backgroundColor: 'rgba(245,235,220,0.15)', 
    borderRadius: 25, 
    padding: 4 
  },
  toggleBtn: { 
    paddingHorizontal: 16, 
    paddingVertical: 10, 
    borderRadius: 20 
  },
  toggleBtnActive: { 
    backgroundColor: BK_RED 
  },
  toggleText: { 
    fontSize: 12, 
    fontWeight: '800', 
    color: 'rgba(245,235,220,0.5)',
    letterSpacing: 0.5,
  },
  toggleTextActive: { 
    color: BK_CREAM 
  },
  
  // Location bar
  locationBar: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    backgroundColor: BK_WHITE, 
    paddingHorizontal: 16, 
    paddingVertical: 12, 
    gap: 8, 
    borderBottomWidth: 1, 
    borderBottomColor: '#E8DDD4' 
  },
  locationText: { 
    fontSize: 11, 
    fontWeight: '800', 
    color: BK_RED,
    letterSpacing: 0.5,
  },
  locationValue: { 
    flex: 1, 
    flexDirection: 'row', 
    alignItems: 'center', 
    justifyContent: 'space-between' 
  },
  locationName: { 
    fontSize: 14, 
    fontWeight: '600', 
    color: BK_BROWN 
  },
  
  // Banners (ENHANCED)
  bannerList: { marginTop: 12 },
  banner: { 
    width: width - 32, 
    marginHorizontal: 16, 
    borderRadius: 20, 
    padding: 24, 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center',
    minHeight: 160,
    shadowColor: BK_BROWN,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 6,
  },
  bannerContent: { flex: 1 },
  bannerTitle: { fontSize: 28, fontWeight: '800', color: BK_CREAM, letterSpacing: 0.8, textTransform: 'uppercase' },
  bannerSub: { fontSize: 14, color: 'rgba(245,235,220,0.9)', marginTop: 8, fontWeight: '600' },
  bannerDiscountCircle: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: 'rgba(255,255,255,0.95)',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.5)',
  },
  bannerDiscountPercent: { fontSize: 20, fontWeight: '800', color: BK_RED },
  bannerDiscountLabel: { fontSize: 10, fontWeight: '800', color: BK_BROWN, textTransform: 'uppercase', letterSpacing: 0.5 },
  bannerBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(245,235,220,0.3)', alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20, marginTop: 8 },
  bannerBadgeText: { fontSize: 11, fontWeight: '800', color: BK_CREAM, letterSpacing: 0.5 },
  bannerImagePlaceholder: { width: 100, height: 100, alignItems: 'center', justifyContent: 'center' },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: 12 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#D4C4B0' },
  dotActive: { backgroundColor: BK_ORANGE, width: 24 },
  
  // Category Grid (CLEAN - No Box)
  sectionTitle: { fontSize: 22, fontWeight: '800', color: BK_BROWN, paddingHorizontal: 16, marginTop: 24, marginBottom: 14, letterSpacing: 0.3, textTransform: 'uppercase' },
  categoryGrid: { 
    flexDirection: 'row', 
    flexWrap: 'wrap', 
    paddingHorizontal: 12, 
    gap: 12 
  },
  categoryCard: { 
    width: (width - 60) / 4, 
    alignItems: 'center', 
    backgroundColor: 'transparent',
    padding: 8,
  },
  categoryImage: { 
    width: 60, 
    height: 60, 
    borderRadius: 14, 
    marginBottom: 6 
  },
  categoryIconBg: { 
    alignItems: 'center', 
    justifyContent: 'center' 
  },
  categoryLabel: { 
    fontSize: 11, 
    fontWeight: '800', 
    color: BK_BROWN, 
    textAlign: 'center',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  
  // Nutrition Card
  nutriCard: { backgroundColor: BK_WHITE, marginHorizontal: 16, marginTop: 16, borderRadius: 16, padding: 18, borderWidth: 2, borderColor: '#E8DDD4' },
  nutriHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 },
  nutriTitle: { flex: 1, fontSize: 16, fontWeight: '800', color: BK_BROWN, textTransform: 'uppercase', letterSpacing: 0.3 },
  nutriMeals: { fontSize: 12, color: BK_TEXT_LIGHT },
  nutriRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  nutriMain: { flexDirection: 'row', alignItems: 'baseline', gap: 4 },
  calValue: { fontSize: 34, fontWeight: '800', color: BK_BROWN },
  calUnit: { fontSize: 13, color: BK_TEXT_LIGHT },
  macroRow: { flexDirection: 'row', gap: 16 },
  macroItem: { alignItems: 'center' },
  macroVal: { fontSize: 16, fontWeight: '800' },
  macroLabel: { fontSize: 10, color: BK_TEXT_LIGHT, marginTop: 2, textTransform: 'uppercase', letterSpacing: 0.5 },
  progressBg: { height: 6, backgroundColor: '#E8DDD4', borderRadius: 3, marginTop: 14, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: BK_ORANGE, borderRadius: 3 },
  progressFillOver: { backgroundColor: BK_RED },
  overGoalBanner: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10, backgroundColor: '#FDE8E4', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
  overGoalText: { fontSize: 11, color: BK_RED, fontWeight: '700', flex: 1 },
  
  // Scan Table CTA
  scanTableCTA: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#E8F5E1', marginHorizontal: 16, marginTop: 16, borderRadius: 14, padding: 16, borderWidth: 2, borderColor: BK_GREEN },
  scanCtaLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  scanCtaIconBg: { width: 44, height: 44, borderRadius: 12, backgroundColor: BK_GREEN, alignItems: 'center', justifyContent: 'center' },
  scanCtaTitle: { fontSize: 16, fontWeight: '800', color: BK_GREEN, textTransform: 'uppercase' },
  scanCtaSub: { fontSize: 12, color: '#6DB84D', marginTop: 2 },
  
  // AI Meal Builder CTA
  mealBuilderCTA: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: BK_WHITE, marginHorizontal: 16, marginTop: 16, borderRadius: 14, padding: 16, borderWidth: 2, borderColor: BK_ORANGE, borderStyle: 'dashed' },
  ctaLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  ctaIconBg: { width: 44, height: 44, borderRadius: 12, backgroundColor: BK_ORANGE, alignItems: 'center', justifyContent: 'center' },
  ctaTitle: { fontSize: 16, fontWeight: '800', color: BK_BROWN, textTransform: 'uppercase' },
  ctaSub: { fontSize: 12, color: BK_TEXT_LIGHT, marginTop: 2 },
  
  // Schedule for Later CTA
  scheduleCTA: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#E8F5E1', marginHorizontal: 16, marginTop: 12, borderRadius: 14, padding: 16, borderWidth: 2, borderColor: BK_GREEN },
  
  // Builder Card
  builderCard: { backgroundColor: BK_WHITE, marginHorizontal: 16, marginTop: 16, borderRadius: 16, padding: 18, borderWidth: 2, borderColor: BK_ORANGE },
  builderHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  builderTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  builderTitle: { fontSize: 18, fontWeight: '800', color: BK_BROWN, textTransform: 'uppercase' },
  builderLabel: { fontSize: 13, fontWeight: '800', color: BK_TEXT_LIGHT, marginBottom: 8, marginTop: 6, textTransform: 'uppercase', letterSpacing: 0.5 },
  dietRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  dietChip: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, borderRadius: 25, backgroundColor: BK_WHITE, borderWidth: 2, borderColor: '#E8DDD4' },
  dietText: { fontSize: 13, fontWeight: '700', color: BK_TEXT_LIGHT },
  vegIndicator: { width: 14, height: 14, borderRadius: 2, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  vegDotInner: { width: 7, height: 7, borderRadius: 4 },
  goalRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  goalChip: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 12, borderRadius: 25, backgroundColor: BK_WHITE, borderWidth: 2, borderColor: '#E8DDD4' },
  goalText: { fontSize: 11, fontWeight: '700', color: BK_TEXT_LIGHT },
  budgetInput: { backgroundColor: BK_CREAM, borderRadius: 12, padding: 14, color: BK_BROWN, fontSize: 15, fontWeight: '600', borderWidth: 2, borderColor: '#E8DDD4', marginBottom: 14 },
  buildBtn: { backgroundColor: BK_RED, borderRadius: 25, paddingVertical: 16, alignItems: 'center', justifyContent: 'center' },
  buildBtnContent: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  buildBtnText: { color: BK_CREAM, fontSize: 15, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 },
  
  // Meal Result
  mealResultCard: { backgroundColor: BK_WHITE, marginHorizontal: 16, marginTop: 16, borderRadius: 16, padding: 16, borderWidth: 2, borderColor: '#E8DDD4' },
  mealResultHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  mealResultTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  mealResultTitle: { fontSize: 18, fontWeight: '800', color: BK_BROWN, textTransform: 'uppercase' },
  rebuildBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#FFF0E0', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  rebuildText: { fontSize: 12, fontWeight: '800', color: BK_ORANGE },
  mealSummary: { color: BK_TEXT_LIGHT, fontSize: 13, lineHeight: 19, marginBottom: 12 },
  mealItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#E8DDD4' },
  mealItemLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  vegDot: { width: 16, height: 16, borderRadius: 2, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  vegDotFill: { width: 8, height: 8, borderRadius: 4 },
  mealItemName: { fontSize: 14, fontWeight: '700', color: BK_BROWN },
  mealItemReason: { fontSize: 11, color: BK_TEXT_LIGHT, marginTop: 2 },
  mealItemRight: { alignItems: 'flex-end' },
  mealItemGrams: { fontSize: 15, fontWeight: '800', color: BK_RED },
  mealItemPrice: { fontSize: 12, color: BK_TEXT_LIGHT, marginTop: 2 },
  mealTotals: { backgroundColor: BK_CREAM, borderRadius: 12, padding: 14, marginTop: 14 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-around', marginBottom: 12 },
  totalItem: { alignItems: 'center' },
  totalLabel: { fontSize: 10, color: BK_TEXT_LIGHT, marginBottom: 3, textTransform: 'uppercase' },
  totalValue: { fontSize: 16, fontWeight: '800' },
  totalPriceRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: 1, borderTopColor: '#E8DDD4', paddingTop: 10 },
  totalPriceLabel: { fontSize: 14, fontWeight: '600', color: BK_TEXT_LIGHT },
  totalPriceValue: { fontSize: 24, fontWeight: '800', color: BK_BROWN },
  orderMealBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: BK_RED, borderRadius: 25, paddingVertical: 16, marginTop: 14 },
  orderMealText: { color: BK_CREAM, fontSize: 15, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 },
  mealErrorRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  mealErrorText: { flex: 1, color: BK_TEXT_LIGHT, fontSize: 13, lineHeight: 18 },
  retryBtn: { backgroundColor: BK_ORANGE, borderRadius: 25, paddingVertical: 12, alignItems: 'center', marginTop: 14 },
  retryText: { color: BK_BROWN, fontSize: 14, fontWeight: '800', textTransform: 'uppercase' },
  
  // Popular Items (ENHANCED)
  popularScroll: { paddingHorizontal: 12, gap: 14 },
  popularCard: { 
    width: 220, 
    backgroundColor: BK_WHITE, 
    borderRadius: 18, 
    overflow: 'hidden', 
    borderWidth: 2, 
    borderColor: '#E8DDD4',
    shadowColor: BK_BROWN,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 4,
  },
  popularImg: { width: '100%', height: 150, backgroundColor: BK_CREAM },
  popularImgPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  popularBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
    backgroundColor: BK_ORANGE,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
  },
  popularBadgeText: { fontSize: 9, fontWeight: '800', color: BK_WHITE, textTransform: 'uppercase', letterSpacing: 0.5 },
  proteinBadge: { 
    position: 'absolute', 
    top: 10, 
    right: 10, 
    backgroundColor: BK_BROWN, 
    paddingHorizontal: 10, 
    paddingVertical: 6, 
    borderRadius: 20,
    alignItems: 'center',
  },
  proteinText: { fontSize: 15, fontWeight: '800', color: BK_CREAM },
  proteinLabel: { fontSize: 9, color: 'rgba(245,235,220,0.8)', textTransform: 'uppercase' },
  vegBadge: { 
    position: 'absolute', 
    bottom: 10, 
    right: 10, 
    width: 20, 
    height: 20, 
    borderRadius: 4, 
    borderWidth: 2, 
    alignItems: 'center', 
    justifyContent: 'center', 
    backgroundColor: BK_WHITE 
  },
  vegBadgeDot: { width: 10, height: 10, borderRadius: 5 },
  popularInfo: { padding: 14 },
  popularName: { fontSize: 16, fontWeight: '800', color: BK_BROWN },
  popularDesc: { fontSize: 12, color: BK_TEXT_LIGHT, marginTop: 4 },
  popularBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 },
  popularPrice: { fontSize: 18, fontWeight: '800', color: BK_BROWN },
  per100: { fontSize: 10, fontWeight: '400', color: BK_TEXT_LIGHT },
  addBtn: { backgroundColor: BK_RED, paddingHorizontal: 20, paddingVertical: 9, borderRadius: 20 },
  addBtnText: { color: BK_CREAM, fontSize: 13, fontWeight: '800', textTransform: 'uppercase' },
  
  // Floating AI Button (BK Orange)
  floatingAiBtn: { position: 'absolute', bottom: 90, right: 20, width: 56, height: 56, borderRadius: 28, backgroundColor: BK_ORANGE, alignItems: 'center', justifyContent: 'center', shadowColor: BK_BROWN, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.3, shadowRadius: 10, elevation: 10 },
  floatingAiInner: { width: 56, height: 56, borderRadius: 28, backgroundColor: BK_ORANGE, alignItems: 'center', justifyContent: 'center' },
  floatingAiBadge: { position: 'absolute', top: -2, right: -2, width: 20, height: 20, borderRadius: 10, backgroundColor: BK_RED, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: BK_WHITE },
});
