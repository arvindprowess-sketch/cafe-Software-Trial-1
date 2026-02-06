import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl,
  SafeAreaView, Alert, ActivityIndicator
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { apiCall } from '../../utils/api';

interface Product {
  id: string; name: string; cost_per_100g: number; category: string;
  calories_per_100g: number; protein_per_100g: number; carbs_per_100g: number;
  fat_per_100g: number; available_qty_grams: number;
}

interface CartItem extends Product { grams: number; }

const CATEGORY_COLORS: Record<string, string> = {
  Protein: '#FF3B30', Carb: '#FF9F0A', Fat: '#007AFF', Other: '#8E8E93'
};
const CATEGORY_ICONS: Record<string, string> = {
  Protein: 'barbell', Carb: 'leaf', Fat: 'water', Other: 'ellipse'
};

export default function MenuScreen() {
  const router = useRouter();
  const [products, setProducts] = useState<Product[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [orderType, setOrderType] = useState('dine-in');

  const loadProducts = useCallback(async () => {
    try {
      const data = await apiCall('/products');
      setProducts(data.filter((p: Product) => p.available_qty_grams > 0));
    } catch (e) {} finally { setLoading(false); }
  }, []);

  useEffect(() => { loadProducts(); }, []);

  const onRefresh = async () => { setRefreshing(true); await loadProducts(); setRefreshing(false); };

  const addToCart = (product: Product) => {
    const exists = cart.find(c => c.id === product.id);
    if (exists) {
      setCart(cart.map(c => c.id === product.id ? { ...c, grams: c.grams + 100 } : c));
    } else {
      setCart([...cart, { ...product, grams: 100 }]);
    }
  };

  const removeFromCart = (productId: string) => {
    setCart(cart.filter(c => c.id !== productId));
  };

  const cartTotal = cart.reduce((sum, item) => sum + (item.grams / 100) * item.cost_per_100g, 0);
  const cartCalories = cart.reduce((sum, item) => sum + (item.grams / 100) * item.calories_per_100g, 0);

  const goToCustomize = () => {
    if (cart.length === 0) {
      Alert.alert('Empty Cart', 'Please add items to your meal first');
      return;
    }
    router.push({
      pathname: '/customize',
      params: { cart: JSON.stringify(cart), orderType },
    });
  };

  const renderProduct = ({ item }: { item: Product }) => {
    const inCart = cart.find(c => c.id === item.id);
    const catColor = CATEGORY_COLORS[item.category] || '#8E8E93';
    return (
      <View style={styles.productCard} testID={`product-${item.id}`}>
        <View style={styles.productTop}>
          <View style={[styles.catDot, { backgroundColor: catColor }]} />
          <View style={styles.productInfo}>
            <Text style={styles.productName}>{item.name}</Text>
            <Text style={styles.productCat}>{item.category}</Text>
          </View>
          <Text style={styles.productPrice}>₹{item.cost_per_100g}<Text style={styles.per100}>/100g</Text></Text>
        </View>
        <View style={styles.nutritionRow}>
          <View style={styles.nutriItem}>
            <Ionicons name="flame" size={12} color="#FF3B30" />
            <Text style={styles.nutriVal}>{item.calories_per_100g} cal</Text>
          </View>
          <View style={styles.nutriItem}>
            <Text style={styles.nutriLabel}>P:</Text>
            <Text style={styles.nutriVal}>{item.protein_per_100g}g</Text>
          </View>
          <View style={styles.nutriItem}>
            <Text style={styles.nutriLabel}>C:</Text>
            <Text style={styles.nutriVal}>{item.carbs_per_100g}g</Text>
          </View>
          <View style={styles.nutriItem}>
            <Text style={styles.nutriLabel}>F:</Text>
            <Text style={styles.nutriVal}>{item.fat_per_100g}g</Text>
          </View>
        </View>
        <View style={styles.productActions}>
          <Text style={styles.stockText}>Stock: {Math.round(item.available_qty_grams)}g</Text>
          {inCart ? (
            <View style={styles.cartControls}>
              <TouchableOpacity
                testID={`remove-${item.id}`}
                style={styles.cartBtn}
                onPress={() => removeFromCart(item.id)}
              >
                <Ionicons name="trash" size={16} color="#FF453A" />
              </TouchableOpacity>
              <Text style={styles.cartGrams}>{inCart.grams}g</Text>
              <TouchableOpacity
                testID={`add-more-${item.id}`}
                style={[styles.cartBtn, styles.cartBtnAdd]}
                onPress={() => addToCart(item)}
              >
                <Ionicons name="add" size={16} color="#FFF" />
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity
              testID={`add-${item.id}`}
              style={styles.addBtn}
              onPress={() => addToCart(item)}
            >
              <Ionicons name="add-circle" size={20} color="#FF3B30" />
              <Text style={styles.addText}>ADD</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}><ActivityIndicator size="large" color="#FF3B30" /></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Text style={styles.title}>Menu</Text>
        <View style={styles.orderTypeRow}>
          {['dine-in', 'takeaway', 'delivery'].map(t => (
            <TouchableOpacity
              key={t}
              testID={`order-type-${t}`}
              style={[styles.typeBtn, orderType === t && styles.typeBtnActive]}
              onPress={() => setOrderType(t)}
            >
              <Ionicons
                name={t === 'dine-in' ? 'restaurant' : t === 'takeaway' ? 'bag-handle' : 'bicycle'}
                size={14}
                color={orderType === t ? '#FFF' : '#8E8E93'}
              />
              <Text style={[styles.typeText, orderType === t && styles.typeTextActive]}>
                {t === 'dine-in' ? 'Dine In' : t === 'takeaway' ? 'Takeaway' : 'Delivery'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <FlatList
        data={products}
        keyExtractor={item => item.id}
        renderItem={renderProduct}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#FF3B30" />}
      />

      {cart.length > 0 && (
        <TouchableOpacity testID="customize-btn" style={styles.cartBar} onPress={goToCustomize} activeOpacity={0.9}>
          <View style={styles.cartInfo}>
            <Text style={styles.cartCount}>{cart.length} items</Text>
            <Text style={styles.cartCal}>{Math.round(cartCalories)} cal</Text>
          </View>
          <View style={styles.cartRight}>
            <Text style={styles.cartPrice}>₹{Math.round(cartTotal)}</Text>
            <Text style={styles.cartAction}>CUSTOMIZE</Text>
            <Ionicons name="arrow-forward" size={18} color="#FFF" />
          </View>
        </TouchableOpacity>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#000' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { padding: 16, paddingTop: 8 },
  title: { fontSize: 28, fontWeight: '800', color: '#FFF', marginBottom: 12 },
  orderTypeRow: { flexDirection: 'row', gap: 8 },
  typeBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
    backgroundColor: '#1C1C1E', borderWidth: 1, borderColor: '#2C2C2E',
  },
  typeBtnActive: { backgroundColor: '#FF3B30', borderColor: '#FF3B30' },
  typeText: { fontSize: 12, fontWeight: '600', color: '#8E8E93' },
  typeTextActive: { color: '#FFF' },
  list: { padding: 16, paddingBottom: 100 },
  productCard: {
    backgroundColor: '#121212', borderRadius: 16, padding: 16,
    marginBottom: 12, borderWidth: 1, borderColor: '#2C2C2E',
  },
  productTop: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  catDot: { width: 10, height: 10, borderRadius: 5, marginRight: 10 },
  productInfo: { flex: 1 },
  productName: { fontSize: 16, fontWeight: '700', color: '#FFF' },
  productCat: { fontSize: 11, color: '#8E8E93', marginTop: 2 },
  productPrice: { fontSize: 18, fontWeight: '800', color: '#FF3B30' },
  per100: { fontSize: 11, fontWeight: '400', color: '#8E8E93' },
  nutritionRow: { flexDirection: 'row', gap: 12, marginBottom: 10 },
  nutriItem: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  nutriLabel: { fontSize: 11, color: '#48484A', fontWeight: '600' },
  nutriVal: { fontSize: 11, color: '#8E8E93' },
  productActions: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  stockText: { fontSize: 11, color: '#48484A' },
  addBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8,
    borderWidth: 1, borderColor: '#FF3B30',
  },
  addText: { color: '#FF3B30', fontSize: 13, fontWeight: '700' },
  cartControls: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  cartBtn: {
    width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#1C1C1E', borderWidth: 1, borderColor: '#2C2C2E',
  },
  cartBtnAdd: { backgroundColor: '#FF3B30', borderColor: '#FF3B30' },
  cartGrams: { color: '#FFF', fontSize: 14, fontWeight: '700', minWidth: 40, textAlign: 'center' },
  cartBar: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: '#FF3B30', flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', paddingHorizontal: 20, paddingVertical: 16,
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    shadowColor: '#FF3B30', shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.3, shadowRadius: 8, elevation: 10,
  },
  cartInfo: {},
  cartCount: { color: '#FFF', fontSize: 14, fontWeight: '700' },
  cartCal: { color: 'rgba(255,255,255,0.7)', fontSize: 11 },
  cartRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cartPrice: { color: '#FFF', fontSize: 20, fontWeight: '800' },
  cartAction: { color: '#FFF', fontSize: 12, fontWeight: '700', letterSpacing: 1 },
});
