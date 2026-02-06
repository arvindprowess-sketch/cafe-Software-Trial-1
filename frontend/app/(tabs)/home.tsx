import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Image,
  RefreshControl, SafeAreaView, FlatList, Dimensions, ActivityIndicator
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { apiCall, getStoredUser } from '../../utils/api';

const Z_RED = '#E23744';
const { width } = Dimensions.get('window');
const CATEGORIES = [
  { key: 'All', icon: 'grid', color: Z_RED },
  { key: 'Protein', icon: 'barbell', color: '#E23744' },
  { key: 'Carb', icon: 'leaf', color: '#FF9F0A' },
  { key: 'Fat', icon: 'water', color: '#5B5FE0' },
];

export default function HomeScreen() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [summary, setSummary] = useState<any>(null);
  const [products, setProducts] = useState<any[]>([]);
  const [banners, setBanners] = useState<any[]>([]);
  const [selectedCat, setSelectedCat] = useState('All');
  const [search, setSearch] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const bannerRef = useRef<FlatList>(null);
  const [bannerIdx, setBannerIdx] = useState(0);

  const loadData = useCallback(async () => {
    try {
      const [u, s, p, b] = await Promise.all([
        getStoredUser(), apiCall('/user/nutrition-summary'), apiCall('/products'), apiCall('/banners'),
      ]);
      setUser(u); setSummary(s); setProducts(p); setBanners(b);
    } catch (e) {} finally { setLoading(false); }
  }, []);

  useEffect(() => { loadData(); }, []);
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

  const filteredProducts = products.filter(p => {
    const catMatch = selectedCat === 'All' || p.category === selectedCat;
    const searchMatch = !search || p.name.toLowerCase().includes(search.toLowerCase());
    return catMatch && searchMatch && p.available_qty_grams > 0;
  });

  const consumed = summary?.consumed || {};
  const goals = summary?.goals || {};
  const calPct = goals.daily_calories ? Math.min((consumed.calories / goals.daily_calories) * 100, 100) : 0;

  if (loading) return <SafeAreaView style={styles.safe}><View style={styles.center}><ActivityIndicator size="large" color={Z_RED} /></View></SafeAreaView>;

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Z_RED} />}>
        <View style={styles.header}>
          <View>
            <View style={styles.locRow}>
              <Ionicons name="location" size={18} color={Z_RED} />
              <Text style={styles.locText}>Diet Cafe</Text>
              <Ionicons name="chevron-down" size={14} color={Z_RED} />
            </View>
            <Text style={styles.locSub}>Healthy meals, delivered fresh</Text>
          </View>
          <TouchableOpacity testID="profile-avatar-btn" style={styles.avatar} onPress={() => router.push('/(tabs)/profile')}>
            <Ionicons name="person" size={18} color={Z_RED} />
          </TouchableOpacity>
        </View>

        <View style={styles.searchBar}>
          <Ionicons name="search" size={18} color="#9C9C9C" />
          <TextInput testID="search-input" style={styles.searchInput} value={search} onChangeText={setSearch} placeholder="Search for healthy meals..." placeholderTextColor="#B0B0B0" />
        </View>

        {banners.length > 0 && (
          <FlatList
            ref={bannerRef}
            horizontal showsHorizontalScrollIndicator={false} pagingEnabled
            data={banners} keyExtractor={item => item.id}
            style={styles.bannerList}
            onScrollToIndexFailed={() => {}}
            renderItem={({ item }) => (
              <View style={[styles.banner, { backgroundColor: item.color }]} testID={`banner-${item.id}`}>
                <View>
                  <Text style={styles.bannerTitle}>{item.title}</Text>
                  <Text style={styles.bannerSub}>{item.subtitle}</Text>
                </View>
                <Ionicons name="arrow-forward-circle" size={32} color="rgba(255,255,255,0.6)" />
              </View>
            )}
          />
        )}
        <View style={styles.dots}>
          {banners.map((_, i) => (
            <View key={i} style={[styles.dot, i === bannerIdx && styles.dotActive]} />
          ))}
        </View>

        <View style={styles.nutriCard} testID="nutrition-summary-card">
          <View style={styles.nutriHeader}>
            <Ionicons name="fitness" size={18} color={Z_RED} />
            <Text style={styles.nutriTitle}>Today's Nutrition</Text>
            <Text style={styles.nutriMeals}>{summary?.meals_count || 0} meals</Text>
          </View>
          <View style={styles.nutriRow}>
            <View style={styles.nutriMain}>
              <Text style={styles.calValue}>{Math.round(consumed.calories || 0)}</Text>
              <Text style={styles.calUnit}>/ {goals.daily_calories || 2000} kcal</Text>
            </View>
            <View style={styles.macroRow}>
              {[
                { label: 'Protein', val: consumed.protein, goal: goals.daily_protein, color: Z_RED },
                { label: 'Carbs', val: consumed.carbs, goal: goals.daily_carbs, color: '#FF9F0A' },
                { label: 'Fat', val: consumed.fat, goal: goals.daily_fat, color: '#5B5FE0' },
              ].map(m => (
                <View key={m.label} style={styles.macroItem}>
                  <Text style={[styles.macroVal, { color: m.color }]}>{Math.round(m.val || 0)}g</Text>
                  <Text style={styles.macroLabel}>{m.label}</Text>
                </View>
              ))}
            </View>
          </View>
          <View style={styles.progressBg}>
            <View style={[styles.progressFill, { width: `${calPct}%` }]} />
          </View>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.catScroll} contentContainerStyle={styles.catContent}>
          {CATEGORIES.map(c => (
            <TouchableOpacity
              key={c.key} testID={`cat-${c.key}`}
              style={[styles.catPill, selectedCat === c.key && { backgroundColor: Z_RED, borderColor: Z_RED }]}
              onPress={() => setSelectedCat(c.key)}
            >
              <Ionicons name={c.icon as any} size={16} color={selectedCat === c.key ? '#FFF' : '#696969'} />
              <Text style={[styles.catText, selectedCat === c.key && { color: '#FFF' }]}>{c.key}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <Text style={styles.sectionTitle}>Popular Items</Text>
        <View style={styles.productsGrid}>
          {filteredProducts.slice(0, 8).map(item => (
            <TouchableOpacity
              key={item.id} testID={`popular-${item.id}`} style={styles.prodCard}
              onPress={() => router.push('/(tabs)/menu')} activeOpacity={0.9}
            >
              {item.image_url ? (
                <Image source={{ uri: item.image_url }} style={styles.prodImg} />
              ) : (
                <View style={[styles.prodImg, styles.prodImgPlaceholder]}>
                  <Ionicons name="restaurant" size={28} color="#D0D0D0" />
                </View>
              )}
              <View style={styles.ratingBadge}>
                <Ionicons name="star" size={10} color="#FFF" />
                <Text style={styles.ratingText}>{item.rating || '4.2'}</Text>
              </View>
              <View style={styles.prodInfo}>
                <Text style={styles.prodName} numberOfLines={1}>{item.name}</Text>
                <Text style={styles.prodDesc} numberOfLines={1}>{item.description || item.category}</Text>
                <View style={styles.prodBottom}>
                  <Text style={styles.prodPrice}>₹{item.cost_per_100g}<Text style={styles.per100}>/100g</Text></Text>
                  <Text style={styles.prodCal}>{item.calories_per_100g} cal</Text>
                </View>
              </View>
            </TouchableOpacity>
          ))}
        </View>
        <View style={{ height: 24 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F8F8F8' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8, backgroundColor: '#FFF' },
  locRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  locText: { fontSize: 18, fontWeight: '700', color: '#1C1C2E' },
  locSub: { fontSize: 12, color: '#9C9C9C', marginTop: 2, marginLeft: 22 },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#FDE8EA', alignItems: 'center', justifyContent: 'center' },
  searchBar: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#F0F0F5', marginHorizontal: 16, marginTop: 10, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10 },
  searchInput: { flex: 1, fontSize: 14, color: '#1C1C2E' },
  bannerList: { marginTop: 14 },
  banner: { width: width - 32, marginHorizontal: 16, borderRadius: 14, padding: 20, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  bannerTitle: { fontSize: 20, fontWeight: '800', color: '#FFF' },
  bannerSub: { fontSize: 13, color: 'rgba(255,255,255,0.8)', marginTop: 4 },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: 10 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#D0D0D0' },
  dotActive: { backgroundColor: Z_RED, width: 18 },
  nutriCard: { backgroundColor: '#FFF', marginHorizontal: 16, marginTop: 14, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: '#EFEFEF' },
  nutriHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 },
  nutriTitle: { flex: 1, fontSize: 14, fontWeight: '700', color: '#1C1C2E' },
  nutriMeals: { fontSize: 12, color: '#9C9C9C' },
  nutriRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  nutriMain: { flexDirection: 'row', alignItems: 'baseline', gap: 4 },
  calValue: { fontSize: 32, fontWeight: '800', color: '#1C1C2E' },
  calUnit: { fontSize: 13, color: '#9C9C9C' },
  macroRow: { flexDirection: 'row', gap: 16 },
  macroItem: { alignItems: 'center' },
  macroVal: { fontSize: 16, fontWeight: '700' },
  macroLabel: { fontSize: 10, color: '#9C9C9C', marginTop: 1 },
  progressBg: { height: 4, backgroundColor: '#F0F0F5', borderRadius: 2, marginTop: 12, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: Z_RED, borderRadius: 2 },
  catScroll: { marginTop: 14 },
  catContent: { paddingHorizontal: 16, gap: 8 },
  catPill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20, backgroundColor: '#FFF', borderWidth: 1, borderColor: '#E8E8E8' },
  catText: { fontSize: 13, fontWeight: '600', color: '#696969' },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: '#1C1C2E', paddingHorizontal: 16, marginTop: 18, marginBottom: 12 },
  productsGrid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 12, gap: 8 },
  prodCard: { width: (width - 40) / 2, backgroundColor: '#FFF', borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: '#EFEFEF' },
  prodImg: { width: '100%', height: 120, backgroundColor: '#F5F5F5' },
  prodImgPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  ratingBadge: { position: 'absolute', top: 100, left: 8, flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: '#267E3E', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  ratingText: { fontSize: 10, fontWeight: '700', color: '#FFF' },
  prodInfo: { padding: 10 },
  prodName: { fontSize: 14, fontWeight: '700', color: '#1C1C2E' },
  prodDesc: { fontSize: 11, color: '#9C9C9C', marginTop: 2 },
  prodBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 },
  prodPrice: { fontSize: 14, fontWeight: '700', color: '#1C1C2E' },
  per100: { fontSize: 10, fontWeight: '400', color: '#9C9C9C' },
  prodCal: { fontSize: 11, color: Z_RED, fontWeight: '600' },
});
