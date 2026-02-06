import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, TextInput, Modal,
  Alert, ActivityIndicator, RefreshControl, KeyboardAvoidingView,
  Platform, ScrollView, Image
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { apiCall } from '../../utils/api';

const Z_RED = '#E23744';
const PURPLE = '#5B5FE0';
const GREEN = '#267E3E';

export default function ProductsScreen() {
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showTypeSheet, setShowTypeSheet] = useState(false);
  const [showSingleModal, setShowSingleModal] = useState(false);
  const [showReadyModal, setShowReadyModal] = useState(false);
  const [saving, setSaving] = useState(false);
  
  // Diet filter: 'all', 'veg', 'non-veg'
  const [dietFilter, setDietFilter] = useState('all');

  // Single product form
  const [singleName, setSingleName] = useState('');
  const [singlePrice, setSinglePrice] = useState('');
  const [singleGrams, setSingleGrams] = useState('');

  // Ready-made meal form
  const [readyName, setReadyName] = useState('');
  const [readyPrice, setReadyPrice] = useState('');
  const [readyServing, setReadyServing] = useState('300');
  const [readyIngredients, setReadyIngredients] = useState<{name: string, grams: string}[]>([]);
  const [ingredientName, setIngredientName] = useState('');
  const [ingredientGrams, setIngredientGrams] = useState('');
  const [readyImages, setReadyImages] = useState<string[]>([]);
  const [isEditable, setIsEditable] = useState(false);

  const load = useCallback(async () => {
    try { setProducts(await apiCall('/products/all')); } catch (e) {} finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, []);
  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  // Reset forms
  const resetSingle = () => { setSingleName(''); setSinglePrice(''); setSingleGrams(''); };
  const resetReady = () => { 
    setReadyName(''); setReadyPrice(''); setReadyServing('300'); 
    setReadyIngredients([]); setIngredientName(''); setIngredientGrams(''); 
    setReadyImages([]); setIsEditable(false); 
  };

  // Add ingredient with grams
  const addIngredient = () => {
    const trimmedName = ingredientName.trim();
    const grams = ingredientGrams.trim() || '100';
    if (trimmedName && !readyIngredients.some(i => i.name.toLowerCase() === trimmedName.toLowerCase())) {
      setReadyIngredients([...readyIngredients, { name: trimmedName, grams }]);
      setIngredientName('');
      setIngredientGrams('');
    }
  };

  const removeIngredient = (name: string) => {
    setReadyIngredients(readyIngredients.filter(i => i.name !== name));
  };

  // Pick image
  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Allow photo access to upload images');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.7,
      base64: true,
      allowsMultipleSelection: true,
    });
    if (!result.canceled && result.assets) {
      const newImages = result.assets
        .filter(a => a.base64)
        .map(a => `data:image/jpeg;base64,${a.base64}`);
      setReadyImages([...readyImages, ...newImages]);
    }
  };

  const removeImage = (idx: number) => {
    setReadyImages(readyImages.filter((_, i) => i !== idx));
  };

  // Save single product
  const saveSingle = async () => {
    if (!singleName || !singlePrice || !singleGrams) {
      Alert.alert('Missing Fields', 'Enter product name, price, and grams');
      return;
    }
    setSaving(true);
    try {
      await apiCall('/products/single', {
        method: 'POST',
        body: {
          name: singleName,
          price: parseFloat(singlePrice),
          grams: parseFloat(singleGrams),
        },
      });
      setShowSingleModal(false);
      resetSingle();
      await load();
      Alert.alert('Success', 'Product added with AI-generated details!');
    } catch (e: any) { Alert.alert('Error', e.message); }
    finally { setSaving(false); }
  };

  // Save ready-made meal
  const saveReady = async () => {
    if (!readyName || !readyPrice) {
      Alert.alert('Missing Fields', 'Enter dish name and price');
      return;
    }
    if (readyIngredients.length === 0) {
      Alert.alert('Add Ingredients', 'Add at least one ingredient with grams');
      return;
    }
    setSaving(true);
    try {
      // Format ingredients with grams_per_serving
      const ingredients = readyIngredients.map(ing => ({
        name: ing.name,
        grams_per_serving: parseFloat(ing.grams) || 100
      }));
      
      await apiCall('/products/ready-made', {
        method: 'POST',
        body: {
          name: readyName,
          ingredients: ingredients,
          images: readyImages,
          price: parseFloat(readyPrice),
          serving_grams: parseFloat(readyServing) || 300,
          is_editable: isEditable,
        },
      });
      setShowReadyModal(false);
      resetReady();
      await load();
      Alert.alert('Success', 'Ready-made meal added with AI description!');
    } catch (e: any) { Alert.alert('Error', e.message); }
    finally { setSaving(false); }
  };

  const toggleActive = async (p: any) => {
    try { await apiCall(`/products/${p.id}`, { method: 'PUT', body: { is_active: !p.is_active } }); await load(); }
    catch (e: any) { Alert.alert('Error', e.message); }
  };

  const deleteProduct = (p: any) => Alert.alert('Delete', `Remove ${p.name}?`, [
    { text: 'Cancel' },
    { text: 'Delete', style: 'destructive', onPress: async () => {
      try { await apiCall(`/products/${p.id}`, { method: 'DELETE' }); await load(); }
      catch (e: any) { Alert.alert('Error', e.message); }
    }}
  ]);

  // Filter products by diet type
  const filteredProducts = products.filter(p => {
    if (dietFilter === 'all') return true;
    return p.diet_type === dietFilter;
  });

  // Count by diet type
  const vegCount = products.filter(p => p.diet_type === 'veg').length;
  const nonVegCount = products.filter(p => p.diet_type === 'non-veg').length;

  const renderProduct = ({ item }: { item: any }) => {
    const isReady = item.product_type === 'ready_made';
    // Format ingredients display for ready-made
    const ingredientsDisplay = isReady && item.ingredients ? 
      item.ingredients.map((ing: any) => 
        typeof ing === 'object' ? `${ing.name} (${ing.grams_per_serving}g)` : ing
      ).join(', ') : '';
    
    return (
      <View style={[styles.card, !item.is_active && { opacity: 0.5 }]} testID={`admin-product-${item.id}`}>
        <View style={styles.cardRow}>
          {item.image_url ? (
            <Image source={{ uri: item.image_url }} style={styles.cardImg} />
          ) : (
            <View style={[styles.cardImg, styles.cardImgPlaceholder]}>
              <Ionicons name="restaurant" size={20} color="#D0D0D0" />
            </View>
          )}
          <View style={styles.cardInfo}>
            <View style={styles.cardNameRow}>
              <View style={[styles.vegBadge, { borderColor: item.diet_type === 'non-veg' ? Z_RED : GREEN }]}>
                <View style={[styles.vegDotSmall, { backgroundColor: item.diet_type === 'non-veg' ? Z_RED : GREEN }]} />
              </View>
              <Text style={styles.pName} numberOfLines={1}>{item.name}</Text>
            </View>
            <View style={styles.tagRow}>
              <View style={[styles.typeBadge, isReady ? styles.readyBadge : styles.singleBadge]}>
                <Ionicons name={isReady ? 'fast-food' : 'cube'} size={10} color={isReady ? PURPLE : '#FF9F0A'} />
                <Text style={[styles.typeText, { color: isReady ? PURPLE : '#FF9F0A' }]}>{isReady ? 'Ready-Made' : 'Single'}</Text>
              </View>
              {isReady && item.is_editable && (
                <View style={styles.editableBadge}>
                  <Ionicons name="pencil" size={8} color="#FFF" />
                  <Text style={styles.editableText}>Editable</Text>
                </View>
              )}
              <Text style={styles.pMeta}>{item.category}</Text>
            </View>
            {item.description ? <Text style={styles.pDesc} numberOfLines={1}>{item.description}</Text> : null}
            {isReady && ingredientsDisplay && (
              <Text style={styles.pIngredients} numberOfLines={2}>{ingredientsDisplay}</Text>
            )}
          </View>
        </View>
        <View style={styles.cardBottom}>
          <View style={styles.priceRow}>
            {isReady ? (
              <Text style={styles.priceText}>₹{item.fixed_price || Math.round(item.cost_per_100g * (item.serving_grams || 300) / 100)}<Text style={styles.perUnit}>/plate</Text></Text>
            ) : (
              <Text style={styles.priceText}>₹{item.cost_per_100g}<Text style={styles.perUnit}>/100g</Text></Text>
            )}
          </View>
          <View style={styles.nutriRow}>
            <Text style={styles.nutri}>{isReady ? item.total_calories_per_serving || item.calories_per_100g : item.calories_per_100g} cal</Text>
            <Text style={styles.nutri}>P: {isReady ? item.total_protein_per_serving || item.protein_per_100g : item.protein_per_100g}g</Text>
            <Text style={styles.nutri}>C: {isReady ? item.total_carbs_per_serving || item.carbs_per_100g : item.carbs_per_100g}g</Text>
            <Text style={styles.nutri}>F: {isReady ? item.total_fat_per_serving || item.fat_per_100g : item.fat_per_100g}g</Text>
          </View>
          <View style={styles.stockRow}>
            {isReady ? (
              <Text style={[styles.stockText, { color: GREEN }]}>
                Servings: {item.available_servings || 20}
              </Text>
            ) : (
              <Text style={[styles.stockText, { color: item.available_qty_grams <= 500 ? Z_RED : GREEN }]}>
                Stock: {Math.round(item.available_qty_grams || 0)}g
              </Text>
            )}
            <View style={styles.actionRow}>
              <TouchableOpacity testID={`toggle-${item.id}`} style={[styles.toggle, item.is_active && styles.toggleOn]} onPress={() => toggleActive(item)}>
                <Text style={styles.toggleText}>{item.is_active ? 'LIVE' : 'OFF'}</Text>
              </TouchableOpacity>
              <TouchableOpacity testID={`delete-${item.id}`} onPress={() => deleteProduct(item)} style={styles.deleteBtn}>
                <Ionicons name="trash-outline" size={16} color={Z_RED} />
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>
    );
  };

  if (loading) return <SafeAreaView style={styles.safe}><View style={styles.center}><ActivityIndicator size="large" color={Z_RED} /></View></SafeAreaView>;

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Text style={styles.title}>Products</Text>
        <TouchableOpacity testID="add-product-btn" style={styles.addBtn} onPress={() => setShowTypeSheet(true)}>
          <Ionicons name="add" size={18} color="#FFF" /><Text style={styles.addText}>Add New</Text>
        </TouchableOpacity>
      </View>
      
      {/* ===== VEG / NON-VEG SECTION FILTER ===== */}
      <View style={styles.filterRow}>
        <TouchableOpacity 
          testID="filter-all"
          style={[styles.filterTab, dietFilter === 'all' && styles.filterTabActive]}
          onPress={() => setDietFilter('all')}
        >
          <Ionicons name="grid" size={14} color={dietFilter === 'all' ? '#FFF' : '#696969'} />
          <Text style={[styles.filterText, dietFilter === 'all' && styles.filterTextActive]}>All ({products.length})</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          testID="filter-veg"
          style={[styles.filterTab, styles.filterVeg, dietFilter === 'veg' && styles.filterVegActive]}
          onPress={() => setDietFilter('veg')}
        >
          <View style={[styles.vegIndicator, { borderColor: GREEN }]}>
            <View style={[styles.vegDotFilter, { backgroundColor: GREEN }]} />
          </View>
          <Text style={[styles.filterText, dietFilter === 'veg' && { color: '#FFF' }]}>Veg Section ({vegCount})</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          testID="filter-nonveg"
          style={[styles.filterTab, styles.filterNonVeg, dietFilter === 'non-veg' && styles.filterNonVegActive]}
          onPress={() => setDietFilter('non-veg')}
        >
          <View style={[styles.vegIndicator, { borderColor: Z_RED }]}>
            <View style={[styles.vegDotFilter, { backgroundColor: Z_RED }]} />
          </View>
          <Text style={[styles.filterText, dietFilter === 'non-veg' && { color: '#FFF' }]}>Non-Veg Section ({nonVegCount})</Text>
        </TouchableOpacity>
      </View>
      
      <FlatList data={filteredProducts} keyExtractor={i => i.id} renderItem={renderProduct}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Z_RED} />}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Ionicons name={dietFilter === 'veg' ? 'leaf' : dietFilter === 'non-veg' ? 'fish' : 'restaurant'} size={48} color="#D0D0D0" />
            <Text style={styles.emptyText}>No {dietFilter === 'all' ? '' : dietFilter} products yet</Text>
          </View>
        }
      />

      {/* ===== TYPE SELECTION SHEET ===== */}
      <Modal visible={showTypeSheet} animationType="slide" transparent>
        <TouchableOpacity style={styles.sheetOverlay} activeOpacity={1} onPress={() => setShowTypeSheet(false)}>
          <View style={styles.sheetContent}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Add Product</Text>
            <Text style={styles.sheetSub}>Choose product type</Text>

            <TouchableOpacity testID="type-ready-made" style={styles.typeOption} onPress={() => { setShowTypeSheet(false); setShowReadyModal(true); }} activeOpacity={0.9}>
              <View style={[styles.typeIconBg, { backgroundColor: '#F0F0FF' }]}>
                <Ionicons name="fast-food" size={24} color={PURPLE} />
              </View>
              <View style={styles.typeInfo}>
                <Text style={styles.typeName}>Ready-Made Meal</Text>
                <Text style={styles.typeDesc}>Complete dish with ingredients & grams per plate{'\n'}Set as editable or non-editable for customers</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#D0D0D0" />
            </TouchableOpacity>

            <TouchableOpacity testID="type-single" style={styles.typeOption} onPress={() => { setShowTypeSheet(false); setShowSingleModal(true); }} activeOpacity={0.9}>
              <View style={[styles.typeIconBg, { backgroundColor: '#FFF5E0' }]}>
                <Ionicons name="cube" size={24} color="#FF9F0A" />
              </View>
              <View style={styles.typeInfo}>
                <Text style={styles.typeName}>Single Product</Text>
                <Text style={styles.typeDesc}>Raw ingredient — enter name, price, grams{'\n'}Used for stock tracking in ready-made meals</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#D0D0D0" />
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ===== SINGLE PRODUCT MODAL ===== */}
      <Modal visible={showSingleModal} animationType="slide" transparent>
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={styles.modalContent}>
            <View style={styles.modalHead}>
              <View style={styles.modalTitleRow}>
                <Ionicons name="cube" size={20} color="#FF9F0A" />
                <Text style={styles.modalTitle}>Single Product</Text>
              </View>
              <TouchableOpacity testID="close-single-modal" onPress={() => { setShowSingleModal(false); resetSingle(); }}>
                <Ionicons name="close-circle" size={26} color="#D0D0D0" />
              </TouchableOpacity>
            </View>
            <View style={styles.aiBadge}>
              <Ionicons name="sparkles" size={12} color={PURPLE} />
              <Text style={styles.aiBadgeText}>AI will auto-calculate cost/gram, GENERATE product photo, detect nutrition & generate description</Text>
            </View>

            <Text style={styles.inputLabel}>Product Name</Text>
            <TextInput testID="single-name-input" style={styles.input} value={singleName} onChangeText={setSingleName} placeholder="e.g. Chicken Breast, Paneer, Oats..." placeholderTextColor="#B0B0B0" />

            <Text style={styles.inputLabel}>Price (₹)</Text>
            <TextInput testID="single-price-input" style={styles.input} value={singlePrice} onChangeText={setSinglePrice} placeholder="Total price for the stock" placeholderTextColor="#B0B0B0" keyboardType="decimal-pad" />

            <Text style={styles.inputLabel}>Quantity (grams)</Text>
            <TextInput testID="single-grams-input" style={styles.input} value={singleGrams} onChangeText={setSingleGrams} placeholder="Total grams of stock" placeholderTextColor="#B0B0B0" keyboardType="number-pad" />

            {singlePrice && singleGrams ? (
              <View style={styles.calcPreview}>
                <Ionicons name="calculator" size={14} color={GREEN} />
                <Text style={styles.calcText}>Auto: ₹{((parseFloat(singlePrice) / parseFloat(singleGrams)) * 100).toFixed(1)}/100g</Text>
              </View>
            ) : null}

            <TouchableOpacity testID="save-single-btn" style={[styles.saveBtn, { backgroundColor: '#FF9F0A' }]} onPress={saveSingle} disabled={saving}>
              {saving ? (
                <View style={styles.savingRow}><ActivityIndicator color="#FFF" size="small" /><Text style={styles.saveBtnText}>AI generating photo & details...</Text></View>
              ) : (
                <View style={styles.savingRow}><Ionicons name="sparkles" size={16} color="#FFF" /><Text style={styles.saveBtnText}>Add with AI</Text></View>
              )}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ===== READY-MADE MEAL MODAL ===== */}
      <Modal visible={showReadyModal} animationType="slide" transparent>
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <ScrollView contentContainerStyle={styles.scrollModalContent}>
            <View style={styles.modalContent}>
              <View style={styles.modalHead}>
                <View style={styles.modalTitleRow}>
                  <Ionicons name="fast-food" size={20} color={PURPLE} />
                  <Text style={styles.modalTitle}>Ready-Made Meal</Text>
                </View>
                <TouchableOpacity testID="close-ready-modal" onPress={() => { setShowReadyModal(false); resetReady(); }}>
                  <Ionicons name="close-circle" size={26} color="#D0D0D0" />
                </TouchableOpacity>
              </View>
              <View style={styles.aiBadge}>
                <Ionicons name="sparkles" size={12} color={PURPLE} />
                <Text style={styles.aiBadgeText}>AI generates description & calculates nutrition from ingredients</Text>
              </View>

              <Text style={styles.inputLabel}>Dish Name</Text>
              <TextInput testID="ready-name-input" style={styles.input} value={readyName} onChangeText={setReadyName} placeholder="e.g. Chicken Biryani Bowl" placeholderTextColor="#B0B0B0" />

              {/* Ingredients with grams per plate */}
              <Text style={styles.inputLabel}>Ingredients (per plate)</Text>
              <View style={styles.ingredientInputRow}>
                <TextInput
                  testID="ingredient-name-input"
                  style={[styles.input, { flex: 2 }]}
                  value={ingredientName}
                  onChangeText={setIngredientName}
                  placeholder="Ingredient name..."
                  placeholderTextColor="#B0B0B0"
                />
                <TextInput
                  testID="ingredient-grams-input"
                  style={[styles.input, styles.gramsInput]}
                  value={ingredientGrams}
                  onChangeText={setIngredientGrams}
                  placeholder="grams"
                  placeholderTextColor="#B0B0B0"
                  keyboardType="number-pad"
                />
                <TouchableOpacity testID="add-ingredient-btn" style={styles.addIngBtn} onPress={addIngredient}>
                  <Ionicons name="add-circle" size={36} color={PURPLE} />
                </TouchableOpacity>
              </View>
              
              {readyIngredients.length > 0 && (
                <View style={styles.ingredientChips}>
                  {readyIngredients.map((ing, i) => (
                    <View key={i} style={styles.chip}>
                      <Text style={styles.chipText}>{ing.name}</Text>
                      <View style={styles.chipGrams}>
                        <Text style={styles.chipGramsText}>{ing.grams}g</Text>
                      </View>
                      <TouchableOpacity onPress={() => removeIngredient(ing.name)}>
                        <Ionicons name="close-circle" size={16} color="#9C9C9C" />
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              )}

              <Text style={styles.inputLabel}>Photos</Text>
              <TouchableOpacity testID="pick-images-btn" style={styles.imagePickerBtn} onPress={pickImage} activeOpacity={0.8}>
                <Ionicons name="camera" size={22} color={PURPLE} />
                <Text style={styles.imagePickerText}>Add Photos</Text>
              </TouchableOpacity>
              {readyImages.length > 0 && (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.imagePreviewRow}>
                  {readyImages.map((img, i) => (
                    <View key={i} style={styles.imagePreview}>
                      <Image source={{ uri: img }} style={styles.previewImg} />
                      <TouchableOpacity style={styles.removeImgBtn} onPress={() => removeImage(i)}>
                        <Ionicons name="close-circle" size={20} color={Z_RED} />
                      </TouchableOpacity>
                    </View>
                  ))}
                </ScrollView>
              )}

              <Text style={styles.inputLabel}>Price (₹ per plate)</Text>
              <TextInput testID="ready-price-input" style={styles.input} value={readyPrice} onChangeText={setReadyPrice} placeholder="Price per serving" placeholderTextColor="#B0B0B0" keyboardType="decimal-pad" />

              <Text style={styles.inputLabel}>Serving Size (grams) - optional</Text>
              <TextInput testID="ready-serving-input" style={styles.input} value={readyServing} onChangeText={setReadyServing} placeholder="300" placeholderTextColor="#B0B0B0" keyboardType="number-pad" />

              {/* Editable toggle */}
              <View style={styles.editableRow}>
                <View style={styles.editableInfo}>
                  <Text style={styles.editableLabel}>Allow Customer Customization</Text>
                  <Text style={styles.editableDesc}>Customers can modify ingredient grams</Text>
                </View>
                <TouchableOpacity 
                  testID="toggle-editable"
                  style={[styles.editableToggle, isEditable && styles.editableToggleOn]}
                  onPress={() => setIsEditable(!isEditable)}
                >
                  <View style={[styles.editableKnob, isEditable && styles.editableKnobOn]} />
                </TouchableOpacity>
              </View>

              <TouchableOpacity testID="save-ready-btn" style={[styles.saveBtn, { backgroundColor: PURPLE }]} onPress={saveReady} disabled={saving}>
                {saving ? (
                  <View style={styles.savingRow}><ActivityIndicator color="#FFF" size="small" /><Text style={styles.saveBtnText}>AI generating photo & details...</Text></View>
                ) : (
                  <View style={styles.savingRow}><Ionicons name="sparkles" size={16} color="#FFF" /><Text style={styles.saveBtnText}>Add Meal with AI</Text></View>
                )}
              </TouchableOpacity>
              <View style={{ height: 40 }} />
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F8F8F8' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, paddingTop: 8, backgroundColor: '#FFF', borderBottomWidth: 1, borderBottomColor: '#EFEFEF' },
  title: { fontSize: 24, fontWeight: '800', color: '#1C1C2E' },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: Z_RED, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10 },
  addText: { color: '#FFF', fontSize: 14, fontWeight: '700' },
  
  // Diet filter
  filterRow: { flexDirection: 'row', backgroundColor: '#FFF', paddingHorizontal: 12, paddingVertical: 10, gap: 8, borderBottomWidth: 1, borderBottomColor: '#EFEFEF' },
  filterTab: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, backgroundColor: '#F5F5F5', borderWidth: 1, borderColor: '#E8E8E8' },
  filterTabActive: { backgroundColor: '#1C1C2E', borderColor: '#1C1C2E' },
  filterVeg: { borderColor: '#E0F0E0' },
  filterVegActive: { backgroundColor: '#267E3E', borderColor: '#267E3E' },
  filterNonVeg: { borderColor: '#FDE8EA' },
  filterNonVegActive: { backgroundColor: Z_RED, borderColor: Z_RED },
  filterText: { fontSize: 12, fontWeight: '600', color: '#696969' },
  filterTextActive: { color: '#FFF' },
  vegIndicator: { width: 12, height: 12, borderRadius: 2, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  vegDotFilter: { width: 6, height: 6, borderRadius: 3 },
  
  emptyState: { alignItems: 'center', paddingTop: 60, gap: 12 },
  emptyText: { fontSize: 15, color: '#9C9C9C' },
  
  list: { padding: 16 },

  // Product card
  card: { backgroundColor: '#FFF', borderRadius: 14, marginBottom: 12, borderWidth: 1, borderColor: '#EFEFEF', overflow: 'hidden' },
  cardRow: { flexDirection: 'row', padding: 12, gap: 12 },
  cardImg: { width: 70, height: 70, borderRadius: 10, backgroundColor: '#F5F5F5' },
  cardImgPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  cardInfo: { flex: 1 },
  cardNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  vegBadge: { width: 14, height: 14, borderRadius: 2, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  vegDotSmall: { width: 7, height: 7, borderRadius: 4 },
  pName: { fontSize: 15, fontWeight: '700', color: '#1C1C2E', flex: 1 },
  tagRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4, flexWrap: 'wrap' },
  typeBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 4 },
  readyBadge: { backgroundColor: '#F0F0FF' },
  singleBadge: { backgroundColor: '#FFF5E0' },
  typeText: { fontSize: 10, fontWeight: '700' },
  editableBadge: { flexDirection: 'row', alignItems: 'center', gap: 2, backgroundColor: '#267E3E', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  editableText: { fontSize: 9, fontWeight: '700', color: '#FFF' },
  pMeta: { fontSize: 11, color: '#9C9C9C' },
  pDesc: { fontSize: 11, color: '#696969', marginTop: 3 },
  pIngredients: { fontSize: 10, color: '#9C9C9C', marginTop: 2, fontStyle: 'italic' },
  cardBottom: { paddingHorizontal: 12, paddingBottom: 12, borderTopWidth: 1, borderTopColor: '#F5F5F5', paddingTop: 8 },
  priceRow: { marginBottom: 4 },
  priceText: { fontSize: 15, fontWeight: '700', color: '#1C1C2E' },
  perUnit: { fontSize: 10, fontWeight: '400', color: '#9C9C9C' },
  nutriRow: { flexDirection: 'row', gap: 10, flexWrap: 'wrap', marginBottom: 6 },
  nutri: { fontSize: 11, color: '#9C9C9C' },
  stockRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  stockText: { fontSize: 11, fontWeight: '600' },
  actionRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  toggle: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6, backgroundColor: '#E8E8E8' },
  toggleOn: { backgroundColor: '#267E3E' },
  toggleText: { fontSize: 10, fontWeight: '700', color: '#FFF' },
  deleteBtn: { padding: 4 },

  // Type selection sheet
  sheetOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheetContent: { backgroundColor: '#FFF', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40 },
  sheetHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: '#E0E0E0', alignSelf: 'center', marginBottom: 16 },
  sheetTitle: { fontSize: 22, fontWeight: '800', color: '#1C1C2E', textAlign: 'center' },
  sheetSub: { fontSize: 13, color: '#9C9C9C', textAlign: 'center', marginBottom: 20 },
  typeOption: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, borderRadius: 14, backgroundColor: '#FAFAFA', marginBottom: 10, borderWidth: 1, borderColor: '#EFEFEF' },
  typeIconBg: { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  typeInfo: { flex: 1 },
  typeName: { fontSize: 16, fontWeight: '700', color: '#1C1C2E' },
  typeDesc: { fontSize: 12, color: '#9C9C9C', marginTop: 2, lineHeight: 16 },

  // Modals
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  scrollModalContent: { flexGrow: 1, justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#FFF', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40, maxHeight: '90%' },
  modalHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  modalTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  modalTitle: { fontSize: 20, fontWeight: '800', color: '#1C1C2E' },
  aiBadge: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, backgroundColor: '#F0F0FF', padding: 10, borderRadius: 8, marginBottom: 16 },
  aiBadgeText: { fontSize: 11, color: '#5B5FE0', flex: 1, lineHeight: 15 },
  inputLabel: { color: '#696969', fontSize: 12, fontWeight: '700', marginBottom: 4, marginTop: 10 },
  input: { backgroundColor: '#F5F5F5', borderRadius: 10, padding: 12, color: '#1C1C2E', fontSize: 15, borderWidth: 1, borderColor: '#EFEFEF' },
  calcPreview: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8, backgroundColor: '#F0FFF0', padding: 8, borderRadius: 8 },
  calcText: { fontSize: 13, fontWeight: '600', color: '#267E3E' },

  // Ingredients with grams
  ingredientInputRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  gramsInput: { flex: 1, textAlign: 'center' },
  addIngBtn: { padding: 2 },
  ingredientChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#F0F0FF', paddingLeft: 10, paddingRight: 6, paddingVertical: 6, borderRadius: 16 },
  chipText: { fontSize: 13, color: '#1C1C2E', fontWeight: '500' },
  chipGrams: { backgroundColor: '#5B5FE0', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8 },
  chipGramsText: { fontSize: 11, color: '#FFF', fontWeight: '700' },

  // Image picker
  imagePickerBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 14, borderWidth: 1.5, borderColor: '#5B5FE0', borderStyle: 'dashed', borderRadius: 12, backgroundColor: '#FAFAFF' },
  imagePickerText: { fontSize: 14, fontWeight: '600', color: '#5B5FE0' },
  imagePreviewRow: { marginTop: 10 },
  imagePreview: { marginRight: 8, position: 'relative' },
  previewImg: { width: 80, height: 80, borderRadius: 10 },
  removeImgBtn: { position: 'absolute', top: -6, right: -6 },

  // Editable toggle
  editableRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#F5F5F5', padding: 14, borderRadius: 12, marginTop: 14 },
  editableInfo: { flex: 1 },
  editableLabel: { fontSize: 14, fontWeight: '700', color: '#1C1C2E' },
  editableDesc: { fontSize: 11, color: '#9C9C9C', marginTop: 2 },
  editableToggle: { width: 50, height: 28, borderRadius: 14, backgroundColor: '#D0D0D0', padding: 3, justifyContent: 'center' },
  editableToggleOn: { backgroundColor: '#267E3E' },
  editableKnob: { width: 22, height: 22, borderRadius: 11, backgroundColor: '#FFF' },
  editableKnobOn: { alignSelf: 'flex-end' },

  // Save button
  saveBtn: { borderRadius: 12, paddingVertical: 15, alignItems: 'center', marginTop: 18 },
  saveBtnText: { color: '#FFF', fontSize: 15, fontWeight: '800' },
  savingRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
});
