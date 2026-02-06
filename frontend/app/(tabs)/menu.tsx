import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, Image, RefreshControl,
  SafeAreaView, Alert, ActivityIndicator, ScrollView
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { apiCall } from '../../utils/api';

const Z_RED = '#E23744';
const CATS = ['All', 'Protein', 'Carb', 'Fat'];

export default function MenuScreen() {
  const router = useRouter();
  const [products, setProducts] = useState<any[]>([]);
  const [cart, setCart] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [orderType, setOrderType] = useState('dine-in');
  const [selectedCat, setSelectedCat] = useState('All');

  const loadProducts = useCallback(async () => {
    try { const data = await apiCall('/products'); setProducts(data.filter((p: any) => p.available_qty_grams > 0)); }
    catch (e) {} finally { setLoading(false); }
  }, []);

  useEffect(() => { loadProducts(); }, []);
  const onRefresh = async () => { setRefreshing(true); await loadProducts(); setRefreshing(false); };

  const addToCart = (product: any) => {
    const exists = cart.find(c => c.id === product.id);
    if (exists) setCart(cart.map(c => c.id === product.id ? { ...c, grams: c.grams + 100 } : c));
    else setCart([...cart, { ...product, grams: 100 }]);
  };
  const removeFromCart = (id: string) => setCart(cart.filter(c => c.id !== id));
  const updateQty = (id: string, delta: number) => {
    setCart(cart.map(c => {
      if (c.id !== id) return c;
      const newG = c.grams + delta;
      return newG > 0 ? { ...c, grams: newG } : c;
    }).filter(c => c.grams > 0));
  };

  const cartTotal = cart.reduce((s, i) => s + (i.grams / 100) * i.cost_per_100g, 0);
  const cartItems = cart.reduce((s, i) => s + 1, 0);

  const filtered = products.filter(p => selectedCat === 'All' || p.category === selectedCat);

  const goCustomize = () => {
    if (cart.length === 0) { Alert.alert('Empty Cart', 'Add items first'); return; }
    router.push({ pathname: '/customize', params: { cart: JSON.stringify(cart), orderType } });
  };

  const renderProduct = ({ item }: { item: any }) => {
    const inCart = cart.find(c => c.id === item.id);
    return (
      <View style={styles.itemCard} testID={`product-${item.id}`}>
        <View style={styles.itemInfo}>
          <View style={styles.itemVeg}>
            <View style={[styles.vegBox, { borderColor: item.diet_type === 'non-veg' ? '#E23744' : '#267E3E' }]}>
              <View style={[styles.vegDotSmall, { backgroundColor: item.diet_type === 'non-veg' ? '#E23744' : '#267E3E' }]} />
            </View>
          </View>
          <Text style={styles.itemName}>{item.name}</Text>
          <Text style={styles.itemDesc} numberOfLines={2}>{item.description || `${item.category} • ${item.calories_per_100g} cal/100g`}</Text>
          <View style={styles.itemMeta}>
            <Text style={styles.itemPrice}>₹{item.cost_per_100g}</Text>
            <Text style={styles.itemPer}>/100g</Text>
          </View>
          <View style={styles.nutriBadges}>
            <View style={styles.nutriBadge}><Text style={styles.nbText}>P: {item.protein_per_100g}g</Text></View>
            <View style={styles.nutriBadge}><Text style={styles.nbText}>C: {item.carbs_per_100g}g</Text></View>
            <View style={styles.nutriBadge}><Text style={styles.nbText}>F: {item.fat_per_100g}g</Text></View>
          </View>
        </View>
        <View style={styles.itemRight}>
          {item.image_url ? (
            <Image source={{ uri: item.image_url }} style={styles.itemImg} />
          ) : (
            <View style={[styles.itemImg, styles.imgPlaceholder]}><Ionicons name="restaurant" size={24} color="#D0D0D0" /></View>
          )}
          <View style={styles.ratingRow}>
            <Ionicons name="star" size={10} color="#FFF" />
            <Text style={styles.ratingNum}>{item.rating || '4.2'}</Text>
          </View>
          {inCart ? (
            <View style={styles.qtyBox}>
              <TouchableOpacity testID={`minus-${item.id}`} style={styles.qtyBtn} onPress={() => updateQty(item.id, -50)}>
                <Ionicons name="remove" size={16} color="#FFF" />
              </TouchableOpacity>
              <Text style={styles.qtyText}>{inCart.grams}g</Text>
              <TouchableOpacity testID={`plus-${item.id}`} style={styles.qtyBtn} onPress={() => updateQty(item.id, 50)}>
                <Ionicons name="add" size={16} color="#FFF" />
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity testID={`add-${item.id}`} style={styles.addBtn} onPress={() => addToCart(item)}>
              <Text style={styles.addText}>ADD</Text>
              <Ionicons name="add" size={14} color={Z_RED} />
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  };

  if (loading) return <SafeAreaView style={styles.safe}><View style={styles.center}><ActivityIndicator size="large" color={Z_RED} /></View></SafeAreaView>;

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Text style={styles.title}>Menu</Text>
        <View style={styles.typeRow}>
          {['dine-in', 'takeaway', 'delivery'].map(t => (
            <TouchableOpacity key={t} testID={`order-type-${t}`} style={[styles.typeChip, orderType === t && styles.typeChipActive]} onPress={() => setOrderType(t)}>
              <Ionicons name={t === 'dine-in' ? 'restaurant' : t === 'takeaway' ? 'bag-handle' : 'bicycle'} size={14} color={orderType === t ? '#FFF' : '#696969'} />
              <Text style={[styles.typeText, orderType === t && { color: '#FFF' }]}>{t === 'dine-in' ? 'Dine In' : t === 'takeaway' ? 'Takeaway' : 'Delivery'}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.catBar} contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}>
        {CATS.map(c => (
          <TouchableOpacity key={c} testID={`menu-cat-${c}`} style={[styles.catPill, selectedCat === c && { backgroundColor: Z_RED, borderColor: Z_RED }]} onPress={() => setSelectedCat(c)}>
            <Text style={[styles.catText, selectedCat === c && { color: '#FFF' }]}>{c}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <FlatList
        data={filtered} keyExtractor={i => i.id} renderItem={renderProduct}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Z_RED} />}
        ItemSeparatorComponent={() => <View style={styles.sep} />}
      />

      {cart.length > 0 && (
        <TouchableOpacity testID="customize-btn" style={styles.cartBar} onPress={goCustomize} activeOpacity={0.95}>
          <View>
            <Text style={styles.cartItems}>{cartItems} item{cartItems > 1 ? 's' : ''}</Text>
            <Text style={styles.cartTotal}>₹{Math.round(cartTotal)}</Text>
          </View>
          <View style={styles.cartRight}>
            <Text style={styles.cartAction}>View Cart</Text>
            <Ionicons name="cart" size={18} color="#FFF" />
          </View>
        </TouchableOpacity>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F8F8F8' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { backgroundColor: '#FFF', paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12 },
  title: { fontSize: 24, fontWeight: '800', color: '#1C1C2E', marginBottom: 10 },
  typeRow: { flexDirection: 'row', gap: 8 },
  typeChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, backgroundColor: '#F5F5F5', borderWidth: 1, borderColor: '#E8E8E8' },
  typeChipActive: { backgroundColor: Z_RED, borderColor: Z_RED },
  typeText: { fontSize: 12, fontWeight: '600', color: '#696969' },
  catBar: { backgroundColor: '#FFF', paddingVertical: 10 },
  catPill: { paddingHorizontal: 18, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: '#E8E8E8', backgroundColor: '#FFF' },
  catText: { fontSize: 13, fontWeight: '600', color: '#696969' },
  list: { padding: 16, paddingBottom: 100 },
  sep: { height: 10 },
  itemCard: { flexDirection: 'row', backgroundColor: '#FFF', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: '#EFEFEF' },
  itemInfo: { flex: 1, paddingRight: 12 },
  itemVeg: { marginBottom: 4 },
  vegDot: { width: 12, height: 12, borderRadius: 2, borderWidth: 1.5, borderColor: 'transparent' },
  vegBox: { width: 14, height: 14, borderRadius: 2, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  vegDotSmall: { width: 7, height: 7, borderRadius: 4 },
  itemName: { fontSize: 16, fontWeight: '700', color: '#1C1C2E' },
  itemDesc: { fontSize: 12, color: '#9C9C9C', marginTop: 3, lineHeight: 16 },
  itemMeta: { flexDirection: 'row', alignItems: 'baseline', marginTop: 6, gap: 2 },
  itemPrice: { fontSize: 16, fontWeight: '700', color: '#1C1C2E' },
  itemPer: { fontSize: 11, color: '#9C9C9C' },
  nutriBadges: { flexDirection: 'row', gap: 6, marginTop: 6 },
  nutriBadge: { backgroundColor: '#F5F5F5', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  nbText: { fontSize: 10, fontWeight: '600', color: '#696969' },
  itemRight: { width: 110, alignItems: 'center' },
  itemImg: { width: 110, height: 90, borderRadius: 10, backgroundColor: '#F5F5F5' },
  imgPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  ratingRow: { position: 'absolute', top: 70, flexDirection: 'row', alignItems: 'center', gap: 2, backgroundColor: '#267E3E', paddingHorizontal: 5, paddingVertical: 1, borderRadius: 3 },
  ratingNum: { fontSize: 10, fontWeight: '700', color: '#FFF' },
  addBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, marginTop: 8, paddingVertical: 7, paddingHorizontal: 24, borderRadius: 8, borderWidth: 1.5, borderColor: Z_RED, backgroundColor: '#FDE8EA' },
  addText: { fontSize: 14, fontWeight: '800', color: Z_RED },
  qtyBox: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 8, backgroundColor: Z_RED, borderRadius: 8, overflow: 'hidden' },
  qtyBtn: { paddingHorizontal: 10, paddingVertical: 7 },
  qtyText: { color: '#FFF', fontSize: 13, fontWeight: '700', minWidth: 36, textAlign: 'center' },
  cartBar: { position: 'absolute', bottom: 0, left: 16, right: 16, backgroundColor: Z_RED, borderRadius: 14, paddingHorizontal: 20, paddingVertical: 14, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, elevation: 8 },
  cartItems: { color: '#FFF', fontSize: 12, fontWeight: '500' },
  cartTotal: { color: '#FFF', fontSize: 18, fontWeight: '800' },
  cartRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  cartAction: { color: '#FFF', fontSize: 15, fontWeight: '700' },
});
