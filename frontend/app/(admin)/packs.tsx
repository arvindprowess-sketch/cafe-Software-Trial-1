import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Alert, ActivityIndicator, Switch, Modal, FlatList } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { apiCall } from '../../utils/api';

const Z_RED = '#E23744';
const GREEN = '#267E3E';
const PURPLE = '#5B5FE0';
const GOALS = [
  { key: 'muscle_gain', label: 'Muscle Gain', color: GREEN },
  { key: 'fat_loss', label: 'Fat Loss', color: Z_RED },
  { key: 'maintenance', label: 'Maintenance', color: PURPLE },
];
const COLORS = ['#267E3E', '#E23744', '#FF9F0A', '#5B5FE0', '#4CAF50', '#2196F3'];

export default function AdminPacksScreen() {
  const router = useRouter();
  const [packs, setPacks] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: '', description: '', goal: 'muscle_gain', diet_type: 'both', pack_price: '',
    banner_color: '#267E3E', is_active: true,
  });
  const [packItems, setPackItems] = useState<any[]>([]);
  const [showProductPicker, setShowProductPicker] = useState(false);

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    try {
      const [p, prods] = await Promise.all([apiCall('/packs/all'), apiCall('/products')]);
      setPacks(p); setProducts(prods);
    } catch {} finally { setLoading(false); }
  };

  const resetForm = () => {
    setForm({ name: '', description: '', goal: 'muscle_gain', diet_type: 'both', pack_price: '', banner_color: '#267E3E', is_active: true });
    setPackItems([]);
    setEditId(null);
  };

  const editPack = (pack: any) => {
    setForm({
      name: pack.name, description: pack.description || '', goal: pack.goal,
      diet_type: pack.diet_type || 'both', pack_price: String(pack.pack_price),
      banner_color: pack.banner_color || '#267E3E', is_active: pack.is_active,
    });
    setPackItems(pack.items || []);
    setEditId(pack.id);
    setShowForm(true);
  };

  const addProduct = (product: any) => {
    const exists = packItems.find(i => i.product_id === product.id);
    if (exists) return;
    setPackItems([...packItems, { product_id: product.id, product_name: product.name, grams: 100 }]);
    setShowProductPicker(false);
  };

  const updateItemGrams = (idx: number, grams: string) => {
    const items = [...packItems];
    items[idx].grams = parseFloat(grams) || 0;
    setPackItems(items);
  };

  const removeItem = (idx: number) => {
    setPackItems(packItems.filter((_, i) => i !== idx));
  };

  const savePack = async () => {
    if (!form.name.trim()) { Alert.alert('Error', 'Name is required'); return; }
    if (packItems.length === 0) { Alert.alert('Error', 'Add at least one item'); return; }
    if (!form.pack_price) { Alert.alert('Error', 'Pack price is required'); return; }
    setSaving(true);
    try {
      const payload = {
        ...form,
        pack_price: parseFloat(form.pack_price) || 0,
        items: packItems,
      };
      if (editId) {
        await apiCall(`/packs/${editId}`, 'PUT', payload);
      } else {
        await apiCall('/packs', 'POST', payload);
      }
      setShowForm(false);
      resetForm();
      loadData();
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to save');
    } finally { setSaving(false); }
  };

  const deletePack = (id: string) => {
    Alert.alert('Delete Pack', 'Are you sure?', [
      { text: 'Cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        await apiCall(`/packs/${id}`, 'DELETE');
        loadData();
      }},
    ]);
  };

  const toggleActive = async (pack: any) => {
    await apiCall(`/packs/${pack.id}`, 'PUT', { is_active: !pack.is_active });
    loadData();
  };

  if (loading) return <SafeAreaView style={s.safe}><View style={s.center}><ActivityIndicator size="large" color={Z_RED} /></View></SafeAreaView>;

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <Ionicons name="arrow-back" size={20} color="#1C1C2E" />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Manage Packs</Text>
        <TouchableOpacity testID="add-pack-btn" style={s.addBtn} onPress={() => { resetForm(); setShowForm(true); }}>
          <Ionicons name="add" size={20} color="#FFF" />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={s.list}>
        {packs.length === 0 && <Text style={s.empty}>No packs yet. Tap + to create one.</Text>}
        {packs.map(pack => {
          const goalInfo = GOALS.find(g => g.key === pack.goal) || GOALS[2];
          return (
            <View key={pack.id} style={[s.card, !pack.is_active && s.cardInactive]} testID={`pack-card-${pack.id}`}>
              <View style={[s.cardStripe, { backgroundColor: pack.banner_color }]} />
              <View style={s.cardBody}>
                <View style={s.cardRow}>
                  <View style={s.cardRowLeft}>
                    <Text style={s.cardTitle}>{pack.name}</Text>
                    <View style={[s.goalTag, { backgroundColor: goalInfo.color + '20' }]}>
                      <Text style={[s.goalTagText, { color: goalInfo.color }]}>{goalInfo.label}</Text>
                    </View>
                  </View>
                  <Switch value={pack.is_active} onValueChange={() => toggleActive(pack)} trackColor={{ true: GREEN }} />
                </View>
                <Text style={s.cardSub}>{pack.description}</Text>
                <View style={s.itemsPreview}>
                  {pack.items?.slice(0, 4).map((item: any, i: number) => (
                    <View key={i} style={s.itemChip}>
                      <Text style={s.itemChipText}>{item.product_name} ({item.grams}g)</Text>
                    </View>
                  ))}
                </View>
                <View style={s.priceRow}>
                  <Text style={s.priceText}>₹{Math.round(pack.pack_price)}</Text>
                  <Text style={s.itemCount}>{pack.items?.length || 0} items</Text>
                </View>
                <View style={s.actions}>
                  <TouchableOpacity testID={`edit-pack-${pack.id}`} style={s.editBtn} onPress={() => editPack(pack)}>
                    <Ionicons name="create" size={16} color={PURPLE} />
                    <Text style={s.editText}>Edit</Text>
                  </TouchableOpacity>
                  <TouchableOpacity testID={`delete-pack-${pack.id}`} style={s.deleteBtn} onPress={() => deletePack(pack.id)}>
                    <Ionicons name="trash" size={16} color={Z_RED} />
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          );
        })}
      </ScrollView>

      {/* Create/Edit Modal */}
      <Modal visible={showForm} animationType="slide" testID="pack-form-modal">
        <SafeAreaView style={s.safe}>
          <View style={s.header}>
            <TouchableOpacity onPress={() => { setShowForm(false); resetForm(); }} style={s.backBtn}>
              <Ionicons name="close" size={20} color="#1C1C2E" />
            </TouchableOpacity>
            <Text style={s.headerTitle}>{editId ? 'Edit Pack' : 'New Pack'}</Text>
            <View style={{ width: 36 }} />
          </View>
          <ScrollView contentContainerStyle={s.formScroll}>
            <Text style={s.label}>Pack Name</Text>
            <TextInput testID="pack-name-input" style={s.input} value={form.name} onChangeText={v => setForm({...form, name: v})} placeholder="e.g. Muscle Gain Pack" />
            <Text style={s.label}>Description</Text>
            <TextInput testID="pack-desc-input" style={[s.input, { height: 80 }]} value={form.description} onChangeText={v => setForm({...form, description: v})} multiline placeholder="Short description..." />
            <Text style={s.label}>Goal</Text>
            <View style={s.toggleRow}>
              {GOALS.map(g => (
                <TouchableOpacity key={g.key} style={[s.toggleBtn, form.goal === g.key && { backgroundColor: g.color }]} onPress={() => setForm({...form, goal: g.key})}>
                  <Text style={[s.toggleText, form.goal === g.key && s.toggleTextActive]}>{g.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={s.label}>Diet Type</Text>
            <View style={s.toggleRow}>
              {['both', 'veg', 'non-veg'].map(t => (
                <TouchableOpacity key={t} style={[s.toggleBtn, form.diet_type === t && s.toggleActive]} onPress={() => setForm({...form, diet_type: t})}>
                  <Text style={[s.toggleText, form.diet_type === t && s.toggleTextActive]}>{t === 'both' ? 'Both' : t === 'veg' ? 'Veg' : 'Non-Veg'}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={s.label}>Pack Price (₹)</Text>
            <TextInput testID="pack-price-input" style={s.input} value={form.pack_price} onChangeText={v => setForm({...form, pack_price: v})} keyboardType="numeric" placeholder="e.g. 199" />
            <Text style={s.label}>Banner Color</Text>
            <View style={s.colorRow}>
              {COLORS.map(c => (
                <TouchableOpacity key={c} style={[s.colorDot, { backgroundColor: c }, form.banner_color === c && s.colorDotActive]} onPress={() => setForm({...form, banner_color: c})} />
              ))}
            </View>
            <View style={s.itemsHeader}>
              <Text style={s.label}>Pack Items ({packItems.length})</Text>
              <TouchableOpacity testID="add-pack-item-btn" style={s.addItemBtn} onPress={() => setShowProductPicker(true)}>
                <Ionicons name="add-circle" size={20} color={GREEN} />
                <Text style={s.addItemText}>Add Product</Text>
              </TouchableOpacity>
            </View>
            {packItems.map((item, idx) => (
              <View key={idx} style={s.packItemRow} testID={`pack-item-${idx}`}>
                <Text style={s.packItemName}>{item.product_name}</Text>
                <TextInput
                  style={s.gramsInput}
                  value={String(item.grams)}
                  onChangeText={v => updateItemGrams(idx, v)}
                  keyboardType="numeric"
                  placeholder="g"
                />
                <Text style={s.gramsLabel}>g</Text>
                <TouchableOpacity onPress={() => removeItem(idx)}>
                  <Ionicons name="close-circle" size={22} color={Z_RED} />
                </TouchableOpacity>
              </View>
            ))}
            <TouchableOpacity testID="save-pack-btn" style={s.saveBtn} onPress={savePack} disabled={saving}>
              {saving ? <ActivityIndicator color="#FFF" /> : <Text style={s.saveText}>{editId ? 'Update Pack' : 'Create Pack'}</Text>}
            </TouchableOpacity>
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* Product Picker Modal */}
      <Modal visible={showProductPicker} animationType="slide" transparent testID="product-picker-modal">
        <View style={s.pickerOverlay}>
          <View style={s.pickerCard}>
            <View style={s.pickerHeader}>
              <Text style={s.pickerTitle}>Select Product</Text>
              <TouchableOpacity onPress={() => setShowProductPicker(false)}>
                <Ionicons name="close" size={24} color="#1C1C2E" />
              </TouchableOpacity>
            </View>
            <FlatList
              data={products.filter(p => !packItems.find(i => i.product_id === p.id))}
              keyExtractor={item => item.id}
              renderItem={({ item }) => (
                <TouchableOpacity style={s.pickerItem} onPress={() => addProduct(item)} testID={`pick-product-${item.id}`}>
                  <View style={[s.vegBox, { borderColor: item.diet_type === 'non-veg' ? Z_RED : GREEN }]}>
                    <View style={[s.vegDot, { backgroundColor: item.diet_type === 'non-veg' ? Z_RED : GREEN }]} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.pickerItemName}>{item.name}</Text>
                    <Text style={s.pickerItemMeta}>{item.calories_per_100g} cal | P:{item.protein_per_100g}g | ₹{item.cost_per_100g}/100g</Text>
                  </View>
                  <Ionicons name="add-circle" size={24} color={GREEN} />
                </TouchableOpacity>
              )}
            />
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F8F8F8' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', padding: 16, gap: 12, backgroundColor: '#FFF', borderBottomWidth: 1, borderBottomColor: '#EFEFEF' },
  backBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#F5F5F5', alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, fontSize: 18, fontWeight: '700', color: '#1C1C2E' },
  addBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: GREEN, alignItems: 'center', justifyContent: 'center' },
  list: { padding: 16 },
  empty: { fontSize: 14, color: '#9C9C9C', textAlign: 'center', paddingTop: 40 },
  card: { backgroundColor: '#FFF', borderRadius: 14, overflow: 'hidden', marginBottom: 12, borderWidth: 1, borderColor: '#EFEFEF' },
  cardInactive: { opacity: 0.5 },
  cardStripe: { height: 4 },
  cardBody: { padding: 14 },
  cardRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  cardRowLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  cardTitle: { fontSize: 16, fontWeight: '700', color: '#1C1C2E' },
  goalTag: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  goalTagText: { fontSize: 10, fontWeight: '700' },
  cardSub: { fontSize: 12, color: '#9C9C9C', marginTop: 4 },
  itemsPreview: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  itemChip: { backgroundColor: '#F5F5F5', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
  itemChipText: { fontSize: 11, color: '#696969' },
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 10 },
  priceText: { fontSize: 20, fontWeight: '800', color: '#1C1C2E' },
  itemCount: { fontSize: 12, color: '#9C9C9C' },
  actions: { flexDirection: 'row', gap: 12, marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#F5F5F5' },
  editBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  editText: { fontSize: 13, color: PURPLE, fontWeight: '600' },
  deleteBtn: { padding: 4 },
  formScroll: { padding: 20, paddingBottom: 40 },
  label: { fontSize: 13, fontWeight: '600', color: '#1C1C2E', marginTop: 16, marginBottom: 6 },
  input: { backgroundColor: '#FFF', borderRadius: 10, padding: 14, fontSize: 15, borderWidth: 1, borderColor: '#EFEFEF' },
  toggleRow: { flexDirection: 'row', gap: 8 },
  toggleBtn: { flex: 1, paddingVertical: 12, borderRadius: 10, backgroundColor: '#F5F5F5', alignItems: 'center' },
  toggleActive: { backgroundColor: '#1C1C2E' },
  toggleText: { fontSize: 13, fontWeight: '600', color: '#696969' },
  toggleTextActive: { color: '#FFF' },
  colorRow: { flexDirection: 'row', gap: 12, marginTop: 4 },
  colorDot: { width: 32, height: 32, borderRadius: 16 },
  colorDotActive: { borderWidth: 3, borderColor: '#1C1C2E' },
  itemsHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 16 },
  addItemBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  addItemText: { fontSize: 13, fontWeight: '600', color: GREEN },
  packItemRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#FFF', borderRadius: 10, padding: 12, marginTop: 8, borderWidth: 1, borderColor: '#EFEFEF' },
  packItemName: { flex: 1, fontSize: 14, fontWeight: '600', color: '#1C1C2E' },
  gramsInput: { width: 60, textAlign: 'center', fontSize: 16, fontWeight: '700', backgroundColor: '#F5F5F5', borderRadius: 8, padding: 8 },
  gramsLabel: { fontSize: 14, color: '#9C9C9C' },
  saveBtn: { backgroundColor: GREEN, borderRadius: 12, paddingVertical: 16, alignItems: 'center', marginTop: 24 },
  saveText: { fontSize: 16, fontWeight: '700', color: '#FFF' },
  pickerOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  pickerCard: { backgroundColor: '#FFF', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, maxHeight: '70%' },
  pickerHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  pickerTitle: { fontSize: 18, fontWeight: '700', color: '#1C1C2E' },
  pickerItem: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#F5F5F5' },
  vegBox: { width: 14, height: 14, borderRadius: 2, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  vegDot: { width: 7, height: 7, borderRadius: 4 },
  pickerItemName: { fontSize: 14, fontWeight: '600', color: '#1C1C2E' },
  pickerItemMeta: { fontSize: 11, color: '#9C9C9C', marginTop: 2 },
});
