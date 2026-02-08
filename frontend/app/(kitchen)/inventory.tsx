import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, RefreshControl, ActivityIndicator
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { apiCall } from '../../utils/api';

const ORANGE = '#FF9F0A';

type InventoryItem = {
  id: string;
  name: string;
  category: string;
  diet_type: string;
  available_qty_grams: number;
  product_type: string;
  is_active: boolean;
  status: string;
};

const STATUS_CONFIG = {
  in_stock: { color: '#267E3E', bg: '#E8F5E9', label: 'In Stock', icon: 'checkmark-circle' as const },
  low: { color: '#FF9F0A', bg: '#FFF3E0', label: 'Low Stock', icon: 'warning' as const },
  out_of_stock: { color: '#E23744', bg: '#FDE8EA', label: 'Out of Stock', icon: 'close-circle' as const },
};

export default function KitchenInventory() {
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadInventory = useCallback(async () => {
    try {
      const data = await apiCall('/inventory');
      // Sort: out_of_stock first, then low, then in_stock
      const order = { out_of_stock: 0, low: 1, in_stock: 2 };
      data.sort((a: InventoryItem, b: InventoryItem) =>
        (order[a.status as keyof typeof order] ?? 2) - (order[b.status as keyof typeof order] ?? 2)
      );
      setInventory(data);
    } catch (e) {
      console.log('Inventory error:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadInventory(); }, []);
  const onRefresh = async () => { setRefreshing(true); await loadInventory(); setRefreshing(false); };

  const counts = {
    total: inventory.length,
    inStock: inventory.filter(i => i.status === 'in_stock').length,
    low: inventory.filter(i => i.status === 'low').length,
    out: inventory.filter(i => i.status === 'out_of_stock').length,
  };

  if (loading) {
    return <SafeAreaView style={styles.safe}><View style={styles.center}><ActivityIndicator size="large" color={ORANGE} /></View></SafeAreaView>;
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={ORANGE} />}
        contentContainerStyle={styles.content}
      >
        <Text style={styles.title}>Inventory</Text>
        <Text style={styles.sub}>{counts.total} items tracked</Text>

        {/* Summary cards */}
        <View style={styles.summaryRow}>
          {[
            { label: 'In Stock', value: counts.inStock, color: '#267E3E' },
            { label: 'Low', value: counts.low, color: '#FF9F0A' },
            { label: 'Out', value: counts.out, color: '#E23744' },
          ].map(s => (
            <View key={s.label} style={[styles.summaryCard, { borderLeftColor: s.color }]}>
              <Text style={[styles.summaryValue, { color: s.color }]}>{s.value}</Text>
              <Text style={styles.summaryLabel}>{s.label}</Text>
            </View>
          ))}
        </View>

        {/* Inventory list */}
        {inventory.map(item => {
          const cfg = STATUS_CONFIG[item.status as keyof typeof STATUS_CONFIG] || STATUS_CONFIG.in_stock;
          return (
            <View key={item.id} style={styles.itemCard}>
              <View style={[styles.statusDot, { backgroundColor: cfg.color }]} />
              <View style={{ flex: 1 }}>
                <Text style={styles.itemName}>{item.name}</Text>
                <View style={styles.itemMeta}>
                  <Text style={styles.itemCategory}>{item.category}</Text>
                  <Text style={[styles.itemDiet, item.diet_type === 'non-veg' && { color: '#E23744' }]}>
                    {item.diet_type === 'non-veg' ? 'Non-Veg' : 'Veg'}
                  </Text>
                </View>
              </View>
              <View style={styles.stockInfo}>
                <Text style={[styles.stockQty, { color: cfg.color }]}>
                  {item.available_qty_grams >= 1000
                    ? `${(item.available_qty_grams / 1000).toFixed(1)}kg`
                    : `${Math.round(item.available_qty_grams)}g`}
                </Text>
                <View style={[styles.statusTag, { backgroundColor: cfg.bg }]}>
                  <Ionicons name={cfg.icon} size={12} color={cfg.color} />
                  <Text style={[styles.statusLabel, { color: cfg.color }]}>{cfg.label}</Text>
                </View>
              </View>
            </View>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F8F8F8' },
  content: { padding: 16 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 26, fontWeight: '800', color: '#1C1C2E', marginTop: 8 },
  sub: { fontSize: 13, color: '#9C9C9C', marginTop: 2, marginBottom: 16 },
  summaryRow: { flexDirection: 'row', gap: 10, marginBottom: 20 },
  summaryCard: { flex: 1, backgroundColor: '#FFF', borderRadius: 12, padding: 14, borderLeftWidth: 3, alignItems: 'center' },
  summaryValue: { fontSize: 24, fontWeight: '800' },
  summaryLabel: { fontSize: 11, color: '#9C9C9C', fontWeight: '600', marginTop: 2 },
  itemCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#FFF', borderRadius: 12, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: '#EFEFEF' },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  itemName: { fontSize: 15, fontWeight: '700', color: '#1C1C2E' },
  itemMeta: { flexDirection: 'row', gap: 8, marginTop: 3 },
  itemCategory: { fontSize: 12, color: '#9C9C9C' },
  itemDiet: { fontSize: 12, color: '#267E3E', fontWeight: '600' },
  stockInfo: { alignItems: 'flex-end', gap: 4 },
  stockQty: { fontSize: 16, fontWeight: '800' },
  statusTag: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  statusLabel: { fontSize: 10, fontWeight: '700' },
});
