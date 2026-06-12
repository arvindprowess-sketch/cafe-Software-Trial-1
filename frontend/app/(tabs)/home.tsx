import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Image,
  RefreshControl, FlatList, Dimensions, ActivityIndicator, Alert, Modal
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiCall, getStoredUser } from '../../utils/api';
import SideDrawer from '../components/SideDrawer';
import CartPill from '../components/CartPill';
import { useCart } from '../../utils/CartContext';
import { FUEL, FONT, GOALS as FUEL_GOALS, RADIUS, SPACE } from '../../utils/theme';
import { DIET_TAGS, DIET_LABEL, toggleDietTag } from '../../utils/diet';
import PressableScale from '../components/PressableScale';
import * as Haptics from 'expo-haptics';

// PR-C: success haptic on add-to-cart (safe no-op on web)
const hapticSuccess = () => {
  try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {}); } catch {}
};

const { width } = Dimensions.get('window');

// Category grid (FUEL palette)
const MENU_CATEGORIES = [
  { key: 'Protein', label: 'High Protein', icon: 'barbell', color: FUEL.protein, image: 'https://images.unsplash.com/photo-1632778149955-e80f8ceca2e8?w=100&h=100&fit=crop' },
  { key: 'Carb', label: 'Healthy Carbs', icon: 'leaf', color: FUEL.carbs, image: 'https://images.unsplash.com/photo-1536304929831-ee1ca9d44726?w=100&h=100&fit=crop' },
  { key: 'Fat', label: 'Good Fats', icon: 'water', color: FUEL.fat, image: 'https://images.unsplash.com/photo-1523049673857-eb18f1d7b578?w=100&h=100&fit=crop' },
  { key: 'Meal', label: 'Ready Meals', icon: 'restaurant', color: FUEL.success, image: 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=100&h=100&fit=crop' },
  { key: 'veg', label: 'Veg Only', icon: 'nutrition', color: FUEL.veg, image: 'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=100&h=100&fit=crop' },
  { key: 'non-veg', label: 'Non-Veg', icon: 'flame', color: FUEL.nonVeg, image: 'https://images.unsplash.com/photo-1467003909585-2f8a72700288?w=100&h=100&fit=crop' },
  { key: 'budget', label: 'Budget Meals', icon: 'wallet', color: FUEL.ink, image: 'https://images.unsplash.com/photo-1490818387583-1baba5e638af?w=100&h=100&fit=crop' },
  { key: 'ai', label: 'AI Picks', icon: 'sparkles', color: FUEL.ink, image: null },
];

export default function HomeScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const [user, setUser] = useState<any>(null);
  const [summary, setSummary] = useState<any>(null);
  const [products, setProducts] = useState<any[]>([]);
  const [menuCats, setMenuCats] = useState<any[]>([]);  // F2: DB taxonomy (fallback: MENU_CATEGORIES)
  const [banners, setBanners] = useState<any[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const bannerRef = useRef<FlatList>(null);
  const [bannerIdx, setBannerIdx] = useState(0);

  // Side drawer state
  const [drawerVisible, setDrawerVisible] = useState(false);

  // Order type toggle
  const [orderType, setOrderType] = useState<'delivery' | 'dine-in'>('dine-in');

  // FIX 1: Delivery address (detected via expo-location or entered manually, persisted)
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [showAddressModal, setShowAddressModal] = useState(false);
  const [locating, setLocating] = useState(false);
  const [manualAddress, setManualAddress] = useState('');
  const [locationError, setLocationError] = useState('');
  const cartCtx = useCart();

  // AI Quick Meal Builder state
  const [showMealBuilder, setShowMealBuilder] = useState(false);
  const [dietPref, setDietPref] = useState<string[]>([]);
  const [mealGoal, setMealGoal] = useState('');
  const [mealBudget, setMealBudget] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiMeal, setAiMeal] = useState<any>(null);

  // P7: saved builds ("My Meals")
  const [savedMeals, setSavedMeals] = useState<any[]>([]);
  const loadSavedMeals = useCallback(async () => {
    try { setSavedMeals(await apiCall('/saved-meals')); } catch {}
  }, []);

  // Phase 2/3/4: personalized daily target + coach nudge (from body stats)
  const [dailyTarget, setDailyTarget] = useState<any>(null);
  const [coachNudge, setCoachNudge] = useState<any>(null);
  const loadTarget = useCallback(async () => {
    try {
      const [t, n] = await Promise.all([
        apiCall('/user/daily-target'),
        apiCall('/user/coach-nudge').catch(() => null),
      ]);
      setDailyTarget(t);
      setCoachNudge(t?.has_body_stats ? n : null);
    } catch {}
  }, []);

  const loadData = useCallback(async () => {
    try {
      const [u, s, best, b, cats] = await Promise.all([
        getStoredUser(),
        apiCall('/user/nutrition-summary').catch(() => null),
        apiCall('/products/best-sellers').catch(() => apiCall('/products')).catch(() => []),
        apiCall('/banners'),
        apiCall('/categories').catch(() => []),
      ]);
      setUser(u); setSummary(s); setProducts(best); setBanners(b);
      setMenuCats(Array.isArray(cats) && cats.length ? cats : []);
      loadTarget();
      loadSavedMeals();
    } catch (e) {} finally { setLoading(false); }
  }, [loadTarget, loadSavedMeals]);

  useEffect(() => { loadData(); }, []);
  // Refresh the personalized target (and saved meals — e.g. after saving a build)
  // whenever Home regains focus
  useFocusEffect(useCallback(() => { loadTarget(); loadSavedMeals(); }, [loadTarget, loadSavedMeals]));
  useEffect(() => {
    AsyncStorage.getItem('delivery_address').then(a => { if (a) setDeliveryAddress(a); }).catch(() => {});
  }, []);
  useEffect(() => {
    if (params.openAi) { setShowMealBuilder(true); }
  }, [params.openAi]);
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

  // Avatar initial derived from the loaded user's name
  const userInitial = (user?.name || '').trim().charAt(0).toUpperCase();

  // Memoize popular products (best sellers, up to 30) arranged into a 5-row horizontal grid
  const popularProducts = useMemo(() => products.slice(0, 30), [products]);
  const POPULAR_ROWS = 5;
  const popularColumns = useMemo(() => {
    const cols: any[][] = [];
    for (let i = 0; i < popularProducts.length; i += POPULAR_ROWS) {
      cols.push(popularProducts.slice(i, i + POPULAR_ROWS));
    }
    return cols;
  }, [popularProducts]);

  const renderPopularCard = (item: any, idx: number) => {
    const isHighProtein = item.protein_per_100g >= 20;
    const isUnderBudget = item.cost_per_100g <= 50;
    const isPopular = idx < 3;
    const ci = cartCtx.getItem(item.id);
    return (
      <TouchableOpacity
        key={item.id} testID={`popular-${item.id}`} style={styles.popularCard}
        onPress={() => router.push('/(tabs)/menu')} activeOpacity={0.9}
      >
        {item.image_url ? (
          <Image source={{ uri: item.image_url }} style={styles.popularImg} resizeMode="cover" />
        ) : (
          <View style={[styles.popularImg, styles.popularImgPlaceholder]}>
            <Ionicons name="restaurant" size={28} color={FUEL.sandBorder} />
          </View>
        )}
        {isPopular && (
          <View style={styles.popularBadge}>
            <Ionicons name="flame" size={10} color={FUEL.lime} />
            <Text style={styles.popularBadgeText}>POPULAR</Text>
          </View>
        )}
        {isHighProtein && !isPopular && (
          <View style={[styles.popularBadge, { backgroundColor: FUEL.ink }]}>
            <Ionicons name="barbell" size={10} color={FUEL.lime} />
            <Text style={styles.popularBadgeText}>HIGH PROTEIN</Text>
          </View>
        )}
        {isUnderBudget && !isPopular && !isHighProtein && (
          <View style={[styles.popularBadge, { backgroundColor: FUEL.success }]}>
            <Ionicons name="wallet" size={10} color={FUEL.white} />
            <Text style={styles.popularBadgeText}>BUDGET</Text>
          </View>
        )}
        <View style={styles.proteinBadge}>
          <Text style={styles.proteinText}>{item.protein_per_100g}g</Text>
          <Text style={styles.proteinLabel}>Protein</Text>
        </View>
        <View style={[styles.vegBadge, { borderColor: item.diet_type === 'non-veg' ? FUEL.nonVeg : FUEL.veg }]}>
          <View style={[styles.vegBadgeDot, { backgroundColor: item.diet_type === 'non-veg' ? FUEL.nonVeg : FUEL.veg }]} />
        </View>
        <View style={styles.popularInfo}>
          <Text style={styles.popularName} numberOfLines={1}>{item.name}</Text>
          <View style={styles.popularBottom}>
            <Text style={styles.popularPrice}>₹{item.cost_per_100g}<Text style={styles.per100}>/100g</Text></Text>
            {ci ? (
              <View style={styles.popQtyBox}>
                <TouchableOpacity testID={`popular-dec-${item.id}`} style={styles.popQtyBtn} onPress={() => cartCtx.decItem(item.id)}><Ionicons name="remove" size={13} color={FUEL.lime} /></TouchableOpacity>
                <Text style={styles.popQtyText}>{ci.grams}g</Text>
                <TouchableOpacity testID={`popular-inc-${item.id}`} style={styles.popQtyBtn} onPress={() => cartCtx.incItem(item.id)}><Ionicons name="add" size={13} color={FUEL.lime} /></TouchableOpacity>
              </View>
            ) : (
              <PressableScale haptic testID={`popular-add-${item.id}`} style={styles.addBtn} onPress={() => { cartCtx.addItem(item); hapticSuccess(); }}>
                <Text style={styles.addBtnText}>Add +</Text>
              </PressableScale>
            )}
          </View>
        </View>
      </TouchableOpacity>
    );
  };

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
    // CORE RULE: AI meal goes into the shared CART (no direct order).
    cartCtx.addMeal(aiMeal.meal_items.map((item: any) => ({
      id: item.product_id, product_id: item.product_id, name: item.product_name,
      grams: item.grams, product_type: 'single',
      cost_per_100g: item.cost_per_100g, calories_per_100g: item.calories_per_100g,
      protein_per_100g: item.protein_per_100g, carbs_per_100g: item.carbs_per_100g,
      fat_per_100g: item.fat_per_100g, category: item.category,
      diet_type: item.diet_type, image_url: item.image_url,
    })));
    router.push('/cart');
  };

  // P7: tap a saved meal → all items into the unified cart (same addMeal path
  // as orderAiMeal; the authoritative stock recheck stays at order placement).
  const orderSavedMeal = (meal: any) => {
    if (!meal?.items?.length) return;
    cartCtx.addMeal(meal.items);
    hapticSuccess();
    router.push('/cart');
  };

  const confirmDeleteSavedMeal = (meal: any) => {
    Alert.alert('Delete meal?', `Remove "${meal.name}" from My Meals?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          try {
            await apiCall(`/saved-meals/${meal.id}`, { method: 'DELETE' });
            setSavedMeals(prev => prev.filter(m => m.id !== meal.id));
          } catch (e: any) {
            Alert.alert('Error', e?.message || 'Could not delete meal');
          }
        },
      },
    ]);
  };

  // ===== FIX 1: Delivery location detection (expo-location) + manual fallback =====
  const persistAddress = async (addr: string) => {
    setDeliveryAddress(addr);
    try { await AsyncStorage.setItem('delivery_address', addr); } catch {}
    setShowAddressModal(false);
    setManualAddress('');
    setLocationError('');
  };

  const detectLocation = async () => {
    setLocating(true); setLocationError('');
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setLocationError('Location permission denied. Please enter your delivery address manually below.');
        setLocating(false);
        return;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const { latitude, longitude } = pos.coords;
      let address = '';
      // Native reverse geocode
      try {
        const geo = await Location.reverseGeocodeAsync({ latitude, longitude });
        if (geo && geo.length > 0) {
          const g: any = geo[0];
          address = [g.name, g.street, g.district || g.subregion, g.city, g.region, g.postalCode]
            .filter(Boolean)
            .filter((v: string, i: number, a: string[]) => a.indexOf(v) === i)
            .join(', ');
        }
      } catch {}
      // Web fallback (expo reverseGeocode is unavailable on web)
      if (!address) {
        try {
          const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&zoom=18&addressdetails=1`, { headers: { Accept: 'application/json' } });
          const data = await res.json();
          address = data?.display_name || '';
        } catch {}
      }
      if (!address) address = `Lat ${latitude.toFixed(5)}, Lng ${longitude.toFixed(5)}`;
      await persistAddress(address);
    } catch (e) {
      setLocationError('Could not detect your location. Please enter your address manually.');
    } finally {
      setLocating(false);
    }
  };

  const saveManualAddress = () => {
    if (!manualAddress.trim()) { setLocationError('Please enter an address first.'); return; }
    persistAddress(manualAddress.trim());
  };

  const resetBuilder = () => { setAiMeal(null); setMealGoal(''); setMealBudget(''); setDietPref([]); setShowMealBuilder(false); };

  // Phase 2: tapping a goal — if body stats are missing, open goal-setup; else open the meal builder.
  const handleGoalTap = (key: string) => {
    setMealGoal(key);
    if (!dailyTarget?.has_body_stats) {
      router.push({ pathname: '/goal-setup', params: { goal: key, next: 'builder' } });
    } else {
      setShowMealBuilder(true);
    }
  };

  const handleCategoryPress = (cat: any) => {
    if (cat.key === 'ai') {
      setShowMealBuilder(true);
    } else if (cat.key === 'budget') {
      router.push('/(tabs)/budget-meal');
    } else if (cat.key === 'veg' || cat.key === 'non-veg') {
      router.push({ pathname: '/(tabs)/menu', params: { dietFilter: cat.key } });
    } else {
      // Menu filters/highlights by category name (falls back to key for the
      // hardcoded list, which has no name). Pass the same value menu matches on.
      router.push({ pathname: '/(tabs)/menu', params: { category: cat.name || cat.key } });
    }
  };

  if (loading) return <SafeAreaView style={styles.safe}><View style={styles.center}><ActivityIndicator size="large" color={FUEL.ink} /></View></SafeAreaView>;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Side Drawer */}
      <SideDrawer visible={drawerVisible} onClose={() => setDrawerVisible(false)} user={user} />

      <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={FUEL.ink} />} showsVerticalScrollIndicator={false}>
        {/* ===== HEADER: ☰ · DELIVERY/DINE-IN TOGGLE · AVATAR ===== */}
        <View style={styles.header}>
          <TouchableOpacity testID="menu-drawer-btn" style={styles.menuBtn} onPress={() => setDrawerVisible(true)}>
            <Ionicons name="menu" size={24} color={FUEL.sand} />
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

          {/* Avatar — lime circle with the user's initial, opens the drawer */}
          <TouchableOpacity testID="header-avatar" style={styles.avatar} onPress={() => setDrawerVisible(true)} activeOpacity={0.85}>
            {userInitial ? (
              <Text style={styles.avatarInitial}>{userInitial}</Text>
            ) : (
              <Ionicons name="person" size={18} color={FUEL.ink} />
            )}
          </TouchableOpacity>
        </View>

        {/* Location Bar */}
        {orderType === 'dine-in' && (
          <TouchableOpacity style={styles.locationBar} onPress={() => router.push('/scan-table')} activeOpacity={0.85}>
            <View style={styles.locationIconBox}>
              <Ionicons name="restaurant" size={16} color={FUEL.lime} />
            </View>
            <View style={styles.locationValue}>
              <Text style={styles.locationText}>DINE-IN AT</Text>
              <View style={styles.locationNameRow}>
                <Text style={styles.locationName} numberOfLines={1}>BORAROC • Scan Table</Text>
                <Ionicons name="chevron-down" size={14} color={FUEL.muted} />
              </View>
            </View>
          </TouchableOpacity>
        )}

        {orderType === 'delivery' && (
          <TouchableOpacity style={styles.locationBar} onPress={() => setShowAddressModal(true)} testID="delivery-address-bar" activeOpacity={0.8}>
            <View style={styles.locationIconBox}>
              <Ionicons name="bicycle" size={16} color={FUEL.lime} />
            </View>
            <View style={styles.locationValue}>
              <Text style={styles.locationText}>DELIVER TO</Text>
              <View style={styles.locationNameRow}>
                <Text style={styles.locationName} numberOfLines={1}>{deliveryAddress || 'Select Address'}</Text>
                <Ionicons name="chevron-down" size={14} color={FUEL.muted} />
              </View>
            </View>
            <TouchableOpacity testID="detect-location-chip" style={styles.detectChip} onPress={detectLocation} disabled={locating} activeOpacity={0.85}>
              {locating ? (
                <ActivityIndicator size="small" color={FUEL.ink} />
              ) : (
                <>
                  <Ionicons name="location" size={12} color={FUEL.ink} />
                  <Text style={styles.detectChipText}>DETECT</Text>
                </>
              )}
            </TouchableOpacity>
          </TouchableOpacity>
        )}

        {/* ===== GOAL-FIRST ORDERING ===== */}
        <View style={styles.goalSelector}>
          <Text style={styles.goalSelectorTitle}>What's your goal?</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.goalSelectorRow}>
            {FUEL_GOALS.map((g) => {
              const active = mealGoal === g.key;
              return (
                <PressableScale
                  key={g.key}
                  testID={`home-goal-${g.key}`}
                  style={[styles.goalSelectorChip, active && styles.goalSelectorChipActive]}
                  onPress={() => handleGoalTap(g.key)}
                >
                  <Ionicons name={g.icon as any} size={18} color={active ? FUEL.lime : FUEL.ink} />
                  <Text style={[styles.goalSelectorLabel, active && styles.goalSelectorLabelActive]}>{g.label}</Text>
                </PressableScale>
              );
            })}
          </ScrollView>

          {/* Phase 2/3: personalized daily target + plan entry */}
          {dailyTarget?.has_body_stats ? (
            <TouchableOpacity testID="home-daily-target" style={styles.targetBanner} activeOpacity={0.9} onPress={() => router.push('/meal-plan')}>
              <View style={styles.targetBannerLeft}>
                <Text style={styles.targetBannerLabel}>YOUR DAILY TARGET</Text>
                <Text style={styles.targetBannerValue}>
                  {dailyTarget.daily_calories} kcal · <Text style={{ color: FUEL.protein }}>{dailyTarget.daily_protein}g protein</Text>
                </Text>
              </View>
              <View style={styles.targetBannerCta}>
                <Ionicons name="restaurant" size={14} color={FUEL.ink} />
                <Text style={styles.targetBannerCtaText}>PLAN MEALS</Text>
              </View>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity testID="home-setup-target" style={styles.targetSetup} activeOpacity={0.9} onPress={() => router.push({ pathname: '/goal-setup', params: { goal: mealGoal || 'maintenance', next: 'meal-plan' } })}>
              <Ionicons name="sparkles" size={15} color={FUEL.limeDeep} />
              <Text style={styles.targetSetupText}>Tap a goal to get a personalized daily target</Text>
            </TouchableOpacity>
          )}

          {/* Phase 4 / B4: gentle coach nudge — hidden when no nudge or goal unset */}
          {coachNudge?.nudge && user?.fitness_goal ? (
            <TouchableOpacity testID="home-coach-nudge" style={styles.nudgeBanner} activeOpacity={0.9} onPress={() => router.push('/meal-plan')}>
              <Text style={styles.nudgeBannerEmoji}>🏆</Text>
              <Text style={styles.nudgeBannerText}>{coachNudge.nudge}</Text>
              {coachNudge.streak_days > 0 ? (
                <View style={styles.nudgeStreakChip}>
                  <Text style={styles.nudgeStreakText}>{coachNudge.streak_days}-day streak</Text>
                </View>
              ) : null}
            </TouchableOpacity>
          ) : null}
        </View>

        {/* ===== PROMOTIONAL BANNERS — dark hero style (ink + lime) ===== */}
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
                <View style={styles.banner}>
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
                      <View style={styles.bannerBadge}>
                        <Ionicons name="nutrition" size={12} color={FUEL.lime} />
                        <Text style={styles.bannerBadgeText}>View Pack</Text>
                      </View>
                    )}
                  </View>
                  <View style={styles.bannerImagePlaceholder}>
                    <Ionicons name={item.type === 'pack' ? 'fitness' : item.type === 'offer' ? 'pricetag' : 'fast-food'} size={60} color="rgba(199,242,78,0.35)" />
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

        {/* ===== CATEGORY CHIPS (DB taxonomy + synthetic AI Picks) ===== */}
        <Text style={styles.sectionTitle}>Our Menu</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryChipRow}>
          {[
            { key: 'ai', label: 'AI Picks', icon: 'sparkles', synthetic: true },
            ...(menuCats.length ? menuCats : MENU_CATEGORIES),
          ].map((cat: any) => {
            const img = cat.image_url || cat.image;
            return (
              <TouchableOpacity
                key={cat.key || cat.id}
                testID={`cat-chip-${cat.key}`}
                style={styles.categoryChip}
                onPress={() => handleCategoryPress(cat)}
                activeOpacity={0.85}
              >
                {cat.synthetic ? (
                  <View style={[styles.categoryChipThumb, styles.categoryChipThumbAi]}>
                    <Ionicons name="sparkles" size={18} color={FUEL.lime} />
                  </View>
                ) : img ? (
                  <Image source={{ uri: img }} style={styles.categoryChipThumb} />
                ) : (
                  <View style={[styles.categoryChipThumb, styles.categoryChipThumbAi, { backgroundColor: cat.color || FUEL.ink }]}>
                    <Ionicons name={(cat.icon as any) || 'grid'} size={18} color={FUEL.white} />
                  </View>
                )}
                <Text style={styles.categoryChipLabel} numberOfLines={1}>
                  {cat.synthetic ? '✨ AI Picks' : (cat.label || cat.name)}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* ===== TODAY'S NUTRITION CARD (CLICKABLE) ===== */}
        <TouchableOpacity
          style={styles.nutriCard}
          testID="nutrition-summary-card"
          onPress={() => router.push('/nutrition-detail')}
          activeOpacity={0.8}
        >
          <View style={styles.nutriHeader}>
            <Ionicons name="fitness" size={18} color={isCalorieOver ? FUEL.error : FUEL.limeDeep} />
            <Text style={styles.nutriTitle}>Today's Nutrition</Text>
            <Text style={styles.nutriMeals}>{summary?.meals_count || 0} meals</Text>
            <Ionicons name="chevron-forward" size={18} color={FUEL.muted} style={{ marginLeft: 'auto' }} />
          </View>
          <View style={styles.nutriRow}>
            <View style={styles.nutriMain}>
              <Text style={[styles.calValue, isCalorieOver && { color: FUEL.error }]}>{Math.round(consumed.calories || 0)}</Text>
              <Text style={styles.calUnit}>/ {goals.daily_calories || 2000} kcal</Text>
            </View>
            <View style={styles.macroRow}>
              {[
                { label: 'Protein', val: consumed.protein, goal: goals.daily_protein, color: FUEL.protein },
                { label: 'Carbs', val: consumed.carbs, goal: goals.daily_carbs, color: FUEL.carbs },
                { label: 'Fat', val: consumed.fat, goal: goals.daily_fat, color: FUEL.fat },
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
              <Ionicons name="information-circle" size={14} color={FUEL.error} />
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
                <Ionicons name="qr-code" size={20} color={FUEL.white} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.scanCtaTitle}>Scan Table QR</Text>
                <Text style={styles.scanCtaSub}>Order from your seat</Text>
              </View>
            </View>
            <Ionicons name="scan" size={24} color={FUEL.success} />
          </TouchableOpacity>
        )}

        {/* ===== AI COMBO BUILDER — dark hero card ===== */}
        {!showMealBuilder && !aiMeal && (
          <TouchableOpacity testID="open-meal-builder" style={styles.mealBuilderCTA} onPress={() => router.push('/combo-builder')} activeOpacity={0.9}>
            <View style={styles.ctaLeft}>
              <View style={styles.heroCtaIconBg}>
                <Ionicons name="sparkles" size={20} color={FUEL.ink} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.heroCtaTitle}>AI Combo Builder</Text>
                <Text style={styles.heroCtaSub}>Budget + Goal = Perfect meal in seconds</Text>
              </View>
            </View>
            <Ionicons name="arrow-forward-circle" size={28} color={FUEL.lime} />
          </TouchableOpacity>
        )}

        {/* ===== SCHEDULE FOR LATER ===== */}
        <TouchableOpacity testID="schedule-for-later" style={styles.scheduleCTA} onPress={() => router.push('/(tabs)/menu')} activeOpacity={0.9}>
          <View style={styles.ctaLeft}>
            <View style={[styles.ctaIconBg, { backgroundColor: FUEL.success }]}>
              <Ionicons name="time" size={20} color={FUEL.white} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.ctaTitle}>Schedule for Later</Text>
              <Text style={styles.ctaSub}>Pre-order your meals in advance</Text>
            </View>
          </View>
          <Ionicons name="calendar" size={28} color={FUEL.success} />
        </TouchableOpacity>

        {showMealBuilder && !aiMeal && (
          <View style={styles.builderCard}>
            <View style={styles.builderHeader}>
              <View style={styles.builderTitleRow}>
                <Ionicons name="sparkles" size={18} color={FUEL.limeDeep} />
                <Text style={styles.builderTitle}>AI Meal Builder</Text>
              </View>
              <TouchableOpacity testID="close-builder" onPress={resetBuilder}>
                <Ionicons name="close-circle" size={24} color={FUEL.sandBorder} />
              </TouchableOpacity>
            </View>

            {/* Diet Preference */}
            <Text style={styles.builderLabel}>Diet Preference</Text>
            <View style={[styles.dietRow, { flexWrap: 'wrap' }]}>
              <TouchableOpacity
                testID="diet-all"
                style={[styles.dietChip, dietPref.length === 0 && { backgroundColor: FUEL.ink, borderColor: FUEL.ink }]}
                onPress={() => setDietPref([])}
              >
                <Ionicons name="apps" size={14} color={dietPref.length === 0 ? FUEL.lime : FUEL.muted} />
                <Text style={[styles.dietText, dietPref.length === 0 && { color: FUEL.white }]}>All</Text>
              </TouchableOpacity>
              {DIET_TAGS.map(tag => {
                const on = dietPref.includes(tag);
                const color = tag === 'non-veg' ? FUEL.nonVeg : FUEL.veg;
                return (
                  <TouchableOpacity
                    key={tag} testID={`diet-${tag}`}
                    style={[styles.dietChip, on && { backgroundColor: color, borderColor: color }]}
                    onPress={() => setDietPref(prev => toggleDietTag(prev, tag))}
                  >
                    <View style={[styles.vegIndicator, { borderColor: on ? FUEL.white : color }]}><View style={[styles.vegDotInner, { backgroundColor: on ? FUEL.white : color }]} /></View>
                    <Text style={[styles.dietText, on && { color: FUEL.white }]}>{DIET_LABEL[tag]}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Fitness Goal — all 6 canonical goals from the shared source */}
            <Text style={styles.builderLabel}>Fitness Goal</Text>
            <View style={styles.goalContainer}>
              <View style={styles.goalGrid}>
                {FUEL_GOALS.map(g => (
                  <TouchableOpacity
                    key={g.key} testID={`meal-goal-${g.key}`}
                    style={[styles.goalChip6, mealGoal === g.key && { backgroundColor: g.color, borderColor: g.color }]}
                    onPress={() => setMealGoal(g.key)}
                  >
                    <Ionicons name={g.icon as any} size={15} color={mealGoal === g.key ? FUEL.white : g.color} />
                    <Text style={[styles.goalText, mealGoal === g.key && { color: FUEL.white }]}>{g.shortLabel}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Budget */}
            <Text style={styles.builderLabel}>Budget (optional)</Text>
            <TextInput
              testID="meal-budget-input"
              style={styles.budgetInput}
              value={mealBudget}
              onChangeText={setMealBudget}
              placeholder="₹ Enter budget"
              placeholderTextColor={FUEL.muted}
              keyboardType="number-pad"
            />

            {/* Build Button */}
            <PressableScale haptic testID="build-meal-btn" style={styles.buildBtn} onPress={buildMeal} disabled={aiLoading}>
              {aiLoading ? (
                <View style={styles.buildBtnContent}>
                  <ActivityIndicator color={FUEL.ink} size="small" />
                  <Text style={styles.buildBtnText}>Building your meal...</Text>
                </View>
              ) : (
                <View style={styles.buildBtnContent}>
                  <Ionicons name="sparkles" size={18} color={FUEL.ink} />
                  <Text style={styles.buildBtnText}>Build My Meal</Text>
                </View>
              )}
            </PressableScale>
          </View>
        )}

        {/* AI Meal Result */}
        {aiMeal && aiMeal.meal_items?.length > 0 && (
          <View style={styles.mealResultCard}>
            <View style={styles.mealResultHeader}>
              <View style={styles.mealResultTitleRow}>
                <Ionicons name="sparkles" size={16} color={FUEL.limeDeep} />
                <Text style={styles.mealResultTitle}>Your AI Meal</Text>
              </View>
              <TouchableOpacity testID="rebuild-meal" onPress={resetBuilder}>
                <View style={styles.rebuildBadge}><Ionicons name="refresh" size={14} color={FUEL.limeDeep} /><Text style={styles.rebuildText}>New</Text></View>
              </TouchableOpacity>
            </View>
            <Text style={styles.mealSummary}>{aiMeal.summary}</Text>

            {/* Display Warnings/Feedback about Daily Targets */}
            {aiMeal.warnings && aiMeal.warnings.length > 0 && (
              <View style={styles.warningsContainer}>
                {aiMeal.warnings.map((warning: string, idx: number) => {
                  const isPositive = warning.startsWith('✅');
                  const isWarning = warning.startsWith('⚠️');
                  return (
                    <View key={idx} style={[
                      styles.warningItem,
                      isPositive && styles.warningPositive,
                      isWarning && styles.warningCaution
                    ]}>
                      <Text style={[
                        styles.warningText,
                        isPositive && styles.warningTextPositive,
                        isWarning && styles.warningTextCaution
                      ]}>{warning}</Text>
                    </View>
                  );
                })}
              </View>
            )}

            {aiMeal.meal_items.map((item: any, i: number) => (
              <View key={i} style={styles.mealItem}>
                <View style={styles.mealItemLeft}>
                  <View style={[styles.vegDot, { borderColor: item.diet_type === 'non-veg' ? FUEL.nonVeg : FUEL.veg }]}>
                    <View style={[styles.vegDotFill, { backgroundColor: item.diet_type === 'non-veg' ? FUEL.nonVeg : FUEL.veg }]} />
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
                  { label: 'Calories', val: aiMeal.totals.calories, color: FUEL.ink },
                  { label: 'Protein', val: `${Math.round(aiMeal.totals.protein)}g`, color: FUEL.protein },
                  { label: 'Carbs', val: `${Math.round(aiMeal.totals.carbs)}g`, color: FUEL.carbs },
                  { label: 'Fat', val: `${Math.round(aiMeal.totals.fat)}g`, color: FUEL.fat },
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
              <Ionicons name="cart" size={18} color={FUEL.ink} />
              <Text style={styles.orderMealText}>Order This Meal</Text>
            </TouchableOpacity>
          </View>
        )}

        {aiMeal && (!aiMeal.meal_items || aiMeal.meal_items.length === 0) && (
          <View style={styles.mealResultCard}>
            <View style={styles.mealErrorRow}>
              <Ionicons name="alert-circle" size={24} color={FUEL.warning} />
              <Text style={styles.mealErrorText}>{aiMeal.summary || 'Could not build meal. Try again.'}</Text>
            </View>
            <TouchableOpacity style={styles.retryBtn} onPress={resetBuilder}><Text style={styles.retryText}>Try Again</Text></TouchableOpacity>
          </View>
        )}

        {/* ===== P7: MY MEALS — saved builds, hidden when empty ===== */}
        {savedMeals.length > 0 && (
          <>
            <View style={styles.popularHeaderRow}>
              <Text style={styles.sectionTitle}>My Meals</Text>
              <Text style={styles.popularHint}>Saved builds • tap to order</Text>
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.myMealsScroll}
              testID="my-meals-row"
            >
              {savedMeals.map((meal) => (
                <TouchableOpacity
                  key={meal.id}
                  testID={`my-meal-${meal.id}`}
                  style={styles.myMealCard}
                  onPress={() => orderSavedMeal(meal)}
                  onLongPress={() => confirmDeleteSavedMeal(meal)}
                  activeOpacity={0.9}
                >
                  <View style={styles.myMealTopRow}>
                    <Ionicons name="bookmark" size={13} color={FUEL.limeDeep} />
                    <Text style={styles.myMealName} numberOfLines={1}>{meal.name}</Text>
                    <TouchableOpacity
                      testID={`my-meal-delete-${meal.id}`}
                      onPress={() => confirmDeleteSavedMeal(meal)}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Ionicons name="close" size={15} color={FUEL.muted} />
                    </TouchableOpacity>
                  </View>
                  <Text style={styles.myMealMeta}>
                    {Math.round(meal.macros?.calories || 0)} kcal · <Text style={{ color: FUEL.protein }}>{Math.round(meal.macros?.protein || 0)}g P</Text>
                  </Text>
                  <View style={styles.myMealBottomRow}>
                    <Text style={styles.myMealPrice}>₹{Math.round(meal.price_estimate || 0)}</Text>
                    <View style={styles.myMealAddChip}>
                      <Ionicons name="cart" size={11} color={FUEL.ink} />
                      <Text style={styles.myMealAddText}>ADD</Text>
                    </View>
                  </View>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </>
        )}

        {/* ===== POPULAR ITEMS — best sellers, 5-row horizontal grid (Swiggy-style) ===== */}
        <View style={styles.popularHeaderRow}>
          <Text style={styles.sectionTitle}>Popular Items</Text>
          <Text style={styles.popularHint}>Best sellers • swipe →</Text>
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.popularGridScroll}
          removeClippedSubviews={true}
        >
          {popularColumns.map((col, ci) => (
            <View key={ci} style={styles.popularColumn}>
              {col.map((item, ri) => renderPopularCard(item, ci * POPULAR_ROWS + ri))}
            </View>
          ))}
        </ScrollView>

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Floating AI Chat Button — ink with lime accent */}
      <TouchableOpacity
        style={[styles.floatingAiBtn, cartCtx.count > 0 && { bottom: 76 }]}
        onPress={() => router.push('/ai-chat')}
        activeOpacity={0.9}
        testID="floating-ai-chat-btn"
      >
        <View style={styles.floatingAiInner}>
          <Ionicons name="chatbubbles" size={22} color={FUEL.lime} />
        </View>
        <View style={styles.floatingAiBadge}>
          <Ionicons name="sparkles" size={10} color={FUEL.ink} />
        </View>
      </TouchableOpacity>

      {/* ===== FIX 1: Delivery Address Modal ===== */}
      <Modal visible={showAddressModal} transparent animationType="slide" onRequestClose={() => setShowAddressModal(false)}>
        <View style={styles.addrOverlay}>
          <View style={styles.addrSheet}>
            <View style={styles.addrHandle} />
            <View style={styles.addrHeader}>
              <Text style={styles.addrTitle}>Delivery Address</Text>
              <TouchableOpacity testID="addr-close-btn" onPress={() => setShowAddressModal(false)}>
                <Ionicons name="close-circle" size={26} color={FUEL.sandBorder} />
              </TouchableOpacity>
            </View>

            {!!deliveryAddress && (
              <View style={styles.addrCurrent}>
                <Ionicons name="checkmark-circle" size={16} color={FUEL.success} />
                <Text style={styles.addrCurrentText} numberOfLines={2}>{deliveryAddress}</Text>
              </View>
            )}

            <TouchableOpacity testID="detect-location-btn" style={styles.addrDetectBtn} onPress={detectLocation} disabled={locating} activeOpacity={0.85}>
              {locating ? (
                <><ActivityIndicator color={FUEL.ink} size="small" /><Text style={styles.addrDetectText}>Detecting your location…</Text></>
              ) : (
                <><Ionicons name="navigate" size={18} color={FUEL.ink} /><Text style={styles.addrDetectText}>Use my current location</Text></>
              )}
            </TouchableOpacity>

            {!!locationError && (
              <View style={styles.addrErrorRow} testID="addr-error">
                <Ionicons name="alert-circle" size={14} color={FUEL.error} />
                <Text style={styles.addrErrorText}>{locationError}</Text>
              </View>
            )}

            <View style={styles.addrDividerRow}>
              <View style={styles.addrDividerLine} />
              <Text style={styles.addrDividerText}>OR ENTER MANUALLY</Text>
              <View style={styles.addrDividerLine} />
            </View>

            <TextInput
              testID="manual-address-input"
              style={styles.addrInput}
              value={manualAddress}
              onChangeText={setManualAddress}
              placeholder="House / Flat, Street, Area, City"
              placeholderTextColor={FUEL.muted}
              multiline
            />
            <TouchableOpacity testID="save-address-btn" style={styles.addrSaveBtn} onPress={saveManualAddress} activeOpacity={0.85}>
              <Ionicons name="checkmark" size={18} color={FUEL.ink} />
              <Text style={styles.addrSaveText}>Save Address</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
      <CartPill bottom={6} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: FUEL.sand },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  // Goal-first ordering
  goalSelector: { paddingHorizontal: SPACE.l, marginTop: SPACE.l },
  goalSelectorTitle: { fontFamily: FONT.display, fontSize: 22, color: FUEL.ink, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: SPACE.m },
  goalSelectorRow: { flexDirection: 'row', gap: SPACE.s, paddingRight: SPACE.l },
  goalSelectorChip: { flexDirection: 'row', alignItems: 'center', gap: SPACE.s, paddingVertical: SPACE.m, paddingHorizontal: SPACE.l, borderRadius: 999, backgroundColor: FUEL.white, borderWidth: 1.5, borderColor: FUEL.sandBorder },
  goalSelectorChipActive: { backgroundColor: FUEL.ink, borderColor: FUEL.ink },
  goalSelectorLabel: { fontFamily: FONT.bodyExtrabold, fontSize: 13, color: FUEL.ink, textTransform: 'uppercase', letterSpacing: 0.3 },
  goalSelectorLabelActive: { color: FUEL.lime },

  // Phase 2/3: personalized daily target banner
  targetBanner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: FUEL.ink, borderRadius: RADIUS.md, paddingVertical: SPACE.m, paddingHorizontal: SPACE.l, marginTop: SPACE.m },
  targetBannerLeft: { flex: 1 },
  targetBannerLabel: { fontFamily: FONT.bodyBold, fontSize: 10.5, color: FUEL.sand, opacity: 0.7, letterSpacing: 1 },
  targetBannerValue: { fontFamily: FONT.bodyExtrabold, fontSize: 16, color: FUEL.lime, marginTop: 3 },
  targetBannerCta: { flexDirection: 'row', alignItems: 'center', gap: SPACE.xs, backgroundColor: FUEL.lime, borderRadius: RADIUS.lg, paddingHorizontal: SPACE.m, paddingVertical: SPACE.s },
  targetBannerCtaText: { fontFamily: FONT.bodyExtrabold, fontSize: 11.5, color: FUEL.ink, letterSpacing: 0.5 },
  targetSetup: { flexDirection: 'row', alignItems: 'center', gap: SPACE.s, backgroundColor: FUEL.limeTint, borderRadius: RADIUS.md, paddingVertical: SPACE.m, paddingHorizontal: SPACE.l, marginTop: SPACE.m },
  targetSetupText: { flex: 1, fontFamily: FONT.bodySemibold, fontSize: 13, color: '#4F5A2E' },
  nudgeBanner: { flexDirection: 'row', alignItems: 'center', gap: SPACE.s, backgroundColor: FUEL.limeTint, borderRadius: RADIUS.md, paddingVertical: SPACE.m, paddingHorizontal: SPACE.m, marginTop: SPACE.m },
  nudgeBannerEmoji: { fontSize: 16 },
  nudgeBannerText: { flex: 1, fontFamily: FONT.bodySemibold, fontSize: 12.5, color: '#4F5A2E', lineHeight: 17 },
  nudgeStreakChip: { backgroundColor: FUEL.ink, borderRadius: 999, paddingHorizontal: SPACE.s, paddingVertical: 3 },
  nudgeStreakText: { fontFamily: FONT.bodyExtrabold, fontSize: 10, color: FUEL.lime, letterSpacing: 0.3 },

  // Header (ink)
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACE.l,
    paddingTop: SPACE.s,
    paddingBottom: SPACE.m,
    backgroundColor: FUEL.ink,
  },
  menuBtn: {
    width: 44,
    height: 44,
    borderRadius: RADIUS.md,
    backgroundColor: FUEL.inkSoft,
    alignItems: 'center',
    justifyContent: 'center'
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18, // circle
    backgroundColor: FUEL.lime,
    alignItems: 'center',
    justifyContent: 'center'
  },
  avatarInitial: {
    fontFamily: FONT.display,
    fontSize: 16,
    color: FUEL.ink,
    textTransform: 'uppercase',
  },

  // Order type toggle
  orderToggle: {
    flexDirection: 'row',
    backgroundColor: FUEL.inkSoft,
    borderRadius: RADIUS.pill,
    padding: SPACE.xs
  },
  toggleBtn: {
    paddingHorizontal: SPACE.l,
    paddingVertical: SPACE.m,
    borderRadius: RADIUS.lg
  },
  toggleBtnActive: {
    backgroundColor: FUEL.lime
  },
  toggleText: {
    fontFamily: FONT.display,
    fontSize: 12,
    color: 'rgba(244,241,233,0.55)',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  toggleTextActive: {
    color: FUEL.ink
  },

  // Location bar — ink-soft rounded bar
  locationBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: FUEL.inkSoft,
    marginHorizontal: SPACE.l,
    marginTop: SPACE.m,
    paddingHorizontal: SPACE.m,
    paddingVertical: SPACE.m,
    gap: SPACE.m,
    borderRadius: RADIUS.md,
  },
  locationIconBox: {
    width: 34,
    height: 34,
    borderRadius: RADIUS.sm,
    backgroundColor: 'rgba(199,242,78,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  locationText: {
    fontFamily: FONT.bodyExtrabold,
    fontSize: 9.5,
    color: 'rgba(244,241,233,0.55)',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  locationValue: {
    flex: 1,
  },
  locationNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.xs,
  },
  locationName: {
    flexShrink: 1,
    fontFamily: FONT.bodySemibold,
    fontSize: 13.5,
    color: FUEL.sand,
    marginTop: 1,
  },
  detectChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.xs,
    backgroundColor: FUEL.lime,
    borderRadius: RADIUS.lg,
    paddingHorizontal: SPACE.m,
    paddingVertical: SPACE.s,
  },
  detectChipText: {
    fontFamily: FONT.display,
    fontSize: 10.5,
    color: FUEL.ink,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },

  // Banners — dark hero (ink + lime)
  bannerList: { marginTop: SPACE.m },
  banner: {
    width: width - 32,
    marginHorizontal: SPACE.l,
    borderRadius: RADIUS.lg,
    padding: SPACE.xl,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    minHeight: 160,
    backgroundColor: FUEL.ink,
    shadowColor: FUEL.ink,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 6,
  },
  bannerContent: { flex: 1 },
  bannerTitle: { fontFamily: FONT.display, fontSize: 28, color: FUEL.sand, letterSpacing: 0.8, textTransform: 'uppercase' },
  bannerSub: { fontFamily: FONT.bodySemibold, fontSize: 14, color: 'rgba(244,241,233,0.85)', marginTop: SPACE.s },
  bannerDiscountCircle: {
    width: 70,
    height: 70,
    borderRadius: 35, // circle
    backgroundColor: FUEL.lime,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: SPACE.m,
    borderWidth: 3,
    borderColor: 'rgba(199,242,78,0.4)',
  },
  bannerDiscountPercent: { fontFamily: FONT.display, fontSize: 20, color: FUEL.ink },
  bannerDiscountLabel: { fontFamily: FONT.bodyExtrabold, fontSize: 10, color: FUEL.ink, textTransform: 'uppercase', letterSpacing: 0.5 },
  bannerBadge: { flexDirection: 'row', alignItems: 'center', gap: SPACE.xs, backgroundColor: FUEL.inkSoft, alignSelf: 'flex-start', paddingHorizontal: SPACE.m, paddingVertical: SPACE.xs, borderRadius: RADIUS.lg, marginTop: SPACE.s },
  bannerBadgeText: { fontFamily: FONT.bodyExtrabold, fontSize: 11, color: FUEL.lime, letterSpacing: 0.5 },
  bannerImagePlaceholder: { width: 100, height: 100, alignItems: 'center', justifyContent: 'center' },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: SPACE.s, marginTop: SPACE.m },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: FUEL.sandBorder }, // circle
  dotActive: { backgroundColor: FUEL.limeDeep, width: 24 },

  // Category Grid
  sectionTitle: { fontFamily: FONT.display, fontSize: 24, color: FUEL.ink, paddingHorizontal: SPACE.l, marginTop: SPACE.xl, marginBottom: SPACE.l, letterSpacing: 0.3, textTransform: 'uppercase' },
  categoryChipRow: { flexDirection: 'row', gap: SPACE.s, paddingHorizontal: SPACE.l, paddingRight: SPACE.xl },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.s,
    paddingVertical: SPACE.s,
    paddingHorizontal: SPACE.m,
    borderRadius: 999,
    backgroundColor: FUEL.white,
    borderWidth: 1.5,
    borderColor: FUEL.sandBorder,
  },
  categoryChipThumb: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  categoryChipThumbAi: {
    backgroundColor: FUEL.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  categoryChipLabel: {
    fontFamily: FONT.bodyExtrabold,
    fontSize: 12,
    color: FUEL.ink,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },

  // Nutrition Card
  nutriCard: { backgroundColor: FUEL.white, marginHorizontal: SPACE.l, marginTop: SPACE.l, borderRadius: RADIUS.md, padding: SPACE.l, borderWidth: 1, borderColor: FUEL.sandBorder },
  nutriHeader: { flexDirection: 'row', alignItems: 'center', gap: SPACE.s, marginBottom: SPACE.l },
  nutriTitle: { flex: 1, fontFamily: FONT.display, fontSize: 16, color: FUEL.ink, textTransform: 'uppercase', letterSpacing: 0.3 },
  nutriMeals: { fontFamily: FONT.body, fontSize: 12, color: FUEL.muted },
  nutriRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  nutriMain: { flexDirection: 'row', alignItems: 'baseline', gap: SPACE.xs },
  calValue: { fontFamily: FONT.display, fontSize: 34, color: FUEL.ink },
  calUnit: { fontFamily: FONT.body, fontSize: 13, color: FUEL.muted },
  macroRow: { flexDirection: 'row', gap: SPACE.l },
  macroItem: { alignItems: 'center' },
  macroVal: { fontFamily: FONT.bodyExtrabold, fontSize: 16 },
  macroLabel: { fontFamily: FONT.bodyMedium, fontSize: 10, color: FUEL.muted, marginTop: 2, textTransform: 'uppercase', letterSpacing: 0.5 },
  progressBg: { height: 6, backgroundColor: FUEL.sandBorder, borderRadius: RADIUS.pill, marginTop: SPACE.l, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: FUEL.limeDeep, borderRadius: RADIUS.xs },
  progressFillOver: { backgroundColor: FUEL.error },
  overGoalBanner: { flexDirection: 'row', alignItems: 'center', gap: SPACE.s, marginTop: SPACE.m, backgroundColor: FUEL.proteinTint, borderRadius: RADIUS.sm, paddingHorizontal: SPACE.m, paddingVertical: SPACE.s },
  overGoalText: { fontFamily: FONT.bodyBold, fontSize: 11, color: FUEL.error, flex: 1 },

  // Scan Table CTA
  scanTableCTA: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: FUEL.limeTint, marginHorizontal: SPACE.l, marginTop: SPACE.l, borderRadius: RADIUS.md, padding: SPACE.l, borderWidth: 1, borderColor: FUEL.success },
  scanCtaLeft: { flexDirection: 'row', alignItems: 'center', gap: SPACE.m, flex: 1 },
  scanCtaIconBg: { width: 44, height: 44, borderRadius: RADIUS.md, backgroundColor: FUEL.success, alignItems: 'center', justifyContent: 'center' },
  scanCtaTitle: { fontFamily: FONT.display, fontSize: 16, color: FUEL.success, textTransform: 'uppercase' },
  scanCtaSub: { fontFamily: FONT.bodyMedium, fontSize: 12, color: '#4F5A2E', marginTop: 2 },

  // AI Combo Builder CTA — dark hero card
  mealBuilderCTA: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: FUEL.ink, marginHorizontal: SPACE.l, marginTop: SPACE.l, borderRadius: RADIUS.md, padding: SPACE.l },
  ctaLeft: { flexDirection: 'row', alignItems: 'center', gap: SPACE.m, flex: 1 },
  heroCtaIconBg: { width: 44, height: 44, borderRadius: RADIUS.md, backgroundColor: FUEL.lime, alignItems: 'center', justifyContent: 'center' },
  heroCtaTitle: { fontFamily: FONT.display, fontSize: 16, color: FUEL.sand, textTransform: 'uppercase' },
  heroCtaSub: { fontFamily: FONT.bodyMedium, fontSize: 12, color: 'rgba(244,241,233,0.7)', marginTop: 2 },
  ctaIconBg: { width: 44, height: 44, borderRadius: RADIUS.md, backgroundColor: FUEL.ink, alignItems: 'center', justifyContent: 'center' },
  ctaTitle: { fontFamily: FONT.display, fontSize: 16, color: FUEL.ink, textTransform: 'uppercase' },
  ctaSub: { fontFamily: FONT.bodyMedium, fontSize: 12, color: FUEL.muted, marginTop: 2 },

  // Schedule for Later CTA
  scheduleCTA: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: FUEL.white, marginHorizontal: SPACE.l, marginTop: SPACE.m, borderRadius: RADIUS.md, padding: SPACE.l, borderWidth: 1, borderColor: FUEL.sandBorder },

  // Builder Card
  builderCard: { backgroundColor: FUEL.white, marginHorizontal: SPACE.l, marginTop: SPACE.l, borderRadius: RADIUS.md, padding: SPACE.l, borderWidth: 1, borderColor: FUEL.sandBorder },
  builderHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACE.l },
  builderTitleRow: { flexDirection: 'row', alignItems: 'center', gap: SPACE.s },
  builderTitle: { fontFamily: FONT.display, fontSize: 18, color: FUEL.ink, textTransform: 'uppercase' },
  builderLabel: { fontFamily: FONT.bodyExtrabold, fontSize: 13, color: FUEL.muted, marginBottom: SPACE.s, marginTop: SPACE.s, textTransform: 'uppercase', letterSpacing: 0.5 },
  dietRow: { flexDirection: 'row', gap: SPACE.s, marginBottom: SPACE.m },
  dietChip: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACE.s, paddingVertical: SPACE.m, borderRadius: RADIUS.pill, backgroundColor: FUEL.white, borderWidth: 1.5, borderColor: FUEL.sandBorder },
  dietText: { fontFamily: FONT.bodyBold, fontSize: 13, color: FUEL.muted },
  vegIndicator: { width: 14, height: 14, borderRadius: RADIUS.xs, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  vegDotInner: { width: 7, height: 7, borderRadius: RADIUS.xs },
  goalContainer: { marginBottom: SPACE.s },
  goalRow: { flexDirection: 'row', gap: SPACE.s, marginBottom: SPACE.m },
  goalGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.s },
  goalChip6: { flexBasis: '31%', flexGrow: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACE.xs, paddingVertical: SPACE.m, paddingHorizontal: SPACE.s, borderRadius: RADIUS.pill, backgroundColor: FUEL.white, borderWidth: 1.5, borderColor: FUEL.sandBorder },
  goalChip: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACE.xs, paddingVertical: SPACE.m, borderRadius: RADIUS.pill, backgroundColor: FUEL.white, borderWidth: 1.5, borderColor: FUEL.sandBorder },
  goalText: { fontFamily: FONT.bodyBold, fontSize: 11, color: FUEL.muted },
  budgetInput: { backgroundColor: FUEL.sand, borderRadius: RADIUS.md, padding: SPACE.l, color: FUEL.ink, fontFamily: FONT.bodySemibold, fontSize: 15, borderWidth: 1.5, borderColor: FUEL.sandBorder, marginBottom: SPACE.l },
  buildBtn: { backgroundColor: FUEL.lime, borderRadius: RADIUS.pill, paddingVertical: SPACE.l, alignItems: 'center', justifyContent: 'center' },
  buildBtnContent: { flexDirection: 'row', alignItems: 'center', gap: SPACE.s },
  buildBtnText: { color: FUEL.ink, fontFamily: FONT.display, fontSize: 15, textTransform: 'uppercase', letterSpacing: 0.5 },

  // Meal Result
  mealResultCard: { backgroundColor: FUEL.white, marginHorizontal: SPACE.l, marginTop: SPACE.l, borderRadius: RADIUS.md, padding: SPACE.l, borderWidth: 1, borderColor: FUEL.sandBorder },
  mealResultHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACE.m },
  mealResultTitleRow: { flexDirection: 'row', alignItems: 'center', gap: SPACE.s },
  mealResultTitle: { fontFamily: FONT.display, fontSize: 18, color: FUEL.ink, textTransform: 'uppercase' },
  rebuildBadge: { flexDirection: 'row', alignItems: 'center', gap: SPACE.xs, backgroundColor: FUEL.limeTint, paddingHorizontal: SPACE.m, paddingVertical: SPACE.s, borderRadius: RADIUS.lg },
  rebuildText: { fontFamily: FONT.bodyExtrabold, fontSize: 12, color: FUEL.limeDeep },
  mealSummary: { fontFamily: FONT.body, color: FUEL.muted, fontSize: 13, lineHeight: 19, marginBottom: SPACE.m },
  warningsContainer: { marginBottom: SPACE.m, gap: SPACE.s },
  warningItem: {
    flexDirection: 'row',
    backgroundColor: FUEL.carbsTint,
    borderLeftWidth: 3,
    borderLeftColor: FUEL.warning,
    padding: SPACE.m,
    borderRadius: RADIUS.sm,
  },
  warningPositive: {
    backgroundColor: FUEL.limeTint,
    borderLeftColor: FUEL.success,
  },
  warningCaution: {
    backgroundColor: FUEL.proteinTint,
    borderLeftColor: FUEL.ink,
  },
  warningText: {
    fontFamily: FONT.body,
    fontSize: 12,
    color: FUEL.muted,
    lineHeight: 18,
    flex: 1,
  },
  warningTextPositive: {
    color: FUEL.success,
    fontFamily: FONT.bodySemibold,
  },
  warningTextCaution: {
    color: FUEL.ink,
    fontFamily: FONT.bodySemibold,
  },
  mealItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: SPACE.m, borderBottomWidth: 1, borderBottomColor: FUEL.sandBorder },
  mealItemLeft: { flexDirection: 'row', alignItems: 'center', gap: SPACE.m, flex: 1 },
  vegDot: { width: 16, height: 16, borderRadius: RADIUS.xs, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  vegDotFill: { width: 8, height: 8, borderRadius: 4 }, // circle
  mealItemName: { fontFamily: FONT.bodyBold, fontSize: 14, color: FUEL.ink },
  mealItemReason: { fontFamily: FONT.body, fontSize: 11, color: FUEL.muted, marginTop: 2 },
  mealItemRight: { alignItems: 'flex-end' },
  mealItemGrams: { fontFamily: FONT.bodyExtrabold, fontSize: 15, color: FUEL.ink },
  mealItemPrice: { fontFamily: FONT.body, fontSize: 12, color: FUEL.muted, marginTop: 2 },
  mealTotals: { backgroundColor: FUEL.sand, borderRadius: RADIUS.md, padding: SPACE.l, marginTop: SPACE.l },
  totalRow: { flexDirection: 'row', justifyContent: 'space-around', marginBottom: SPACE.m },
  totalItem: { alignItems: 'center' },
  totalLabel: { fontFamily: FONT.bodyMedium, fontSize: 10, color: FUEL.muted, marginBottom: 3, textTransform: 'uppercase' },
  totalValue: { fontFamily: FONT.bodyExtrabold, fontSize: 16 },
  totalPriceRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: 1, borderTopColor: FUEL.sandBorder, paddingTop: SPACE.m },
  totalPriceLabel: { fontFamily: FONT.bodySemibold, fontSize: 14, color: FUEL.muted },
  totalPriceValue: { fontFamily: FONT.display, fontSize: 24, color: FUEL.ink },
  orderMealBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACE.s, backgroundColor: FUEL.lime, borderRadius: RADIUS.pill, paddingVertical: SPACE.l, marginTop: SPACE.l },
  orderMealText: { color: FUEL.ink, fontFamily: FONT.display, fontSize: 15, textTransform: 'uppercase', letterSpacing: 0.5 },
  mealErrorRow: { flexDirection: 'row', alignItems: 'center', gap: SPACE.m },
  mealErrorText: { flex: 1, fontFamily: FONT.body, color: FUEL.muted, fontSize: 13, lineHeight: 18 },
  retryBtn: { backgroundColor: FUEL.lime, borderRadius: RADIUS.pill, paddingVertical: SPACE.m, alignItems: 'center', marginTop: SPACE.l },
  retryText: { color: FUEL.ink, fontFamily: FONT.display, fontSize: 14, textTransform: 'uppercase' },

  // P7: My Meals — saved builds row
  myMealsScroll: { paddingHorizontal: SPACE.l, gap: SPACE.m, paddingBottom: SPACE.xs },
  myMealCard: { width: 190, backgroundColor: FUEL.white, borderRadius: RADIUS.md, padding: SPACE.m, borderWidth: 1.5, borderColor: FUEL.lime },
  myMealTopRow: { flexDirection: 'row', alignItems: 'center', gap: SPACE.xs },
  myMealName: { flex: 1, fontFamily: FONT.bodyExtrabold, fontSize: 13, color: FUEL.ink },
  myMealMeta: { fontFamily: FONT.bodySemibold, fontSize: 11, color: FUEL.muted, marginTop: SPACE.s },
  myMealBottomRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: SPACE.s },
  myMealPrice: { fontFamily: FONT.display, fontSize: 16, color: FUEL.ink },
  myMealAddChip: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: FUEL.lime, borderRadius: RADIUS.lg, paddingHorizontal: SPACE.m, paddingVertical: SPACE.xs },
  myMealAddText: { fontFamily: FONT.bodyExtrabold, fontSize: 10, color: FUEL.ink, letterSpacing: 0.3 },

  // Popular Items — compact cards
  popularScroll: { paddingHorizontal: SPACE.m, gap: SPACE.m },
  popularHeaderRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', paddingRight: SPACE.l },
  popularHint: { fontFamily: FONT.bodyBold, fontSize: 11, color: FUEL.muted, marginBottom: SPACE.l, textTransform: 'uppercase', letterSpacing: 0.3 },
  popularGridScroll: { paddingHorizontal: SPACE.m, gap: SPACE.m, paddingBottom: SPACE.xs },
  popularColumn: { gap: SPACE.m },
  popularCard: {
    width: 156,
    backgroundColor: FUEL.white,
    borderRadius: RADIUS.md,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: FUEL.sandBorder,
    shadowColor: FUEL.ink,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 4,
  },
  popularImg: { width: '100%', height: 90, backgroundColor: FUEL.sand },
  popularImgPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  popularBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
    backgroundColor: FUEL.ink,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: SPACE.s,
    paddingVertical: SPACE.xs,
    borderRadius: RADIUS.lg,
  },
  popularBadgeText: { fontFamily: FONT.bodyExtrabold, fontSize: 8, color: FUEL.white, textTransform: 'uppercase', letterSpacing: 0.3 },
  proteinBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: FUEL.ink,
    paddingHorizontal: SPACE.s,
    paddingVertical: SPACE.xs,
    borderRadius: RADIUS.lg,
    alignItems: 'center',
  },
  proteinText: { fontFamily: FONT.bodyExtrabold, fontSize: 13, color: FUEL.lime },
  proteinLabel: { fontFamily: FONT.bodyMedium, fontSize: 8, color: 'rgba(244,241,233,0.8)', textTransform: 'uppercase' },
  vegBadge: {
    position: 'absolute',
    top: 66,
    right: 8,
    width: 18,
    height: 18,
    borderRadius: RADIUS.xs,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: FUEL.white
  },
  vegBadgeDot: { width: 9, height: 9, borderRadius: RADIUS.xs },
  popularInfo: { padding: SPACE.s },
  popularName: { fontFamily: FONT.bodyExtrabold, fontSize: 14, color: FUEL.ink },
  popularDesc: { fontFamily: FONT.body, fontSize: 11, color: FUEL.muted, marginTop: 3 },
  popularBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: SPACE.s },
  popularPrice: { fontFamily: FONT.display, fontSize: 15, color: FUEL.ink },
  per100: { fontFamily: FONT.body, fontSize: 9, color: FUEL.muted },
  popQtyBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: FUEL.ink, borderRadius: RADIUS.lg, paddingHorizontal: 3 },
  popQtyBtn: { paddingHorizontal: SPACE.xs, paddingVertical: SPACE.s },
  popQtyText: { color: FUEL.white, fontFamily: FONT.bodyExtrabold, fontSize: 11, minWidth: 30, textAlign: 'center' },
  addBtn: { backgroundColor: FUEL.lime, paddingHorizontal: SPACE.l, paddingVertical: SPACE.s, borderRadius: RADIUS.lg },
  addBtnText: { color: FUEL.ink, fontFamily: FONT.bodyExtrabold, fontSize: 12, textTransform: 'uppercase' },

  // Floating AI Button — ink with lime accent
  floatingAiBtn: { position: 'absolute', bottom: 90, right: 20, width: 56, height: 56, borderRadius: 28, backgroundColor: FUEL.ink, alignItems: 'center', justifyContent: 'center', shadowColor: FUEL.ink, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.3, shadowRadius: 10, elevation: 10 }, // circle
  floatingAiInner: { width: 56, height: 56, borderRadius: 28, backgroundColor: FUEL.ink, alignItems: 'center', justifyContent: 'center' }, // circle
  floatingAiBadge: { position: 'absolute', top: -2, right: -2, width: 20, height: 20, borderRadius: 10, backgroundColor: FUEL.lime, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: FUEL.white }, // circle

  // Delivery Address Modal (FIX 1)
  addrOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  addrSheet: { backgroundColor: FUEL.sand, borderTopLeftRadius: RADIUS.lg, borderTopRightRadius: RADIUS.lg, padding: SPACE.xl, paddingBottom: SPACE.xxl },
  addrHandle: { alignSelf: 'center', width: 44, height: 5, borderRadius: RADIUS.xs, backgroundColor: FUEL.sandBorder, marginBottom: SPACE.l },
  addrHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: SPACE.l },
  addrTitle: { fontFamily: FONT.display, fontSize: 22, color: FUEL.ink, textTransform: 'uppercase', letterSpacing: 0.5 },
  addrCurrent: { flexDirection: 'row', alignItems: 'center', gap: SPACE.s, backgroundColor: FUEL.limeTint, borderRadius: RADIUS.md, padding: SPACE.m, marginBottom: SPACE.l },
  addrCurrentText: { flex: 1, fontFamily: FONT.bodySemibold, fontSize: 13, color: FUEL.ink },
  addrDetectBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACE.s, backgroundColor: FUEL.lime, borderRadius: RADIUS.md, paddingVertical: SPACE.l },
  addrDetectText: { color: FUEL.ink, fontFamily: FONT.display, fontSize: 15, textTransform: 'uppercase', letterSpacing: 0.5 },
  addrErrorRow: { flexDirection: 'row', alignItems: 'center', gap: SPACE.s, backgroundColor: FUEL.proteinTint, borderRadius: RADIUS.sm, padding: SPACE.m, marginTop: SPACE.m },
  addrErrorText: { flex: 1, fontFamily: FONT.bodySemibold, fontSize: 12, color: FUEL.error },
  addrDividerRow: { flexDirection: 'row', alignItems: 'center', gap: SPACE.m, marginVertical: SPACE.l },
  addrDividerLine: { flex: 1, height: 1, backgroundColor: FUEL.sandBorder },
  addrDividerText: { fontFamily: FONT.bodyExtrabold, fontSize: 10, color: FUEL.muted, letterSpacing: 0.5 },
  addrInput: { backgroundColor: FUEL.white, borderRadius: RADIUS.md, padding: SPACE.l, minHeight: 64, color: FUEL.ink, fontFamily: FONT.bodySemibold, fontSize: 14, borderWidth: 1.5, borderColor: FUEL.sandBorder, textAlignVertical: 'top' },
  addrSaveBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACE.s, backgroundColor: FUEL.lime, borderRadius: RADIUS.md, paddingVertical: SPACE.l, marginTop: SPACE.l },
  addrSaveText: { color: FUEL.ink, fontFamily: FONT.display, fontSize: 15, textTransform: 'uppercase', letterSpacing: 0.5 },
});
