import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, RefreshControl,
  ActivityIndicator, Dimensions
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { apiCall } from '../../utils/api';

const { width } = Dimensions.get('window');
const Z_RED = '#E23744';
const GREEN = '#267E3E';
const PURPLE = '#5B5FE0';

export default function MenuScreen() {
  const router = useRouter();
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [orderType, setOrderType] = useState('dine-in');

  const loadProducts = useCallback(async () => {
    try { 
      const data = await apiCall('/products'); 
      setProducts(data.filter((p: any) => p.is_active !== false && (p.available_qty_grams > 0 || p.product_type === 'ready_made'))); 
    }
    catch (e) {} finally { setLoading(false); }
  }, []);

  useEffect(() => { loadProducts(); }, []);
  const onRefresh = async () => { setRefreshing(true); await loadProducts(); setRefreshing(false); };

  // Separate ready-made dishes and single ingredients
  const readyMadeDishes = products.filter(p => p.product_type === 'ready_made');
  const singleIngredients = products.filter(p => p.product_type !== 'ready_made');

  // Navigate to ready-made dish detail
  const goToReadyMade = (dish: any) => {
    router.push({ 
      pathname: '/ready-made-detail', 
      params: { dish: JSON.stringify(dish), orderType } 
    });
  };

  // Navigate to build your own
  const goToBuildOwn = () => {
    router.push({ 
      pathname: '/build-your-own', 
      params: { ingredients: JSON.stringify(singleIngredients), orderType } 
    });
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={Z_RED} />
          <Text style={styles.loadingText}>Loading Menu...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView 
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Z_RED} />}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.greeting}>What would you like today?</Text>
          <Text style={styles.subtitle}>Choose your perfect meal</Text>
        </View>

        {/* Order Type Selection */}
        <View style={styles.orderTypeSection}>
          {['dine-in', 'takeaway', 'delivery'].map(t => (
            <TouchableOpacity 
              key={t} 
              testID={`order-type-${t}`}
              style={[styles.orderTypeBtn, orderType === t && styles.orderTypeBtnActive]} 
              onPress={() => setOrderType(t)}
            >
              <Ionicons 
                name={t === 'dine-in' ? 'restaurant' : t === 'takeaway' ? 'bag-handle' : 'bicycle'} 
                size={18} 
                color={orderType === t ? '#FFF' : '#696969'} 
              />
              <Text style={[styles.orderTypeText, orderType === t && { color: '#FFF' }]}>
                {t === 'dine-in' ? 'Dine In' : t === 'takeaway' ? 'Takeaway' : 'Delivery'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* ============ OPTION 1: READY-MADE DISHES ============ */}
        <View style={styles.sectionHeader}>
          <View style={styles.sectionIcon}>
            <Ionicons name="fast-food" size={20} color={PURPLE} />
          </View>
          <View style={styles.sectionInfo}>
            <Text style={styles.sectionTitle}>Ready-Made Dishes</Text>
            <Text style={styles.sectionDesc}>Chef-crafted meals, ready to order</Text>
          </View>
        </View>

        {readyMadeDishes.length > 0 ? (
          <ScrollView 
            horizontal 
            showsHorizontalScrollIndicator={false} 
            contentContainerStyle={styles.horizontalList}
          >
            {readyMadeDishes.map(dish => {
              const isEditable = dish.is_editable;
              const price = dish.fixed_price || Math.round(dish.cost_per_100g * (dish.serving_grams || 300) / 100);
              const calories = dish.total_calories_per_serving || dish.calories_per_100g;
              
              return (
                <TouchableOpacity 
                  key={dish.id} 
                  testID={`ready-made-${dish.id}`}
                  style={styles.readyMadeCard}
                  onPress={() => goToReadyMade(dish)}
                  activeOpacity={0.9}
                >
                  {/* Image */}
                  {dish.image_url ? (
                    <Image source={{ uri: dish.image_url }} style={styles.dishImage} />
                  ) : (
                    <View style={[styles.dishImage, styles.imagePlaceholder]}>
                      <Ionicons name="fast-food" size={32} color="#D0D0D0" />
                    </View>
                  )}
                  
                  {/* Editable Badge */}
                  <View style={[styles.editBadge, isEditable ? styles.editBadgeYes : styles.editBadgeNo]}>
                    <Ionicons name={isEditable ? 'create' : 'lock-closed'} size={10} color="#FFF" />
                    <Text style={styles.editBadgeText}>{isEditable ? 'Customizable' : 'Fixed Recipe'}</Text>
                  </View>
                  
                  {/* Veg/Non-Veg */}
                  <View style={styles.vegBadgePos}>
                    <View style={[styles.vegBox, { borderColor: dish.diet_type === 'non-veg' ? Z_RED : GREEN }]}>
                      <View style={[styles.vegDot, { backgroundColor: dish.diet_type === 'non-veg' ? Z_RED : GREEN }]} />
                    </View>
                  </View>

                  {/* Info */}
                  <View style={styles.dishInfo}>
                    <Text style={styles.dishName} numberOfLines={2}>{dish.name}</Text>
                    <Text style={styles.dishMeta}>{Math.round(calories)} cal • {dish.category}</Text>
                    <View style={styles.dishBottom}>
                      <Text style={styles.dishPrice}>₹{price}</Text>
                      <View style={styles.addIndicator}>
                        <Ionicons name="chevron-forward" size={16} color={PURPLE} />
                      </View>
                    </View>
                  </View>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        ) : (
          <View style={styles.emptySection}>
            <Text style={styles.emptyText}>No ready-made dishes available</Text>
          </View>
        )}

        {/* ============ OPTION 2: BUILD YOUR OWN ============ */}
        <TouchableOpacity 
          testID="build-your-own-btn"
          style={styles.buildOwnCard}
          onPress={goToBuildOwn}
          activeOpacity={0.95}
        >
          <View style={styles.buildOwnLeft}>
            <View style={styles.buildOwnIcon}>
              <Ionicons name="construct" size={28} color="#FFF" />
            </View>
            <View style={styles.buildOwnInfo}>
              <Text style={styles.buildOwnTitle}>Build Your Own Dish</Text>
              <Text style={styles.buildOwnDesc}>Create a custom meal from our fresh ingredients</Text>
              <View style={styles.buildOwnFeatures}>
                <View style={styles.featureTag}>
                  <Ionicons name="cash-outline" size={12} color={GREEN} />
                  <Text style={styles.featureText}>Set by ₹</Text>
                </View>
                <View style={styles.featureTag}>
                  <Ionicons name="scale-outline" size={12} color={GREEN} />
                  <Text style={styles.featureText}>Set by grams</Text>
                </View>
                <View style={styles.featureTag}>
                  <Ionicons name="sparkles" size={12} color={PURPLE} />
                  <Text style={styles.featureText}>AI Helper</Text>
                </View>
              </View>
            </View>
          </View>
          <View style={styles.buildOwnArrow}>
            <Ionicons name="arrow-forward-circle" size={32} color={GREEN} />
          </View>
        </TouchableOpacity>

        {/* Available Ingredients Preview */}
        <View style={styles.ingredientsPreview}>
          <Text style={styles.previewTitle}>{singleIngredients.length} Fresh Ingredients Available</Text>
          <View style={styles.ingredientChips}>
            {singleIngredients.slice(0, 6).map(ing => (
              <View key={ing.id} style={styles.ingredientChip}>
                <View style={[styles.miniVeg, { backgroundColor: ing.diet_type === 'non-veg' ? Z_RED : GREEN }]} />
                <Text style={styles.chipText}>{ing.name}</Text>
              </View>
            ))}
            {singleIngredients.length > 6 && (
              <View style={[styles.ingredientChip, { backgroundColor: '#F0F0F0' }]}>
                <Text style={styles.chipText}>+{singleIngredients.length - 6} more</Text>
              </View>
            )}
          </View>
        </View>

        {/* How It Works */}
        <View style={styles.howItWorks}>
          <Text style={styles.howTitle}>How It Works</Text>
          <View style={styles.stepRow}>
            <View style={styles.step}>
              <View style={styles.stepNum}><Text style={styles.stepNumText}>1</Text></View>
              <Text style={styles.stepText}>Choose your option</Text>
            </View>
            <View style={styles.stepArrow}><Ionicons name="arrow-forward" size={16} color="#D0D0D0" /></View>
            <View style={styles.step}>
              <View style={styles.stepNum}><Text style={styles.stepNumText}>2</Text></View>
              <Text style={styles.stepText}>Customize if you want</Text>
            </View>
            <View style={styles.stepArrow}><Ionicons name="arrow-forward" size={16} color="#D0D0D0" /></View>
            <View style={styles.step}>
              <View style={styles.stepNum}><Text style={styles.stepNumText}>3</Text></View>
              <Text style={styles.stepText}>Place order</Text>
            </View>
          </View>
        </View>

        <View style={{ height: 30 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F8F8F8' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
  loadingText: { color: '#9C9C9C', fontSize: 14 },
  scroll: { paddingBottom: 20 },
  
  // Header
  header: { padding: 20, paddingBottom: 10 },
  greeting: { fontSize: 26, fontWeight: '800', color: '#1C1C2E' },
  subtitle: { fontSize: 14, color: '#9C9C9C', marginTop: 4 },
  
  // Order Type
  orderTypeSection: { flexDirection: 'row', paddingHorizontal: 16, gap: 10, marginBottom: 20 },
  orderTypeBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, borderRadius: 12, backgroundColor: '#FFF', borderWidth: 1, borderColor: '#EFEFEF' },
  orderTypeBtnActive: { backgroundColor: Z_RED, borderColor: Z_RED },
  orderTypeText: { fontSize: 12, fontWeight: '600', color: '#696969' },
  
  // Section Header
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, marginBottom: 12 },
  sectionIcon: { width: 44, height: 44, borderRadius: 12, backgroundColor: '#F0F0FF', alignItems: 'center', justifyContent: 'center' },
  sectionInfo: { flex: 1 },
  sectionTitle: { fontSize: 18, fontWeight: '800', color: '#1C1C2E' },
  sectionDesc: { fontSize: 12, color: '#9C9C9C', marginTop: 2 },
  
  // Ready-Made Cards
  horizontalList: { paddingHorizontal: 16, gap: 12, paddingBottom: 4 },
  readyMadeCard: { width: width * 0.55, backgroundColor: '#FFF', borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: '#EFEFEF' },
  dishImage: { width: '100%', height: 120, backgroundColor: '#F5F5F5' },
  imagePlaceholder: { alignItems: 'center', justifyContent: 'center' },
  editBadge: { position: 'absolute', top: 8, left: 8, flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  editBadgeYes: { backgroundColor: GREEN },
  editBadgeNo: { backgroundColor: '#9C9C9C' },
  editBadgeText: { fontSize: 10, fontWeight: '700', color: '#FFF' },
  vegBadgePos: { position: 'absolute', top: 8, right: 8 },
  vegBox: { width: 16, height: 16, borderRadius: 3, borderWidth: 2, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFF' },
  vegDot: { width: 8, height: 8, borderRadius: 4 },
  dishInfo: { padding: 12 },
  dishName: { fontSize: 15, fontWeight: '700', color: '#1C1C2E', minHeight: 38 },
  dishMeta: { fontSize: 12, color: '#9C9C9C', marginTop: 4 },
  dishBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 },
  dishPrice: { fontSize: 18, fontWeight: '800', color: '#1C1C2E' },
  addIndicator: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#F0F0FF', alignItems: 'center', justifyContent: 'center' },
  
  emptySection: { paddingHorizontal: 16, paddingVertical: 30, alignItems: 'center' },
  emptyText: { color: '#9C9C9C', fontSize: 14 },
  
  // Build Your Own Card
  buildOwnCard: { marginHorizontal: 16, marginTop: 24, backgroundColor: '#FFF', borderRadius: 16, padding: 16, flexDirection: 'row', alignItems: 'center', borderWidth: 2, borderColor: GREEN, borderStyle: 'dashed' },
  buildOwnLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  buildOwnIcon: { width: 54, height: 54, borderRadius: 14, backgroundColor: GREEN, alignItems: 'center', justifyContent: 'center' },
  buildOwnInfo: { flex: 1 },
  buildOwnTitle: { fontSize: 17, fontWeight: '800', color: '#1C1C2E' },
  buildOwnDesc: { fontSize: 12, color: '#696969', marginTop: 3 },
  buildOwnFeatures: { flexDirection: 'row', gap: 8, marginTop: 8, flexWrap: 'wrap' },
  featureTag: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#F0FFF0', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  featureText: { fontSize: 10, fontWeight: '600', color: '#1C1C2E' },
  buildOwnArrow: { marginLeft: 8 },
  
  // Ingredients Preview
  ingredientsPreview: { marginHorizontal: 16, marginTop: 16, backgroundColor: '#FFF', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: '#EFEFEF' },
  previewTitle: { fontSize: 13, fontWeight: '700', color: '#696969', marginBottom: 10 },
  ingredientChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  ingredientChip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#F8F8F8', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  miniVeg: { width: 6, height: 6, borderRadius: 3 },
  chipText: { fontSize: 12, color: '#1C1C2E' },
  
  // How It Works
  howItWorks: { marginHorizontal: 16, marginTop: 20, backgroundColor: '#FAFAFA', borderRadius: 12, padding: 16 },
  howTitle: { fontSize: 14, fontWeight: '700', color: '#1C1C2E', marginBottom: 12, textAlign: 'center' },
  stepRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  step: { alignItems: 'center', flex: 1 },
  stepNum: { width: 24, height: 24, borderRadius: 12, backgroundColor: Z_RED, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  stepNumText: { color: '#FFF', fontSize: 12, fontWeight: '800' },
  stepText: { fontSize: 10, color: '#696969', textAlign: 'center' },
  stepArrow: { paddingHorizontal: 4 },
});
