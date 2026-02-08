import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl,
  Alert, ActivityIndicator
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { apiCall, logout } from '../../utils/api';

const ORANGE = '#FF9F0A';

type Order = {
  id: string;
  user_name: string;
  order_type: string;
  items: any[];
  total_price: number;
  status: string;
  priority?: string;
  created_at: string;
};

const PRIORITY_COLORS = { urgent: '#E23744', high: '#FF9F0A', normal: '#9C9C9C' };
const PRIORITY_ICONS = { urgent: 'alert-circle' as const, high: 'arrow-up-circle' as const, normal: 'remove-circle' as const };
const STATUS_COLORS = { pending: '#FF9F0A', preparing: '#5B5FE0', ready: '#267E3E', completed: '#9C9C9C' };

export default function KitchenOrders() {
  const router = useRouter();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadOrders = useCallback(async () => {
    try {
      const data = await apiCall('/orders/kitchen');
      // Sort by priority: urgent > high > normal, then by time
      const sorted = data.sort((a: Order, b: Order) => {
        const pOrder = { urgent: 0, high: 1, normal: 2 };
        const pA = pOrder[(a.priority || 'normal') as keyof typeof pOrder] ?? 2;
        const pB = pOrder[(b.priority || 'normal') as keyof typeof pOrder] ?? 2;
        if (pA !== pB) return pA - pB;
        return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      });
      setOrders(sorted);
    } catch (e) {
      console.log('Kitchen orders error:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadOrders(); const iv = setInterval(loadOrders, 15000); return () => clearInterval(iv); }, []);
  const onRefresh = async () => { setRefreshing(true); await loadOrders(); setRefreshing(false); };

  const updateStatus = async (orderId: string, status: string) => {
    try {
      await apiCall(`/orders/${orderId}/status?status=${status}`, { method: 'PUT' });
      await loadOrders();
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
  };

  const setPriority = async (orderId: string, priority: string) => {
    try {
      await apiCall(`/orders/${orderId}/priority`, { method: 'PUT', body: { priority } });
      await loadOrders();
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
  };

  const handleLogout = async () => { await logout(); router.replace('/'); };

  const getTimeSince = (dateStr: string) => {
    const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000);
    if (diff < 1) return 'Just now';
    if (diff < 60) return `${diff}m ago`;
    return `${Math.floor(diff / 60)}h ${diff % 60}m ago`;
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
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.title}>Kitchen</Text>
            <Text style={styles.sub}>{orders.length} active orders</Text>
          </View>
          <TouchableOpacity data-testid="kitchen-logout-btn" style={styles.logoutBtn} onPress={handleLogout}>
            <Ionicons name="log-out-outline" size={20} color={ORANGE} />
          </TouchableOpacity>
        </View>

        {orders.length === 0 && (
          <View style={styles.emptyState}>
            <Ionicons name="checkmark-circle" size={56} color="#267E3E" />
            <Text style={styles.emptyTitle}>All caught up!</Text>
            <Text style={styles.emptyDesc}>No pending orders right now</Text>
          </View>
        )}

        {orders.map(order => {
          const p = (order.priority || 'normal') as keyof typeof PRIORITY_COLORS;
          const s = order.status as keyof typeof STATUS_COLORS;
          return (
            <View key={order.id} style={[styles.orderCard, p === 'urgent' && styles.urgentCard]}>
              <View style={styles.orderHeader}>
                <View style={styles.orderIdRow}>
                  <Text style={styles.orderId}>#{order.id}</Text>
                  <View style={[styles.statusBadge, { backgroundColor: `${STATUS_COLORS[s] || '#9C9C9C'}15` }]}>
                    <Text style={[styles.statusText, { color: STATUS_COLORS[s] || '#9C9C9C' }]}>{order.status.toUpperCase()}</Text>
                  </View>
                </View>
                <View style={styles.orderMeta}>
                  <Text style={styles.orderCustomer}>{order.user_name}</Text>
                  <Text style={styles.orderTime}>{getTimeSince(order.created_at)}</Text>
                  <Text style={styles.orderType}>{order.order_type}</Text>
                </View>
              </View>

              {/* Priority selector */}
              <View style={styles.priorityRow}>
                <Text style={styles.priorityLabel}>Priority:</Text>
                {(['normal', 'high', 'urgent'] as const).map(pr => (
                  <TouchableOpacity
                    key={pr}
                    data-testid={`priority-${pr}-${order.id}`}
                    style={[styles.priorityBtn, p === pr && { backgroundColor: `${PRIORITY_COLORS[pr]}20`, borderColor: PRIORITY_COLORS[pr] }]}
                    onPress={() => setPriority(order.id, pr)}
                  >
                    <Ionicons name={PRIORITY_ICONS[pr]} size={14} color={p === pr ? PRIORITY_COLORS[pr] : '#9C9C9C'} />
                    <Text style={[styles.priorityText, p === pr && { color: PRIORITY_COLORS[pr] }]}>{pr}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Items */}
              <View style={styles.itemsList}>
                {order.items.map((item: any, idx: number) => (
                  <View key={idx} style={styles.itemRow}>
                    <Text style={styles.itemName}>{item.product_name}</Text>
                    <Text style={styles.itemQty}>
                      {item.product_type === 'ready_made' ? `x${item.quantity || 1} plates` : `${item.grams}g`}
                    </Text>
                  </View>
                ))}
              </View>

              {/* Status actions */}
              <View style={styles.actionRow}>
                {order.status === 'pending' && (
                  <TouchableOpacity data-testid={`start-${order.id}`} style={[styles.actionBtn, { backgroundColor: '#5B5FE0' }]} onPress={() => updateStatus(order.id, 'preparing')}>
                    <Ionicons name="flame" size={16} color="#FFF" />
                    <Text style={styles.actionText}>Start Preparing</Text>
                  </TouchableOpacity>
                )}
                {order.status === 'preparing' && (
                  <TouchableOpacity data-testid={`ready-${order.id}`} style={[styles.actionBtn, { backgroundColor: '#267E3E' }]} onPress={() => updateStatus(order.id, 'ready')}>
                    <Ionicons name="checkmark-circle" size={16} color="#FFF" />
                    <Text style={styles.actionText}>Mark Ready</Text>
                  </TouchableOpacity>
                )}
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
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, marginTop: 8 },
  title: { fontSize: 26, fontWeight: '800', color: '#1C1C2E' },
  sub: { fontSize: 13, color: '#9C9C9C', marginTop: 2 },
  logoutBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#FFF3E0', alignItems: 'center', justifyContent: 'center' },
  emptyState: { alignItems: 'center', padding: 60 },
  emptyTitle: { fontSize: 20, fontWeight: '700', color: '#1C1C2E', marginTop: 16 },
  emptyDesc: { fontSize: 14, color: '#9C9C9C', marginTop: 4 },
  orderCard: { backgroundColor: '#FFF', borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: '#EFEFEF' },
  urgentCard: { borderColor: '#E23744', borderWidth: 2 },
  orderHeader: { marginBottom: 12 },
  orderIdRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  orderId: { fontSize: 18, fontWeight: '800', color: '#1C1C2E' },
  statusBadge: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  statusText: { fontSize: 11, fontWeight: '700' },
  orderMeta: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 6 },
  orderCustomer: { fontSize: 13, fontWeight: '600', color: '#1C1C2E' },
  orderTime: { fontSize: 12, color: '#9C9C9C' },
  orderType: { fontSize: 11, color: '#5B5FE0', fontWeight: '600', backgroundColor: '#F0F0FF', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  priorityRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  priorityLabel: { fontSize: 12, color: '#9C9C9C', fontWeight: '600' },
  priorityBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1.5, borderColor: '#EFEFEF' },
  priorityText: { fontSize: 11, fontWeight: '600', color: '#9C9C9C', textTransform: 'capitalize' },
  itemsList: { backgroundColor: '#FAFAFA', borderRadius: 10, padding: 12, marginBottom: 12 },
  itemRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  itemName: { fontSize: 14, fontWeight: '600', color: '#1C1C2E' },
  itemQty: { fontSize: 13, color: '#9C9C9C', fontWeight: '500' },
  actionRow: { flexDirection: 'row', gap: 10 },
  actionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, borderRadius: 12 },
  actionText: { color: '#FFF', fontSize: 14, fontWeight: '700' },
});
