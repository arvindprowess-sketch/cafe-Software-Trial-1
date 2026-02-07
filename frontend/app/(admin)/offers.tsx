import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Alert, ActivityIndicator, Switch, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { apiCall } from '../../utils/api';

const Z_RED = '#E23744';
const GREEN = '#267E3E';
const COLORS = ['#E23744', '#267E3E', '#FF9F0A', '#5B5FE0', '#FF6B6B', '#4CAF50', '#2196F3'];
const CATEGORIES = ['Protein', 'Carb', 'Fat', 'Meal', 'veg', 'non-veg'];

export default function AdminOffersScreen() {
  const router = useRouter();
  const [offers, setOffers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    title: '', subtitle: '', discount_type: 'percentage', discount_value: '10',
    applicable_to: 'all', applicable_category: '', coupon_code: '',
    min_order_value: '0', max_discount: '', banner_color: '#E23744', is_active: true,
  });

  useEffect(() => { loadOffers(); }, []);

  const loadOffers = async () => {
    try {
      const data = await apiCall('/offers/all');
      setOffers(data);
    } catch {} finally { setLoading(false); }
  };

  const resetForm = () => {
    setForm({ title: '', subtitle: '', discount_type: 'percentage', discount_value: '10', applicable_to: 'all', applicable_category: '', coupon_code: '', min_order_value: '0', max_discount: '', banner_color: '#E23744', is_active: true });
    setEditId(null);
  };

  const editOffer = (offer: any) => {
    setForm({
      title: offer.title, subtitle: offer.subtitle, discount_type: offer.discount_type,
      discount_value: String(offer.discount_value), applicable_to: offer.applicable_to,
      applicable_category: offer.applicable_category || '', coupon_code: offer.coupon_code || '',
      min_order_value: String(offer.min_order_value || 0), max_discount: offer.max_discount ? String(offer.max_discount) : '',
      banner_color: offer.banner_color || '#E23744', is_active: offer.is_active,
    });
    setEditId(offer.id);
    setShowForm(true);
  };

  const saveOffer = async () => {
    if (!form.title.trim()) { Alert.alert('Error', 'Title is required'); return; }
    setSaving(true);
    try {
      const payload = {
        ...form,
        discount_value: parseFloat(form.discount_value) || 0,
        min_order_value: parseFloat(form.min_order_value) || 0,
        max_discount: form.max_discount ? parseFloat(form.max_discount) : null,
      };
      if (editId) {
        await apiCall(`/offers/${editId}`, 'PUT', payload);
      } else {
        await apiCall('/offers', 'POST', payload);
      }
      setShowForm(false);
      resetForm();
      loadOffers();
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to save offer');
    } finally { setSaving(false); }
  };

  const deleteOffer = (id: string) => {
    Alert.alert('Delete Offer', 'Are you sure?', [
      { text: 'Cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        await apiCall(`/offers/${id}`, 'DELETE');
        loadOffers();
      }},
    ]);
  };

  const toggleActive = async (offer: any) => {
    await apiCall(`/offers/${offer.id}`, 'PUT', { is_active: !offer.is_active });
    loadOffers();
  };

  if (loading) return <SafeAreaView style={s.safe}><View style={s.center}><ActivityIndicator size="large" color={Z_RED} /></View></SafeAreaView>;

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <Ionicons name="arrow-back" size={20} color="#1C1C2E" />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Manage Offers</Text>
        <TouchableOpacity testID="add-offer-btn" style={s.addBtn} onPress={() => { resetForm(); setShowForm(true); }}>
          <Ionicons name="add" size={20} color="#FFF" />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={s.list}>
        {offers.length === 0 && <Text style={s.empty}>No offers yet. Tap + to create one.</Text>}
        {offers.map(offer => (
          <View key={offer.id} style={[s.card, !offer.is_active && s.cardInactive]} testID={`offer-card-${offer.id}`}>
            <View style={[s.cardStripe, { backgroundColor: offer.banner_color }]} />
            <View style={s.cardBody}>
              <View style={s.cardRow}>
                <Text style={s.cardTitle}>{offer.title}</Text>
                <Switch value={offer.is_active} onValueChange={() => toggleActive(offer)} trackColor={{ true: GREEN }} />
              </View>
              <Text style={s.cardSub}>{offer.subtitle}</Text>
              <View style={s.tagRow}>
                <View style={s.tag}><Text style={s.tagText}>{offer.discount_type === 'percentage' ? `${offer.discount_value}%` : `₹${offer.discount_value}`} OFF</Text></View>
                <View style={s.tag}><Text style={s.tagText}>{offer.applicable_to === 'all' ? 'All items' : offer.applicable_category}</Text></View>
                {offer.coupon_code && <View style={[s.tag, { backgroundColor: '#E8F5E9' }]}><Text style={[s.tagText, { color: GREEN }]}>{offer.coupon_code}</Text></View>}
              </View>
              <View style={s.actions}>
                <TouchableOpacity testID={`edit-offer-${offer.id}`} style={s.editBtn} onPress={() => editOffer(offer)}>
                  <Ionicons name="create" size={16} color="#5B5FE0" />
                  <Text style={s.editText}>Edit</Text>
                </TouchableOpacity>
                <TouchableOpacity testID={`delete-offer-${offer.id}`} style={s.deleteBtn} onPress={() => deleteOffer(offer.id)}>
                  <Ionicons name="trash" size={16} color={Z_RED} />
                </TouchableOpacity>
              </View>
            </View>
          </View>
        ))}
      </ScrollView>

      {/* Create / Edit Modal */}
      <Modal visible={showForm} animationType="slide" testID="offer-form-modal">
        <SafeAreaView style={s.safe}>
          <View style={s.header}>
            <TouchableOpacity onPress={() => { setShowForm(false); resetForm(); }} style={s.backBtn}>
              <Ionicons name="close" size={20} color="#1C1C2E" />
            </TouchableOpacity>
            <Text style={s.headerTitle}>{editId ? 'Edit Offer' : 'New Offer'}</Text>
            <View style={{ width: 36 }} />
          </View>
          <ScrollView contentContainerStyle={s.formScroll}>
            <Text style={s.label}>Title</Text>
            <TextInput testID="offer-title-input" style={s.input} value={form.title} onChangeText={v => setForm({...form, title: v})} placeholder="e.g. Flat 20% OFF" />
            <Text style={s.label}>Subtitle</Text>
            <TextInput testID="offer-subtitle-input" style={s.input} value={form.subtitle} onChangeText={v => setForm({...form, subtitle: v})} placeholder="e.g. On all protein items" />
            <Text style={s.label}>Discount Type</Text>
            <View style={s.toggleRow}>
              {['percentage', 'flat'].map(t => (
                <TouchableOpacity key={t} style={[s.toggleBtn, form.discount_type === t && s.toggleActive]} onPress={() => setForm({...form, discount_type: t})}>
                  <Text style={[s.toggleText, form.discount_type === t && s.toggleTextActive]}>{t === 'percentage' ? '% OFF' : '₹ Flat'}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={s.label}>Discount Value</Text>
            <TextInput testID="offer-discount-input" style={s.input} value={form.discount_value} onChangeText={v => setForm({...form, discount_value: v})} keyboardType="numeric" />
            <Text style={s.label}>Applies To</Text>
            <View style={s.toggleRow}>
              {['all', 'category'].map(t => (
                <TouchableOpacity key={t} style={[s.toggleBtn, form.applicable_to === t && s.toggleActive]} onPress={() => setForm({...form, applicable_to: t})}>
                  <Text style={[s.toggleText, form.applicable_to === t && s.toggleTextActive]}>{t === 'all' ? 'All Items' : 'Category'}</Text>
                </TouchableOpacity>
              ))}
            </View>
            {form.applicable_to === 'category' && (
              <View style={s.chipRow}>
                {CATEGORIES.map(c => (
                  <TouchableOpacity key={c} style={[s.chip, form.applicable_category === c && s.chipActive]} onPress={() => setForm({...form, applicable_category: c})}>
                    <Text style={[s.chipText, form.applicable_category === c && s.chipTextActive]}>{c}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
            <Text style={s.label}>Coupon Code (optional)</Text>
            <TextInput testID="offer-coupon-input" style={s.input} value={form.coupon_code} onChangeText={v => setForm({...form, coupon_code: v.toUpperCase()})} placeholder="e.g. PROTEIN20" autoCapitalize="characters" />
            <Text style={s.label}>Min Order Value (₹)</Text>
            <TextInput style={s.input} value={form.min_order_value} onChangeText={v => setForm({...form, min_order_value: v})} keyboardType="numeric" />
            <Text style={s.label}>Max Discount (₹, optional)</Text>
            <TextInput style={s.input} value={form.max_discount} onChangeText={v => setForm({...form, max_discount: v})} keyboardType="numeric" placeholder="Leave empty for no limit" />
            <Text style={s.label}>Banner Color</Text>
            <View style={s.colorRow}>
              {COLORS.map(c => (
                <TouchableOpacity key={c} style={[s.colorDot, { backgroundColor: c }, form.banner_color === c && s.colorDotActive]} onPress={() => setForm({...form, banner_color: c})} />
              ))}
            </View>
            <TouchableOpacity testID="save-offer-btn" style={s.saveBtn} onPress={saveOffer} disabled={saving}>
              {saving ? <ActivityIndicator color="#FFF" /> : <Text style={s.saveText}>{editId ? 'Update Offer' : 'Create Offer'}</Text>}
            </TouchableOpacity>
          </ScrollView>
        </SafeAreaView>
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
  addBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: Z_RED, alignItems: 'center', justifyContent: 'center' },
  list: { padding: 16 },
  empty: { fontSize: 14, color: '#9C9C9C', textAlign: 'center', paddingTop: 40 },
  card: { backgroundColor: '#FFF', borderRadius: 14, overflow: 'hidden', marginBottom: 12, borderWidth: 1, borderColor: '#EFEFEF' },
  cardInactive: { opacity: 0.5 },
  cardStripe: { height: 4 },
  cardBody: { padding: 14 },
  cardRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardTitle: { fontSize: 16, fontWeight: '700', color: '#1C1C2E', flex: 1 },
  cardSub: { fontSize: 12, color: '#9C9C9C', marginTop: 4 },
  tagRow: { flexDirection: 'row', gap: 8, marginTop: 10, flexWrap: 'wrap' },
  tag: { backgroundColor: '#F5F5F5', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
  tagText: { fontSize: 11, fontWeight: '600', color: '#696969' },
  actions: { flexDirection: 'row', gap: 12, marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#F5F5F5' },
  editBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  editText: { fontSize: 13, color: '#5B5FE0', fontWeight: '600' },
  deleteBtn: { padding: 4 },
  formScroll: { padding: 20, paddingBottom: 40 },
  label: { fontSize: 13, fontWeight: '600', color: '#1C1C2E', marginTop: 16, marginBottom: 6 },
  input: { backgroundColor: '#FFF', borderRadius: 10, padding: 14, fontSize: 15, borderWidth: 1, borderColor: '#EFEFEF' },
  toggleRow: { flexDirection: 'row', gap: 10 },
  toggleBtn: { flex: 1, paddingVertical: 12, borderRadius: 10, backgroundColor: '#F5F5F5', alignItems: 'center' },
  toggleActive: { backgroundColor: '#1C1C2E' },
  toggleText: { fontSize: 14, fontWeight: '600', color: '#696969' },
  toggleTextActive: { color: '#FFF' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: '#F5F5F5' },
  chipActive: { backgroundColor: '#1C1C2E' },
  chipText: { fontSize: 13, color: '#696969' },
  chipTextActive: { color: '#FFF', fontWeight: '600' },
  colorRow: { flexDirection: 'row', gap: 12, marginTop: 4 },
  colorDot: { width: 32, height: 32, borderRadius: 16 },
  colorDotActive: { borderWidth: 3, borderColor: '#1C1C2E' },
  saveBtn: { backgroundColor: Z_RED, borderRadius: 12, paddingVertical: 16, alignItems: 'center', marginTop: 24 },
  saveText: { fontSize: 16, fontWeight: '700', color: '#FFF' },
});
