import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, TextInput, Modal, SafeAreaView, Alert, ActivityIndicator, RefreshControl, KeyboardAvoidingView, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { apiCall } from '../../utils/api';

const Z_RED = '#E23744';

export default function ProductsScreen() {
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [newName, setNewName] = useState('');
  const [newCost, setNewCost] = useState('');
  const [newQty, setNewQty] = useState('10000');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => { try { setProducts(await apiCall('/products/all')); } catch (e) {} finally { setLoading(false); } }, []);
  useEffect(() => { load(); }, []);
  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const addProduct = async () => {
    if (!newName || !newCost) { Alert.alert('Error', 'Name and cost required'); return; }
    setSaving(true);
    try { await apiCall('/products', { method: 'POST', body: { name: newName, cost_per_100g: parseFloat(newCost), available_qty_grams: parseFloat(newQty) || 10000 } }); setShowModal(false); setNewName(''); setNewCost(''); setNewQty('10000'); await load(); }
    catch (e: any) { Alert.alert('Error', e.message); } finally { setSaving(false); }
  };

  const toggleActive = async (p: any) => {
    try { await apiCall(`/products/${p.id}`, { method: 'PUT', body: { is_active: !p.is_active } }); await load(); }
    catch (e: any) { Alert.alert('Error', e.message); }
  };

  const deleteProduct = (p: any) => Alert.alert('Delete', `Remove ${p.name}?`, [{ text: 'Cancel' }, { text: 'Delete', style: 'destructive', onPress: async () => { try { await apiCall(`/products/${p.id}`, { method: 'DELETE' }); await load(); } catch (e: any) { Alert.alert('Error', e.message); } } }]);

  const renderProduct = ({ item }: { item: any }) => (
    <View style={[styles.card, !item.is_active && { opacity: 0.5 }]} testID={`admin-product-${item.id}`}>
      <View style={styles.cardTop}>
        <View style={{ flex: 1 }}>
          <Text style={styles.pName}>{item.name}</Text>
          <Text style={styles.pMeta}>{item.category} • ₹{item.cost_per_100g}/100g</Text>
        </View>
        <TouchableOpacity testID={`toggle-${item.id}`} style={[styles.toggle, item.is_active && styles.toggleOn]} onPress={() => toggleActive(item)}>
          <Text style={styles.toggleText}>{item.is_active ? 'LIVE' : 'OFF'}</Text>
        </TouchableOpacity>
        <TouchableOpacity testID={`delete-${item.id}`} onPress={() => deleteProduct(item)} style={{ padding: 4 }}><Ionicons name="trash-outline" size={18} color={Z_RED} /></TouchableOpacity>
      </View>
      <View style={styles.nutriRow}>
        <Text style={styles.nutri}>{item.calories_per_100g} cal</Text>
        <Text style={styles.nutri}>P: {item.protein_per_100g}g</Text>
        <Text style={styles.nutri}>C: {item.carbs_per_100g}g</Text>
        <Text style={styles.nutri}>F: {item.fat_per_100g}g</Text>
        <Text style={[styles.nutri, { color: item.available_qty_grams <= 500 ? Z_RED : '#267E3E' }]}>Stock: {Math.round(item.available_qty_grams)}g</Text>
      </View>
    </View>
  );

  if (loading) return <SafeAreaView style={styles.safe}><View style={styles.center}><ActivityIndicator size="large" color={Z_RED} /></View></SafeAreaView>;

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Text style={styles.title}>Products</Text>
        <TouchableOpacity testID="add-product-btn" style={styles.addBtn} onPress={() => setShowModal(true)}>
          <Ionicons name="add" size={18} color="#FFF" /><Text style={styles.addText}>Add</Text>
        </TouchableOpacity>
      </View>
      <FlatList data={products} keyExtractor={i => i.id} renderItem={renderProduct} contentContainerStyle={styles.list} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Z_RED} />} />

      <Modal visible={showModal} animationType="slide" transparent>
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={styles.modalContent}>
            <View style={styles.modalHead}><Text style={styles.modalTitle}>Add Product</Text><TouchableOpacity testID="close-modal-btn" onPress={() => setShowModal(false)}><Ionicons name="close" size={24} color="#9C9C9C" /></TouchableOpacity></View>
            <Text style={styles.hint}>Nutrition & category auto-detected</Text>
            <Text style={styles.inputLabel}>Product Name</Text>
            <TextInput testID="product-name-input" style={styles.input} value={newName} onChangeText={setNewName} placeholder="e.g. Chicken Breast" placeholderTextColor="#B0B0B0" />
            <Text style={styles.inputLabel}>Cost per 100g (₹)</Text>
            <TextInput testID="product-cost-input" style={styles.input} value={newCost} onChangeText={setNewCost} placeholder="₹" placeholderTextColor="#B0B0B0" keyboardType="decimal-pad" />
            <Text style={styles.inputLabel}>Available Quantity (g)</Text>
            <TextInput testID="product-qty-input" style={styles.input} value={newQty} onChangeText={setNewQty} placeholder="grams" placeholderTextColor="#B0B0B0" keyboardType="number-pad" />
            <TouchableOpacity testID="save-product-btn" style={styles.saveBtn} onPress={addProduct} disabled={saving}>
              {saving ? <ActivityIndicator color="#FFF" /> : <Text style={styles.saveBtnText}>Add Product</Text>}
            </TouchableOpacity>
          </View>
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
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: Z_RED, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8 },
  addText: { color: '#FFF', fontSize: 13, fontWeight: '700' },
  list: { padding: 16 },
  card: { backgroundColor: '#FFF', borderRadius: 12, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: '#EFEFEF' },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  pName: { fontSize: 15, fontWeight: '700', color: '#1C1C2E' },
  pMeta: { fontSize: 12, color: '#9C9C9C', marginTop: 2 },
  toggle: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6, backgroundColor: '#E8E8E8' },
  toggleOn: { backgroundColor: '#267E3E' },
  toggleText: { fontSize: 10, fontWeight: '700', color: '#FFF' },
  nutriRow: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  nutri: { fontSize: 11, color: '#9C9C9C' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#FFF', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40 },
  modalHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  modalTitle: { fontSize: 20, fontWeight: '800', color: '#1C1C2E' },
  hint: { color: '#9C9C9C', fontSize: 12, marginBottom: 16 },
  inputLabel: { color: '#696969', fontSize: 12, fontWeight: '600', marginBottom: 4, marginTop: 8 },
  input: { backgroundColor: '#F5F5F5', borderRadius: 8, padding: 12, color: '#1C1C2E', fontSize: 15, borderWidth: 1, borderColor: '#EFEFEF' },
  saveBtn: { backgroundColor: Z_RED, borderRadius: 10, paddingVertical: 14, alignItems: 'center', marginTop: 16 },
  saveBtnText: { color: '#FFF', fontSize: 15, fontWeight: '700' },
});
