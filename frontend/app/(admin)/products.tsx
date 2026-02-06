import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, TextInput, Modal,
  SafeAreaView, Alert, ActivityIndicator, RefreshControl, KeyboardAvoidingView,
  Platform, ScrollView, Image
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { apiCall } from '../../utils/api';

const Z_RED = '#E23744';
const PURPLE = '#5B5FE0';

export default function ProductsScreen() {
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showTypeSheet, setShowTypeSheet] = useState(false);
  const [showSingleModal, setShowSingleModal] = useState(false);
  const [showReadyModal, setShowReadyModal] = useState(false);
  const [saving, setSaving] = useState(false);

  // Single product form
  const [singleName, setSingleName] = useState('');
  const [singlePrice, setSinglePrice] = useState('');
  const [singleGrams, setSingleGrams] = useState('');

  // Ready-made meal form
  const [readyName, setReadyName] = useState('');
  const [readyPrice, setReadyPrice] = useState('');
  const [readyServing, setReadyServing] = useState('300');
  const [readyIngredients, setReadyIngredients] = useState<string[]>([]);
  const [ingredientInput, setIngredientInput] = useState('');
  const [readyImages, setReadyImages] = useState<string[]>([]);

  const load = useCallback(async () => {
    try { setProducts(await apiCall('/products/all')); } catch (e) {} finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, []);
  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  // Reset forms
  const resetSingle = () => { setSingleName(''); setSinglePrice(''); setSingleGrams(''); };
  const resetReady = () => { setReadyName(''); setReadyPrice(''); setReadyServing('300'); setReadyIngredients([]); setIngredientInput(''); setReadyImages([]); };

  // Add ingredient
  const addIngredient = () => {
    const trimmed = ingredientInput.trim();
    if (trimmed && !readyIngredients.includes(trimmed)) {
      setReadyIngredients([...readyIngredients, trimmed]);
      setIngredientInput('');
    }
  };

  const removeIngredient = (ing: string) => {
    setReadyIngredients(readyIngredients.filter(i => i !== ing));
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
      Alert.alert('Add Ingredients', 'Add at least one ingredient');
      return;
    }
    setSaving(true);
    try {
      await apiCall('/products/ready-made', {
        method: 'POST',
        body: {
          name: readyName,
          ingredients: readyIngredients,
          images: readyImages,
          price: parseFloat(readyPrice),
          serving_grams: parseFloat(readyServing) || 300,
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

  const renderProduct = ({ item }: { item: any }) => {
    const isReady = item.product_type === 'ready_made';
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
              <View style={[styles.vegBadge, { borderColor: item.diet_type === 'non-veg' ? Z_RED : '#267E3E' }]}>
                <View style={[styles.vegDotSmall, { backgroundColor: item.diet_type === 'non-veg' ? Z_RED : '#267E3E' }]} />
              </View>
              <Text style={styles.pName} numberOfLines={1}>{item.name}</Text>
            </View>
            <View style={styles.tagRow}>
              <View style={[styles.typeBadge, isReady ? styles.readyBadge : styles.singleBadge]}>
                <Ionicons name={isReady ? 'fast-food' : 'cube'} size={10} color={isReady ? PURPLE : '#FF9F0A'} />
                <Text style={[styles.typeText, { color: isReady ? PURPLE : '#FF9F0A' }]}>{isReady ? 'Ready-Made' : 'Single'}</Text>
              </View>
              <Text style={styles.pMeta}>{item.category}</Text>
            </View>
            {item.description ? <Text style={styles.pDesc} numberOfLines={1}>{item.description}</Text> : null}
            {isReady && item.ingredients?.length > 0 && (
              <Text style={styles.pIngredients} numberOfLines={1}>{item.ingredients.join(', ')}</Text>
            )}
          </View>
        </View>
        <View style={styles.cardBottom}>
          <View style={styles.priceRow}>
            {isReady ? (
              <Text style={styles.priceText}>₹{item.fixed_price || Math.round(item.cost_per_100g * (item.serving_grams || 300) / 100)}<Text style={styles.perUnit}>/serving</Text></Text>
            ) : (
              <Text style={styles.priceText}>₹{item.cost_per_100g}<Text style={styles.perUnit}>/100g</Text></Text>
            )}
          </View>
          <View style={styles.nutriRow}>
            <Text style={styles.nutri}>{item.calories_per_100g} cal</Text>
            <Text style={styles.nutri}>P: {item.protein_per_100g}g</Text>
            <Text style={styles.nutri}>C: {item.carbs_per_100g}g</Text>
            <Text style={styles.nutri}>F: {item.fat_per_100g}g</Text>
          </View>
          <View style={styles.stockRow}>
            <Text style={[styles.stockText, { color: item.available_qty_grams <= 500 ? Z_RED : '#267E3E' }]}>
              Stock: {Math.round(item.available_qty_grams)}g
            </Text>
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
      <FlatList data={products} keyExtractor={i => i.id} renderItem={renderProduct}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Z_RED} />}
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
                <Text style={styles.typeDesc}>Complete dish with ingredients & photos{'\n'}AI auto-generates description</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#D0D0D0" />
            </TouchableOpacity>

            <TouchableOpacity testID="type-single" style={styles.typeOption} onPress={() => { setShowTypeSheet(false); setShowSingleModal(true); }} activeOpacity={0.9}>
              <View style={[styles.typeIconBg, { backgroundColor: '#FFF5E0' }]}>
                <Ionicons name="cube" size={24} color="#FF9F0A" />
              </View>
              <View style={styles.typeInfo}>
                <Text style={styles.typeName}>Single Product</Text>
                <Text style={styles.typeDesc}>Raw ingredient — enter name, price, grams{'\n'}AI handles everything else</Text>
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
              <Text style={styles.aiBadgeText}>AI will auto-calculate cost/gram, find photo, detect nutrition & generate description</Text>
            </View>

            <Text style={styles.inputLabel}>Product Name</Text>
            <TextInput testID="single-name-input" style={styles.input} value={singleName} onChangeText={setSingleName} placeholder="e.g. Chicken Breast, Paneer, Oats..." placeholderTextColor="#B0B0B0" />

            <Text style={styles.inputLabel}>Price (₹)</Text>
            <TextInput testID="single-price-input" style={styles.input} value={singlePrice} onChangeText={setSinglePrice} placeholder="Total price for the stock" placeholderTextColor="#B0B0B0" keyboardType="decimal-pad" />

            <Text style={styles.inputLabel}>Quantity (grams)</Text>
            <TextInput testID="single-grams-input" style={styles.input} value={singleGrams} onChangeText={setSingleGrams} placeholder="Total grams of stock" placeholderTextColor="#B0B0B0" keyboardType="number-pad" />

            {singlePrice && singleGrams ? (
              <View style={styles.calcPreview}>
                <Ionicons name="calculator" size={14} color="#267E3E" />
                <Text style={styles.calcText}>Auto: ₹{((parseFloat(singlePrice) / parseFloat(singleGrams)) * 100).toFixed(1)}/100g</Text>
              </View>
            ) : null}

            <TouchableOpacity testID="save-single-btn" style={[styles.saveBtn, { backgroundColor: '#FF9F0A' }]} onPress={saveSingle} disabled={saving}>
              {saving ? (
                <View style={styles.savingRow}><ActivityIndicator color="#FFF" size="small" /><Text style={styles.saveBtnText}>AI is working...</Text></View>
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
                <Text style={styles.aiBadgeText}>AI will generate description & calculate nutrition from ingredients</Text>
              </View>

              <Text style={styles.inputLabel}>Dish Name</Text>
              <TextInput testID="ready-name-input" style={styles.input} value={readyName} onChangeText={setReadyName} placeholder="e.g. Chicken Biryani Bowl" placeholderTextColor="#B0B0B0" />

              <Text style={styles.inputLabel}>Ingredients</Text>
              <View style={styles.ingredientInputRow}>
                <TextInput
                  testID="ingredient-input"
                  style={[styles.input, { flex: 1 }]}
                  value={ingredientInput}
                  onChangeText={setIngredientInput}
                  placeholder="Add ingredient..."
                  placeholderTextColor="#B0B0B0"
                  onSubmitEditing={addIngredient}
                  returnKeyType="done"
                />
                <TouchableOpacity testID="add-ingredient-btn" style={styles.addIngBtn} onPress={addIngredient}>
                  <Ionicons name="add-circle" size={36} color={PURPLE} />
                </TouchableOpacity>
              </View>
              {readyIngredients.length > 0 && (
                <View style={styles.ingredientChips}>
                  {readyIngredients.map((ing, i) => (
                    <View key={i} style={styles.chip}>
                      <Text style={styles.chipText}>{ing}</Text>
                      <TouchableOpacity onPress={() => removeIngredient(ing)}>
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

              <Text style={styles.inputLabel}>Price (₹)</Text>
              <TextInput testID="ready-price-input" style={styles.input} value={readyPrice} onChangeText={setReadyPrice} placeholder="Price per serving" placeholderTextColor="#B0B0B0" keyboardType="decimal-pad" />

              <Text style={styles.inputLabel}>Serving Size (grams) - optional</Text>
              <TextInput testID="ready-serving-input" style={styles.input} value={readyServing} onChangeText={setReadyServing} placeholder="300" placeholderTextColor="#B0B0B0" keyboardType="number-pad" />

              <TouchableOpacity testID="save-ready-btn" style={[styles.saveBtn, { backgroundColor: PURPLE }]} onPress={saveReady} disabled={saving}>
                {saving ? (
                  <View style={styles.savingRow}><ActivityIndicator color="#FFF" size="small" /><Text style={styles.saveBtnText}>AI is working...</Text></View>
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
  tagRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  typeBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 4 },
  readyBadge: { backgroundColor: '#F0F0FF' },
  singleBadge: { backgroundColor: '#FFF5E0' },
  typeText: { fontSize: 10, fontWeight: '700' },
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

  // Ingredients
  ingredientInputRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  addIngBtn: { padding: 2 },
  ingredientChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#F0F0FF', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 16 },
  chipText: { fontSize: 13, color: '#1C1C2E', fontWeight: '500' },

  // Image picker
  imagePickerBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 14, borderWidth: 1.5, borderColor: '#5B5FE0', borderStyle: 'dashed', borderRadius: 12, backgroundColor: '#FAFAFF' },
  imagePickerText: { fontSize: 14, fontWeight: '600', color: '#5B5FE0' },
  imagePreviewRow: { marginTop: 10 },
  imagePreview: { marginRight: 8, position: 'relative' },
  previewImg: { width: 80, height: 80, borderRadius: 10 },
  removeImgBtn: { position: 'absolute', top: -6, right: -6 },

  // Save button
  saveBtn: { borderRadius: 12, paddingVertical: 15, alignItems: 'center', marginTop: 18 },
  saveBtnText: { color: '#FFF', fontSize: 15, fontWeight: '800' },
  savingRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
});
