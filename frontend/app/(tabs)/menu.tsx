import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, Image, RefreshControl,
  Alert, ActivityIndicator, ScrollView, TextInput, Dimensions, Modal
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image as ExpoImage } from 'expo-image';
import Animated, { FadeIn, FadeOut, FadeInDown } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { apiCall } from '../../utils/api';
import SideDrawer from '../components/SideDrawer';
import { SkeletonList } from '../components/Skeleton';
import { getStoredUser } from '../../utils/api';
import { useRealtime } from '../../utils/realtime';
import { FUEL, FONT, RADIUS, SPACE } from '../../utils/theme';
import { useCart } from '../../utils/CartContext';
import { useStore } from '../../utils/StoreContext';
import { DIET_TAGS, DIET_LABEL, matchesDiet, matchesAnyDiet, toggleDietTag } from '../../utils/diet';
import { goalFitForProduct, sortByGoalFit } from '../../utils/goalFit';
import CartPill from '../components/CartPill';
import PressableScale from '../components/PressableScale';
import * as Haptics from 'expo-haptics';

// PR-C: success haptic on add-to-cart (safe no-op on web)
const hapticSuccess = () => {
  try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {}); } catch {}
};

const { width } = Dimensions.get('window');

// Default categories (used as fallback if no DB categories)
const DEFAULT_CATS = [
  { key: 'Protein', label: 'Protein', icon: 'barbell', color: FUEL.protein, image_url: 'https://images.unsplash.com/photo-1632778149955-e80f8ceca2e8?w=80&h=80&fit=crop' },
  { key: 'Carb', label: 'Carbs', icon: 'leaf', color: FUEL.carbs, image_url: 'https://images.unsplash.com/photo-1536304929831-ee1ca9d44726?w=80&h=80&fit=crop' },
  { key: 'Fat', label: 'Fats', icon: 'water', color: FUEL.fat, image_url: 'https://images.unsplash.com/photo-1523049673857-eb18f1d7b578?w=80&h=80&fit=crop' },
  { key: 'Meal', label: 'Meals', icon: 'fast-food', color: FUEL.success, image_url: 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=80&h=80&fit=crop' },
];

// Budget pills — CLIENT-SIDE price filter on the displayed price of a default serving
const BUDGET_PILLS = [
  { key: '150', label: 'UNDER ₹150', cap: 150 },
  { key: '250', label: 'UNDER ₹250', cap: 250 },
  { key: '400', label: 'UNDER ₹400', cap: 400 },
  { key: 'all', label: 'ALL', cap: null as number | null },
];

// Store-resolved menus carry `selling_price` (base price + this store's HQ
// override). Map it onto the price fields the whole app already reads
// (fixed_price / cost_per_100g) so the override shows in the row price, the
// ₹/g-protein value, and the cart estimate. No-op for the global (no-store)
// menu, which omits selling_price. Authoritative totals still come from the
// server quote / order — this only fixes what the customer SEES while browsing.
const applyStorePricing = (p: any) => {
  if (p == null || p.selling_price == null) return p;
  return p.product_type === 'ready_made'
    ? { ...p, fixed_price: p.selling_price }
    : { ...p, cost_per_100g: p.selling_price };
};

// Displayed price of a default serving — same formula the product rows use
const getDisplayPrice = (p: any) => {
  const isReadyMade = p.product_type === 'ready_made';
  return isReadyMade
    ? (p.fixed_price || Math.round(p.cost_per_100g * (p.serving_grams || 300) / 100))
    : p.cost_per_100g;
};

// Protein grams in that same default serving (for ₹/g-protein value)
const getServingProtein = (p: any) => {
  const isReadyMade = p.product_type === 'ready_made';
  return isReadyMade
    ? (p.protein_per_100g || 0) * (p.serving_grams || 300) / 100
    : (p.protein_per_100g || 0);
};

const getPricePerGramProtein = (p: any): number | null => {
  const protein = getServingProtein(p);
  if (!protein || protein <= 0) return null;
  return getDisplayPrice(p) / protein;
};

export default function MenuScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const [products, setProducts] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>(DEFAULT_CATS);
  const { addItem, incItem, decItem, getItem, count: cartCount, subtotal: cartSubtotal } = useCart();
  const { stores, selectedStoreId, selectedStore, selectStore } = useStore();
  const [storePickerOpen, setStorePickerOpen] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const searchRef = useRef<TextInput>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [orderType, setOrderType] = useState('dine-in');
  const [selectedCat, setSelectedCat] = useState('');
  const [search, setSearch] = useState('');
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [dietFilter, setDietFilter] = useState<string[]>([]);
  const [budgetCap, setBudgetCap] = useState<number | null>(null);
  const [wallExpanded, setWallExpanded] = useState(false);
  // Protein-left strip: personalized daily target + today's consumption
  const [dailyTarget, setDailyTarget] = useState<any>(null);
  const [nutritionSummary, setNutritionSummary] = useState<any>(null);
  // P7: HQ value-card control — {mode: 'auto'|'pin'|'off', product_id}; null → auto
  const [valueCardSetting, setValueCardSetting] = useState<any>(null);
  const userGoal = user?.fitness_goal;

  // Handle URL params for category/diet filter (only on initial load)
  useEffect(() => {
    if (params.category) {
      setSelectedCat(params.category as string);
    }
    if (params.dietFilter) {
      // Param arrives as a string ('veg' | 'non-veg'); diet filter state is a tag array.
      setDietFilter(Array.isArray(params.dietFilter) ? params.dietFilter : [params.dietFilter as string]);
    }
  }, []); // Only run once on mount

  const loadProducts = useCallback(async () => {
    try {
      // Store-scoped catalog: send store_id so HQ per-store price/availability
      // overrides show while browsing (not just at final bill). No store → global menu.
      const [data, u, cats, target, summary, valueCard] = await Promise.all([
        apiCall(`/products${selectedStoreId ? `?store_id=${selectedStoreId}` : ''}`),
        getStoredUser(),
        apiCall('/categories').catch(() => []),
        apiCall('/user/daily-target').catch(() => null),
        apiCall('/user/nutrition-summary').catch(() => null),
        apiCall('/settings/value-card').catch(() => null), // P7: default auto on failure
      ]);
      setUser(u);
      setValueCardSetting(valueCard);
      setProducts(data.map(applyStorePricing).filter((p: any) => {
        if (p.product_type === 'ready_made') return p.is_active !== false;
        return p.available_qty_grams > 0;
      }));
      setDailyTarget(target);
      setNutritionSummary(summary);
      // Merge DB categories with defaults
      if (cats && cats.length > 0) {
        setCategories(cats);
      }
      setLoadError(false);
    }
    catch (e) { setLoadError(true); } finally { setLoading(false); }
  }, [selectedStoreId]);

  // Re-fetch on mount and whenever the selected store changes (store-scoped menu).
  useEffect(() => { loadProducts(); }, [loadProducts]);
  // Live menu/stock sync: re-fetch when admin edits menu or stock changes (C3)
  useRealtime((msg) => {
    if (msg.type === 'menu_update') loadProducts();
  });
  const onRefresh = async () => { setRefreshing(true); await loadProducts(); setRefreshing(false); };

  // Add to cart now goes through the shared CartContext (one cart app-wide).
  // addItem(product) handles single (+100g) vs ready-made (+1 plate);
  // incItem/decItem drive the stepper.

  // Category match — identical semantics to the old chip filter
  const matchesCategory = (p: any, cat: string) => {
    if (!cat) return true;
    if (cat === 'veg') return p.diet_type === 'veg';
    if (cat === 'non-veg') return p.diet_type === 'non-veg';
    if (cat === 'Meal') return p.product_type === 'ready_made' || p.category === 'Meal';
    return p.category === cat;
  };

  // Filter products (memoized for performance)
  const filtered = useMemo(() => {
    const list = products.filter(p => {
      // Search filter
      const searchMatch = !search || p.name.toLowerCase().includes(search.toLowerCase());
      if (!searchMatch) return false;

      // Diet type filter (multi-select tags, AND semantics)
      if (!matchesDiet(p, dietFilter)) return false;

      // Budget pill filter (client-side, on the displayed serving price)
      if (budgetCap != null && getDisplayPrice(p) > budgetCap) return false;

      // Category filter
      return matchesCategory(p, selectedCat);
    });
    // Phase 3: sort goal-fit dishes first (only when the user has a personalized goal)
    return userGoal ? sortByGoalFit(list, userGoal) : list;
  }, [products, search, dietFilter, selectedCat, budgetCap, userGoal]);

  // PR-1: group the visible list by subcategory in canonical order (display only).
  // Headers are injected as sentinel rows; products without a known subcategory
  // fall under "Other" shown last. Skipped while searching to keep results flat.
  const sectioned = useMemo(() => {
    const SUBCAT_ORDER = ['Base', 'Protein', 'Veggies', 'Sauce', 'Toppings'];
    const anySub = filtered.some(p => p.subcategory && String(p.subcategory).trim());
    if (search || !anySub) return filtered; // flat
    const groups: Record<string, any[]> = {};
    for (const p of filtered) {
      const key = (p.subcategory && String(p.subcategory).trim()) ? String(p.subcategory).trim() : 'Other';
      (groups[key] ||= []).push(p);
    }
    const order = [...SUBCAT_ORDER.filter(l => groups[l]),
                   ...Object.keys(groups).filter(l => !SUBCAT_ORDER.includes(l) && l !== 'Other').sort(),
                   ...(groups['Other'] ? ['Other'] : [])];
    const out: any[] = [];
    for (const label of order) { out.push({ __header: true, id: `__h_${label}`, label }); out.push(...groups[label]); }
    return out;
  }, [filtered, search]);

  // Nearest options when a multi-tag AND combo returns nothing (e.g. Vegan+Keto)
  const nearest = useMemo(() => {
    if (dietFilter.length < 2) return [];
    return products.filter(p => matchesAnyDiet(p, dietFilter)).slice(0, 6);
  }, [products, dietFilter]);

  // Today's best protein value — honours the HQ value-card control (P7):
  // off → hidden; pin → show the pinned product (fall back to auto when the
  // pinned product is missing/out-of-stock — products state already excludes
  // out-of-stock); auto (default) → CLIENT-SIDE pick: in-stock product with
  // the minimum price-per-gram-protein.
  const bestValue = useMemo(() => {
    const mode = valueCardSetting?.mode || 'auto';
    if (mode === 'off') return null;
    if (mode === 'pin' && valueCardSetting?.product_id) {
      const pinned = products.find(p => p.id === valueCardSetting.product_id);
      if (pinned) {
        const ratio = getPricePerGramProtein(pinned);
        if (ratio != null) return { product: pinned, ratio };
      }
      // pinned product unavailable → fall through to auto
    }
    let best: any = null;
    let bestRatio = Infinity;
    for (const p of products) {
      const ratio = getPricePerGramProtein(p);
      if (ratio != null && ratio < bestRatio) { bestRatio = ratio; best = p; }
    }
    return best ? { product: best, ratio: bestRatio } : null;
  }, [products, valueCardSetting]);

  // Protein left today (hidden when no goal / body stats set)
  const proteinLeft = useMemo(() => {
    if (!dailyTarget?.has_body_stats || !dailyTarget?.daily_protein) return null;
    const consumed = nutritionSummary?.consumed?.protein || 0;
    return Math.max(0, Math.round(dailyTarget.daily_protein - consumed));
  }, [dailyTarget, nutritionSummary]);

  const goCustomize = () => {
    if (cartCount === 0) { Alert.alert('Empty Cart', 'Add items first'); return; }
    router.push('/cart');
  };

  // ===== Category wall (2-column grid replacing the old chip rail) =====
  const catValueOf = (cat: any) => cat.name || cat.key;
  const countFor = (cat: any) => products.filter(p => matchesCategory(p, catValueOf(cat))).length;

  const WALL_MAX = 6;
  const showAllTile = categories.length > WALL_MAX;
  const visibleCats = (wallExpanded || !showAllTile) ? categories : categories.slice(0, WALL_MAX - 1);
  const hiddenCount = categories.length - (WALL_MAX - 1);

  const renderWallTile = (cat: any, index: number) => {
    const catValue = catValueOf(cat);
    const isActive = selectedCat === catValue;
    // F4: signature cats get the dark ink+lime fill (fallback: first tile dark).
    const isDark = !!cat.is_signature || (index === 0 && !cat.parent_group);
    const fontStyleProp = cat.font_style === 'italic' ? { fontStyle: 'italic' as const } : cat.font_style === 'mono' ? { fontFamily: 'monospace' } : {};
    return (
      <TouchableOpacity
        key={cat.id || catValue}
        testID={`sidebar-cat-${catValue}`}
        style={[styles.wallTile, isDark && styles.wallTileFirst, isActive && styles.wallTileActive]}
        onPress={() => setSelectedCat(prev => prev === catValue ? '' : catValue)}
        activeOpacity={0.85}
      >
        <View style={styles.wallTileTop}>
          <Text style={[styles.wallTileTitle, isDark && styles.wallTileTitleFirst, fontStyleProp]} numberOfLines={2}>
            {cat.label || cat.name}
          </Text>
          {isActive && <Ionicons name="checkmark-circle" size={18} color={isDark ? FUEL.lime : FUEL.limeDeep} />}
        </View>
        <Text style={[styles.wallTileCount, isDark && styles.wallTileCountFirst]}>{countFor(cat)} ITEMS</Text>
      </TouchableOpacity>
    );
  };

  // PR-1: render a subcategory section header, else delegate to the product card.
  const renderRow = ({ item }: { item: any }) => {
    if (item.__header) {
      return (
        <Text testID={`menu-subcat-${String(item.label).toLowerCase().replace(/[^a-z]+/g, '-')}`}
          style={styles.subcatHeader}>{item.label}</Text>
      );
    }
    return renderProduct({ item });
  };

  // Render product row — photo left + ₹/g-protein badge + macros + ADD
  const renderProduct = ({ item }: { item: any }) => {
    const inCart = getItem(item.id);
    const isReadyMade = item.product_type === 'ready_made';
    const displayPrice = getDisplayPrice(item);
    const priceUnit = isReadyMade ? '' : '/100g';
    const valuePerGram = getPricePerGramProtein(item);

    // Phase 3: goal-fit flag for the user's current goal
    const goalFit = userGoal ? goalFitForProduct(item, userGoal) : null;

    return (
      <View style={styles.productCard} testID={`product-${item.id}`}>
        {/* Photo (72px, rounded) with ₹/g-protein badge */}
        <View style={styles.productImageWrapper}>
          {item.image_url ? (
            <Image source={{ uri: item.image_url }} style={styles.productImage} />
          ) : (
            <View style={[styles.productImage, styles.productImagePlaceholder]}>
              <Ionicons name={isReadyMade ? 'fast-food' : 'restaurant'} size={26} color={FUEL.sandBorder} />
            </View>
          )}
          {valuePerGram != null && (
            <View style={styles.valueBadge} testID={`value-badge-${item.id}`}>
              <Text style={styles.valueBadgeText}>₹{valuePerGram.toFixed(1)}/g P</Text>
            </View>
          )}
        </View>

        {/* Product Info */}
        <View style={styles.productInfo}>
          <View style={styles.productHeader}>
            <Text style={styles.productName} numberOfLines={2}>{item.name}</Text>
            {/* Veg/Non-veg indicator */}
            <View style={[styles.vegIndicator, { borderColor: item.diet_type === 'non-veg' ? FUEL.nonVeg : FUEL.veg }]}>
              <View style={[styles.vegDot, { backgroundColor: item.diet_type === 'non-veg' ? FUEL.nonVeg : FUEL.veg }]} />
            </View>
          </View>

          <Text style={styles.productDesc} numberOfLines={1}>
            {item.description || `${item.category} • ${item.calories_per_100g} cal${priceUnit}`}
          </Text>

          {/* Phase 3: "Fits your goal" badge */}
          {goalFit?.fits && (
            <View style={styles.goalFitBadge} testID={`goal-fit-${item.id}`}>
              <Ionicons name="checkmark-circle" size={12} color="#4F5A2E" />
              <Text style={styles.goalFitText}>Fits your goal · {goalFit.reason}</Text>
            </View>
          )}

          {/* Macro chips (P / C / F) — color-coded per-100g nutrition */}
          <View style={styles.macroChips}>
            <View style={[styles.macroChip, { backgroundColor: FUEL.proteinTint }]}>
              <Text style={[styles.macroChipText, { color: FUEL.protein }]}>P {Math.round(item.protein_per_100g || 0)}g</Text>
            </View>
            <View style={[styles.macroChip, { backgroundColor: FUEL.carbsTint }]}>
              <Text style={[styles.macroChipText, { color: FUEL.carbs }]}>C {Math.round(item.carbs_per_100g || 0)}g</Text>
            </View>
            <View style={[styles.macroChip, { backgroundColor: FUEL.fatTint }]}>
              <Text style={[styles.macroChipText, { color: FUEL.fat }]}>F {Math.round(item.fat_per_100g || 0)}g</Text>
            </View>
          </View>

          {/* Price and Add Button Row */}
          <View style={styles.productFooter}>
            <Text style={styles.productPrice}>₹{displayPrice}{priceUnit ? <Text style={styles.priceUnit}>{priceUnit}</Text> : null}</Text>

            {inCart ? (
              <View style={styles.qtyBox}>
                <TouchableOpacity testID={`minus-${item.id}`} style={styles.qtyBtn} onPress={() => decItem(item.id)}>
                  <Ionicons name="remove" size={14} color={FUEL.lime} />
                </TouchableOpacity>
                <Text style={styles.qtyText}>{isReadyMade ? inCart.quantity : `${inCart.grams}g`}</Text>
                <TouchableOpacity testID={`plus-${item.id}`} style={styles.qtyBtn} onPress={() => incItem(item.id)}>
                  <Ionicons name="add" size={14} color={FUEL.lime} />
                </TouchableOpacity>
              </View>
            ) : (
              <PressableScale haptic testID={`add-${item.id}`} style={styles.addBtn} onPress={() => { addItem(item); hapticSuccess(); }}>
                <Text style={styles.addBtnText}>ADD +</Text>
              </PressableScale>
            )}
          </View>
        </View>
      </View>
    );
  };

  // ===== Scrolling header: hero + diet chips + category wall + best-value card =====
  const listHeader = (
    <View>
      {/* HERO — ink, rounded bottom */}
      <View style={styles.hero}>
        <Text style={styles.heroLine1}>FIT YOUR BUDGET.</Text>
        <Text style={styles.heroLine2}>EAT FOR YOUR GOAL.</Text>

        {proteinLeft != null && (
          <View style={styles.proteinStrip} testID="protein-left-strip">
            <Ionicons name="flash" size={13} color={FUEL.lime} />
            <Text style={styles.proteinStripText}>
              <Text style={styles.proteinStripValue}>{proteinLeft}g</Text> protein left today
            </Text>
          </View>
        )}

        <View style={styles.budgetRow}>
          {BUDGET_PILLS.map(pill => {
            const active = budgetCap === pill.cap;
            return (
              <TouchableOpacity
                key={pill.key}
                testID={`budget-pill-${pill.key}`}
                style={[styles.budgetPill, active && styles.budgetPillActive]}
                onPress={() => setBudgetCap(pill.cap)}
                activeOpacity={0.85}
              >
                <Text style={[styles.budgetPillText, active && styles.budgetPillTextActive]}>{pill.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* Diet filter — multi-select chips */}
      <View style={styles.dietToggleRow} testID="diet-toggle-row">
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: SPACE.s, paddingRight: SPACE.m }}>
          <TouchableOpacity
            testID="diet-toggle-all"
            style={[styles.dietToggleBtn, dietFilter.length === 0 && styles.dietToggleBtnAllActive]}
            onPress={() => setDietFilter([])}
          >
            <Ionicons name="apps" size={14} color={dietFilter.length === 0 ? FUEL.lime : FUEL.muted} />
            <Text style={[styles.dietToggleText, dietFilter.length === 0 && styles.dietToggleTextActive]}>All</Text>
          </TouchableOpacity>
          {DIET_TAGS.map(tag => {
            const on = dietFilter.includes(tag);
            const accent = tag === 'non-veg' ? FUEL.nonVeg : FUEL.veg;
            return (
              <TouchableOpacity
                key={tag}
                testID={`diet-toggle-${tag}`}
                style={[styles.dietToggleBtn, on && { backgroundColor: accent, borderColor: accent }]}
                onPress={() => setDietFilter(prev => toggleDietTag(prev, tag))}
              >
                <View style={[styles.dietToggleDot, { backgroundColor: on ? FUEL.white : accent, borderColor: on ? FUEL.white : accent }]} />
                <Text style={[styles.dietToggleText, on && { color: FUEL.white, fontFamily: FONT.bodyExtrabold }]}>{DIET_LABEL[tag]}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* CATEGORY WALL — grouped by parent_group, 2-column display-type grid */}
      <View style={styles.wallGrid}>
        {(() => {
          const GROUP_LABEL: Record<string, string> = { meals: 'MEALS', drinks: 'DRINKS', desserts: 'DESSERTS' };
          const GROUP_ORDER = ['meals', 'drinks', 'desserts'];
          const buckets: Record<string, any[]> = {};
          const seen: string[] = [];
          visibleCats.forEach((cat: any) => {
            const g = cat.parent_group || '_';
            if (!buckets[g]) { buckets[g] = []; seen.push(g); }
            buckets[g].push(cat);
          });
          const groups = [
            ...GROUP_ORDER.filter(g => buckets[g]),
            ...seen.filter(g => !GROUP_ORDER.includes(g)),
          ];
          let idx = 0;
          return groups.map(g => (
            <React.Fragment key={g}>
              {GROUP_LABEL[g] ? <Text style={styles.wallSectionLabel}>{GROUP_LABEL[g]}</Text> : null}
              {buckets[g].map((cat: any) => renderWallTile(cat, idx++))}
            </React.Fragment>
          ));
        })()}
        {showAllTile && !wallExpanded && (
          <TouchableOpacity
            testID="category-wall-all"
            style={[styles.wallTile, styles.wallTileAll]}
            onPress={() => setWallExpanded(true)}
            activeOpacity={0.85}
          >
            <Text style={styles.wallTileAllText}>ALL CATEGORIES +{hiddenCount} ▸</Text>
          </TouchableOpacity>
        )}
        {showAllTile && wallExpanded && (
          <TouchableOpacity
            testID="category-wall-less"
            style={[styles.wallTile, styles.wallTileAll]}
            onPress={() => setWallExpanded(false)}
            activeOpacity={0.85}
          >
            <Text style={styles.wallTileAllText}>SHOW LESS ▴</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* TODAY'S BEST PROTEIN VALUE — auto, client-side */}
      {bestValue && (
        <View style={styles.bestValueCard} testID="best-value-card">
          <View style={styles.bestValueLeft}>
            <View style={styles.bestValueLabelRow}>
              <Ionicons name="trophy" size={12} color={FUEL.lime} />
              <Text style={styles.bestValueLabel}>TODAY'S BEST PROTEIN VALUE</Text>
            </View>
            <Text style={styles.bestValueName} numberOfLines={1}>{bestValue.product.name}</Text>
            <Text style={styles.bestValueMeta}>
              {Math.round(getServingProtein(bestValue.product))}g protein · ₹{getDisplayPrice(bestValue.product)}{bestValue.product.product_type === 'ready_made' ? '' : '/100g'}
            </Text>
          </View>
          <View style={styles.bestValueRight}>
            <Text style={styles.bestValueRatio}>₹{bestValue.ratio.toFixed(1)}</Text>
            <Text style={styles.bestValueRatioLabel}>/g PROTEIN</Text>
          </View>
        </View>
      )}
    </View>
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Side Drawer */}
      <SideDrawer visible={drawerVisible} onClose={() => setDrawerVisible(false)} user={user} />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.menuBtn} onPress={() => setDrawerVisible(true)}>
          <Ionicons name="menu" size={24} color={FUEL.sand} />
        </TouchableOpacity>
        <Text style={styles.title}>Our Menu</Text>
        <TouchableOpacity style={styles.searchBtn} onPress={() => searchRef.current?.focus()}>
          <Ionicons name="search" size={22} color={FUEL.lime} />
        </TouchableOpacity>
      </View>

      {/* Search Bar — part of the dark header band */}
      <View style={styles.searchStrip}>
        <View style={styles.searchBar}>
          <Ionicons name="search" size={18} color={FUEL.muted} />
          <TextInput
            ref={searchRef}
            style={styles.searchInput}
            value={search}
            onChangeText={setSearch}
            placeholder="Search menu..."
            placeholderTextColor={FUEL.muted}
          />
          {search ? (
            <TouchableOpacity onPress={() => setSearch('')}>
              <Ionicons name="close-circle" size={18} color={FUEL.muted} />
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      {/* Store pill — which store's menu you're viewing (tap to switch) */}
      {selectedStore && (
        <TouchableOpacity
          testID="menu-store-pill"
          style={styles.storePill}
          onPress={() => { if (stores.length > 1) setStorePickerOpen(true); }}
          activeOpacity={stores.length > 1 ? 0.85 : 1}
        >
          <Ionicons name="storefront" size={14} color={FUEL.ink} />
          <Text style={styles.storePillText} numberOfLines={1}>{selectedStore.name}</Text>
          {stores.length > 1 && <Ionicons name="chevron-down" size={14} color={FUEL.muted} />}
        </TouchableOpacity>
      )}

      {/* Product list with hero / wall / best-value header */}
      {loading ? (
        <Animated.View entering={FadeIn.duration(200)} exiting={FadeOut.duration(150)} style={{ flex: 1 }} testID="menu-skeleton">
          <SkeletonList row="menu" count={6} />
        </Animated.View>
      ) : (
      <FlatList
        data={sectioned}
        keyExtractor={i => i.id}
        renderItem={renderRow}
        ListHeaderComponent={listHeader}
        contentContainerStyle={styles.productListContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={FUEL.ink} />}
        showsVerticalScrollIndicator={false}
        ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
        removeClippedSubviews={true}
        maxToRenderPerBatch={10}
        updateCellsBatchingPeriod={50}
        windowSize={10}
        initialNumToRender={8}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={
          loadError ? (
            <View style={styles.emptyState} testID="menu-error">
              <Ionicons name="cloud-offline-outline" size={44} color={FUEL.sandBorder} />
              <Text style={styles.emptyText}>Couldn't load the menu.</Text>
              <TouchableOpacity testID="menu-retry" style={styles.retryBtn} onPress={() => { setLoading(true); loadProducts(); }} activeOpacity={0.85}>
                <Ionicons name="refresh" size={16} color={FUEL.lime} />
                <Text style={styles.retryText}>Retry</Text>
              </TouchableOpacity>
            </View>
          ) : (
          <View style={styles.emptyState}>
            <Ionicons name="restaurant-outline" size={44} color={FUEL.sandBorder} />
            <Text style={styles.emptyText}>
              {dietFilter.length
                ? `No items match ${dietFilter.map(t => DIET_LABEL[t]).join(' + ')}`
                : 'No items found'}
            </Text>
            {dietFilter.length > 0 && (
              <>
                <Text style={styles.emptySub}>Try removing a filter. Closest picks:</Text>
                <View style={styles.nearestWrap}>
                  {nearest.map(np => (
                    <TouchableOpacity key={np.id} testID={`nearest-${np.id}`} style={styles.nearestChip} onPress={() => addItem(np)} activeOpacity={0.8}>
                      <Text style={styles.nearestChipText} numberOfLines={1}>{np.name}</Text>
                      <Ionicons name="add-circle" size={16} color={FUEL.veg} />
                    </TouchableOpacity>
                  ))}
                </View>
                <TouchableOpacity testID="clear-diet-filters" style={styles.clearFiltersBtn} onPress={() => setDietFilter([])} activeOpacity={0.8}>
                  <Text style={styles.clearFiltersText}>Clear diet filters</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
          )
        }
      />
      )}

      {/* Store picker — same store choices as cart, reused via useStore() */}
      <Modal visible={storePickerOpen} transparent animationType="fade" onRequestClose={() => setStorePickerOpen(false)}>
        <TouchableOpacity style={styles.storeModalOverlay} activeOpacity={1} onPress={() => setStorePickerOpen(false)}>
          <View style={styles.storeModalCard} testID="menu-store-modal">
            <Text style={styles.storeModalTitle}>Choose store</Text>
            {stores.map(s => (
              <TouchableOpacity
                key={s.store_id}
                testID={`menu-store-option-${s.store_id}`}
                style={[styles.storeModalRow, selectedStoreId === s.store_id && styles.storeModalRowActive]}
                onPress={() => { selectStore(s.store_id); setStorePickerOpen(false); }}
                activeOpacity={0.85}
              >
                <Ionicons name="storefront" size={18} color={selectedStoreId === s.store_id ? FUEL.ink : FUEL.muted} />
                <Text style={[styles.storeModalRowText, selectedStoreId === s.store_id && styles.storeModalRowTextActive]}>{s.name}</Text>
                {selectedStoreId === s.store_id && <Ionicons name="checkmark-circle" size={18} color={FUEL.limeDeep} />}
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Cart Bar */}
      {cartCount > 0 && (
        <TouchableOpacity testID="customize-btn" style={styles.cartBar} onPress={goCustomize} activeOpacity={0.95}>
          <View>
            <Text style={styles.cartItems}>{cartCount} item{cartCount > 1 ? 's' : ''}</Text>
            <Text style={styles.cartTotal}>₹{Math.round(cartSubtotal)}</Text>
          </View>
          <View style={styles.cartRight}>
            <Text style={styles.cartAction}>View Cart</Text>
            <Ionicons name="arrow-forward" size={18} color={FUEL.ink} />
          </View>
        </TouchableOpacity>
      )}
    </SafeAreaView>
  );
}

const WALL_TILE_WIDTH = (width - 16 * 2 - 10) / 2;

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: FUEL.sand },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  // Header (ink)
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: FUEL.ink,
    paddingHorizontal: SPACE.m,
    paddingVertical: SPACE.m,
  },
  menuBtn: {
    width: 36,
    height: 36,
    borderRadius: RADIUS.sm,
    backgroundColor: FUEL.inkSoft,
    alignItems: 'center',
    justifyContent: 'center'
  },
  title: { fontFamily: FONT.display, fontSize: 20, color: FUEL.sand, textTransform: 'uppercase', letterSpacing: 0.5 },
  searchBtn: {
    width: 36,
    height: 36,
    borderRadius: RADIUS.lg,
    backgroundColor: FUEL.inkSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Search Bar (dark strip continues the header)
  searchStrip: {
    backgroundColor: FUEL.ink,
    paddingHorizontal: SPACE.m,
    paddingBottom: SPACE.m,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: FUEL.inkSoft,
    paddingHorizontal: SPACE.l,
    paddingVertical: SPACE.m,
    borderRadius: RADIUS.lg,
    gap: SPACE.s,
  },
  searchInput: { flex: 1, fontFamily: FONT.bodyMedium, fontSize: 13, color: FUEL.sand },

  // Store pill (below the dark header band)
  storePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.s,
    alignSelf: 'flex-start',
    backgroundColor: FUEL.white,
    borderWidth: 1,
    borderColor: FUEL.sandBorder,
    borderRadius: RADIUS.lg,
    paddingHorizontal: SPACE.m,
    paddingVertical: SPACE.s,
    marginHorizontal: SPACE.m,
    marginTop: SPACE.s,
  },
  storePillText: { fontFamily: FONT.bodyExtrabold, fontSize: 12, color: FUEL.ink, textTransform: 'uppercase', letterSpacing: 0.3, maxWidth: 200 },

  // Store picker modal
  storeModalOverlay: { flex: 1, backgroundColor: 'rgba(21,20,15,0.45)', alignItems: 'center', justifyContent: 'center', padding: SPACE.xl },
  storeModalCard: { width: '100%', maxWidth: 360, backgroundColor: FUEL.white, borderRadius: RADIUS.lg, padding: SPACE.xl },
  storeModalTitle: { fontFamily: FONT.display, fontSize: 20, color: FUEL.ink, textTransform: 'uppercase', letterSpacing: 0.3, marginBottom: SPACE.m },
  storeModalRow: { flexDirection: 'row', alignItems: 'center', gap: SPACE.m, paddingVertical: SPACE.m, paddingHorizontal: SPACE.m, borderRadius: RADIUS.md, borderWidth: 1.5, borderColor: FUEL.sandBorder, marginBottom: SPACE.s },
  storeModalRowActive: { borderColor: FUEL.lime, backgroundColor: FUEL.limeTint },
  storeModalRowText: { flex: 1, fontFamily: FONT.bodyBold, fontSize: 14, color: FUEL.muted },
  storeModalRowTextActive: { color: FUEL.ink, fontFamily: FONT.bodyExtrabold },

  // Retry block (error state)
  retryBtn: { flexDirection: 'row', alignItems: 'center', gap: SPACE.s, backgroundColor: FUEL.ink, borderRadius: RADIUS.lg, paddingVertical: SPACE.m, paddingHorizontal: SPACE.xl, marginTop: SPACE.l },
  retryText: { color: FUEL.lime, fontFamily: FONT.bodyExtrabold, fontSize: 13, textTransform: 'uppercase', letterSpacing: 0.3 },

  // HERO — ink block, rounded bottom corners
  hero: {
    backgroundColor: FUEL.ink,
    borderBottomLeftRadius: RADIUS.lg,
    borderBottomRightRadius: RADIUS.lg,
    paddingHorizontal: SPACE.l,
    paddingTop: SPACE.s,
    paddingBottom: SPACE.l,
    marginHorizontal: -8,
    marginTop: -8,
    marginBottom: SPACE.xs,
  },
  heroLine1: { fontFamily: FONT.display, fontSize: 28, color: FUEL.sand, textTransform: 'uppercase', letterSpacing: 0.5, lineHeight: 34 },
  heroLine2: { fontFamily: FONT.display, fontSize: 28, color: FUEL.lime, textTransform: 'uppercase', letterSpacing: 0.5, lineHeight: 34 },
  proteinStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.s,
    alignSelf: 'flex-start',
    backgroundColor: FUEL.inkSoft,
    borderRadius: RADIUS.lg,
    paddingHorizontal: SPACE.m,
    paddingVertical: SPACE.s,
    marginTop: SPACE.m,
  },
  proteinStripText: { fontFamily: FONT.bodySemibold, fontSize: 12, color: FUEL.sand },
  proteinStripValue: { fontFamily: FONT.bodyExtrabold, color: FUEL.lime },
  budgetRow: { flexDirection: 'row', gap: SPACE.s, marginTop: SPACE.l, flexWrap: 'wrap' },
  budgetPill: {
    backgroundColor: FUEL.inkSoft,
    borderRadius: RADIUS.lg,
    paddingHorizontal: SPACE.m,
    paddingVertical: SPACE.s,
  },
  budgetPillActive: { backgroundColor: FUEL.lime },
  budgetPillText: { fontFamily: FONT.display, fontSize: 11, color: 'rgba(244,241,233,0.7)', letterSpacing: 0.4, textTransform: 'uppercase' },
  budgetPillTextActive: { color: FUEL.ink },

  // Diet Toggle (FUEL pills)
  dietToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.s,
    paddingHorizontal: SPACE.xs,
    paddingTop: SPACE.m,
    paddingBottom: SPACE.xs,
  },
  dietToggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.s,
    paddingHorizontal: SPACE.l,
    paddingVertical: SPACE.s,
    borderRadius: RADIUS.lg,
    backgroundColor: FUEL.white,
    borderWidth: 1.5,
    borderColor: FUEL.sandBorder,
  },
  dietToggleBtnAllActive: {
    backgroundColor: FUEL.ink,
    borderColor: FUEL.ink,
  },
  dietToggleDot: {
    width: 12,
    height: 12,
    borderRadius: RADIUS.xs,
    borderWidth: 2,
  },
  dietToggleText: {
    fontFamily: FONT.bodyBold,
    fontSize: 13,
    color: FUEL.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  dietToggleTextActive: {
    color: FUEL.lime,
    fontFamily: FONT.bodyExtrabold,
  },

  // Category wall — 2-column grid
  wallGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACE.m,
    paddingHorizontal: SPACE.xs,
    paddingTop: SPACE.m,
    paddingBottom: SPACE.xs,
  },
  wallTile: {
    width: WALL_TILE_WIDTH,
    backgroundColor: FUEL.white,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: FUEL.sandBorder,
    paddingHorizontal: SPACE.l,
    paddingVertical: SPACE.l,
    minHeight: 76,
    justifyContent: 'space-between',
  },
  wallTileFirst: {
    backgroundColor: FUEL.ink,
    borderColor: FUEL.ink,
  },
  wallTileActive: {
    borderColor: FUEL.lime,
    borderWidth: 2,
  },
  wallTileAll: {
    backgroundColor: FUEL.lime,
    borderColor: FUEL.lime,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  wallTileTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: SPACE.s },
  wallTileTitle: { flex: 1, fontFamily: FONT.display, fontSize: 16, color: FUEL.ink, textTransform: 'uppercase', letterSpacing: 0.4 },
  wallTileTitleFirst: { color: FUEL.lime },
  wallTileCount: { fontFamily: FONT.bodyBold, fontSize: 10, color: FUEL.muted, letterSpacing: 0.6, marginTop: SPACE.s },
  wallTileCountFirst: { color: 'rgba(244,241,233,0.6)' },
  wallTileAllText: { fontFamily: FONT.display, fontSize: 14, color: FUEL.ink, textTransform: 'uppercase', letterSpacing: 0.4 },
  wallSectionLabel: { width: '100%', fontFamily: FONT.display, fontSize: 14, color: FUEL.muted, textTransform: 'uppercase', letterSpacing: 1, marginTop: SPACE.s, marginBottom: SPACE.xs, paddingHorizontal: SPACE.xs },

  // Best protein value card — dark hero
  bestValueCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: FUEL.ink,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACE.l,
    paddingVertical: SPACE.l,
    marginHorizontal: SPACE.xs,
    marginTop: SPACE.m,
    marginBottom: SPACE.m,
  },
  bestValueLeft: { flex: 1, paddingRight: SPACE.m },
  bestValueLabelRow: { flexDirection: 'row', alignItems: 'center', gap: SPACE.xs },
  bestValueLabel: { fontFamily: FONT.bodyExtrabold, fontSize: 9.5, color: 'rgba(244,241,233,0.6)', letterSpacing: 1 },
  bestValueName: { fontFamily: FONT.display, fontSize: 18, color: FUEL.sand, textTransform: 'uppercase', marginTop: SPACE.xs },
  bestValueMeta: { fontFamily: FONT.bodyMedium, fontSize: 12, color: 'rgba(244,241,233,0.7)', marginTop: 3 },
  bestValueRight: { alignItems: 'center', backgroundColor: FUEL.inkSoft, borderRadius: RADIUS.md, paddingHorizontal: SPACE.m, paddingVertical: SPACE.m },
  bestValueRatio: { fontFamily: FONT.display, fontSize: 20, color: FUEL.lime },
  bestValueRatioLabel: { fontFamily: FONT.bodyBold, fontSize: 8, color: 'rgba(244,241,233,0.6)', letterSpacing: 0.6, marginTop: 2 },

  // Product List
  productListContent: {
    padding: SPACE.s,
    paddingBottom: 120,
  },
  subcatHeader: {  // PR-1
    fontFamily: FONT.bodyExtrabold,
    fontSize: 12,
    color: FUEL.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: SPACE.m,
    marginBottom: SPACE.xs,
    marginLeft: SPACE.xs,
  },

  // Product row — photo left
  productCard: {
    flexDirection: 'row',
    backgroundColor: FUEL.white,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: FUEL.sandBorder,
    padding: SPACE.m,
    gap: SPACE.m,
    shadowColor: FUEL.ink,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 5,
    elevation: 2,
  },
  productImageWrapper: {
    width: 72,
  },
  productImage: {
    width: 72,
    height: 72,
    borderRadius: RADIUS.md,
    backgroundColor: FUEL.sand,
  },
  productImagePlaceholder: {
    alignItems: 'center',
    justifyContent: 'center'
  },
  valueBadge: {
    position: 'absolute',
    bottom: -6,
    alignSelf: 'center',
    backgroundColor: FUEL.ink,
    borderRadius: RADIUS.sm,
    paddingHorizontal: SPACE.s,
    paddingVertical: 3,
  },
  valueBadgeText: { fontFamily: FONT.bodyExtrabold, fontSize: 8.5, color: FUEL.lime, letterSpacing: 0.2 },

  productInfo: {
    flex: 1,
  },
  productHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: SPACE.s,
  },
  productName: {
    flex: 1,
    fontFamily: FONT.bodyExtrabold,
    fontSize: 14,
    color: FUEL.ink,
    lineHeight: 18,
  },
  vegIndicator: {
    width: 16,
    height: 16,
    borderRadius: RADIUS.xs,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: FUEL.white,
  },
  vegDot: { width: 8, height: 8, borderRadius: RADIUS.xs },
  productDesc: {
    fontFamily: FONT.body,
    fontSize: 11,
    color: FUEL.muted,
    marginTop: 3,
    lineHeight: 14,
  },
  productFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: SPACE.m,
  },
  productPrice: {
    fontFamily: FONT.display,
    fontSize: 19,
    color: FUEL.ink,
  },
  priceUnit: {
    fontFamily: FONT.body,
    fontSize: 10,
    color: FUEL.muted,
  },
  addBtn: {
    backgroundColor: FUEL.lime,
    paddingHorizontal: SPACE.l,
    paddingVertical: SPACE.s,
    borderRadius: RADIUS.lg,
  },
  addBtnText: {
    color: FUEL.ink,
    fontFamily: FONT.display,
    fontSize: 13,
    textTransform: 'uppercase',
  },
  qtyBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: FUEL.ink,
    borderRadius: RADIUS.lg,
    overflow: 'hidden'
  },
  qtyBtn: { paddingHorizontal: SPACE.m, paddingVertical: SPACE.s },
  qtyText: { color: FUEL.white, fontFamily: FONT.bodyExtrabold, fontSize: 12, minWidth: 36, textAlign: 'center' },

  // Empty State
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    fontFamily: FONT.bodySemibold,
    fontSize: 14,
    color: FUEL.muted,
    marginTop: SPACE.m,
    textAlign: 'center',
    paddingHorizontal: SPACE.xl,
  },
  emptySub: { fontFamily: FONT.body, fontSize: 12, color: FUEL.muted, marginTop: SPACE.m, marginBottom: SPACE.s },
  nearestWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.s, justifyContent: 'center', paddingHorizontal: SPACE.l },
  nearestChip: { flexDirection: 'row', alignItems: 'center', gap: SPACE.s, backgroundColor: FUEL.white, borderWidth: 1, borderColor: FUEL.sandBorder, borderRadius: RADIUS.lg, paddingVertical: SPACE.s, paddingHorizontal: SPACE.m, maxWidth: 150 },
  nearestChipText: { fontFamily: FONT.bodyBold, fontSize: 12, color: FUEL.ink },
  clearFiltersBtn: { marginTop: SPACE.l, backgroundColor: FUEL.ink, borderRadius: RADIUS.lg, paddingVertical: SPACE.m, paddingHorizontal: SPACE.xl },
  clearFiltersText: { color: FUEL.lime, fontFamily: FONT.bodyExtrabold, fontSize: 13 },

  // Cart Bar (lime CTA)
  cartBar: {
    position: 'absolute',
    bottom: 0,
    left: 16,
    right: 16,
    backgroundColor: FUEL.lime,
    borderRadius: RADIUS.lg,
    paddingHorizontal: SPACE.xl,
    paddingVertical: SPACE.l,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACE.s,
    elevation: 12,
    zIndex: 100,
    shadowColor: FUEL.ink,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  cartItems: { color: FUEL.ink, fontFamily: FONT.bodyBold, fontSize: 12 },
  cartTotal: { color: FUEL.ink, fontFamily: FONT.display, fontSize: 24 },
  cartRight: { flexDirection: 'row', alignItems: 'center', gap: SPACE.s },
  cartAction: { color: FUEL.ink, fontFamily: FONT.display, fontSize: 15, textTransform: 'uppercase', letterSpacing: 0.5 },

  // Macro chips (P / C / F)
  macroChips: { flexDirection: 'row', gap: SPACE.s, marginTop: SPACE.s },
  macroChip: { paddingHorizontal: SPACE.s, paddingVertical: 3, borderRadius: RADIUS.sm },
  macroChipText: { fontFamily: FONT.bodyExtrabold, fontSize: 10, letterSpacing: 0.2 },
  goalFitBadge: { flexDirection: 'row', alignItems: 'center', gap: SPACE.xs, marginTop: SPACE.s, alignSelf: 'flex-start', backgroundColor: FUEL.limeTint, paddingHorizontal: SPACE.s, paddingVertical: SPACE.xs, borderRadius: RADIUS.sm },
  goalFitText: { fontFamily: FONT.bodyExtrabold, fontSize: 10, color: '#4F5A2E' },
});
