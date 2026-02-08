import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput,
  RefreshControl, Alert, ActivityIndicator, Modal, FlatList
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { apiCall, logout } from '../../utils/api';

const PURPLE = '#5B5FE0';
const Z_RED = '#E23744';
const GREEN = '#267E3E';

type Product = {
  id: string;
  name: string;
  cost_per_100g: number;
  calories_per_100g: number;
  protein_per_100g: number;
  carbs_per_100g: number;
  fat_per_100g: number;
  category: string;
  diet_type: string;
  image_url?: string;
  available_qty_grams: number;
  product_type?: string;
  fixed_price?: number;
  serving_grams?: number;
};

type CartItem = {
  product: Product;
  grams: number;
  quantity: number;
  price: number;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
};

type Category = { id: string; name: string; key: string; icon: string; color: string };

export default function CashierPOS() {
  const router = useRouter();
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [search, setSearch] = useState('');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showCart, setShowCart] = useState(false);
  const [orderType, setOrderType] = useState<'dine-in' | 'takeaway'>('dine-in');
  const [placing, setPlacing] = useState(false);
  const [showAI, setShowAI] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiGoal, setAiGoal] = useState('maintenance');
  const [aiBudget, setAiBudget] = useState('200');
  const [aiDiet, setAiDiet] = useState('both');
  const [aiResult, setAiResult] = useState<any>(null);

  const loadData = useCallback(async () => {
    try {
      const [prods, cats] = await Promise.all([apiCall('/products'), apiCall('/categories')]);
      setProducts(prods);
      setCategories(cats);
    } catch (e) {
      console.log('POS load error:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, []);
  const onRefresh = async () => { setRefreshing(true); await loadData(); setRefreshing(false); };

  const filteredProducts = products.filter(p => {
    if (search && !p.name.toLowerCase().includes(search.toLowerCase())) return false;
    if (selectedCategory === 'All') return true;
    if (selectedCategory === 'veg') return p.diet_type === 'veg';
    if (selectedCategory === 'non-veg') return p.diet_type === 'non-veg';
    return p.category === selectedCategory;
  });

  const addToCart = (product: Product, grams: number = 100) => {
    setCart(prev => {
      const existing = prev.findIndex(c => c.product.id === product.id);
      const factor = grams / 100;
      const item: CartItem = {
        product,
        grams,
        quantity: 1,
        price: product.product_type === 'ready_made' ? (product.fixed_price || 0) : Math.round(factor * product.cost_per_100g * 100) / 100,
        calories: Math.round(factor * product.calories_per_100g * 10) / 10,
        protein: Math.round(factor * product.protein_per_100g * 10) / 10,
        carbs: Math.round(factor * product.carbs_per_100g * 10) / 10,
        fat: Math.round(factor * product.fat_per_100g * 10) / 10,
      };
      if (existing >= 0) {
        const updated = [...prev];
        updated[existing].grams += grams;
        const f2 = updated[existing].grams / 100;
        updated[existing].price = Math.round(f2 * product.cost_per_100g * 100) / 100;
        updated[existing].calories = Math.round(f2 * product.calories_per_100g * 10) / 10;
        updated[existing].protein = Math.round(f2 * product.protein_per_100g * 10) / 10;
        updated[existing].carbs = Math.round(f2 * product.carbs_per_100g * 10) / 10;
        updated[existing].fat = Math.round(f2 * product.fat_per_100g * 10) / 10;
        return updated;
      }
      return [...prev, item];
    });
  };

  const removeFromCart = (productId: string) => {
    setCart(prev => prev.filter(c => c.product.id !== productId));
  };

  const cartTotals = cart.reduce((acc, c) => ({
    price: acc.price + c.price,
    calories: acc.calories + c.calories,
    protein: acc.protein + c.protein,
    carbs: acc.carbs + c.carbs,
    fat: acc.fat + c.fat,
  }), { price: 0, calories: 0, protein: 0, carbs: 0, fat: 0 });

  const placeOrder = async () => {
    if (cart.length === 0) return;
    setPlacing(true);
    try {
      const orderData = {
        order_type: orderType,
        items: cart.map(c => ({
          product_id: c.product.id,
          product_name: c.product.name,
          grams: c.grams,
          price: c.price,
          calories: c.calories,
          protein: c.protein,
          carbs: c.carbs,
          fat: c.fat,
          product_type: c.product.product_type || 'single',
          quantity: c.quantity,
        })),
        total_price: Math.round(cartTotals.price * 100) / 100,
        total_calories: Math.round(cartTotals.calories * 10) / 10,
        total_protein: Math.round(cartTotals.protein * 10) / 10,
        total_carbs: Math.round(cartTotals.carbs * 10) / 10,
        total_fat: Math.round(cartTotals.fat * 10) / 10,
      };
      const result = await apiCall('/orders', { method: 'POST', body: orderData });
      Alert.alert('Order Placed!', `Order #${result.id}\nTotal: ₹${Math.round(cartTotals.price)}\n${orderType.toUpperCase()}`);
      setCart([]);
      setShowCart(false);
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to place order');
    } finally {
      setPlacing(false);
    }
  };

  const runAIMeal = async () => {
    setAiLoading(true);
    setAiResult(null);
    try {
      const result = await apiCall('/ai/quick-meal', {
        method: 'POST',
        body: { diet_preference: aiDiet, goal: aiGoal, budget: parseFloat(aiBudget) || undefined, order_type: orderType }
      });
      setAiResult(result);
    } catch (e: any) {
      Alert.alert('Error', e.message || 'AI suggestion failed');
    } finally {
      setAiLoading(false);
    }
  };

  const addAIResultToCart = () => {
    if (!aiResult?.meal_items) return;
    for (const item of aiResult.meal_items) {
      const product = products.find(p => p.id === item.product_id);
      if (product) {
        addToCart(product, item.grams);
      }
    }
    setShowAI(false);
    setAiResult(null);
    setShowCart(true);
  };

  const handleLogout = async () => { await logout(); router.replace('/'); };

  if (loading) {
    return <SafeAreaView style={styles.safe}><View style={styles.center}><ActivityIndicator size="large" color={PURPLE} /></View></SafeAreaView>;
  }

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>POS Terminal</Text>
          <Text style={styles.sub}>Cashier Mode</Text>
        </View>
        <View style={styles.headerActions}>
          <TouchableOpacity data-testid="ai-suggest-btn" style={styles.aiBtn} onPress={() => setShowAI(true)}>
            <Ionicons name="sparkles" size={18} color="#FFF" />
          </TouchableOpacity>
          <TouchableOpacity data-testid="open-cart-btn" style={styles.cartBtn} onPress={() => setShowCart(true)}>
            <Ionicons name="cart" size={20} color="#FFF" />
            {cart.length > 0 && <View style={styles.cartBadge}><Text style={styles.cartBadgeText}>{cart.length}</Text></View>}
          </TouchableOpacity>
          <TouchableOpacity data-testid="cashier-logout-btn" style={styles.logoutBtn} onPress={handleLogout}>
            <Ionicons name="log-out-outline" size={18} color={PURPLE} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Search */}
      <View style={styles.searchRow}>
        <View style={styles.searchBox}>
          <Ionicons name="search" size={18} color="#9C9C9C" />
          <TextInput
            data-testid="search-input"
            style={styles.searchInput}
            value={search}
            onChangeText={setSearch}
            placeholder="Search menu..."
            placeholderTextColor="#B0B0B0"
          />
        </View>
      </View>

      {/* Categories */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoryScroll} contentContainerStyle={styles.categoryContent}>
        {[{ key: 'All', name: 'All', icon: 'apps', color: PURPLE } as any, ...categories].map(cat => (
          <TouchableOpacity
            key={cat.key || cat.name}
            data-testid={`cat-${cat.key || cat.name}`}
            style={[styles.categoryChip, selectedCategory === (cat.key || cat.name) && { backgroundColor: PURPLE, borderColor: PURPLE }]}
            onPress={() => setSelectedCategory(cat.key || cat.name)}
          >
            <Text style={[styles.categoryText, selectedCategory === (cat.key || cat.name) && { color: '#FFF' }]}>{cat.name}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Order type toggle */}
      <View style={styles.orderTypeRow}>
        {(['dine-in', 'takeaway'] as const).map(t => (
          <TouchableOpacity
            key={t}
            data-testid={`order-type-${t}`}
            style={[styles.orderTypeBtn, orderType === t && styles.orderTypeBtnActive]}
            onPress={() => setOrderType(t)}
          >
            <Ionicons name={t === 'dine-in' ? 'restaurant' : 'bag-handle'} size={16} color={orderType === t ? '#FFF' : '#9C9C9C'} />
            <Text style={[styles.orderTypeText, orderType === t && { color: '#FFF' }]}>{t === 'dine-in' ? 'Dine-In' : 'Takeaway'}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Product Grid */}
      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={PURPLE} />}
        contentContainerStyle={styles.productGrid}
      >
        {filteredProducts.map(product => {
          const inCart = cart.find(c => c.product.id === product.id);
          return (
            <TouchableOpacity
              key={product.id}
              data-testid={`product-${product.id}`}
              style={[styles.productCard, inCart && styles.productInCart]}
              onPress={() => addToCart(product, 100)}
            >
              <View style={[styles.productIcon, { backgroundColor: product.diet_type === 'non-veg' ? '#FDE8EA' : '#E8F5E9' }]}>
                <Ionicons name={product.diet_type === 'non-veg' ? 'flame' : 'leaf'} size={20} color={product.diet_type === 'non-veg' ? Z_RED : GREEN} />
              </View>
              <Text style={styles.productName} numberOfLines={1}>{product.name}</Text>
              <Text style={styles.productPrice}>₹{product.cost_per_100g}/100g</Text>
              <Text style={styles.productNutrition}>{product.calories_per_100g} cal | P:{product.protein_per_100g}g</Text>
              {inCart && (
                <View style={styles.inCartBadge}>
                  <Text style={styles.inCartText}>{inCart.grams}g</Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Floating Cart Summary */}
      {cart.length > 0 && !showCart && (
        <TouchableOpacity data-testid="cart-summary-bar" style={styles.cartBar} onPress={() => setShowCart(true)}>
          <View>
            <Text style={styles.cartBarTitle}>{cart.length} items | ₹{Math.round(cartTotals.price)}</Text>
            <Text style={styles.cartBarSub}>{Math.round(cartTotals.calories)} cal</Text>
          </View>
          <View style={styles.cartBarBtn}>
            <Text style={styles.cartBarBtnText}>View Cart</Text>
            <Ionicons name="arrow-forward" size={16} color="#FFF" />
          </View>
        </TouchableOpacity>
      )}

      {/* Cart Modal */}
      <Modal visible={showCart} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Cart ({cart.length} items)</Text>
              <TouchableOpacity onPress={() => setShowCart(false)}>
                <Ionicons name="close" size={24} color="#1C1C2E" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.cartList}>
              {cart.map(c => (
                <View key={c.product.id} style={styles.cartItem}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.cartItemName}>{c.product.name}</Text>
                    <Text style={styles.cartItemDetail}>{c.grams}g | {Math.round(c.calories)} cal | P:{Math.round(c.protein)}g</Text>
                  </View>
                  <Text style={styles.cartItemPrice}>₹{Math.round(c.price)}</Text>
                  <TouchableOpacity data-testid={`remove-${c.product.id}`} onPress={() => removeFromCart(c.product.id)} style={styles.removeBtn}>
                    <Ionicons name="close-circle" size={22} color={Z_RED} />
                  </TouchableOpacity>
                </View>
              ))}
            </ScrollView>

            {/* Totals */}
            <View style={styles.totalSection}>
              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>Subtotal</Text>
                <Text style={styles.totalValue}>₹{Math.round(cartTotals.price)}</Text>
              </View>
              {orderType === 'takeaway' && (
                <View style={styles.totalRow}>
                  <Text style={styles.totalLabel}>Packaging</Text>
                  <Text style={styles.totalValue}>₹10</Text>
                </View>
              )}
              <View style={[styles.totalRow, styles.grandTotal]}>
                <Text style={styles.grandTotalLabel}>Total</Text>
                <Text style={styles.grandTotalValue}>₹{Math.round(cartTotals.price) + (orderType === 'takeaway' ? 10 : 0)}</Text>
              </View>
              <View style={styles.nutritionSummary}>
                <Text style={styles.nutritionText}>{Math.round(cartTotals.calories)} cal | P:{Math.round(cartTotals.protein)}g | C:{Math.round(cartTotals.carbs)}g | F:{Math.round(cartTotals.fat)}g</Text>
              </View>
            </View>

            <TouchableOpacity
              data-testid="place-order-btn"
              style={[styles.placeOrderBtn, cart.length === 0 && styles.placeOrderDisabled]}
              onPress={placeOrder}
              disabled={placing || cart.length === 0}
            >
              {placing ? <ActivityIndicator color="#FFF" /> : (
                <>
                  <Ionicons name="checkmark-circle" size={20} color="#FFF" />
                  <Text style={styles.placeOrderText}>Place Order ({orderType})</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* AI Suggestion Modal */}
      <Modal visible={showAI} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>AI Meal Builder</Text>
              <TouchableOpacity onPress={() => { setShowAI(false); setAiResult(null); }}>
                <Ionicons name="close" size={24} color="#1C1C2E" />
              </TouchableOpacity>
            </View>

            {!aiResult ? (
              <ScrollView>
                <Text style={styles.aiLabel}>Fitness Goal</Text>
                <View style={styles.aiOptions}>
                  {[{ k: 'fat_loss', l: 'Fat Loss' }, { k: 'muscle_gain', l: 'Muscle Gain' }, { k: 'maintenance', l: 'Balanced' }].map(g => (
                    <TouchableOpacity key={g.k} style={[styles.aiOption, aiGoal === g.k && styles.aiOptionActive]} onPress={() => setAiGoal(g.k)}>
                      <Text style={[styles.aiOptionText, aiGoal === g.k && { color: '#FFF' }]}>{g.l}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <Text style={styles.aiLabel}>Diet Preference</Text>
                <View style={styles.aiOptions}>
                  {[{ k: 'veg', l: 'Veg' }, { k: 'non-veg', l: 'Non-Veg' }, { k: 'both', l: 'Both' }].map(d => (
                    <TouchableOpacity key={d.k} style={[styles.aiOption, aiDiet === d.k && styles.aiOptionActive]} onPress={() => setAiDiet(d.k)}>
                      <Text style={[styles.aiOptionText, aiDiet === d.k && { color: '#FFF' }]}>{d.l}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <Text style={styles.aiLabel}>Budget (₹)</Text>
                <TextInput
                  style={styles.aiInput}
                  value={aiBudget}
                  onChangeText={setAiBudget}
                  keyboardType="number-pad"
                  placeholder="200"
                  placeholderTextColor="#B0B0B0"
                />

                <TouchableOpacity data-testid="ai-build-btn" style={styles.aiBuildBtn} onPress={runAIMeal} disabled={aiLoading}>
                  {aiLoading ? <ActivityIndicator color="#FFF" /> : (
                    <>
                      <Ionicons name="sparkles" size={18} color="#FFF" />
                      <Text style={styles.aiBuildText}>Build Meal with AI</Text>
                    </>
                  )}
                </TouchableOpacity>
              </ScrollView>
            ) : (
              <ScrollView>
                <Text style={styles.aiSummary}>{aiResult.summary}</Text>
                {aiResult.meal_items?.map((item: any, idx: number) => (
                  <View key={idx} style={styles.aiItem}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.aiItemName}>{item.product_name}</Text>
                      <Text style={styles.aiItemDetail}>{item.grams}g | {Math.round(item.calories)} cal | P:{Math.round(item.protein)}g</Text>
                      {item.reason ? <Text style={styles.aiItemReason}>{item.reason}</Text> : null}
                    </View>
                    <Text style={styles.aiItemPrice}>₹{Math.round(item.price)}</Text>
                  </View>
                ))}
                {aiResult.totals && (
                  <View style={styles.aiTotals}>
                    <Text style={styles.aiTotalsText}>Total: ₹{Math.round(aiResult.totals.price)} | {Math.round(aiResult.totals.calories)} cal | P:{Math.round(aiResult.totals.protein)}g</Text>
                  </View>
                )}
                <View style={styles.aiActions}>
                  <TouchableOpacity style={styles.aiRetryBtn} onPress={runAIMeal}>
                    <Ionicons name="refresh" size={16} color={PURPLE} />
                    <Text style={styles.aiRetryText}>Retry</Text>
                  </TouchableOpacity>
                  <TouchableOpacity data-testid="ai-add-to-cart" style={styles.aiAddBtn} onPress={addAIResultToCart}>
                    <Ionicons name="cart" size={16} color="#FFF" />
                    <Text style={styles.aiAddText}>Add to Cart</Text>
                  </TouchableOpacity>
                </View>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F8F8F8' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12 },
  title: { fontSize: 22, fontWeight: '800', color: '#1C1C2E' },
  sub: { fontSize: 12, color: '#9C9C9C', marginTop: 2 },
  headerActions: { flexDirection: 'row', gap: 10 },
  aiBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: PURPLE, alignItems: 'center', justifyContent: 'center' },
  cartBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: Z_RED, alignItems: 'center', justifyContent: 'center' },
  cartBadge: { position: 'absolute', top: -4, right: -4, width: 18, height: 18, borderRadius: 9, backgroundColor: '#FFF', alignItems: 'center', justifyContent: 'center' },
  cartBadgeText: { fontSize: 10, fontWeight: '800', color: Z_RED },
  logoutBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: '#F0F0FF', alignItems: 'center', justifyContent: 'center' },
  searchRow: { paddingHorizontal: 16, marginBottom: 10 },
  searchBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', borderRadius: 12, paddingHorizontal: 14, gap: 8, borderWidth: 1, borderColor: '#EFEFEF' },
  searchInput: { flex: 1, fontSize: 15, paddingVertical: 12, color: '#1C1C2E' },
  categoryScroll: { maxHeight: 44, marginBottom: 8 },
  categoryContent: { paddingHorizontal: 16, gap: 8 },
  categoryChip: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, backgroundColor: '#FFF', borderWidth: 1, borderColor: '#EFEFEF' },
  categoryText: { fontSize: 13, fontWeight: '600', color: '#1C1C2E' },
  orderTypeRow: { flexDirection: 'row', paddingHorizontal: 16, gap: 10, marginBottom: 10 },
  orderTypeBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 10, backgroundColor: '#FFF', borderWidth: 1, borderColor: '#EFEFEF' },
  orderTypeBtnActive: { backgroundColor: PURPLE, borderColor: PURPLE },
  orderTypeText: { fontSize: 13, fontWeight: '600', color: '#9C9C9C' },
  productGrid: { paddingHorizontal: 16, flexDirection: 'row', flexWrap: 'wrap', gap: 10, paddingBottom: 100 },
  productCard: { width: '48%', backgroundColor: '#FFF', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: '#EFEFEF' },
  productInCart: { borderColor: PURPLE, borderWidth: 2 },
  productIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  productName: { fontSize: 14, fontWeight: '700', color: '#1C1C2E', marginBottom: 4 },
  productPrice: { fontSize: 15, fontWeight: '800', color: PURPLE },
  productNutrition: { fontSize: 11, color: '#9C9C9C', marginTop: 2 },
  inCartBadge: { position: 'absolute', top: 8, right: 8, backgroundColor: PURPLE, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2 },
  inCartText: { fontSize: 10, color: '#FFF', fontWeight: '700' },
  cartBar: { position: 'absolute', bottom: 70, left: 16, right: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: PURPLE, borderRadius: 16, padding: 16, elevation: 8, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8 },
  cartBarTitle: { fontSize: 15, fontWeight: '700', color: '#FFF' },
  cartBarSub: { fontSize: 12, color: 'rgba(255,255,255,0.7)', marginTop: 2 },
  cartBarBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8 },
  cartBarBtnText: { fontSize: 13, fontWeight: '700', color: '#FFF' },
  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#FFF', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, maxHeight: '85%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  modalTitle: { fontSize: 20, fontWeight: '800', color: '#1C1C2E' },
  cartList: { maxHeight: 300 },
  cartItem: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#F5F5F5' },
  cartItemName: { fontSize: 15, fontWeight: '700', color: '#1C1C2E' },
  cartItemDetail: { fontSize: 12, color: '#9C9C9C', marginTop: 2 },
  cartItemPrice: { fontSize: 16, fontWeight: '800', color: PURPLE },
  removeBtn: { padding: 4 },
  totalSection: { borderTopWidth: 1, borderTopColor: '#EFEFEF', paddingTop: 16, marginTop: 8 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  totalLabel: { fontSize: 14, color: '#9C9C9C' },
  totalValue: { fontSize: 14, fontWeight: '600', color: '#1C1C2E' },
  grandTotal: { borderTopWidth: 1, borderTopColor: '#EFEFEF', paddingTop: 10, marginTop: 6 },
  grandTotalLabel: { fontSize: 16, fontWeight: '800', color: '#1C1C2E' },
  grandTotalValue: { fontSize: 20, fontWeight: '800', color: PURPLE },
  nutritionSummary: { marginTop: 8, backgroundColor: '#F8F8F8', borderRadius: 10, padding: 10, alignItems: 'center' },
  nutritionText: { fontSize: 12, color: '#9C9C9C', fontWeight: '500' },
  placeOrderBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#267E3E', borderRadius: 14, paddingVertical: 16, marginTop: 16, marginBottom: 20 },
  placeOrderDisabled: { backgroundColor: '#D0D0D0' },
  placeOrderText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
  // AI
  aiLabel: { fontSize: 14, fontWeight: '700', color: '#1C1C2E', marginTop: 16, marginBottom: 8 },
  aiOptions: { flexDirection: 'row', gap: 8 },
  aiOption: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 10, backgroundColor: '#F5F5F5', borderWidth: 1.5, borderColor: '#EFEFEF' },
  aiOptionActive: { backgroundColor: PURPLE, borderColor: PURPLE },
  aiOptionText: { fontSize: 13, fontWeight: '600', color: '#1C1C2E' },
  aiInput: { backgroundColor: '#F5F5F5', borderRadius: 12, padding: 14, fontSize: 18, fontWeight: '700', color: '#1C1C2E', textAlign: 'center', marginTop: 4 },
  aiBuildBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: PURPLE, borderRadius: 14, paddingVertical: 16, marginTop: 24, marginBottom: 20 },
  aiBuildText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
  aiSummary: { fontSize: 14, color: '#1C1C2E', fontWeight: '600', marginBottom: 16, lineHeight: 20 },
  aiItem: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#F5F5F5' },
  aiItemName: { fontSize: 15, fontWeight: '700', color: '#1C1C2E' },
  aiItemDetail: { fontSize: 12, color: '#9C9C9C', marginTop: 2 },
  aiItemReason: { fontSize: 11, color: PURPLE, marginTop: 2, fontStyle: 'italic' },
  aiItemPrice: { fontSize: 16, fontWeight: '800', color: PURPLE },
  aiTotals: { backgroundColor: '#F0F0FF', borderRadius: 12, padding: 14, marginTop: 12, alignItems: 'center' },
  aiTotalsText: { fontSize: 14, fontWeight: '700', color: PURPLE },
  aiActions: { flexDirection: 'row', gap: 12, marginTop: 16, marginBottom: 20 },
  aiRetryBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 14, borderRadius: 12, borderWidth: 2, borderColor: PURPLE },
  aiRetryText: { fontSize: 14, fontWeight: '700', color: PURPLE },
  aiAddBtn: { flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#267E3E', borderRadius: 12, paddingVertical: 14 },
  aiAddText: { color: '#FFF', fontSize: 14, fontWeight: '700' },
});
