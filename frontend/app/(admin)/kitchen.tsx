import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl, SafeAreaView, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { apiCall } from '../../utils/api';

const Z_RED = '#E23744';
const FLOW: Record<string, string> = { pending: 'preparing', preparing: 'ready', ready: 'completed' };
const COLORS: Record<string, string> = { pending: '#FF9F0A', preparing: '#5B5FE0', ready: '#267E3E', completed: '#9C9C9C' };

export default function KitchenScreen() {
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => { try { setOrders(await apiCall('/orders/kitchen')); } catch (e) {} finally { setLoading(false); } }, []);
  useEffect(() => { load(); const i = setInterval(load, 10000); return () => clearInterval(i); }, []);
  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const updateStatus = async (id: string, status: string) => {
    try { await apiCall(`/orders/${id}/status?status=${status}`, { method: 'PUT' }); await load(); } catch (e: any) { /* ignore */ }
  };

  const renderOrder = ({ item }: { item: any }) => {
    const next = FLOW[item.status];
    const color = COLORS[item.status] || '#9C9C9C';
    return (
      <View style={styles.card} testID={`kitchen-order-${item.id}`}>
        <View style={styles.cardTop}>
          <View>
            <Text style={styles.orderId}>#{item.id}</Text>
            <Text style={styles.userName}>{item.user_name}</Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <View style={[styles.badge, { backgroundColor: `${color}15` }]}>
              <View style={[styles.badgeDot, { backgroundColor: color }]} />
              <Text style={[styles.badgeText, { color }]}>{item.status}</Text>
            </View>
            <View style={styles.typeRow}>
              <Ionicons name={item.order_type === 'dine-in' ? 'restaurant' : item.order_type === 'takeaway' ? 'bag-handle' : 'bicycle'} size={12} color="#9C9C9C" />
              <Text style={styles.typeText}>{item.order_type}</Text>
            </View>
          </View>
        </View>

        <View style={styles.itemsBox}>
          <Text style={styles.itemsLabel}>PREPARE:</Text>
          {item.items?.map((it: any, i: number) => (
            <View key={i} style={styles.kitchenRow}>
              <Text style={styles.kitchenName}>{it.product_name}</Text>
              <View style={styles.gramsBadge}><Text style={styles.gramsText}>{Math.round(it.grams)}g</Text></View>
            </View>
          ))}
        </View>

        {next && (
          <TouchableOpacity testID={`update-status-${item.id}`} style={[styles.actionBtn, { backgroundColor: COLORS[next] || Z_RED }]} onPress={() => updateStatus(item.id, next)}>
            <Ionicons name={next === 'preparing' ? 'flame' : next === 'ready' ? 'checkmark-circle' : 'checkmark-done'} size={16} color="#FFF" />
            <Text style={styles.actionText}>Mark as {next}</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  if (loading) return <SafeAreaView style={styles.safe}><View style={styles.center}><ActivityIndicator size="large" color={Z_RED} /></View></SafeAreaView>;

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Text style={styles.title}>Kitchen</Text>
        <View style={styles.countBadge}><Text style={styles.countText}>{orders.length} active</Text></View>
      </View>
      {orders.length === 0 ? (
        <View style={styles.center}><Ionicons name="checkmark-done-circle" size={64} color="#267E3E" /><Text style={styles.emptyText}>All caught up!</Text></View>
      ) : (
        <FlatList data={orders} keyExtractor={i => i.id} renderItem={renderOrder} contentContainerStyle={styles.list} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Z_RED} />} />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F8F8F8' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 8 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, paddingTop: 8, backgroundColor: '#FFF', borderBottomWidth: 1, borderBottomColor: '#EFEFEF' },
  title: { fontSize: 24, fontWeight: '800', color: '#1C1C2E' },
  countBadge: { backgroundColor: '#FDE8EA', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12 },
  countText: { color: Z_RED, fontSize: 13, fontWeight: '700' },
  emptyText: { color: '#267E3E', fontSize: 16, fontWeight: '600' },
  list: { padding: 16 },
  card: { backgroundColor: '#FFF', borderRadius: 14, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: '#EFEFEF' },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  orderId: { fontSize: 20, fontWeight: '800', color: '#1C1C2E' },
  userName: { fontSize: 13, color: '#9C9C9C', marginTop: 2 },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  badgeDot: { width: 6, height: 6, borderRadius: 3 },
  badgeText: { fontSize: 11, fontWeight: '700', textTransform: 'capitalize' },
  typeRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  typeText: { fontSize: 11, color: '#9C9C9C', textTransform: 'capitalize' },
  itemsBox: { backgroundColor: '#FAFAFA', borderRadius: 10, padding: 12, marginBottom: 12 },
  itemsLabel: { fontSize: 10, fontWeight: '700', color: '#B0B0B0', letterSpacing: 1, marginBottom: 6 },
  kitchenRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: '#EFEFEF' },
  kitchenName: { fontSize: 14, fontWeight: '600', color: '#1C1C2E' },
  gramsBadge: { backgroundColor: Z_RED, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
  gramsText: { color: '#FFF', fontSize: 14, fontWeight: '800' },
  actionBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 10, paddingVertical: 12 },
  actionText: { color: '#FFF', fontSize: 14, fontWeight: '700', textTransform: 'capitalize' },
});
