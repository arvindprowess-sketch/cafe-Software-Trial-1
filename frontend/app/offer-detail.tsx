import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { apiCall } from '../utils/api';

const Z_RED = '#15140F';
const GREEN = '#3FA34D';

export default function OfferDetailScreen() {
  const router = useRouter();
  const { offerId } = useLocalSearchParams();
  const [loading, setLoading] = useState(true);
  const [offer, setOffer] = useState<any>(null);
  const [products, setProducts] = useState<any[]>([]);
  const [cart, setCart] = useState<any[]>([]);

  useEffect(() => { loadOffer(); }, []);

  const loadOffer = async () => {
    try {
      const data = await apiCall(`/offers/${offerId}/products`);
      setOffer(data.offer);
      setProducts(data.products);
    } catch (e) {} finally { setLoading(false); }
  };

  const addToCart = (product: any) => {
    const exists = cart.find(c => c.id === product.id);
    if (exists) {
      setCart(cart.map(c => c.id === product.id ? { ...c, grams: c.grams + 100 } : c));
    } else {
      setCart([...cart, { ...product, grams: 100, cost_per_100g: product.discounted_price || product.cost_per_100g }]);
    }
  };

  const goToCheckout = () => {
    if (cart.length === 0) return;
    router.push({ pathname: '/customize', params: { cart: JSON.stringify(cart), orderType: 'dine-in' } });
  };

  if (loading) return <SafeAreaView style={s.safe}><View style={s.center}><ActivityIndicator size="large" color={Z_RED} /></View></SafeAreaView>;

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}>
        <TouchableOpacity testID="back-btn" onPress={() => router.back()} style={s.backBtn}>
          <Ionicons name="arrow-back" size={20} color="#15140F" />
        </TouchableOpacity>
        <Text style={s.headerTitle} numberOfLines={1}>{offer?.title || 'Offer'}</Text>
      </View>

      {offer && (
        <View style={[s.offerBanner, { backgroundColor: offer.banner_color || Z_RED }]} testID="offer-banner-detail">
          <Text style={s.offerTitle}>{offer.title}</Text>
          <Text style={s.offerSub}>{offer.subtitle}</Text>
          {offer.coupon_code && (
            <View style={s.couponBadge}>
              <Ionicons name="ticket" size={14} color="#FFF" />
              <Text style={s.couponText}>Code: {offer.coupon_code}</Text>
            </View>
          )}
          <Text style={s.offerDiscount}>
            {offer.discount_type === 'percentage' ? `${offer.discount_value}% OFF` : `₹${offer.discount_value} OFF`}
          </Text>
        </View>
      )}

      <ScrollView contentContainerStyle={s.scroll}>
        <Text style={s.sectionTitle}>{products.length} items with this offer</Text>
        {products.map(p => {
          const inCart = cart.find(c => c.id === p.id);
          return (
            <View key={p.id} style={s.productCard} testID={`offer-product-${p.id}`}>
              <View style={s.productRow}>
                {p.image_url ? (
                  <Image source={{ uri: p.image_url }} style={s.productImg} />
                ) : (
                  <View style={[s.productImg, s.imgPlaceholder]}>
                    <Ionicons name="restaurant" size={24} color="#D0D0D0" />
                  </View>
                )}
                <View style={s.productInfo}>
                  <View style={s.nameRow}>
                    <View style={[s.vegBox, { borderColor: p.diet_type === 'non-veg' ? Z_RED : GREEN }]}>
                      <View style={[s.vegDot, { backgroundColor: p.diet_type === 'non-veg' ? Z_RED : GREEN }]} />
                    </View>
                    <Text style={s.productName}>{p.name}</Text>
                  </View>
                  <Text style={s.productMeta}>{p.calories_per_100g} cal • P:{p.protein_per_100g}g per 100g</Text>
                  <View style={s.priceRow}>
                    <Text style={s.discountedPrice}>₹{p.discounted_price}/100g</Text>
                    <Text style={s.originalPrice}>₹{p.original_price}</Text>
                    <View style={s.saveBadge}>
                      <Text style={s.saveText}>Save ₹{p.discount_amount}</Text>
                    </View>
                  </View>
                </View>
              </View>
              <TouchableOpacity
                testID={`add-offer-product-${p.id}`}
                style={[s.addBtn, inCart && s.addedBtn]}
                onPress={() => addToCart(p)}
              >
                <Ionicons name={inCart ? 'checkmark' : 'add'} size={18} color="#FFF" />
                <Text style={s.addText}>{inCart ? `${inCart.grams}g added` : 'Add 100g'}</Text>
              </TouchableOpacity>
            </View>
          );
        })}
        <View style={{ height: 100 }} />
      </ScrollView>

      {cart.length > 0 && (
        <View style={s.bottomBar}>
          <View>
            <Text style={s.cartCount}>{cart.length} items • {cart.reduce((a, c) => a + c.grams, 0)}g</Text>
            <Text style={s.cartTotal}>₹{Math.round(cart.reduce((a, c) => a + (c.grams / 100) * c.cost_per_100g, 0))}</Text>
          </View>
          <TouchableOpacity testID="offer-checkout-btn" style={s.checkoutBtn} onPress={goToCheckout}>
            <Text style={s.checkoutText}>Review Order</Text>
            <Ionicons name="arrow-forward" size={18} color="#FFF" />
          </TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F4F1E9' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', padding: 16, gap: 12, backgroundColor: '#FFF', borderBottomWidth: 1, borderBottomColor: '#E6E1D4' },
  backBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#F4F1E9', alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, fontSize: 18, fontWeight: '700', color: '#15140F' },
  offerBanner: { margin: 16, borderRadius: 16, padding: 20 },
  offerTitle: { fontSize: 24, fontWeight: '800', color: '#FFF' },
  offerSub: { fontSize: 14, color: 'rgba(255,255,255,0.85)', marginTop: 4 },
  couponBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(255,255,255,0.2)', alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, marginTop: 10 },
  couponText: { fontSize: 13, fontWeight: '700', color: '#FFF' },
  offerDiscount: { fontSize: 20, fontWeight: '800', color: '#FFF', marginTop: 8 },
  scroll: { padding: 16, paddingTop: 0 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#15140F', marginBottom: 12 },
  productCard: { backgroundColor: '#FFF', borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: '#E6E1D4' },
  productRow: { flexDirection: 'row', gap: 12 },
  productImg: { width: 80, height: 80, borderRadius: 12, backgroundColor: '#F4F1E9' },
  imgPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  productInfo: { flex: 1 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  vegBox: { width: 14, height: 14, borderRadius: 2, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  vegDot: { width: 7, height: 7, borderRadius: 4 },
  productName: { fontSize: 15, fontWeight: '700', color: '#15140F' },
  productMeta: { fontSize: 11, color: '#6B6A5E', marginTop: 4 },
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
  discountedPrice: { fontSize: 16, fontWeight: '800', color: Z_RED },
  originalPrice: { fontSize: 13, color: '#6B6A5E', textDecorationLine: 'line-through' },
  saveBadge: { backgroundColor: '#EAF2DD', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  saveText: { fontSize: 10, fontWeight: '700', color: GREEN },
  addBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: Z_RED, borderRadius: 10, paddingVertical: 10, marginTop: 10 },
  addedBtn: { backgroundColor: GREEN },
  addText: { fontSize: 14, fontWeight: '700', color: '#FFF' },
  bottomBar: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: '#FFF', borderTopWidth: 1, borderTopColor: '#E6E1D4', padding: 16, paddingBottom: 28, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cartCount: { fontSize: 12, color: '#6B6A5E' },
  cartTotal: { fontSize: 22, fontWeight: '800', color: '#15140F' },
  checkoutBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: Z_RED, borderRadius: 12, paddingHorizontal: 24, paddingVertical: 14 },
  checkoutText: { fontSize: 15, fontWeight: '700', color: '#FFF' },
});
