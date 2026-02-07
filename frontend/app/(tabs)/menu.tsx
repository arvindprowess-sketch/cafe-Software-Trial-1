import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, Image, RefreshControl,
  Alert, ActivityIndicator, ScrollView
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { apiCall } from '../../utils/api';

const Z_RED = '#E23744';
const GREEN = '#267E3E';
const PURPLE = '#5B5FE0';
const CATS = ['All', 'Protein', 'Carb', 'Fat', 'Meal'];

export default function MenuScreen() {
  const router = useRouter();
  const [products, setProducts] = useState<any[]>([]);
  const [cart, setCart] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [orderType, setOrderType] = useState('dine-in');
  const [selectedCat, setSelectedCat] = useState('All');
  const [dietFilter, setDietFilter] = useState('all'); // 'all', 'veg', 'non-veg'

  const loadProducts = useCallback(async () => {
    try { 
      const data = await apiCall('/products'); 
      // Include both single products with stock AND ready-made dishes
      setProducts(data.filter((p: any) => {
        if (p.product_type === 'ready_made') return p.is_active !== false;
        return p.available_qty_grams > 0;
      })); 
    }
    catch (e) {} finally { setLoading(false); }
  }, []);

  useEffect(() => { loadProducts(); }, []);
  const onRefresh = async () => { setRefreshing(true); await loadProducts(); setRefreshing(false); };

  // Add single product to cart (by grams)
  const addToCart = (product: any) => {
    if (product.product_type === 'ready_made') {
      // Ready-made: add by plates
      const exists = cart.find(c => c.id === product.id);
      if (exists) {
        setCart(cart.map(c => c.id === product.id ? { ...c, quantity: c.quantity + 1 } : c));
      } else {
        setCart([...cart, { ...product, quantity: 1, grams: product.serving_grams || 300 }]);
      }
    } else {
      // Single product: add by grams
      const exists = cart.find(c => c.id === product.id);
      if (exists) setCart(cart.map(c => c.id === product.id ? { ...c, grams: c.grams + 100 } : c));
      else setCart([...cart, { ...product, grams: 100, quantity: 1 }]);
    }
  };
  
  const removeFromCart = (id: string) => setCart(cart.filter(c => c.id !== id));
  
  const updateQty = (id: string, delta: number, isReadyMade: boolean = false) => {
    setCart(cart.map(c => {
      if (c.id !== id) return c;
      if (isReadyMade) {
        const newQty = (c.quantity || 1) + delta;
        return newQty > 0 ? { ...c, quantity: newQty, grams: (c.serving_grams || 300) * newQty } : c;
      } else {
        const newG = c.grams + delta;
        return newG > 0 ? { ...c, grams: newG } : c;
      }
    }).filter(c => c.grams > 0 || (c.quantity || 0) > 0));
  };

  // Calculate cart total
  const cartTotal = cart.reduce((s, i) => {
    if (i.product_type === 'ready_made') {
      const price = i.fixed_price || (i.cost_per_100g * (i.serving_grams || 300) / 100);
      return s + price * (i.quantity || 1);
    }
    return s + (i.grams / 100) * i.cost_per_100g;
  }, 0);
  const cartItems = cart.length;

  // Filter by both category AND diet type
  const filtered = products.filter(p => {
    // Category matching
    let catMatch = selectedCat === 'All';
    if (selectedCat === 'Meal') {
      // Meal = ready-made dishes
      catMatch = p.product_type === 'ready_made' || p.category === 'Meal';
    } else if (selectedCat !== 'All') {
      // For Protein/Carb/Fat - check if category matches OR if it's in the name
      catMatch = p.category === selectedCat || 
                 (p.name && p.name.toLowerCase().includes(selectedCat.toLowerCase()));
    }
    
    // Diet type matching
    const dietMatch = dietFilter === 'all' || p.diet_type === dietFilter;
    
    return catMatch && dietMatch;
  });

  const goCustomize = () => {
    if (cart.length === 0) { Alert.alert('Empty Cart', 'Add items first'); return; }
    router.push({ pathname: '/customize', params: { cart: JSON.stringify(cart), orderType } });
  };

  const renderProduct = ({ item }: { item: any }) => {
    const inCart = cart.find(c => c.id === item.id);
    const isReadyMade = item.product_type === 'ready_made';
    const isEditable = item.is_editable;
    
    // Price display
    const displayPrice = isReadyMade 
      ? (item.fixed_price || Math.round(item.cost_per_100g * (item.serving_grams || 300) / 100))
      : item.cost_per_100g;
    const priceUnit = isReadyMade ? '/plate' : '/100g';
    
    // Nutrition display
    const displayCal = isReadyMade ? (item.total_calories_per_serving || item.calories_per_100g) : item.calories_per_100g;
    
    return (
      <View style={styles.itemCard} testID={`product-${item.id}`}>
        <View style={styles.itemInfo}>
          <View style={styles.itemTopRow}>
            <View style={[styles.vegBox, { borderColor: item.diet_type === 'non-veg' ? Z_RED : GREEN }]}>
              <View style={[styles.vegDotSmall, { backgroundColor: item.diet_type === 'non-veg' ? Z_RED : GREEN }]} />
            </View>
            {isReadyMade && (
              <View style={[styles.editBadge, isEditable ? styles.editBadgeYes : styles.editBadgeNo]}>
                <Ionicons name={isEditable ? 'create' : 'lock-closed'} size={9} color="#FFF" />
                <Text style={styles.editBadgeText}>{isEditable ? 'Customizable' : 'Fixed'}</Text>
              </View>
            )}
          </View>
          <Text style={styles.itemName}>{item.name}</Text>
          <Text style={styles.itemDesc} numberOfLines={2}>
            {item.description || `${item.category} • ${Math.round(displayCal)} cal${priceUnit}`}
          </Text>
          {isReadyMade && item.ingredients && item.ingredients.length > 0 && (
            <Text style={styles.ingredientsList} numberOfLines={1}>
              {item.ingredients.map((ing: any) => typeof ing === 'object' ? ing.name : ing).join(', ')}
            </Text>
          )}
          <View style={styles.itemMeta}>
            <Text style={styles.itemPrice}>₹{displayPrice}</Text>
            <Text style={styles.itemPer}>{priceUnit}</Text>
          </View>
          <View style={styles.nutriBadges}>
            <View style={styles.nutriBadge}><Text style={styles.nbText}>P: {isReadyMade ? Math.round(item.total_protein_per_serving || item.protein_per_100g) : item.protein_per_100g}g</Text></View>
            <View style={styles.nutriBadge}><Text style={styles.nbText}>C: {isReadyMade ? Math.round(item.total_carbs_per_serving || item.carbs_per_100g) : item.carbs_per_100g}g</Text></View>
            <View style={styles.nutriBadge}><Text style={styles.nbText}>F: {isReadyMade ? Math.round(item.total_fat_per_serving || item.fat_per_100g) : item.fat_per_100g}g</Text></View>
          </View>
        </View>
        <View style={styles.itemRight}>
          {item.image_url ? (
            <Image source={{ uri: item.image_url }} style={styles.itemImg} />
          ) : (
            <View style={[styles.itemImg, styles.imgPlaceholder]}>
              <Ionicons name={isReadyMade ? 'fast-food' : 'restaurant'} size={24} color="#D0D0D0" />
            </View>
          )}
          <View style={styles.ratingRow}>
            <Ionicons name="star" size={10} color="#FFF" />
            <Text style={styles.ratingNum}>{item.rating || '4.2'}</Text>
          </View>
          {inCart ? (
            isReadyMade ? (
              // Ready-made: plate counter
              <View style={[styles.qtyBox, { backgroundColor: PURPLE }]}>
                <TouchableOpacity testID={`minus-${item.id}`} style={styles.qtyBtn} onPress={() => updateQty(item.id, -1, true)}>
                  <Ionicons name="remove" size={16} color="#FFF" />
                </TouchableOpacity>
                <Text style={styles.qtyText}>{inCart.quantity || 1}</Text>
                <TouchableOpacity testID={`plus-${item.id}`} style={styles.qtyBtn} onPress={() => updateQty(item.id, 1, true)}>
                  <Ionicons name="add" size={16} color="#FFF" />
                </TouchableOpacity>
              </View>
            ) : (
              // Single product: gram counter
              <View style={styles.qtyBox}>
                <TouchableOpacity testID={`minus-${item.id}`} style={styles.qtyBtn} onPress={() => updateQty(item.id, -50, false)}>
                  <Ionicons name="remove" size={16} color="#FFF" />
                </TouchableOpacity>
                <Text style={styles.qtyText}>{inCart.grams}g</Text>
                <TouchableOpacity testID={`plus-${item.id}`} style={styles.qtyBtn} onPress={() => updateQty(item.id, 50, false)}>
                  <Ionicons name="add" size={16} color="#FFF" />
                </TouchableOpacity>
              </View>
            )
          ) : (
            <TouchableOpacity testID={`add-${item.id}`} style={[styles.addBtn, isReadyMade && styles.addBtnReadyMade]} onPress={() => addToCart(item)}>
              <Text style={[styles.addText, isReadyMade && { color: PURPLE }]}>ADD</Text>
              <Ionicons name="add" size={14} color={isReadyMade ? PURPLE : Z_RED} />
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

      {/* ===== VEG / NON-VEG FILTER (HIGHLIGHTED AT TOP) ===== */}
      <View style={styles.dietFilterRow}>
        <TouchableOpacity 
          testID="diet-all"
          style={[styles.dietFilterBtn, dietFilter === 'all' && styles.dietFilterBtnActive]}
          onPress={() => setDietFilter('all')}
        >
          <Ionicons name="apps" size={16} color={dietFilter === 'all' ? '#FFF' : '#696969'} />
          <Text style={[styles.dietFilterText, dietFilter === 'all' && { color: '#FFF' }]}>All</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          testID="diet-veg"
          style={[styles.dietFilterBtn, styles.vegFilterBtn, dietFilter === 'veg' && styles.vegFilterBtnActive]}
          onPress={() => setDietFilter('veg')}
        >
          <View style={styles.vegFilterIcon}>
            <View style={[styles.vegDotFilter, { backgroundColor: GREEN }]} />
          </View>
          <Text style={[styles.dietFilterText, dietFilter === 'veg' && { color: '#FFF' }]}>Veg</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          testID="diet-nonveg"
          style={[styles.dietFilterBtn, styles.nonVegFilterBtn, dietFilter === 'non-veg' && styles.nonVegFilterBtnActive]}
          onPress={() => setDietFilter('non-veg')}
        >
          <View style={styles.vegFilterIcon}>
            <View style={[styles.vegDotFilter, { backgroundColor: Z_RED }]} />
          </View>
          <Text style={[styles.dietFilterText, dietFilter === 'non-veg' && { color: '#FFF' }]}>Non-Veg</Text>
        </TouchableOpacity>
      </View>

      {/* ===== CATEGORY BOXES (COMPACT) ===== */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.catBar} contentContainerStyle={styles.catContent}>
        {CATS.map(c => {
          const isActive = selectedCat === c;
          const icon = c === 'All' ? 'grid' : c === 'Protein' ? 'barbell' : c === 'Carb' ? 'leaf' : c === 'Fat' ? 'water' : 'fast-food';
          const activeColor = c === 'Protein' ? Z_RED : c === 'Carb' ? '#FF9F0A' : c === 'Fat' ? PURPLE : c === 'Meal' ? GREEN : '#1C1C2E';
          
          return (
            <TouchableOpacity 
              key={c} 
              testID={`menu-cat-${c}`} 
              style={[
                styles.catBox, 
                isActive && { backgroundColor: activeColor, borderColor: activeColor }
              ]} 
              onPress={() => setSelectedCat(c)}
            >
              <Ionicons name={icon as any} size={14} color={isActive ? '#FFF' : activeColor} />
              <Text style={[styles.catBoxText, isActive && { color: '#FFF' }]}>{c}</Text>
            </TouchableOpacity>
          );
        })}
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
  
  // Diet filter (Veg/Non-Veg)
  dietFilterRow: { flexDirection: 'row', backgroundColor: '#FFF', paddingHorizontal: 16, paddingVertical: 12, gap: 10, borderBottomWidth: 1, borderBottomColor: '#EFEFEF' },
  dietFilterBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 12, borderRadius: 12, backgroundColor: '#F5F5F5', borderWidth: 2, borderColor: '#E8E8E8' },
  dietFilterBtnActive: { backgroundColor: '#1C1C2E', borderColor: '#1C1C2E' },
  vegFilterBtn: { borderColor: '#D0F0D0' },
  vegFilterBtnActive: { backgroundColor: GREEN, borderColor: GREEN },
  nonVegFilterBtn: { borderColor: '#FFE0E0' },
  nonVegFilterBtnActive: { backgroundColor: Z_RED, borderColor: Z_RED },
  dietFilterText: { fontSize: 14, fontWeight: '700', color: '#696969' },
  vegFilterIcon: { width: 16, height: 16, borderRadius: 2, borderWidth: 2, borderColor: 'currentColor', alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFF' },
  vegDotFilter: { width: 8, height: 8, borderRadius: 4 },
  
  // Category boxes (compact pills - horizontal)
  catBar: { backgroundColor: '#FFF', maxHeight: 50, borderBottomWidth: 1, borderBottomColor: '#EFEFEF' },
  catContent: { paddingHorizontal: 12, paddingVertical: 8, gap: 8, flexDirection: 'row', alignItems: 'center' },
  catBox: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 18, borderWidth: 1.5, borderColor: '#E8E8E8', backgroundColor: '#FFF', minHeight: 32, maxHeight: 34 },
  catIconBg: { width: 22, height: 22, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  catBoxText: { fontSize: 12, fontWeight: '600', color: '#1C1C2E' },
  catPill: { paddingHorizontal: 18, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: '#E8E8E8', backgroundColor: '#FFF' },
  catText: { fontSize: 13, fontWeight: '600', color: '#696969' },
  
  list: { padding: 16, paddingBottom: 100 },
  sep: { height: 10 },
  itemCard: { flexDirection: 'row', backgroundColor: '#FFF', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: '#EFEFEF' },
  itemInfo: { flex: 1, paddingRight: 12 },
  itemTopRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  itemVeg: { marginBottom: 4 },
  vegDot: { width: 12, height: 12, borderRadius: 2, borderWidth: 1.5, borderColor: 'transparent' },
  vegBox: { width: 14, height: 14, borderRadius: 2, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  vegDotSmall: { width: 7, height: 7, borderRadius: 4 },
  editBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  editBadgeYes: { backgroundColor: GREEN },
  editBadgeNo: { backgroundColor: '#9C9C9C' },
  editBadgeText: { fontSize: 9, fontWeight: '700', color: '#FFF' },
  itemName: { fontSize: 16, fontWeight: '700', color: '#1C1C2E' },
  itemDesc: { fontSize: 12, color: '#9C9C9C', marginTop: 3, lineHeight: 16 },
  ingredientsList: { fontSize: 10, color: PURPLE, marginTop: 3, fontStyle: 'italic' },
  itemMeta: { flexDirection: 'row', alignItems: 'baseline', marginTop: 6, gap: 2 },
  itemPrice: { fontSize: 16, fontWeight: '700', color: '#1C1C2E' },
  itemPer: { fontSize: 11, color: '#9C9C9C' },
  nutriBadges: { flexDirection: 'row', gap: 6, marginTop: 6 },
  nutriBadge: { backgroundColor: '#F5F5F5', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  nbText: { fontSize: 10, fontWeight: '600', color: '#696969' },
  itemRight: { width: 110, alignItems: 'center' },
  itemImg: { width: 110, height: 90, borderRadius: 10, backgroundColor: '#F5F5F5' },
  imgPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  ratingRow: { position: 'absolute', top: 70, flexDirection: 'row', alignItems: 'center', gap: 2, backgroundColor: GREEN, paddingHorizontal: 5, paddingVertical: 1, borderRadius: 3 },
  ratingNum: { fontSize: 10, fontWeight: '700', color: '#FFF' },
  addBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, marginTop: 8, paddingVertical: 7, paddingHorizontal: 24, borderRadius: 8, borderWidth: 1.5, borderColor: Z_RED, backgroundColor: '#FDE8EA' },
  addBtnReadyMade: { borderColor: PURPLE, backgroundColor: '#F0F0FF' },
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
