import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, Image, RefreshControl,
  Alert, ActivityIndicator, ScrollView, TextInput, Dimensions
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { apiCall } from '../../utils/api';
import SideDrawer from '../components/SideDrawer';
import { getStoredUser } from '../../utils/api';
import { useRealtime } from '../../utils/realtime';
import { FUEL, FONT } from '../../utils/theme';
import { useCart } from '../../utils/CartContext';
import { DIET_TAGS, DIET_LABEL, matchesDiet, matchesAnyDiet, toggleDietTag } from '../../utils/diet';
import CartPill from '../components/CartPill';

// BK Design System Colors
const BK_RED = '#15140F';
const BK_ORANGE = '#15140F';
const BK_BROWN = '#15140F';
const BK_CREAM = '#F4F1E9';
const BK_GREEN = '#3FA34D';
const BK_WHITE = '#FFFFFF';
const BK_TEXT_LIGHT = '#6B6A5E';
const Z_RED = BK_RED;
const GREEN = BK_GREEN;
const PURPLE = BK_RED;
const { width, height } = Dimensions.get('window');

// Default categories (used as fallback if no DB categories)
const DEFAULT_CATS = [
  { key: 'Protein', label: 'Protein', icon: 'barbell', color: Z_RED, image_url: 'https://images.unsplash.com/photo-1632778149955-e80f8ceca2e8?w=80&h=80&fit=crop' },
  { key: 'Carb', label: 'Carbs', icon: 'leaf', color: '#D69A35', image_url: 'https://images.unsplash.com/photo-1536304929831-ee1ca9d44726?w=80&h=80&fit=crop' },
  { key: 'Fat', label: 'Fats', icon: 'water', color: PURPLE, image_url: 'https://images.unsplash.com/photo-1523049673857-eb18f1d7b578?w=80&h=80&fit=crop' },
  { key: 'Meal', label: 'Meals', icon: 'fast-food', color: GREEN, image_url: 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=80&h=80&fit=crop' },
];

export default function MenuScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const [products, setProducts] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>(DEFAULT_CATS);
  const { addItem, incItem, decItem, getItem, count: cartCount, subtotal: cartSubtotal } = useCart();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [orderType, setOrderType] = useState('dine-in');
  const [selectedCat, setSelectedCat] = useState('');
  const [search, setSearch] = useState('');
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [dietFilter, setDietFilter] = useState<string[]>([]);

  // Handle URL params for category/diet filter (only on initial load)
  useEffect(() => {
    if (params.category) {
      setSelectedCat(params.category as string);
    }
    if (params.dietFilter) {
      setDietFilter(params.dietFilter as 'veg' | 'non-veg');
    }
  }, []); // Only run once on mount

  const loadProducts = useCallback(async () => {
    try { 
      const [data, u, cats] = await Promise.all([
        apiCall('/products'),
        getStoredUser(),
        apiCall('/categories').catch(() => [])
      ]);
      setUser(u);
      setProducts(data.filter((p: any) => {
        if (p.product_type === 'ready_made') return p.is_active !== false;
        return p.available_qty_grams > 0;
      }));
      // Merge DB categories with defaults
      if (cats && cats.length > 0) {
        setCategories(cats);
      }
    }
    catch (e) {} finally { setLoading(false); }
  }, []);

  useEffect(() => { loadProducts(); }, []);
  // Live menu/stock sync: re-fetch when admin edits menu or stock changes (C3)
  useRealtime((msg) => {
    if (msg.type === 'menu_update') loadProducts();
  });
  const onRefresh = async () => { setRefreshing(true); await loadProducts(); setRefreshing(false); };

  // Add to cart now goes through the shared CartContext (one cart app-wide).
  // addItem(product) handles single (+100g) vs ready-made (+1 plate);
  // incItem/decItem drive the stepper.

  // Filter products (memoized for performance)
  const filtered = useMemo(() => {
    return products.filter(p => {
      // Search filter
      const searchMatch = !search || p.name.toLowerCase().includes(search.toLowerCase());
      if (!searchMatch) return false;
      
      // Diet type filter (multi-select tags, AND semantics)
      if (!matchesDiet(p, dietFilter)) return false;
      
      // Category filter
      if (!selectedCat) return true;
      
      // Handle special categories
      if (selectedCat === 'veg') return p.diet_type === 'veg';
      if (selectedCat === 'non-veg') return p.diet_type === 'non-veg';
      
      // Meal category - show ready-made meals OR products in Meal category
      if (selectedCat === 'Meal') {
        return p.product_type === 'ready_made' || p.category === 'Meal';
      }
      
      // Standard category matching
      return p.category === selectedCat;
    });
  }, [products, search, dietFilter, selectedCat]);

  // Nearest options when a multi-tag AND combo returns nothing (e.g. Vegan+Keto)
  const nearest = useMemo(() => {
    if (dietFilter.length < 2) return [];
    return products.filter(p => matchesAnyDiet(p, dietFilter)).slice(0, 6);
  }, [products, dietFilter]);

  const goCustomize = () => {
    if (cartCount === 0) { Alert.alert('Empty Cart', 'Add items first'); return; }
    router.push('/cart');
  };

  // Render left sidebar category card
  const renderSidebarCat = (cat: any, index: number) => {
    // Use name for filtering consistency (products use category name, not key)
    const catValue = cat.name;
    const isActive = selectedCat === catValue;
    const catColor = cat.color || '#15140F';
    const fontStyleProp = cat.font_style === 'bold' ? { fontWeight: '800' as const } : cat.font_style === 'italic' ? { fontStyle: 'italic' as const } : cat.font_style === 'mono' ? { fontFamily: 'monospace' } : {};
    return (
      <TouchableOpacity
        key={cat.id || catValue}
        testID={`sidebar-cat-${catValue}`}
        style={[styles.sidebarCat, isActive && styles.sidebarCatActive]}
        onPress={() => {
          console.log('Category clicked:', catValue, 'Current:', selectedCat);
          setSelectedCat(prev => prev === catValue ? '' : catValue);
        }}
        activeOpacity={0.8}
      >
        {cat.image_url ? (
          <Image source={{ uri: cat.image_url }} style={styles.sidebarCatImg} />
        ) : (
          <View style={[styles.sidebarCatIcon, { backgroundColor: catColor }]}>
            <Ionicons name={(cat.icon || 'grid') as any} size={24} color="#FFF" />
          </View>
        )}
        <Text style={[styles.sidebarCatLabel, isActive && { color: catColor, fontWeight: '800' }, fontStyleProp]} numberOfLines={2}>
          {cat.label || cat.name}
        </Text>
        {isActive && <View style={[styles.sidebarActiveBar, { backgroundColor: catColor }]} />}
      </TouchableOpacity>
    );
  };

  // Render product card (ENHANCED)
  const renderProduct = ({ item }: { item: any }) => {
    const inCart = getItem(item.id);
    const isReadyMade = item.product_type === 'ready_made';
    const displayPrice = isReadyMade 
      ? (item.fixed_price || Math.round(item.cost_per_100g * (item.serving_grams || 300) / 100))
      : item.cost_per_100g;
    const priceUnit = isReadyMade ? '' : '/100g';
    
    // Smart badges logic
    const isHighProtein = item.protein_per_100g >= 20;
    const isUnderBudget = item.cost_per_100g <= 50;
    const showSmartBadge = isHighProtein || isUnderBudget;
    
    return (
      <View style={styles.productCard} testID={`product-${item.id}`}>
        {/* Product Image with Badges */}
        <View style={styles.productImageWrapper}>
          {item.image_url ? (
            <Image source={{ uri: item.image_url }} style={styles.productImage} />
          ) : (
            <View style={[styles.productImage, styles.productImagePlaceholder]}>
              <Ionicons name={isReadyMade ? 'fast-food' : 'restaurant'} size={32} color="#D0D0D0" />
            </View>
          )}
          
          {/* Smart Badge (High Protein or Budget) */}
          {showSmartBadge && (
            <View style={[styles.smartBadge, { backgroundColor: isHighProtein ? BK_BROWN : BK_GREEN }]}>
              <Ionicons name={isHighProtein ? 'barbell' : 'wallet'} size={10} color="#FFF" />
              <Text style={styles.smartBadgeText}>{isHighProtein ? 'HIGH PROTEIN' : 'BUDGET'}</Text>
            </View>
          )}
          
          {/* Protein Badge (BK style) */}
          <View style={styles.proteinBadge}>
            <Text style={styles.proteinValue}>{item.protein_per_100g}g</Text>
            <Text style={styles.proteinLabel}>Protein</Text>
          </View>
          
          {/* Ready-made vs Build-your-own tag */}
          <View style={[styles.typeTag, isReadyMade ? styles.typeTagMeal : styles.typeTagBuild]}>
            <Ionicons name={isReadyMade ? 'fast-food' : 'construct'} size={9} color={isReadyMade ? '#FFF' : FUEL.ink} />
            <Text style={[styles.typeTagText, !isReadyMade && { color: FUEL.ink }]}>{isReadyMade ? 'READY-MADE' : 'BUILD'}</Text>
          </View>
        </View>
        
        {/* Product Info */}
        <View style={styles.productInfo}>
          <View style={styles.productHeader}>
            <Text style={styles.productName} numberOfLines={2}>{item.name}</Text>
            {/* Veg/Non-veg indicator */}
            <View style={[styles.vegIndicator, { borderColor: item.diet_type === 'non-veg' ? Z_RED : GREEN }]}>
              <View style={[styles.vegDot, { backgroundColor: item.diet_type === 'non-veg' ? Z_RED : GREEN }]} />
            </View>
          </View>
          
          <Text style={styles.productDesc} numberOfLines={2}>
            {item.description || `${item.category} • ${item.calories_per_100g} cal${priceUnit}`}
          </Text>

          {/* Macro chips (P / C / F) — color-coded per-100g nutrition */}
          <View style={styles.macroChips}>
            <View style={[styles.macroChip, { backgroundColor: FUEL.proteinTint }]}>
              <Text style={[styles.macroChipText, { color: FUEL.protein }]}>P {Math.round(item.protein_per_100g || 0)}g</Text>
            </View>
            <View style={[styles.macroChip, { backgroundColor: FUEL.carbsTint }]}>
              <Text style={[styles.macroChipText, { color: '#9A6E1E' }]}>C {Math.round(item.carbs_per_100g || 0)}g</Text>
            </View>
            <View style={[styles.macroChip, { backgroundColor: FUEL.fatTint }]}>
              <Text style={[styles.macroChipText, { color: '#3E6E8A' }]}>F {Math.round(item.fat_per_100g || 0)}g</Text>
            </View>
          </View>

          {/* Price and Add Button Row */}
          <View style={styles.productFooter}>
            <Text style={styles.productPrice}>₹ {displayPrice}{priceUnit && <Text style={styles.priceUnit}>{priceUnit}</Text>}</Text>
            
            {inCart ? (
              <View style={[styles.qtyBox, isReadyMade && { backgroundColor: PURPLE }]}>
                <TouchableOpacity testID={`minus-${item.id}`} style={styles.qtyBtn} onPress={() => decItem(item.id)}>
                  <Ionicons name="remove" size={14} color="#FFF" />
                </TouchableOpacity>
                <Text style={styles.qtyText}>{isReadyMade ? inCart.quantity : `${inCart.grams}g`}</Text>
                <TouchableOpacity testID={`plus-${item.id}`} style={styles.qtyBtn} onPress={() => incItem(item.id)}>
                  <Ionicons name="add" size={14} color="#FFF" />
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity testID={`add-${item.id}`} style={styles.addBtn} onPress={() => addItem(item)}>
                <Text style={styles.addBtnText}>Add +</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>
    );
  };

  if (loading) return <SafeAreaView style={styles.safe}><View style={styles.center}><ActivityIndicator size="large" color={Z_RED} /></View></SafeAreaView>;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Side Drawer */}
      <SideDrawer visible={drawerVisible} onClose={() => setDrawerVisible(false)} user={user} />
      
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.menuBtn} onPress={() => setDrawerVisible(true)}>
          <Ionicons name="menu" size={24} color="#F4F1E9" />
        </TouchableOpacity>
        <Text style={styles.title}>Our Menu</Text>
        <TouchableOpacity style={styles.searchBtn} onPress={() => {}}>
          <Ionicons name="search" size={22} color={FUEL.lime} />
        </TouchableOpacity>
      </View>
      
      {/* Search Bar (collapsible) */}
      <View style={styles.searchBar}>
        <Ionicons name="search" size={18} color="#9C9C9C" />
        <TextInput
          style={styles.searchInput}
          value={search}
          onChangeText={setSearch}
          placeholder="Search menu..."
          placeholderTextColor="#B0B0B0"
        />
        {search ? (
          <TouchableOpacity onPress={() => setSearch('')}>
            <Ionicons name="close-circle" size={18} color="#9C9C9C" />
          </TouchableOpacity>
        ) : null}
      </View>

      {/* Diet filter — multi-select chips */}
      <View style={styles.dietToggleRow} testID="diet-toggle-row">
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingRight: 12 }}>
          <TouchableOpacity
            testID="diet-toggle-all"
            style={[styles.dietToggleBtn, dietFilter.length === 0 && styles.dietToggleBtnAllActive]}
            onPress={() => setDietFilter([])}
          >
            <Ionicons name="apps" size={14} color={dietFilter.length === 0 ? '#FFF' : '#696969'} />
            <Text style={[styles.dietToggleText, dietFilter.length === 0 && styles.dietToggleTextActive]}>All</Text>
          </TouchableOpacity>
          {DIET_TAGS.map(tag => {
            const on = dietFilter.includes(tag);
            const accent = tag === 'non-veg' ? Z_RED : GREEN;
            return (
              <TouchableOpacity
                key={tag}
                testID={`diet-toggle-${tag}`}
                style={[styles.dietToggleBtn, on && { backgroundColor: accent, borderColor: accent }]}
                onPress={() => setDietFilter(prev => toggleDietTag(prev, tag))}
              >
                <View style={[styles.dietToggleDot, { backgroundColor: on ? '#FFF' : accent, borderColor: on ? '#FFF' : accent }]} />
                <Text style={[styles.dietToggleText, on && { color: '#FFF', fontWeight: '800' }]}>{DIET_LABEL[tag]}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Main Content: Left Sidebar + Right Product List */}
      <View style={styles.mainContent}>
        {/* Left Sidebar Categories - Fixed Width */}
        <View style={styles.sidebarContainer}>
          <ScrollView 
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.sidebarContent}
          >
            {categories.map(renderSidebarCat)}
          </ScrollView>
        </View>
        
        {/* Right Product List - Takes remaining space */}
        <View style={styles.productListContainer}>
          <FlatList
            data={filtered}
            keyExtractor={i => i.id}
            renderItem={renderProduct}
            contentContainerStyle={styles.productListContent}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Z_RED} />}
            showsVerticalScrollIndicator={false}
            ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
            removeClippedSubviews={true}
            maxToRenderPerBatch={10}
            updateCellsBatchingPeriod={50}
            windowSize={10}
            initialNumToRender={8}
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <Ionicons name="restaurant-outline" size={44} color="#D0D0D0" />
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
                          <Ionicons name="add-circle" size={16} color={GREEN} />
                        </TouchableOpacity>
                      ))}
                    </View>
                    <TouchableOpacity testID="clear-diet-filters" style={styles.clearFiltersBtn} onPress={() => setDietFilter([])} activeOpacity={0.8}>
                      <Text style={styles.clearFiltersText}>Clear diet filters</Text>
                    </TouchableOpacity>
                  </>
                )}
              </View>
            }
          />
        </View>
      </View>

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

const SIDEBAR_WIDTH = 90;

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: BK_CREAM },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  
  // Header (BK Dark Brown)
  header: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    justifyContent: 'space-between',
    backgroundColor: BK_BROWN, 
    paddingHorizontal: 12, 
    paddingVertical: 12,
  },
  menuBtn: { 
    width: 36, 
    height: 36, 
    borderRadius: 8, 
    backgroundColor: 'rgba(245,235,220,0.15)', 
    alignItems: 'center', 
    justifyContent: 'center' 
  },
  title: { fontSize: 20, fontWeight: '800', color: BK_CREAM, textTransform: 'uppercase', letterSpacing: 0.5 },
  searchBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(245,235,220,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  
  // Search Bar
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: BK_WHITE,
    marginHorizontal: 10,
    marginVertical: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 25,
    gap: 8,
    borderWidth: 2,
    borderColor: '#E6E1D4',
  },
  searchInput: { flex: 1, fontSize: 13, color: BK_BROWN },
  
  // Diet Toggle (BK style pills)
  dietToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 10,
    paddingBottom: 8,
  },
  dietToggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: BK_WHITE,
    borderWidth: 2,
    borderColor: '#E6E1D4',
  },
  dietToggleBtnAllActive: {
    backgroundColor: BK_BROWN,
    borderColor: BK_BROWN,
  },
  dietToggleBtnVegActive: {
    backgroundColor: '#EAF2DD',
    borderColor: BK_GREEN,
  },
  dietToggleBtnNonvegActive: {
    backgroundColor: '#F1E7E1',
    borderColor: BK_RED,
  },
  dietToggleDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
  },
  dietToggleText: {
    fontSize: 13,
    fontWeight: '700',
    color: BK_TEXT_LIGHT,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  dietToggleTextActive: {
    color: BK_CREAM,
    fontWeight: '800',
  },
  
  // Main Content
  mainContent: { 
    flex: 1, 
    flexDirection: 'row',
  },
  
  // Left Sidebar (BK)
  sidebarContainer: { 
    width: SIDEBAR_WIDTH, 
    backgroundColor: BK_WHITE,
    borderRightWidth: 2,
    borderRightColor: '#E6E1D4',
    zIndex: 10,
  },
  sidebarContent: { 
    paddingVertical: 6,
    paddingHorizontal: 2,
    paddingBottom: 100,
  },
  sidebarCat: { 
    width: SIDEBAR_WIDTH - 4,
    alignItems: 'center', 
    paddingVertical: 12,
    paddingHorizontal: 4,
    marginBottom: 4,
    borderLeftWidth: 3,
    borderLeftColor: 'transparent',
    position: 'relative',
  },
  sidebarCatActive: { 
    backgroundColor: '#F2EEE0',
  },
  sidebarActiveBar: {
    position: 'absolute',
    left: 0,
    top: 8,
    bottom: 8,
    width: 3,
    borderRadius: 2,
  },
  sidebarCatImg: { 
    width: 56, 
    height: 56, 
    borderRadius: 12,
    marginBottom: 8,
  },
  sidebarCatIcon: {
    width: 56,
    height: 56,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  sidebarCatLabel: { 
    fontSize: 10, 
    fontWeight: '700', 
    color: BK_TEXT_LIGHT, 
    textAlign: 'center',
    lineHeight: 13,
    width: '100%',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  
  // Product List
  productListContainer: {
    flex: 1,
    zIndex: 1,
  },
  productListContent: { 
    padding: 8,
    paddingBottom: 120,
  },
  
  // Product Card (ENHANCED)
  productCard: { 
    backgroundColor: BK_WHITE, 
    borderRadius: 16, 
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: '#E6E1D4',
    shadowColor: BK_BROWN,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 4,
  },
  productImageWrapper: {
    position: 'relative',
    width: '100%',
    height: 140,
  },
  productImage: { 
    width: '100%', 
    height: '100%',
    backgroundColor: BK_CREAM,
  },
  productImagePlaceholder: { 
    alignItems: 'center', 
    justifyContent: 'center' 
  },
  smartBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
  },
  smartBadgeText: { fontSize: 9, fontWeight: '800', color: BK_WHITE, textTransform: 'uppercase', letterSpacing: 0.5 },
  proteinBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: BK_BROWN,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
    alignItems: 'center',
  },
  proteinValue: { fontSize: 15, fontWeight: '800', color: BK_CREAM },
  proteinLabel: { fontSize: 8, color: 'rgba(245,235,220,0.8)', marginTop: 1, textTransform: 'uppercase' },
  newBadge: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    backgroundColor: BK_GREEN,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },
  newBadgeText: { fontSize: 9, fontWeight: '800', color: BK_WHITE, textTransform: 'uppercase' },
  
  productInfo: { 
    padding: 10,
  },
  productHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 8,
  },
  productName: { 
    flex: 1,
    fontSize: 14, 
    fontWeight: '800', 
    color: BK_BROWN,
    lineHeight: 18,
  },
  vegIndicator: {
    width: 16,
    height: 16,
    borderRadius: 2,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: BK_WHITE,
  },
  vegDot: { width: 8, height: 8, borderRadius: 4 },
  productDesc: { 
    fontSize: 11, 
    color: BK_TEXT_LIGHT, 
    marginTop: 4,
    lineHeight: 14,
  },
  productFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
  },
  productPrice: { 
    fontFamily: FONT.display,
    fontSize: 19, 
    fontWeight: '800', 
    color: BK_BROWN 
  },
  priceUnit: { 
    fontSize: 10, 
    fontWeight: '400', 
    color: BK_TEXT_LIGHT 
  },
  addBtn: { 
    backgroundColor: BK_RED, 
    paddingHorizontal: 18, 
    paddingVertical: 8, 
    borderRadius: 20,
  },
  addBtnText: { 
    color: BK_CREAM, 
    fontSize: 13, 
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  qtyBox: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    backgroundColor: BK_RED, 
    borderRadius: 20, 
    overflow: 'hidden' 
  },
  qtyBtn: { paddingHorizontal: 10, paddingVertical: 8 },
  qtyText: { color: BK_CREAM, fontSize: 12, fontWeight: '800', minWidth: 36, textAlign: 'center' },
  
  // Empty State
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 14,
    color: BK_TEXT_LIGHT,
    marginTop: 12,
    fontWeight: '600',
    textAlign: 'center',
    paddingHorizontal: 20,
  },
  emptySub: { fontSize: 12, color: BK_TEXT_LIGHT, marginTop: 10, marginBottom: 8 },
  nearestWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center', paddingHorizontal: 16 },
  nearestChip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#FFF', borderWidth: 1, borderColor: '#E0E0E0', borderRadius: 20, paddingVertical: 7, paddingHorizontal: 12, maxWidth: 150 },
  nearestChipText: { fontSize: 12, fontWeight: '700', color: BK_BROWN },
  clearFiltersBtn: { marginTop: 16, backgroundColor: BK_BROWN, borderRadius: 22, paddingVertical: 10, paddingHorizontal: 22 },
  clearFiltersText: { color: '#FFF', fontWeight: '800', fontSize: 13 },
  
  // Cart Bar (BK Red)
  cartBar: { 
    position: 'absolute', 
    bottom: 0, 
    left: 16, 
    right: 16, 
    backgroundColor: FUEL.lime, 
    borderRadius: 25, 
    paddingHorizontal: 22, 
    paddingVertical: 14, 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center', 
    marginBottom: 6, 
    elevation: 12,
    zIndex: 100,
    shadowColor: BK_BROWN,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  cartItems: { color: FUEL.ink, fontSize: 12, fontWeight: '700' },
  cartTotal: { color: FUEL.ink, fontFamily: FONT.display, fontSize: 24, fontWeight: '800' },
  cartRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cartAction: { color: FUEL.ink, fontSize: 15, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 },

  // Macro chips (P / C / F)
  macroChips: { flexDirection: 'row', gap: 6, marginTop: 8 },
  macroChip: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  macroChipText: { fontFamily: FONT.bodyExtrabold, fontSize: 10, fontWeight: '800', letterSpacing: 0.2 },

  // Ready-made vs Build-your-own tag
  typeTag: { position: 'absolute', bottom: 8, left: 8, flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 20 },
  typeTagMeal: { backgroundColor: FUEL.ink },
  typeTagBuild: { backgroundColor: FUEL.lime },
  typeTagText: { fontFamily: FONT.bodyExtrabold, fontSize: 9, fontWeight: '800', color: '#FFF', textTransform: 'uppercase', letterSpacing: 0.4 },
});
