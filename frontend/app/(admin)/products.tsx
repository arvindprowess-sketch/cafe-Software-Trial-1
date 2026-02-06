import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, TextInput, Modal,
  SafeAreaView, Alert, ActivityIndicator, RefreshControl, KeyboardAvoidingView, Platform
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { apiCall } from '../../utils/api';

export default function ProductsScreen() {
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [newName, setNewName] = useState('');
  const [newCost, setNewCost] = useState('');
  const [newQty, setNewQty] = useState('10000');
  const [saving, setSaving] = useState(false);

  const loadProducts = useCallback(async () => {
    try { const data = await apiCall('/products/all'); setProducts(data); }
    catch (e) {} finally { setLoading(false); }
  }, []);

  useEffect(() => { loadProducts(); }, []);
  const onRefresh = async () => { setRefreshing(true); await loadProducts(); setRefreshing(false); };

  const addProduct = async () => {
    if (!newName || !newCost) { Alert.alert('Error', 'Name and cost are required'); return; }
    setSaving(true);
    try {
      await apiCall('/products', {
        method: 'POST',
        body: { name: newName, cost_per_100g: parseFloat(newCost), available_qty_grams: parseFloat(newQty) || 10000 }
      });
      setShowModal(false);
      setNewName(''); setNewCost(''); setNewQty('10000');
      await loadProducts();
    } catch (e: any) { Alert.alert('Error', e.message); }
    finally { setSaving(false); }
  };

  const toggleActive = async (product: any) => {
    try {
      await apiCall(`/products/${product.id}`, {
        method: 'PUT', body: { is_active: !product.is_active }
      });
      await loadProducts();
    } catch (e: any) { Alert.alert('Error', e.message); }
  };

  const deleteProduct = (product: any) => {
    Alert.alert('Delete', `Remove ${product.name}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          try { await apiCall(`/products/${product.id}`, { method: 'DELETE' }); await loadProducts(); }
          catch (e: any) { Alert.alert('Error', e.message); }
        }
      }
    ]);
  };

  const renderProduct = ({ item }: { item: any }) => (
    <View style={[styles.card, !item.is_active && styles.cardInactive]} testID={`admin-product-${item.id}`}>
      <View style={styles.cardTop}>
        <View style={{ flex: 1 }}>
          <Text style={styles.productName}>{item.name}</Text>
          <Text style={styles.productMeta}>
            {item.category} • ₹{item.cost_per_100g}/100g
          </Text>
        </View>
        <View style={styles.cardActions}>
          <TouchableOpacity
            testID={`toggle-${item.id}`}
            style={[styles.statusDot, item.is_active && styles.statusActive]}
            onPress={() => toggleActive(item)}
          >
            <Text style={styles.statusText}>{item.is_active ? 'ON' : 'OFF'}</Text>
          </TouchableOpacity>
          <TouchableOpacity testID={`delete-${item.id}`} onPress={() => deleteProduct(item)}>
            <Ionicons name="trash" size={18} color="#FF453A" />
          </TouchableOpacity>
        </View>
      </View>
      <View style={styles.nutritionRow}>
        <Text style={styles.nutri}>{item.calories_per_100g} cal</Text>
        <Text style={styles.nutri}>P: {item.protein_per_100g}g</Text>
        <Text style={styles.nutri}>C: {item.carbs_per_100g}g</Text>
        <Text style={styles.nutri}>F: {item.fat_per_100g}g</Text>
        <Text style={[styles.nutri, { color: item.available_qty_grams <= 500 ? '#FF453A' : '#32D74B' }]}>
          Stock: {Math.round(item.available_qty_grams)}g
        </Text>
      </View>
    </View>
  );

  if (loading) {
    return <SafeAreaView style={styles.safe}><View style={styles.center}><ActivityIndicator size="large" color="#FF3B30" /></View></SafeAreaView>;
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Text style={styles.title}>Products</Text>
        <TouchableOpacity testID="add-product-btn" style={styles.addBtn} onPress={() => setShowModal(true)}>
          <Ionicons name="add" size={20} color="#FFF" />
          <Text style={styles.addBtnText}>ADD</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={products}
        keyExtractor={item => item.id}
        renderItem={renderProduct}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#FF3B30" />}
      />

      <Modal visible={showModal} animationType="slide" transparent>
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Add Product</Text>
              <TouchableOpacity testID="close-modal-btn" onPress={() => setShowModal(false)}>
                <Ionicons name="close-circle" size={28} color="#48484A" />
              </TouchableOpacity>
            </View>
            <Text style={styles.modalHint}>System will auto-detect nutrition & category</Text>

            <Text style={styles.inputLabel}>Product Name</Text>
            <TextInput
              testID="product-name-input"
              style={styles.input}
              value={newName}
              onChangeText={setNewName}
              placeholder="e.g. Chicken Breast, Paneer Tikka"
              placeholderTextColor="#48484A"
            />

            <Text style={styles.inputLabel}>Cost per 100g (₹)</Text>
            <TextInput
              testID="product-cost-input"
              style={styles.input}
              value={newCost}
              onChangeText={setNewCost}
              placeholder="₹"
              placeholderTextColor="#48484A"
              keyboardType="decimal-pad"
            />

            <Text style={styles.inputLabel}>Available Quantity (grams)</Text>
            <TextInput
              testID="product-qty-input"
              style={styles.input}
              value={newQty}
              onChangeText={setNewQty}
              placeholder="grams"
              placeholderTextColor="#48484A"
              keyboardType="number-pad"
            />

            <TouchableOpacity
              testID="save-product-btn"
              style={styles.saveBtn}
              onPress={addProduct}
              disabled={saving}
            >
              {saving ? <ActivityIndicator color="#FFF" /> : <Text style={styles.saveBtnText}>ADD PRODUCT</Text>}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#000' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: 16, paddingTop: 8,
  },
  title: { fontSize: 28, fontWeight: '800', color: '#FFF' },
  addBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#FF3B30', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10,
  },
  addBtnText: { color: '#FFF', fontSize: 14, fontWeight: '700' },
  list: { padding: 16 },
  card: {
    backgroundColor: '#121212', borderRadius: 14, padding: 14, marginBottom: 10,
    borderWidth: 1, borderColor: '#2C2C2E',
  },
  cardInactive: { opacity: 0.5 },
  cardTop: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  productName: { fontSize: 16, fontWeight: '700', color: '#FFF' },
  productMeta: { fontSize: 12, color: '#8E8E93', marginTop: 2 },
  cardActions: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  statusDot: {
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8,
    backgroundColor: '#2C2C2E',
  },
  statusActive: { backgroundColor: '#32D74B' },
  statusText: { fontSize: 11, fontWeight: '700', color: '#FFF' },
  nutritionRow: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  nutri: { fontSize: 11, color: '#8E8E93' },
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#1C1C1E', borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 24, paddingBottom: 40,
  },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  modalTitle: { fontSize: 22, fontWeight: '800', color: '#FFF' },
  modalHint: { color: '#8E8E93', fontSize: 12, marginBottom: 20 },
  inputLabel: { color: '#8E8E93', fontSize: 12, fontWeight: '600', marginBottom: 6, marginTop: 10 },
  input: {
    backgroundColor: '#2C2C2E', borderRadius: 10, padding: 14,
    color: '#FFF', fontSize: 16,
  },
  saveBtn: {
    backgroundColor: '#FF3B30', borderRadius: 12, paddingVertical: 16,
    alignItems: 'center', marginTop: 20,
  },
  saveBtnText: { color: '#FFF', fontSize: 16, fontWeight: '700', letterSpacing: 1 },
});
