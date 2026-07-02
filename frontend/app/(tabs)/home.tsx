import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Image,
  RefreshControl, FlatList, Dimensions, ActivityIndicator, Alert, Modal, Animated
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiCall, getStoredUser } from '../../utils/api';
import SideDrawer from '../components/SideDrawer';
import CartPill from '../components/CartPill';
import { useCart } from '../../utils/CartContext';
import { useStore } from '../../utils/StoreContext';
import { FUEL, FONT, GOALS as FUEL_GOALS, RADIUS, SPACE } from '../../utils/theme';
import { DIET_TAGS, DIET_LABEL, toggleDietTag } from '../../utils/diet';
import PressableScale from '../components/PressableScale';
import * as Haptics from 'expo-haptics';
import { setTabBarHidden, resetTabBar } from '../../utils/tabBar';

// Active-order status vocabulary (from server.py). The order-on-the-way widget
// shows only while the order is in one of these states; anything else
// (delivered / completed / cancelled) hides it.
const ACTIVE_ORDER_STATUSES = ['pending', 'accepted', 'preparing', 'ready', 'out_for_delivery'];
const ORDER_STAGE = {
  pending: { label: 'Order placed', icon: 'receipt', pct: 0.15 },
  accepted: { label: 'Order confirmed', icon: 'checkmark-circle', pct: 0.35 },
  preparing: { label: 'Preparing your meal', icon: 'restaurant', pct: 0.6 },
  ready: { label: 'Ready for pickup', icon: 'bag-check', pct: 0.85 },
  out_for_delivery: { label: 'Out for delivery', icon: 'bicycle', pct: 0.9 },
} as const;

// Hero fallback imagery (brand / healthy-lifestyle) used when a banner has no
// image_url. Real banners come from /banners so this stays admin-driven.
const HERO_FALLBACK_IMAGES = [
  'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=900&h=800&fit=crop',
  'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=900&h=800&fit=crop',
  'https://images.unsplash.com/photo-1467003909585-2f8a72700288?w=900&h=800&fit=crop',
];

// PR-C: success haptic on add-to-cart (safe no-op on web)
const hapticSuccess = () => {
  try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {}); } catch {}
};

const { width } = Dimensions.get('window');

// Offers carousel (v5 ticket cards): ~78% width so the next card peeks.
const OFFER_CARD_W = Math.round(width * 0.78);
const OFFER_GAP = 12;
const OFFER_SNAP = OFFER_CARD_W + OFFER_GAP;
const OFFER_ACCENTS = [FUEL.lime, FUEL.protein, FUEL.carbs]; // rotates by index

// percentage="{v}% OFF", flat="₹{v} OFF", bogo="BUY 1 GET 1"
const offerValueText = (item: any): string => {
  const v = item?.discount_value ?? 0;
  if (item?.discount_type === 'bogo') return 'BUY 1 GET 1';
  if (item?.discount_type === 'flat') return `₹${v} OFF`;
  return `${v}% OFF`;
};

// Inline AI Combo Builder goals — derived from the canonical GOALS (all 6),
// never a hardcoded subset. Keys match /ai/quick-meal; label is the short form.
const COMBO_GOALS = FUEL_GOALS.map(g => ({ key: g.key, label: g.shortLabel }));
const COMBO_MIN_BUDGET = 50;

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
  const { selectedStoreId } = useStore();
  const [user, setUser] = useState<any>(null);
  const [summary, setSummary] = useState<any>(null);
  const [products, setProducts] = useState<any[]>([]);
  const [menuCats, setMenuCats] = useState<any[]>([]);  // F2: DB taxonomy (fallback: MENU_CATEGORIES)
  const [banners, setBanners] = useState<any[]>([]);
  const [packs, setPacks] = useState<any[]>([]);        // meal packs (/packs)
  const [goalFit, setGoalFit] = useState<any[]>([]);    // "Best for your goal" (/products/goal-fit)
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false); // FIX 5: Home resilience — show a retry block when the core load fails
  const bannerRef = useRef<FlatList>(null);
  const [bannerIdx, setBannerIdx] = useState(0);
  // Offers popup (NET-NEW): bottom-sheet shown once/day/user after first load
  const [showOffersPopup, setShowOffersPopup] = useState(false);
  const offersPopupChecked = useRef(false);

  // Side drawer state
  const [drawerVisible, setDrawerVisible] = useState(false);

  // Hero carousel + sticky-header scroll state
  const insets = useSafeAreaInsets();
  const [heroIdx, setHeroIdx] = useState(0);
  const scrollY = useRef(new Animated.Value(0)).current;
  const lastY = useRef(0);

  // Live order-on-the-way widget (customer's own active order)
  const [activeOrder, setActiveOrder] = useState<any>(null);
  const loadActiveOrder = useCallback(async () => {
    try {
      const orders = await apiCall('/orders'); // customer: own orders, newest first
      const active = Array.isArray(orders)
        ? orders.find((o: any) => ACTIVE_ORDER_STATUSES.includes(o.status))
        : null;
      setActiveOrder(active || null);
    } catch { setActiveOrder(null); }
  }, []);

  // Unread notifications count for the header bell badge
  const [notifUnread, setNotifUnread] = useState(0);
  const loadNotifCount = useCallback(async () => {
    try {
      const list = await apiCall('/notifications');
      setNotifUnread(Array.isArray(list) ? list.filter((n: any) => !n.read).length : 0);
    } catch { setNotifUnread(0); }
  }, []);

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

  // Show the offers popup once per day per user, only when active offers exist.
  // Data source: the type:'offer' entries from /banners (the active-offers feed
  // Home already loads) — no new endpoint. Frequency key: per-user YYYY-MM-DD.
  const maybeShowOffersPopup = useCallback(async (bannerList: any[], u: any) => {
    if (offersPopupChecked.current) return;
    const offers = (bannerList || []).filter((x: any) => x.type === 'offer' && x.offer_id);
    if (!offers.length) return;
    const key = `offers_popup_last_shown_${u?.id || 'anon'}`;
    const today = new Date().toISOString().slice(0, 10);
    try {
      const last = await AsyncStorage.getItem(key);
      offersPopupChecked.current = true; // one decision per app session
      if (last === today) return;        // already shown today → skip
      await AsyncStorage.setItem(key, today);
      setShowOffersPopup(true);
    } catch { offersPopupChecked.current = true; }
  }, []);

  const loadData = useCallback(async () => {
    // Store-scoped best-sellers/fallback so per-store price & availability show on Home.
    const storeQ = selectedStoreId ? `?store_id=${selectedStoreId}` : '';
    try {
      const [u, s, best, b, cats, pk, gf] = await Promise.all([
        getStoredUser(),
        apiCall('/user/nutrition-summary').catch(() => null),
        apiCall(`/products/best-sellers${storeQ}`).catch(() => apiCall(`/products${storeQ}`)).catch(() => []),
        apiCall('/banners').catch(() => []), // FIX 5: never let a banners failure blank the whole Home
        apiCall('/categories').catch(() => []),
        apiCall('/packs').catch(() => []),
        apiCall('/products/goal-fit').catch(() => null),
      ]);
      setPacks(Array.isArray(pk) ? pk : []);
      setGoalFit(gf?.products ? gf.products.filter((p: any) => p.goal_fit).slice(0, 8) : []);
      // Map any store `selling_price` (override) onto the price fields the cards read.
      const bestPriced = Array.isArray(best) ? best.map((p: any) => (
        p?.selling_price == null ? p
          : p.product_type === 'ready_made' ? { ...p, fixed_price: p.selling_price }
          : { ...p, cost_per_100g: p.selling_price }
      )) : best;
      setUser(u); setSummary(s); setProducts(bestPriced); setBanners(b);
      setMenuCats(Array.isArray(cats) && cats.length ? cats : []);
      setLoadError(false);
      loadTarget();
      loadSavedMeals();
      loadActiveOrder();
      loadNotifCount();
      maybeShowOffersPopup(b, u);
    } catch (e) { setLoadError(true); } finally { setLoading(false); }
  }, [selectedStoreId, loadTarget, loadSavedMeals, loadActiveOrder, loadNotifCount, maybeShowOffersPopup]);

  // Re-fetch on mount and whenever the selected store changes (store-scoped Home).
  useEffect(() => { loadData(); }, [loadData]);
  // Refresh the personalized target, saved meals and the live order status
  // whenever Home regains focus; also restore the tab bar (it may have been
  // hidden by scroll on a previous visit).
  useFocusEffect(useCallback(() => {
    loadTarget(); loadSavedMeals(); loadActiveOrder(); loadNotifCount(); resetTabBar();
  }, [loadTarget, loadSavedMeals, loadActiveOrder, loadNotifCount]));
  useEffect(() => {
    AsyncStorage.getItem('delivery_address').then(a => { if (a) setDeliveryAddress(a); }).catch(() => {});
  }, []);
  useEffect(() => {
    if (params.openAi) { setShowMealBuilder(true); }
  }, [params.openAi]);
  // Offers carousel: drive the dot pager from the snap position.
  const onOffersScroll = (e: any) => {
    const x = e?.nativeEvent?.contentOffset?.x || 0;
    const idx = Math.max(0, Math.min(banners.length - 1, Math.round(x / OFFER_SNAP)));
    if (idx !== bannerIdx) setBannerIdx(idx);
  };

  // Existing tap behavior: offer -> /offer-detail, pack -> /pack-detail.
  const handleBannerPress = (item: any) => {
    if (item.type === 'offer' && item.offer_id) {
      router.push({ pathname: '/offer-detail', params: { offerId: item.offer_id } });
    } else if (item.type === 'pack' && item.pack_id) {
      router.push({ pathname: '/pack-detail', params: { packId: item.pack_id } });
    }
  };

  const onRefresh = async () => { setRefreshing(true); await loadData(); setRefreshing(false); };

  // Drive header background + tab-bar hide/show from the scroll position.
  // (useNativeDriver:false because the header interpolates backgroundColor.)
  const onScroll = Animated.event(
    [{ nativeEvent: { contentOffset: { y: scrollY } } }],
    {
      useNativeDriver: false,
      listener: (e: any) => {
        const y = e?.nativeEvent?.contentOffset?.y || 0;
        if (y <= 6) setTabBarHidden(false);            // at top → always show
        else if (y > lastY.current + 6) setTabBarHidden(true);   // scroll down → hide
        else if (y < lastY.current - 6) setTabBarHidden(false);  // scroll up → show
        lastY.current = y;
      },
    }
  );

  // Header fades from transparent (over hero) to solid ink once scrolled in.
  const HERO_HEIGHT = 300;
  // The tab bar is position:absolute, so the scene runs full height and
  // bottom-anchored overlays must clear the bar (66) + the safe-area inset.
  const TAB_BAR_H = 66 + insets.bottom;
  const headerBg = scrollY.interpolate({
    inputRange: [0, HERO_HEIGHT - 120, HERO_HEIGHT - 60],
    outputRange: ['rgba(21,20,15,0)', 'rgba(21,20,15,0)', FUEL.ink],
    extrapolate: 'clamp',
  });

  // Active-order widget derived display data
  const orderStage = activeOrder ? (ORDER_STAGE as any)[activeOrder.status] : null;

  // Hero slides come from the /banners feed (admin-managed). Fall back to a
  // single brand slide when there are no banners yet.
  const heroSlides = banners.length > 0 ? banners : [{ id: '__brand__', __brand: true }];
  const onHeroScroll = (e: any) => {
    const x = e?.nativeEvent?.contentOffset?.x || 0;
    const idx = Math.max(0, Math.min(heroSlides.length - 1, Math.round(x / width)));
    if (idx !== heroIdx) setHeroIdx(idx);
  };

  const comboBudgetValid = parseFloat(mealBudget) >= COMBO_MIN_BUDGET;

  const consumed = summary?.consumed || {};
  const goals = summary?.goals || {};
  const calPct = goals.daily_calories ? (consumed.calories / goals.daily_calories) * 100 : 0;
  const isCalorieOver = calPct > 100;
  const caloriesOverAmount = Math.round((consumed.calories || 0) - (goals.daily_calories || 2000));

  // Avatar initial derived from the loaded user's name
  const userInitial = (user?.name || '').trim().charAt(0).toUpperCase();

  // Memoize popular products (best sellers, up to 30); shown as a single-row carousel
  const popularProducts = useMemo(() => products.slice(0, 30), [products]);

  const renderPopularCard = (item: any, idx: number) => {
    // v5 badge precedence (client-side only): HIGH PROTEIN -> BUDGET -> POPULAR
    const badge = item.protein_per_100g >= 20
      ? { label: 'HIGH PROTEIN', icon: 'barbell', bg: FUEL.ink, color: FUEL.lime }
      : item.cost_per_100g <= 15
        ? { label: 'BUDGET', icon: 'wallet', bg: FUEL.success, color: FUEL.white }
        : { label: 'POPULAR', icon: 'flame', bg: null, color: FUEL.lime };
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
        <View testID={`popular-badge-${item.id}`} style={[styles.popularBadge, badge.bg && { backgroundColor: badge.bg }]}>
          <Ionicons name={badge.icon as any} size={10} color={badge.color} />
          <Text style={styles.popularBadgeText}>{badge.label}</Text>
        </View>
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

  if (loading) return <SafeAreaView style={styles.safe} edges={['top']}><View style={styles.center}><ActivityIndicator size="large" color={FUEL.ink} /></View></SafeAreaView>;

  // FIX 5: if the core load failed and we have nothing to show, offer a retry
  // instead of a silently blank Home.
  if (!loading && loadError && products.length === 0) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.center} testID="home-error">
          <Ionicons name="cloud-offline-outline" size={48} color={FUEL.sandBorder} />
          <Text style={styles.homeErrorText}>Couldn't load. Check your connection.</Text>
          <TouchableOpacity testID="home-retry" style={styles.homeRetryBtn} onPress={() => { setLoading(true); loadData(); }} activeOpacity={0.85}>
            <Ionicons name="refresh" size={16} color={FUEL.lime} />
            <Text style={styles.homeRetryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <View style={styles.safe}>
      {/* Side Drawer */}
      <SideDrawer visible={drawerVisible} onClose={() => setDrawerVisible(false)} user={user} />

      <Animated.ScrollView
        onScroll={onScroll}
        scrollEventThrottle={16}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={FUEL.ink} progressViewOffset={insets.top + 44} />}
        showsVerticalScrollIndicator={false}
      >
        {/* ===== EDGE-TO-EDGE HERO CAROUSEL — admin-managed /banners feed ===== */}
        <View style={[styles.heroWrap, { height: HERO_HEIGHT }]}>
          <FlatList
            data={heroSlides}
            keyExtractor={(item: any) => item.id}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={onHeroScroll}
            testID="home-hero-carousel"
            style={{ height: HERO_HEIGHT }}
            renderItem={({ item, index }) => {
              const img = item.image_url || HERO_FALLBACK_IMAGES[index % HERO_FALLBACK_IMAGES.length];
              const isOffer = item.type === 'offer';
              const isPack = item.type === 'pack';
              const eyebrow = item.__brand ? 'EAT FOR YOUR GOAL' : isOffer ? 'LIMITED OFFER' : isPack ? 'MEAL PACK' : 'BORAROC';
              const firstName = (user?.name || '').trim().split(' ')[0];
              const title = item.__brand ? `Good to see you${firstName ? ', ' + firstName : ''}` : (item.title || 'Fuel your goal');
              const subtitle = item.__brand ? 'Fresh, macro-perfect meals built for your body.' : (item.subtitle || '');
              return (
                <TouchableOpacity
                  activeOpacity={item.__brand ? 1 : 0.9}
                  onPress={() => { if (!item.__brand) handleBannerPress(item); }}
                  style={[styles.heroSlide, { width, height: HERO_HEIGHT, paddingTop: insets.top + 64 }]}
                >
                  <Image source={{ uri: img }} style={styles.heroImg} resizeMode="cover" />
                  <LinearGradient
                    colors={['rgba(21,20,15,0.4)', 'rgba(21,20,15,0)', 'rgba(21,20,15,0.94)']}
                    locations={[0, 0.34, 1]}
                    style={StyleSheet.absoluteFill}
                  />
                  <View style={styles.heroContent}>
                    <Text style={styles.heroEyebrow}>{eyebrow}</Text>
                    <Text style={styles.heroTitle} numberOfLines={2}>{title}</Text>
                    {!!subtitle && <Text style={styles.heroSub} numberOfLines={2}>{subtitle}</Text>}
                    {isOffer && (
                      <View style={styles.heroCta}>
                        <Ionicons name="ticket-outline" size={13} color={FUEL.ink} />
                        <Text style={styles.heroCtaText}>{offerValueText(item)} · REDEEM</Text>
                      </View>
                    )}
                  </View>
                </TouchableOpacity>
              );
            }}
          />
          {heroSlides.length > 1 && (
            <View style={styles.heroDots}>
              {heroSlides.map((_: any, i: number) => (
                <View key={i} style={[styles.heroDot, i === heroIdx && styles.heroDotActive]} />
              ))}
            </View>
          )}
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

          {/* Phase 2/3: personalized daily target — compact row with streak inline */}
          {dailyTarget?.has_body_stats ? (
            <TouchableOpacity testID="home-daily-target" style={styles.targetCompact} activeOpacity={0.9} onPress={() => router.push('/meal-plan')}>
              <View style={styles.targetCompactIcon}>
                <Ionicons name="flame" size={15} color={FUEL.ink} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.targetCompactLabel}>DAILY TARGET</Text>
                <Text style={styles.targetCompactValue} numberOfLines={1}>
                  {dailyTarget.daily_calories} kcal · <Text style={{ color: FUEL.protein }}>{dailyTarget.daily_protein}g protein</Text>
                </Text>
              </View>
              {coachNudge?.streak_days > 0 ? (
                <View style={styles.targetStreakChip}>
                  <Text style={styles.targetStreakText}>🔥 {coachNudge.streak_days}</Text>
                </View>
              ) : null}
              <View style={styles.targetPlanBtn}>
                <Text style={styles.targetPlanText}>PLAN</Text>
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

        {/* ===== AI COMBO BUILDER — moved directly below goals/target ===== */}
        {!showMealBuilder && !aiMeal && (
          <View testID="open-meal-builder" style={styles.comboCard}>
            <View style={styles.comboTitleRow}>
              <View style={styles.heroCtaIconBg}>
                <Ionicons name="sparkles" size={18} color={FUEL.ink} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.comboTitle}>AI Combo Builder</Text>
                <Text style={styles.comboSub}>Budget + Goal = Perfect meal in seconds</Text>
              </View>
            </View>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.comboGoalRow}>
              {COMBO_GOALS.map(g => {
                const active = mealGoal === g.key;
                return (
                  <TouchableOpacity
                    key={g.key}
                    testID={`combo-goal-${g.key}`}
                    style={[styles.comboGoalChip, active && styles.comboGoalChipActive]}
                    onPress={() => setMealGoal(g.key)}
                    activeOpacity={0.85}
                  >
                    <Text style={[styles.comboGoalText, active && styles.comboGoalTextActive]}>{g.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            <View style={styles.comboBuildRow}>
              <TextInput
                testID="combo-budget-input"
                style={styles.comboBudgetInput}
                value={mealBudget}
                onChangeText={setMealBudget}
                placeholder={`₹ Budget (min ${COMBO_MIN_BUDGET})`}
                placeholderTextColor="rgba(244,241,233,0.5)"
                keyboardType="number-pad"
              />
              <PressableScale
                haptic
                testID="combo-build-btn"
                style={[styles.comboBuildBtn, (!comboBudgetValid || !mealGoal || aiLoading) && styles.comboBuildBtnDisabled]}
                disabled={!comboBudgetValid || !mealGoal || aiLoading}
                onPress={buildMeal}
              >
                {aiLoading ? (
                  <ActivityIndicator color={FUEL.ink} size="small" />
                ) : (
                  <Text style={styles.comboBuildText}>BUILD</Text>
                )}
              </PressableScale>
            </View>
          </View>
        )}

        {/* ===== OFFERS FOR YOU — v5 ticket carousel (data + routing kept) ===== */}
        {loading ? (
          <View style={styles.offerSkeletonRow}>
            <View style={styles.offerSkeletonCard} />
            <View style={[styles.offerSkeletonCard, styles.offerSkeletonPeek]} />
          </View>
        ) : banners.length > 0 ? (
          <>
            <View style={styles.popularHeaderRow}>
              <Text style={styles.sectionTitle}>Offers for you</Text>
            </View>
            <FlatList
              ref={bannerRef}
              testID="offers-carousel"
              horizontal
              showsHorizontalScrollIndicator={false}
              data={banners}
              keyExtractor={item => item.id}
              style={styles.offerList}
              contentContainerStyle={styles.offerListContent}
              snapToInterval={OFFER_SNAP}
              snapToAlignment="start"
              decelerationRate="fast"
              onMomentumScrollEnd={onOffersScroll}
              removeClippedSubviews={true}
              renderItem={({ item, index }) => {
                const isOffer = item.type === 'offer';
                const isPack = item.type === 'pack';
                const cardId = item.offer_id || item.pack_id || item.id;
                const img = item.image_url || HERO_FALLBACK_IMAGES[index % HERO_FALLBACK_IMAGES.length];
                const eyebrow = isOffer ? 'LIMITED OFFER' : isPack ? 'MEAL PACK' : 'BORAROC';
                return (
                  <TouchableOpacity
                    activeOpacity={0.9}
                    testID={`offer-card-${cardId}`}
                    style={styles.offerImgCard}
                    onPress={() => handleBannerPress(item)}
                  >
                    <Image source={{ uri: img }} style={styles.offerImg} resizeMode="cover" />
                    <LinearGradient
                      colors={['rgba(21,20,15,0.15)', 'rgba(21,20,15,0)', 'rgba(21,20,15,0.9)']}
                      locations={[0, 0.4, 1]}
                      style={StyleSheet.absoluteFill}
                    />
                    <View style={styles.offerImgContent}>
                      <View style={styles.offerImgTag}>
                        <Text style={styles.offerImgTagText}>{eyebrow}</Text>
                      </View>
                      <View>
                        {isOffer && <Text style={styles.offerImgValue} numberOfLines={1}>{offerValueText(item)}</Text>}
                        <Text style={styles.offerImgTitle} numberOfLines={1}>{item.title}</Text>
                        <View style={styles.offerImgBottom}>
                          <Text style={styles.offerImgSub} numberOfLines={1}>{item.subtitle || ''}</Text>
                          <View style={styles.offerImgBtn}>
                            <Text testID={`offer-redeem-${cardId}`} style={styles.offerImgBtnText}>
                              {isOffer ? 'REDEEM' : isPack ? 'VIEW' : 'EXPLORE'}
                            </Text>
                          </View>
                        </View>
                      </View>
                    </View>
                  </TouchableOpacity>
                );
              }}
            />
            <View style={styles.dots}>
              {banners.map((_, i) => (
                <View key={i} style={[styles.dot, i === bannerIdx && styles.dotActive]} />
              ))}
            </View>
          </>
        ) : null}

        {/* ===== CATEGORIES — photo circles (DB taxonomy + synthetic AI Picks) ===== */}
        <View style={styles.popularHeaderRow}>
          <Text style={styles.sectionTitle}>Our Menu</Text>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.catRow}>
          {[
            { key: 'ai', label: 'AI Picks', icon: 'sparkles', synthetic: true },
            ...(menuCats.length ? menuCats : MENU_CATEGORIES),
          ].map((cat: any) => {
            const img = cat.image_url || cat.image;
            return (
              <TouchableOpacity
                key={cat.key || cat.id}
                testID={`cat-chip-${cat.key}`}
                style={styles.catItem}
                onPress={() => handleCategoryPress(cat)}
                activeOpacity={0.85}
              >
                {cat.synthetic ? (
                  <View style={[styles.catCircle, styles.catCircleAi]}>
                    <Ionicons name="sparkles" size={24} color={FUEL.lime} />
                  </View>
                ) : img ? (
                  <Image source={{ uri: img }} style={styles.catCircle} />
                ) : (
                  <View style={[styles.catCircle, styles.catCircleAi, { backgroundColor: cat.color || FUEL.ink }]}>
                    <Ionicons name={(cat.icon as any) || 'grid'} size={22} color={FUEL.white} />
                  </View>
                )}
                <Text style={styles.catLabel} numberOfLines={1}>
                  {cat.synthetic ? 'AI Picks' : (cat.label || cat.name)}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* ===== MEAL PACKS — curated combos (/packs) ===== */}
        {packs.length > 0 && (
          <>
            <View style={styles.popularHeaderRow}>
              <Text style={styles.sectionTitle}>Meal Packs</Text>
              <Text style={styles.popularHint}>Curated combos</Text>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hScroll} testID="packs-row">
              {packs.map((p: any) => (
                <TouchableOpacity
                  key={p.id}
                  testID={`pack-${p.id}`}
                  style={styles.packCard}
                  activeOpacity={0.9}
                  onPress={() => router.push({ pathname: '/pack-detail', params: { packId: p.id } })}
                >
                  {p.image_url ? (
                    <Image source={{ uri: p.image_url }} style={styles.packImg} resizeMode="cover" />
                  ) : (
                    <View style={[styles.packImg, styles.packImgPlaceholder, { backgroundColor: p.banner_color || FUEL.ink }]}>
                      <Ionicons name="cube" size={26} color={FUEL.lime} />
                    </View>
                  )}
                  <View style={styles.packBody}>
                    <Text style={styles.packName} numberOfLines={1}>{p.name}</Text>
                    <Text style={styles.packMeta} numberOfLines={1}>
                      {p.total_calories} kcal · <Text style={{ color: FUEL.protein }}>{p.total_protein}g P</Text>
                    </Text>
                    <View style={styles.packBottom}>
                      <Text style={styles.packPrice}>₹{Math.round(p.pack_price || 0)}</Text>
                      <View style={styles.packViewBtn}><Text style={styles.packViewText}>VIEW</Text></View>
                    </View>
                  </View>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </>
        )}

        {/* ===== BEST FOR YOUR GOAL — personalized picks (/products/goal-fit) ===== */}
        {goalFit.length > 0 && (
          <>
            <View style={styles.popularHeaderRow}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Ionicons name="ribbon" size={15} color={FUEL.limeDeep} />
                <Text style={styles.sectionTitle}>Best for your goal</Text>
              </View>
              <Text style={styles.popularHint}>Picked for you</Text>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.popularGridScroll} testID="goal-fit-row">
              {goalFit.map((item: any, idx: number) => renderPopularCard(item, idx))}
            </ScrollView>
          </>
        )}

        {/* ===== AI COACH — chat + portion adjust ===== */}
        <View style={styles.popularHeaderRow}>
          <Text style={styles.sectionTitle}>AI Coach</Text>
        </View>
        <View style={styles.aiCoachRow}>
          <TouchableOpacity style={styles.aiCoachCard} onPress={() => router.push('/ai-chat')} testID="ai-coach-chat" activeOpacity={0.9}>
            <View style={styles.aiCoachIcon}><Ionicons name="chatbubbles" size={18} color={FUEL.limeDeep} /></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.aiCoachTitle}>AI Chat</Text>
              <Text style={styles.aiCoachSub}>Ask your coach</Text>
            </View>
          </TouchableOpacity>
          <TouchableOpacity style={styles.aiCoachCard} onPress={() => setShowMealBuilder(true)} testID="ai-coach-adjust" activeOpacity={0.9}>
            <View style={styles.aiCoachIcon}><Ionicons name="options" size={18} color={FUEL.limeDeep} /></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.aiCoachTitle}>Adjust Portions</Text>
              <Text style={styles.aiCoachSub}>Fine-tune macros</Text>
            </View>
          </TouchableOpacity>
        </View>

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
              {goals.daily_calories > 0 && !isCalorieOver && (
                <Text style={styles.calLeft}>{Math.round(goals.daily_calories - (consumed.calories || 0))} left</Text>
              )}
            </View>
            <View style={styles.macroRow}>
              {[
                { label: 'Protein', val: consumed.protein, goal: goals.daily_protein, color: FUEL.protein },
                { label: 'Carbs', val: consumed.carbs, goal: goals.daily_carbs, color: FUEL.carbs },
                { label: 'Fat', val: consumed.fat, goal: goals.daily_fat, color: FUEL.fat },
              ].map(m => (
                <View key={m.label} testID={`macro-chip-${m.label.toLowerCase()}`} style={styles.macroItem}>
                  <Text style={[styles.macroVal, { color: m.color }]}>
                    {m.goal > 0 ? `${Math.round(m.val || 0)}/${Math.round(m.goal)}g` : `${Math.round(m.val || 0)}g`}
                  </Text>
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

        {/* ===== QUICK ACTIONS — Reorder · Schedule · Scan ===== */}
        <View style={styles.quickRow}>
          <TouchableOpacity testID="quick-reorder" style={styles.quickCard} activeOpacity={0.9} onPress={() => router.push('/(tabs)/orders')}>
            <View style={styles.quickIcon}><Ionicons name="repeat" size={19} color={FUEL.limeDeep} /></View>
            <Text style={styles.quickLabel}>Reorder</Text>
          </TouchableOpacity>
          <TouchableOpacity testID="schedule-for-later" style={styles.quickCard} activeOpacity={0.9} onPress={() => router.push('/(tabs)/menu')}>
            <View style={styles.quickIcon}><Ionicons name="time" size={19} color={FUEL.success} /></View>
            <Text style={styles.quickLabel}>Schedule</Text>
          </TouchableOpacity>
          {orderType === 'dine-in' ? (
            <TouchableOpacity testID="quick-scan" style={[styles.quickCard, styles.quickCardInk]} activeOpacity={0.9} onPress={() => router.push('/scan-table')}>
              <View style={[styles.quickIcon, styles.quickIconInk]}><Ionicons name="qr-code" size={19} color={FUEL.lime} /></View>
              <Text style={[styles.quickLabel, { color: FUEL.white }]}>Scan Table</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity testID="quick-address" style={styles.quickCard} activeOpacity={0.9} onPress={() => setShowAddressModal(true)}>
              <View style={styles.quickIcon}><Ionicons name="location" size={19} color={FUEL.limeDeep} /></View>
              <Text style={styles.quickLabel}>Address</Text>
            </TouchableOpacity>
          )}
        </View>

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
          {popularProducts.slice(0, 12).map((item, idx) => renderPopularCard(item, idx))}
        </ScrollView>

        <View style={{ height: TAB_BAR_H + (activeOrder ? 96 : 24) }} />
      </Animated.ScrollView>

      {/* ===== FLOATING STICKY HEADER — transparent over hero → ink on scroll ===== */}
      <Animated.View style={[styles.floatHeader, { paddingTop: insets.top + 6, backgroundColor: headerBg }]}>
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

        <View style={styles.headerActions}>
          {/* AI chat — moved here from the old bottom floating button */}
          <TouchableOpacity testID="header-ai-chat" style={styles.headerIconBtn} onPress={() => router.push('/ai-chat')} activeOpacity={0.85}>
            <Ionicons name="sparkles" size={17} color={FUEL.lime} />
          </TouchableOpacity>
          {/* Notifications — bell with unread badge */}
          <TouchableOpacity testID="notif-bell" style={styles.headerIconBtn} onPress={() => router.push('/notifications')} activeOpacity={0.85}>
            <Ionicons name="notifications" size={17} color={FUEL.sand} />
            {notifUnread > 0 && (
              <View style={styles.notifBadge} testID="notif-unread-badge">
                <Text style={styles.notifBadgeText}>{notifUnread > 9 ? '9+' : notifUnread}</Text>
              </View>
            )}
          </TouchableOpacity>
          {/* Avatar — opens the drawer */}
          <TouchableOpacity testID="header-avatar" style={styles.avatar} onPress={() => setDrawerVisible(true)} activeOpacity={0.85}>
            {userInitial ? (
              <Text style={styles.avatarInitial}>{userInitial}</Text>
            ) : (
              <Ionicons name="person" size={18} color={FUEL.ink} />
            )}
          </TouchableOpacity>
        </View>
      </Animated.View>

      {/* ===== ORDER ON THE WAY — only while an order is active, above the nav ===== */}
      {activeOrder && orderStage && (
        <TouchableOpacity
          testID="active-order-widget"
          style={[styles.orderWidget, { bottom: TAB_BAR_H + 8 }]}
          activeOpacity={0.9}
          onPress={() => router.push({ pathname: '/delivery-tracking', params: { orderId: activeOrder.id } })}
        >
          <View style={styles.orderWidgetIcon}>
            <Ionicons name={orderStage.icon as any} size={20} color={FUEL.lime} />
          </View>
          <View style={{ flex: 1 }}>
            <View style={styles.orderWidgetTop}>
              <View style={styles.orderLiveDot} />
              <Text style={styles.orderWidgetTitle} numberOfLines={1}>{orderStage.label}</Text>
            </View>
            <Text style={styles.orderWidgetSub} numberOfLines={1}>
              #{String(activeOrder.order_number || activeOrder.id || '').toString().slice(-6).toUpperCase()}
              {activeOrder.eta_minutes ? ` · ~${activeOrder.eta_minutes} min` : ''}
            </Text>
          </View>
          <View style={styles.orderWidgetTrack}>
            <Text style={styles.orderWidgetTrackText}>TRACK</Text>
            <Ionicons name="chevron-forward" size={13} color={FUEL.lime} />
          </View>
        </TouchableOpacity>
      )}

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

      {/* ===== OFFERS POPUP — post-login bottom sheet (once/day/user) ===== */}
      <Modal visible={showOffersPopup} transparent animationType="slide" onRequestClose={() => setShowOffersPopup(false)}>
        <View style={styles.offersPopupOverlay}>
          <View style={styles.offersPopupSheet}>
            <View style={styles.offersPopupHeader}>
              <View>
                <Text style={styles.offersPopupTitle}>Offers for you</Text>
                <Text style={styles.offersPopupCount}>
                  {banners.filter((b: any) => b.type === 'offer').length} active {banners.filter((b: any) => b.type === 'offer').length === 1 ? 'offer' : 'offers'}
                </Text>
              </View>
              <TouchableOpacity testID="offers-popup-close" style={styles.offersPopupClose} onPress={() => setShowOffersPopup(false)} activeOpacity={0.85}>
                <Ionicons name="close" size={20} color={FUEL.ink} />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.offersPopupList} showsVerticalScrollIndicator={false}>
              {banners.filter((b: any) => b.type === 'offer').map((item: any, index: number) => {
                const accent = OFFER_ACCENTS[index % OFFER_ACCENTS.length];
                return (
                  <TouchableOpacity
                    key={item.id}
                    testID={`offers-popup-card-${item.offer_id}`}
                    style={styles.offersPopupCard}
                    activeOpacity={0.9}
                    onPress={() => { setShowOffersPopup(false); handleBannerPress(item); }}
                  >
                    <View style={[styles.offersPopupValuePill, { backgroundColor: accent }]}>
                      <Text style={styles.offersPopupValueText}>{offerValueText(item)}</Text>
                    </View>
                    <View style={styles.offersPopupCardBody}>
                      <Text style={styles.offersPopupCardTitle} numberOfLines={1}>{item.title}</Text>
                      <Text style={styles.offersPopupCardSub} numberOfLines={1}>{item.subtitle}</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={FUEL.lime} />
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            <TouchableOpacity testID="offers-popup-skip" style={styles.offersPopupSkip} onPress={() => setShowOffersPopup(false)} activeOpacity={0.7}>
              <Text style={styles.offersPopupSkipText}>Skip for now</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <CartPill bottom={TAB_BAR_H + (activeOrder ? 78 : 8)} />
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: FUEL.sand },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  homeErrorText: { fontFamily: FONT.bodySemibold, fontSize: 14, color: FUEL.muted, marginTop: SPACE.m, textAlign: 'center', paddingHorizontal: SPACE.xl },
  homeRetryBtn: { flexDirection: 'row', alignItems: 'center', gap: SPACE.s, backgroundColor: FUEL.ink, borderRadius: RADIUS.lg, paddingVertical: SPACE.m, paddingHorizontal: SPACE.xl, marginTop: SPACE.l },
  homeRetryText: { color: FUEL.lime, fontFamily: FONT.bodyExtrabold, fontSize: 13, textTransform: 'uppercase', letterSpacing: 0.3 },

  // ===== Edge-to-edge hero carousel =====
  heroWrap: { width: '100%', backgroundColor: FUEL.ink },
  heroSlide: { height: '100%', justifyContent: 'flex-end' },
  heroImg: { ...StyleSheet.absoluteFillObject, width: '100%', height: '100%' },
  heroContent: { paddingHorizontal: SPACE.xl, paddingBottom: SPACE.xxl + SPACE.s },
  heroEyebrow: { fontFamily: FONT.bodyExtrabold, fontSize: 11, letterSpacing: 1.4, color: FUEL.lime, marginBottom: SPACE.s },
  heroTitle: { fontFamily: FONT.display, fontSize: 30, lineHeight: 32, color: FUEL.white, letterSpacing: 0.3 },
  heroSub: { fontFamily: FONT.bodyMedium, fontSize: 13.5, color: 'rgba(255,255,255,0.82)', marginTop: SPACE.s, lineHeight: 19 },
  heroCta: { flexDirection: 'row', alignItems: 'center', gap: SPACE.xs, alignSelf: 'flex-start', backgroundColor: FUEL.lime, borderRadius: RADIUS.pill, paddingHorizontal: SPACE.l, paddingVertical: SPACE.s, marginTop: SPACE.m },
  heroCtaText: { fontFamily: FONT.bodyExtrabold, fontSize: 12, color: FUEL.ink, letterSpacing: 0.5 },
  heroDots: { position: 'absolute', bottom: SPACE.m, left: 0, right: 0, flexDirection: 'row', justifyContent: 'center', gap: 5 },
  heroDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.5)' },
  heroDotActive: { width: 20, backgroundColor: FUEL.lime },

  // ===== Floating sticky header (over hero → ink) =====
  floatHeader: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 30, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: SPACE.l, paddingBottom: SPACE.s },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: SPACE.s },
  headerIconBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(20,19,14,0.35)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' },
  notifBadge: { position: 'absolute', top: -2, right: -2, minWidth: 16, height: 16, borderRadius: 8, backgroundColor: FUEL.protein, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 },
  notifBadgeText: { fontFamily: FONT.bodyExtrabold, fontSize: 9, color: FUEL.white },

  // ===== Compact daily target =====
  targetCompact: { flexDirection: 'row', alignItems: 'center', gap: SPACE.m, backgroundColor: FUEL.ink, borderRadius: RADIUS.md, paddingVertical: SPACE.m, paddingHorizontal: SPACE.m, marginTop: SPACE.m },
  targetCompactIcon: { width: 32, height: 32, borderRadius: RADIUS.sm, backgroundColor: FUEL.lime, alignItems: 'center', justifyContent: 'center' },
  targetCompactLabel: { fontFamily: FONT.bodyExtrabold, fontSize: 9.5, letterSpacing: 1, color: 'rgba(244,241,233,0.6)' },
  targetCompactValue: { fontFamily: FONT.bodyExtrabold, fontSize: 14, color: FUEL.lime, marginTop: 2 },
  targetStreakChip: { backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: RADIUS.pill, paddingHorizontal: SPACE.s, paddingVertical: 4 },
  targetStreakText: { fontFamily: FONT.bodyExtrabold, fontSize: 12, color: FUEL.white },
  targetPlanBtn: { backgroundColor: FUEL.lime, borderRadius: RADIUS.pill, paddingHorizontal: SPACE.m, paddingVertical: SPACE.s },
  targetPlanText: { fontFamily: FONT.bodyExtrabold, fontSize: 11, color: FUEL.ink, letterSpacing: 0.5 },

  // ===== Order-on-the-way widget =====
  orderWidget: { position: 'absolute', left: SPACE.l, right: SPACE.l, bottom: 8, zIndex: 25, flexDirection: 'row', alignItems: 'center', gap: SPACE.m, backgroundColor: FUEL.inkSoft, borderRadius: RADIUS.md, paddingVertical: SPACE.m, paddingHorizontal: SPACE.m, shadowColor: FUEL.ink, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.3, shadowRadius: 12, elevation: 10 },
  orderWidgetIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(199,242,78,0.15)', alignItems: 'center', justifyContent: 'center' },
  orderWidgetTop: { flexDirection: 'row', alignItems: 'center', gap: SPACE.s },
  orderLiveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: FUEL.lime },
  orderWidgetTitle: { fontFamily: FONT.bodyExtrabold, fontSize: 13.5, color: FUEL.white },
  orderWidgetSub: { fontFamily: FONT.bodyMedium, fontSize: 11.5, color: 'rgba(244,241,233,0.6)', marginTop: 2 },
  orderWidgetTrack: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  orderWidgetTrackText: { fontFamily: FONT.bodyExtrabold, fontSize: 11, color: FUEL.lime, letterSpacing: 0.5 },

  // ===== Categories (photo circles) =====
  catRow: { flexDirection: 'row', gap: SPACE.l, paddingHorizontal: SPACE.l, paddingTop: SPACE.xs, paddingBottom: SPACE.s },
  catItem: { width: 68, alignItems: 'center' },
  catCircle: { width: 66, height: 66, borderRadius: 22, marginBottom: 6, backgroundColor: FUEL.white },
  catCircleAi: { alignItems: 'center', justifyContent: 'center', backgroundColor: FUEL.ink },
  catLabel: { fontFamily: FONT.bodySemibold, fontSize: 11, color: FUEL.ink, textAlign: 'center' },

  // Shared horizontal scroll padding for card rows
  hScroll: { paddingHorizontal: SPACE.l, paddingVertical: SPACE.s, gap: SPACE.m },

  // ===== Offers (full-image cards) =====
  offerImgCard: { width: OFFER_CARD_W, height: 150, borderRadius: RADIUS.lg, overflow: 'hidden', marginRight: OFFER_GAP, backgroundColor: FUEL.ink },
  offerImg: { ...StyleSheet.absoluteFillObject, width: '100%', height: '100%' },
  offerImgContent: { flex: 1, padding: SPACE.l, justifyContent: 'space-between' },
  offerImgTag: { alignSelf: 'flex-start', backgroundColor: FUEL.lime, borderRadius: RADIUS.pill, paddingHorizontal: SPACE.s, paddingVertical: 3 },
  offerImgTagText: { fontFamily: FONT.bodyExtrabold, fontSize: 9, color: FUEL.ink, letterSpacing: 0.5 },
  offerImgValue: { fontFamily: FONT.display, fontSize: 24, color: FUEL.white, letterSpacing: 0.5 },
  offerImgTitle: { fontFamily: FONT.bodyExtrabold, fontSize: 15, color: FUEL.white, marginTop: 2 },
  offerImgBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 6, gap: SPACE.s },
  offerImgSub: { flex: 1, fontFamily: FONT.bodyMedium, fontSize: 11, color: 'rgba(255,255,255,0.82)' },
  offerImgBtn: { backgroundColor: FUEL.lime, borderRadius: RADIUS.pill, paddingHorizontal: SPACE.m, paddingVertical: 6 },
  offerImgBtnText: { fontFamily: FONT.bodyExtrabold, fontSize: 11, color: FUEL.ink, letterSpacing: 0.5 },

  // ===== Meal Packs =====
  packCard: { width: 220, borderRadius: RADIUS.lg, backgroundColor: FUEL.white, overflow: 'hidden', borderWidth: 1, borderColor: FUEL.sandBorder },
  packImg: { width: '100%', height: 96 },
  packImgPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  packBody: { padding: SPACE.m },
  packName: { fontFamily: FONT.bodyExtrabold, fontSize: 14, color: FUEL.ink },
  packMeta: { fontFamily: FONT.bodyMedium, fontSize: 11.5, color: FUEL.muted, marginTop: 2, marginBottom: SPACE.s } as any,
  packBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  packPrice: { fontFamily: FONT.display, fontSize: 16, color: FUEL.ink },
  packViewBtn: { backgroundColor: FUEL.lime, borderRadius: RADIUS.pill, paddingHorizontal: SPACE.m, paddingVertical: 6 },
  packViewText: { fontFamily: FONT.bodyExtrabold, fontSize: 11, color: FUEL.ink, letterSpacing: 0.5 },

  // ===== AI Coach row =====
  aiCoachRow: { flexDirection: 'row', gap: SPACE.m, paddingHorizontal: SPACE.l },
  aiCoachCard: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: SPACE.s, backgroundColor: FUEL.white, borderRadius: RADIUS.md, padding: SPACE.m, borderWidth: 1, borderColor: FUEL.sandBorder },
  aiCoachIcon: { width: 36, height: 36, borderRadius: RADIUS.sm, backgroundColor: FUEL.limeTint, alignItems: 'center', justifyContent: 'center' },
  aiCoachTitle: { fontFamily: FONT.bodyExtrabold, fontSize: 12.5, color: FUEL.ink },
  aiCoachSub: { fontFamily: FONT.body, fontSize: 10.5, color: FUEL.muted, marginTop: 1 },

  // ===== Quick actions grid =====
  quickRow: { flexDirection: 'row', gap: SPACE.m, paddingHorizontal: SPACE.l, marginTop: SPACE.l },
  quickCard: { flex: 1, alignItems: 'center', gap: SPACE.s, backgroundColor: FUEL.white, borderRadius: RADIUS.md, paddingVertical: SPACE.l, borderWidth: 1, borderColor: FUEL.sandBorder },
  quickCardInk: { backgroundColor: FUEL.ink, borderColor: FUEL.ink },
  quickIcon: { width: 40, height: 40, borderRadius: RADIUS.sm, backgroundColor: FUEL.limeTint, alignItems: 'center', justifyContent: 'center' },
  quickIconInk: { backgroundColor: 'rgba(199,242,78,0.15)' },
  quickLabel: { fontFamily: FONT.bodyExtrabold, fontSize: 11.5, color: FUEL.ink },

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
  headerSpacer: { width: 36, height: 36 }, // mirrors the avatar so the toggle stays centered
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

  // ===== Offers carousel — v5 ticket cards =====
  offerList: { marginTop: SPACE.m },
  offerListContent: { paddingHorizontal: SPACE.l },
  offerCard: {
    width: OFFER_CARD_W,
    marginRight: OFFER_GAP,
    backgroundColor: FUEL.ink,
    borderRadius: RADIUS.lg,
    paddingHorizontal: SPACE.l,
    paddingVertical: SPACE.l,
    minHeight: 168,
    justifyContent: 'space-between',
  },
  offerTop: {},
  offerEyebrow: { alignSelf: 'flex-start', borderRadius: RADIUS.lg, paddingHorizontal: SPACE.m, paddingVertical: 3 },
  offerEyebrowText: { fontFamily: FONT.bodyExtrabold, fontSize: 10, color: FUEL.ink, letterSpacing: 0.8 },
  offerValue: { fontFamily: FONT.display, fontSize: 34, letterSpacing: 0.5, marginTop: SPACE.s, textTransform: 'uppercase' },
  offerTitle: { fontFamily: FONT.bodyExtrabold, fontSize: 15, color: FUEL.sand, marginTop: SPACE.xs, textTransform: 'uppercase', letterSpacing: 0.3 },
  offerSubtitle: { fontFamily: FONT.bodySemibold, fontSize: 12.5, color: 'rgba(244,241,233,0.7)', marginTop: 2 },
  // coupon perforation
  offerPerf: { height: 14, justifyContent: 'center', marginVertical: SPACE.s },
  offerDash: { borderTopWidth: 1.5, borderStyle: 'dashed', borderColor: 'rgba(244,241,233,0.35)' },
  offerNotch: { position: 'absolute', width: 14, height: 14, borderRadius: 7, backgroundColor: FUEL.sand, top: 0 },
  offerNotchLeft: { left: -SPACE.l - 7 },
  offerNotchRight: { right: -SPACE.l - 7 },
  offerBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  offerCodeChip: { flexDirection: 'row', alignItems: 'center', gap: SPACE.xs, borderWidth: 1, borderStyle: 'dashed', borderColor: 'rgba(244,241,233,0.5)', borderRadius: RADIUS.sm, paddingHorizontal: SPACE.m, paddingVertical: SPACE.xs },
  offerCodeText: { fontFamily: FONT.bodyExtrabold, fontSize: 10.5, color: FUEL.sand, letterSpacing: 0.5 },
  offerRedeem: { backgroundColor: FUEL.lime, borderRadius: RADIUS.lg, paddingHorizontal: SPACE.l, paddingVertical: SPACE.s },
  offerRedeemText: { fontFamily: FONT.bodyExtrabold, fontSize: 12, color: FUEL.ink, letterSpacing: 0.5 },
  // loading skeleton
  offerSkeletonRow: { flexDirection: 'row', marginTop: SPACE.m, paddingHorizontal: SPACE.l },
  offerSkeletonCard: { width: OFFER_CARD_W, minHeight: 168, borderRadius: RADIUS.lg, backgroundColor: FUEL.sandBorder, marginRight: OFFER_GAP },
  offerSkeletonPeek: { opacity: 0.5 },

  // ===== Offers popup — bottom sheet =====
  offersPopupOverlay: { flex: 1, backgroundColor: 'rgba(21,20,15,0.45)', justifyContent: 'flex-end' },
  offersPopupSheet: { backgroundColor: FUEL.sand, borderTopLeftRadius: RADIUS.lg, borderTopRightRadius: RADIUS.lg, paddingHorizontal: SPACE.l, paddingTop: SPACE.l, paddingBottom: SPACE.xl, maxHeight: '70%' },
  offersPopupHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: SPACE.m },
  offersPopupTitle: { fontFamily: FONT.display, fontSize: 22, color: FUEL.ink, textTransform: 'uppercase', letterSpacing: 0.4 },
  offersPopupCount: { fontFamily: FONT.bodySemibold, fontSize: 12.5, color: FUEL.muted, marginTop: 2 },
  offersPopupClose: { width: 36, height: 36, borderRadius: 18, backgroundColor: FUEL.white, borderWidth: 1, borderColor: FUEL.sandBorder, alignItems: 'center', justifyContent: 'center' },
  offersPopupList: { flexGrow: 0 },
  offersPopupCard: { flexDirection: 'row', alignItems: 'center', gap: SPACE.m, backgroundColor: FUEL.ink, borderRadius: RADIUS.md, paddingHorizontal: SPACE.l, paddingVertical: SPACE.m, marginBottom: SPACE.s },
  offersPopupValuePill: { borderRadius: RADIUS.sm, paddingHorizontal: SPACE.s, paddingVertical: SPACE.xs, minWidth: 64, alignItems: 'center' },
  offersPopupValueText: { fontFamily: FONT.bodyExtrabold, fontSize: 12, color: FUEL.ink, letterSpacing: 0.3 },
  offersPopupCardBody: { flex: 1 },
  offersPopupCardTitle: { fontFamily: FONT.bodyExtrabold, fontSize: 14, color: FUEL.sand, textTransform: 'uppercase', letterSpacing: 0.3 },
  offersPopupCardSub: { fontFamily: FONT.bodySemibold, fontSize: 12, color: 'rgba(244,241,233,0.7)', marginTop: 2 },
  offersPopupSkip: { alignItems: 'center', paddingVertical: SPACE.m, marginTop: SPACE.s },
  offersPopupSkipText: { fontFamily: FONT.bodyExtrabold, fontSize: 13, color: FUEL.muted, textDecorationLine: 'underline' },

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
  calLeft: { fontFamily: FONT.bodyExtrabold, fontSize: 11, color: FUEL.limeDeep, marginLeft: SPACE.xs },
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

  // AI Combo Builder — inline ink card
  comboCard: { backgroundColor: FUEL.ink, marginHorizontal: SPACE.l, marginTop: SPACE.l, borderRadius: RADIUS.md, padding: SPACE.l, gap: SPACE.m },
  comboTitleRow: { flexDirection: 'row', alignItems: 'center', gap: SPACE.m },
  comboTitle: { fontFamily: FONT.display, fontSize: 16, color: FUEL.sand, textTransform: 'uppercase' },
  comboSub: { fontFamily: FONT.bodyMedium, fontSize: 12, color: 'rgba(244,241,233,0.7)', marginTop: 2 },
  comboGoalRow: { flexDirection: 'row', gap: SPACE.s, paddingRight: SPACE.s },
  comboGoalChip: { paddingHorizontal: SPACE.m, paddingVertical: SPACE.s, borderRadius: 999, backgroundColor: FUEL.inkSoft, borderWidth: 1.5, borderColor: FUEL.inkSoft },
  comboGoalChipActive: { backgroundColor: FUEL.lime, borderColor: FUEL.lime },
  comboGoalText: { fontFamily: FONT.bodyExtrabold, fontSize: 12, color: FUEL.sand, textTransform: 'uppercase', letterSpacing: 0.3 },
  comboGoalTextActive: { color: FUEL.ink },
  comboBuildRow: { flexDirection: 'row', alignItems: 'center', gap: SPACE.s },
  comboBudgetInput: { flex: 1, backgroundColor: FUEL.inkSoft, borderRadius: RADIUS.sm, paddingHorizontal: SPACE.m, paddingVertical: SPACE.m, fontFamily: FONT.bodySemibold, fontSize: 14, color: FUEL.sand },
  comboBuildBtn: { backgroundColor: FUEL.lime, borderRadius: RADIUS.sm, paddingHorizontal: SPACE.xl, paddingVertical: SPACE.m, alignItems: 'center', justifyContent: 'center', minWidth: 96 },
  comboBuildBtnDisabled: { opacity: 0.5 },
  comboBuildText: { fontFamily: FONT.bodyExtrabold, fontSize: 14, color: FUEL.ink, letterSpacing: 0.5 },
  ctaLeft: { flexDirection: 'row', alignItems: 'center', gap: SPACE.m, flex: 1 },
  heroCtaIconBg: { width: 44, height: 44, borderRadius: RADIUS.md, backgroundColor: FUEL.lime, alignItems: 'center', justifyContent: 'center' },
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
  popularCard: {
    width: 168,
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
