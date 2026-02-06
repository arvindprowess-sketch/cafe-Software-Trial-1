import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl,
  SafeAreaView, ActivityIndicator, Alert
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { apiCall } from '../../utils/api';

const STATUS_FLOW: Record<string, string> = {
  pending: 'preparing', preparing: 'ready', ready: 'completed'
};
const STATUS_COLORS: Record<string, string> = {
  pending: '#FF9F0A', preparing: '#007AFF', ready: '#32D74B', completed: '#8E8E93'
};
const STATUS_ICONS: Record<string, string> = {
  pending: 'time', preparing: 'flame', ready: 'checkmark-circle', completed: 'checkmark-done'
};

export default function KitchenScreen() {
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadOrders = useCallback(async () => {
    try { const data = await apiCall('/orders/kitchen'); setOrders(data); }
    catch (e) {} finally { setLoading(false); }
  }, []);

  useEffect(() => { loadOrders(); const interval = setInterval(loadOrders, 10000); return () => clearInterval(interval); }, []);
  const onRefresh = async () => { setRefreshing(true); await loadOrders(); setRefreshing(false); };

  const updateStatus = async (orderId: string, newStatus: string) => {
    try {
      await apiCall(`/orders/${orderId}/status?status=${newStatus}`, { method: 'PUT' });
      await loadOrders();
    } catch (e: any) { Alert.alert('Error', e.message); }
  };

  const renderOrder = ({ item }: { item: any }) => {
    const nextStatus = STATUS_FLOW[item.status];
    const color = STATUS_COLORS[item.status] || '#8E8E93';
    return (
      <View style={[styles.card, { borderLeftColor: color, borderLeftWidth: 4 }]} testID={`kitchen-order-${item.id}`}>
        <View style={styles.cardHeader}>
          <View>
            <Text style={styles.orderId}>#{item.id}</Text>
            <Text style={styles.userName}>{item.user_name}</Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <View style={[styles.statusBadge, { backgroundColor: `${color}20` }]}>
              <Ionicons name={(STATUS_ICONS[item.status] || 'ellipse') as any} size={12} color={color} />
              <Text style={[styles.statusText, { color }]}>{item.status.toUpperCase()}</Text>
            </View>
            <View style={styles.typeBadge}>
              <Ionicons
                name={item.order_type === 'dine-in' ? 'restaurant' : item.order_type === 'takeaway' ? 'bag-handle' : 'bicycle'}
                size={12} color="#8E8E93"
              />
              <Text style={styles.typeText}>{item.order_type}</Text>
            </View>
          </View>
        </View>

        <View style={styles.itemsSection}>
          <Text style={styles.itemsTitle}>ITEMS TO PREPARE:</Text>
          {item.items?.map((it: any, i: number) => (
            <View key={i} style={styles.kitchenItem}>
              <View style={styles.kitchenItemLeft}>
                <Text style={styles.kitchenItemName}>{it.product_name}</Text>
              </View>
              <View style={styles.gramsBox}>
                <Text style={styles.gramsText}>{Math.round(it.grams)}g</Text>
              </View>
            </View>
          ))}
        </View>

        {nextStatus && (
          <TouchableOpacity
            testID={`update-status-${item.id}`}
            style={[styles.actionBtn, { backgroundColor: STATUS_COLORS[nextStatus] || '#FF3B30' }]}
            onPress={() => updateStatus(item.id, nextStatus)}
          >
            <Ionicons name={(STATUS_ICONS[nextStatus] || 'arrow-forward') as any} size={18} color="#FFF" />
            <Text style={styles.actionText}>MARK AS {nextStatus.toUpperCase()}</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  if (loading) {
    return <SafeAreaView style={styles.safe}><View style={styles.center}><ActivityIndicator size="large" color="#FF3B30" /></View></SafeAreaView>;
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Text style={styles.title}>Kitchen</Text>
        <View style={styles.countBadge}>
          <Text style={styles.countText}>{orders.length} active</Text>
        </View>
      </View>

      {orders.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="checkmark-done-circle" size={64} color="#32D74B" />
          <Text style={styles.emptyText}>All caught up!</Text>
          <Text style={styles.emptyDesc}>No pending orders</Text>
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
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 8 },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: 16, paddingTop: 8,
  },
  title: { fontSize: 28, fontWeight: '800', color: '#FFF' },
  countBadge: {
    backgroundColor: 'rgba(255,59,48,0.15)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12,
  },
  countText: { color: '#FF3B30', fontSize: 13, fontWeight: '700' },
  emptyText: { color: '#32D74B', fontSize: 18, fontWeight: '700' },
  emptyDesc: { color: '#8E8E93', fontSize: 14 },
  list: { padding: 16 },
  card: {
    backgroundColor: '#121212', borderRadius: 16, padding: 16, marginBottom: 14,
    borderWidth: 1, borderColor: '#2C2C2E',
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 },
  orderId: { fontSize: 20, fontWeight: '800', color: '#FFF' },
  userName: { fontSize: 13, color: '#8E8E93', marginTop: 2 },
  statusBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8,
  },
  statusText: { fontSize: 11, fontWeight: '700' },
  typeBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6,
  },
  typeText: { color: '#8E8E93', fontSize: 11, textTransform: 'capitalize' },
  itemsSection: {
    backgroundColor: '#1C1C1E', borderRadius: 12, padding: 12, marginBottom: 12,
  },
  itemsTitle: { fontSize: 10, fontWeight: '700', color: '#48484A', letterSpacing: 1, marginBottom: 8 },
  kitchenItem: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#2C2C2E',
  },
  kitchenItemLeft: { flex: 1 },
  kitchenItemName: { fontSize: 15, fontWeight: '600', color: '#FFF' },
  gramsBox: {
    backgroundColor: '#FF3B30', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8,
  },
  gramsText: { color: '#FFF', fontSize: 16, fontWeight: '800' },
  actionBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    borderRadius: 12, paddingVertical: 14,
  },
  actionText: { color: '#FFF', fontSize: 14, fontWeight: '700', letterSpacing: 0.5 },
});
