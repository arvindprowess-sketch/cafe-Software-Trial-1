import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { apiCall } from '../utils/api';

const Z_RED = '#15140F';
const GREEN = '#3FA34D';
const PURPLE = '#15140F';

const GOAL_LABELS: Record<string, { label: string; icon: string; color: string }> = {
  muscle_gain: { label: 'Muscle Gain', icon: 'trending-up', color: GREEN },
  fat_loss: { label: 'Fat Loss', icon: 'trending-down', color: Z_RED },
  maintenance: { label: 'Maintenance', icon: 'swap-horizontal', color: PURPLE },
};

export default function PackDetailScreen() {
  const router = useRouter();
  const { packId } = useLocalSearchParams();
  const [loading, setLoading] = useState(true);
  const [pack, setPack] = useState<any>(null);

  useEffect(() => { loadPack(); }, []);

  const loadPack = async () => {
    try {
      const data = await apiCall(`/packs/${packId}`);
      setPack(data);
    } catch (e) {} finally { setLoading(false); }
  };

  const orderPack = () => {
    if (!pack?.items?.length) return;
    const cart = pack.items.map((item: any) => ({
      id: item.product_id,
      name: item.product_name,
      grams: item.grams,
      cost_per_100g: item.cost_per_100g,
      calories_per_100g: item.calories_per_100g,
      protein_per_100g: item.protein_per_100g,
      carbs_per_100g: item.carbs_per_100g,
      fat_per_100g: item.fat_per_100g,
      diet_type: item.diet_type || 'veg',
      image_url: item.image_url,
      category: '',
    }));
    router.push({ pathname: '/customize', params: { cart: JSON.stringify(cart), orderType: 'dine-in' } });
  };

  if (loading) return <SafeAreaView style={s.safe}><View style={s.center}><ActivityIndicator size="large" color={Z_RED} /></View></SafeAreaView>;
  if (!pack) return <SafeAreaView style={s.safe}><View style={s.center}><Text>Pack not found</Text></View></SafeAreaView>;

  const goalInfo = GOAL_LABELS[pack.goal] || GOAL_LABELS.maintenance;

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView>
        {/* Header */}
        <View style={[s.heroBanner, { backgroundColor: pack.banner_color || GREEN }]}>
          <TouchableOpacity testID="back-btn" onPress={() => router.back()} style={s.backBtn}>
            <Ionicons name="arrow-back" size={20} color="#FFF" />
          </TouchableOpacity>
          <View style={s.heroContent}>
            <View style={[s.goalBadge, { backgroundColor: 'rgba(255,255,255,0.2)' }]}>
              <Ionicons name={goalInfo.icon as any} size={14} color="#FFF" />
              <Text style={s.goalBadgeText}>{goalInfo.label}</Text>
            </View>
            <Text style={s.heroTitle}>{pack.name}</Text>
            <Text style={s.heroDesc}>{pack.description}</Text>
          </View>
        </View>

        {/* Nutrition Overview */}
        <View style={s.nutritionCard} testID="pack-nutrition-overview">
          <View style={s.nutritionGrid}>
            {[
              { label: 'Calories', value: pack.total_calories, color: Z_RED },
              { label: 'Protein', value: `${pack.total_protein}g`, color: Z_RED },
              { label: 'Items', value: pack.items?.length || 0, color: PURPLE },
              { label: 'Serving', value: `${pack.items?.reduce((a: number, i: any) => a + (i.grams || 0), 0)}g`, color: '#D69A35' },
            ].map(n => (
              <View key={n.label} style={s.nutritionItem}>
                <Text style={[s.nutritionValue, { color: n.color }]}>{n.value}</Text>
                <Text style={s.nutritionLabel}>{n.label}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Pack Items */}
        <Text style={s.sectionTitle}>What's Inside</Text>
        {pack.items?.map((item: any, idx: number) => (
          <View key={idx} style={s.itemCard} testID={`pack-item-${idx}`}>
            <View style={s.itemRow}>
              {item.image_url ? (
                <Image source={{ uri: item.image_url }} style={s.itemImg} />
              ) : (
                <View style={[s.itemImg, s.imgPlaceholder]}>
                  <Ionicons name="restaurant" size={20} color="#D0D0D0" />
                </View>
              )}
              <View style={s.itemInfo}>
                <View style={s.nameRow}>
                  <View style={[s.vegBox, { borderColor: item.diet_type === 'non-veg' ? Z_RED : GREEN }]}>
                    <View style={[s.vegDot, { backgroundColor: item.diet_type === 'non-veg' ? Z_RED : GREEN }]} />
                  </View>
                  <Text style={s.itemName}>{item.product_name}</Text>
                </View>
                <Text style={s.itemMeta}>{item.calories} cal • P:{item.protein}g</Text>
              </View>
              <View style={s.itemRight}>
                <Text style={s.itemGrams}>{item.grams}g</Text>
                <Text style={s.itemPrice}>₹{Math.round(item.price)}</Text>
              </View>
            </View>
          </View>
        ))}

        {/* Price Comparison */}
        <View style={s.priceCard} testID="pack-price-comparison">
          <View style={s.priceRow}>
            <Text style={s.priceLabel}>Individual total</Text>
            <Text style={s.priceOld}>₹{Math.round(pack.individual_total)}</Text>
          </View>
          <View style={s.priceRow}>
            <Text style={s.priceLabel}>Pack price</Text>
            <Text style={s.packPrice}>₹{Math.round(pack.pack_price)}</Text>
          </View>
          {pack.savings > 0 && (
            <View style={s.savingsRow}>
              <Ionicons name="pricetag" size={16} color={GREEN} />
              <Text style={s.savingsText}>You save ₹{Math.round(pack.savings)}!</Text>
            </View>
          )}
        </View>

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Order Button */}
      <View style={s.bottomBar}>
        <View>
          <Text style={s.bottomPrice}>₹{Math.round(pack.pack_price)}</Text>
          <Text style={s.bottomSub}>{pack.total_calories} cal • {pack.items?.length} items</Text>
        </View>
        <TouchableOpacity testID="order-pack-btn" style={[s.orderBtn, { backgroundColor: pack.banner_color || GREEN }]} onPress={orderPack}>
          <Ionicons name="cart" size={18} color="#FFF" />
          <Text style={s.orderText}>Order This Pack</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F4F1E9' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  heroBanner: { paddingTop: 20, paddingBottom: 30, paddingHorizontal: 20 },
  backBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  heroContent: {},
  goalBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, marginBottom: 10 },
  goalBadgeText: { fontSize: 12, fontWeight: '700', color: '#FFF' },
  heroTitle: { fontSize: 28, fontWeight: '800', color: '#FFF' },
  heroDesc: { fontSize: 14, color: 'rgba(255,255,255,0.85)', marginTop: 6 },
  nutritionCard: { backgroundColor: '#FFF', margin: 16, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: '#E6E1D4' },
  nutritionGrid: { flexDirection: 'row', justifyContent: 'space-around' },
  nutritionItem: { alignItems: 'center' },
  nutritionValue: { fontSize: 22, fontWeight: '800' },
  nutritionLabel: { fontSize: 10, color: '#6B6A5E', marginTop: 4 },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: '#15140F', paddingHorizontal: 16, marginBottom: 12 },
  itemCard: { backgroundColor: '#FFF', marginHorizontal: 16, borderRadius: 12, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: '#E6E1D4' },
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  itemImg: { width: 56, height: 56, borderRadius: 10, backgroundColor: '#F4F1E9' },
  imgPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  itemInfo: { flex: 1 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  vegBox: { width: 12, height: 12, borderRadius: 2, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  vegDot: { width: 6, height: 6, borderRadius: 3 },
  itemName: { fontSize: 14, fontWeight: '700', color: '#15140F' },
  itemMeta: { fontSize: 11, color: '#6B6A5E', marginTop: 3 },
  itemRight: { alignItems: 'flex-end' },
  itemGrams: { fontSize: 16, fontWeight: '800', color: '#15140F' },
  itemPrice: { fontSize: 12, color: '#6B6A5E', marginTop: 2 },
  priceCard: { backgroundColor: '#FFF', margin: 16, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: '#E6E1D4' },
  priceRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8 },
  priceLabel: { fontSize: 14, color: '#6B6A5E' },
  priceOld: { fontSize: 14, color: '#6B6A5E', textDecorationLine: 'line-through' },
  packPrice: { fontSize: 20, fontWeight: '800', color: '#15140F' },
  savingsRow: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#EAF2DD', borderRadius: 10, padding: 12, marginTop: 8 },
  savingsText: { fontSize: 15, fontWeight: '700', color: GREEN },
  bottomBar: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: '#FFF', borderTopWidth: 1, borderTopColor: '#E6E1D4', padding: 16, paddingBottom: 28, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  bottomPrice: { fontSize: 22, fontWeight: '800', color: '#15140F' },
  bottomSub: { fontSize: 11, color: '#6B6A5E', marginTop: 2 },
  orderBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 12, paddingHorizontal: 24, paddingVertical: 14 },
  orderText: { fontSize: 15, fontWeight: '700', color: '#FFF' },
});
