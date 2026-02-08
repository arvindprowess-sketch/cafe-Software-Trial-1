import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, RefreshControl, ActivityIndicator
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { apiCall } from '../../utils/api';

const PURPLE = '#5B5FE0';

const STATUS_COLORS: Record<string, string> = { pending: '#FF9F0A', preparing: '#5B5FE0', ready: '#267E3E', completed: '#9C9C9C', cancelled: '#E23744' };

export default function CashierOrders() {
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadOrders = useCallback(async () => {
    try {
      const data = await apiCall('/orders');
      setOrders(data);
    } catch (e) {
      console.log('Orders error:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadOrders(); }, []);
  const onRefresh = async () => { setRefreshing(true); await loadOrders(); setRefreshing(false); };

  if (loading) {
    return <SafeAreaView style={styles.safe}><View style={styles.center}><ActivityIndicator size="large" color={PURPLE} /></View></SafeAreaView>;
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={PURPLE} />}
        contentContainerStyle={styles.content}
      >
        <Text style={styles.title}>Recent Orders</Text>
        <Text style={styles.sub}>{orders.length} orders</Text>

        {orders.length === 0 && (
          <View style={styles.emptyState}>
            <Ionicons name="receipt-outline" size={48} color="#D0D0D0" />
            <Text style={styles.emptyTitle}>No orders yet</Text>
            <Text style={styles.emptyDesc}>Orders placed from POS will appear here</Text>
          </View>
        )}

        {orders.map(order => {
          const statusColor = STATUS_COLORS[order.status] || '#9C9C9C';
          return (
            <View key={order.id} style={styles.orderCard}>
              <View style={styles.orderHeader}>
                <Text style={styles.orderId}>#{order.id}</Text>
                <View style={[styles.statusBadge, { backgroundColor: `${statusColor}15` }]}>
                  <Text style={[styles.statusText, { color: statusColor }]}>{order.status.toUpperCase()}</Text>
                </View>
              </View>
              <View style={styles.orderMeta}>
                <Text style={styles.orderType}>{order.order_type}</Text>
                <Text style={styles.orderPrice}>₹{Math.round(order.total_price)}</Text>
                <Text style={styles.orderCal}>{Math.round(order.total_calories)} cal</Text>
              </View>
              <View style={styles.itemsList}>
                {order.items?.map((item: any, idx: number) => (
                  <Text key={idx} style={styles.itemText}>{item.product_name} ({item.grams}g) - ₹{Math.round(item.price)}</Text>
                ))}
              </View>
              <Text style={styles.orderTime}>{new Date(order.created_at).toLocaleString()}</Text>
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
  emptyState: { alignItems: 'center', padding: 40 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: '#1C1C2E', marginTop: 16 },
  emptyDesc: { fontSize: 13, color: '#9C9C9C', marginTop: 4 },
  orderCard: { backgroundColor: '#FFF', borderRadius: 14, padding: 16, marginBottom: 10, borderWidth: 1, borderColor: '#EFEFEF' },
  orderHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  orderId: { fontSize: 17, fontWeight: '800', color: '#1C1C2E' },
  statusBadge: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  statusText: { fontSize: 11, fontWeight: '700' },
  orderMeta: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 10 },
  orderType: { fontSize: 12, color: PURPLE, fontWeight: '600', backgroundColor: '#F0F0FF', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  orderPrice: { fontSize: 15, fontWeight: '800', color: '#1C1C2E' },
  orderCal: { fontSize: 12, color: '#9C9C9C' },
  itemsList: { backgroundColor: '#FAFAFA', borderRadius: 8, padding: 10, marginBottom: 8 },
  itemText: { fontSize: 13, color: '#1C1C2E', paddingVertical: 2 },
  orderTime: { fontSize: 11, color: '#B0B0B0' },
});
