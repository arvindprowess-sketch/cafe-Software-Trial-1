import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, RefreshControl, SafeAreaView, ActivityIndicator
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { apiCall } from '../../utils/api';

const STATUS_COLORS: Record<string, string> = {
  pending: '#FF9F0A', preparing: '#007AFF', ready: '#32D74B', completed: '#8E8E93', cancelled: '#FF453A'
};

export default function OrdersScreen() {
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadOrders = useCallback(async () => {
    try { const data = await apiCall('/orders'); setOrders(data); } catch (e) {}
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadOrders(); }, []);
  const onRefresh = async () => { setRefreshing(true); await loadOrders(); setRefreshing(false); };

  const renderOrder = ({ item }: { item: any }) => (
    <View style={styles.card} testID={`order-${item.id}`}>
      <View style={styles.cardHeader}>
        <View style={styles.orderIdBox}>
          <Text style={styles.orderId}>#{item.id}</Text>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: `${STATUS_COLORS[item.status]}20` }]}>
          <Text style={[styles.statusText, { color: STATUS_COLORS[item.status] }]}>
            {item.status.toUpperCase()}
          </Text>
        </View>
      </View>
      <View style={styles.typeRow}>
        <Ionicons
          name={item.order_type === 'dine-in' ? 'restaurant' : item.order_type === 'takeaway' ? 'bag-handle' : 'bicycle'}
          size={14} color="#8E8E93"
        />
        <Text style={styles.typeText}>{item.order_type}</Text>
        <Text style={styles.dateText}>{new Date(item.created_at).toLocaleString()}</Text>
      </View>
      <View style={styles.itemsList}>
        {item.items?.map((it: any, i: number) => (
          <View key={i} style={styles.itemRow}>
            <Text style={styles.itemName}>{it.product_name}</Text>
            <Text style={styles.itemGrams}>{Math.round(it.grams)}g</Text>
            <Text style={styles.itemPrice}>₹{Math.round(it.price)}</Text>
          </View>
        ))}
      </View>
      <View style={styles.totalRow}>
        <View style={styles.macroMini}>
          <Ionicons name="flame" size={12} color="#FF3B30" />
          <Text style={styles.macroText}>{Math.round(item.total_calories)} cal</Text>
        </View>
        <Text style={styles.totalPrice}>₹{Math.round(item.total_price)}</Text>
      </View>
    </View>
  );

  if (loading) {
    return <SafeAreaView style={styles.safe}><View style={styles.center}><ActivityIndicator size="large" color="#FF3B30" /></View></SafeAreaView>;
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}><Text style={styles.title}>My Orders</Text></View>
      {orders.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="receipt-outline" size={64} color="#2C2C2E" />
          <Text style={styles.emptyText}>No orders yet</Text>
        </View>
      ) : (
        <FlatList
          data={orders}
          keyExtractor={item => item.id}
          renderItem={renderOrder}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#FF3B30" />}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#000' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
  header: { padding: 16, paddingTop: 8 },
  title: { fontSize: 28, fontWeight: '800', color: '#FFF' },
  emptyText: { color: '#48484A', fontSize: 16 },
  list: { padding: 16 },
  card: {
    backgroundColor: '#121212', borderRadius: 16, padding: 16,
    marginBottom: 12, borderWidth: 1, borderColor: '#2C2C2E',
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  orderIdBox: { backgroundColor: '#1C1C1E', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
  orderId: { color: '#FFF', fontSize: 14, fontWeight: '700' },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  statusText: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },
  typeRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 },
  typeText: { color: '#8E8E93', fontSize: 12, fontWeight: '500', textTransform: 'capitalize' },
  dateText: { color: '#48484A', fontSize: 11, marginLeft: 'auto' },
  itemsList: { borderTopWidth: 1, borderTopColor: '#2C2C2E', paddingTop: 10 },
  itemRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 4 },
  itemName: { flex: 1, color: '#E5E5EA', fontSize: 14 },
  itemGrams: { color: '#8E8E93', fontSize: 13, marginRight: 12, fontWeight: '600' },
  itemPrice: { color: '#FF3B30', fontSize: 13, fontWeight: '600' },
  totalRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    borderTopWidth: 1, borderTopColor: '#2C2C2E', paddingTop: 10, marginTop: 10,
  },
  macroMini: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  macroText: { color: '#8E8E93', fontSize: 12 },
  totalPrice: { fontSize: 20, fontWeight: '800', color: '#FF3B30' },
});
