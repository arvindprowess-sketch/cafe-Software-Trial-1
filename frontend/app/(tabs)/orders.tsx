import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, RefreshControl, SafeAreaView, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { apiCall } from '../../utils/api';

const Z_RED = '#E23744';
const STEPS = ['pending', 'preparing', 'ready', 'completed'];
const STEP_LABELS: Record<string, string> = { pending: 'Order Placed', preparing: 'Being Prepared', ready: 'Ready', completed: 'Completed' };
const STEP_ICONS: Record<string, string> = { pending: 'checkmark-circle', preparing: 'flame', ready: 'bag-check', completed: 'checkmark-done-circle' };

export default function OrdersScreen() {
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadOrders = useCallback(async () => {
    try { setOrders(await apiCall('/orders')); } catch (e) {} finally { setLoading(false); }
  }, []);

  useEffect(() => { loadOrders(); }, []);
  const onRefresh = async () => { setRefreshing(true); await loadOrders(); setRefreshing(false); };

  const renderOrder = ({ item }: { item: any }) => {
    const statusIdx = STEPS.indexOf(item.status);
    return (
      <View style={styles.card} testID={`order-${item.id}`}>
        <View style={styles.cardTop}>
          <View>
            <Text style={styles.orderId}>Order #{item.id}</Text>
            <View style={styles.metaRow}>
              <Ionicons name={item.order_type === 'dine-in' ? 'restaurant' : item.order_type === 'takeaway' ? 'bag-handle' : 'bicycle'} size={12} color="#9C9C9C" />
              <Text style={styles.metaText}>{item.order_type}</Text>
              <Text style={styles.metaDot}>•</Text>
              <Text style={styles.metaText}>{new Date(item.created_at).toLocaleDateString()}</Text>
            </View>
          </View>
          <Text style={styles.orderPrice}>₹{Math.round(item.total_price)}</Text>
        </View>

        <View style={styles.timeline}>
          {STEPS.map((step, i) => {
            const done = i <= statusIdx;
            const active = i === statusIdx;
            return (
              <View key={step} style={styles.tlStep}>
                <View style={styles.tlDotCol}>
                  <View style={[styles.tlDot, done && styles.tlDotDone, active && styles.tlDotActive]}>
                    <Ionicons name={STEP_ICONS[step] as any} size={12} color={done ? '#FFF' : '#D0D0D0'} />
                  </View>
                  {i < STEPS.length - 1 && <View style={[styles.tlLine, done && styles.tlLineDone]} />}
                </View>
                <Text style={[styles.tlLabel, done && styles.tlLabelDone, active && styles.tlLabelActive]}>{STEP_LABELS[step]}</Text>
              </View>
            );
          })}
        </View>

        <View style={styles.itemsBox}>
          {item.items?.map((it: any, i: number) => (
            <View key={i} style={styles.itemRow}>
              <Text style={styles.itemQty}>{Math.round(it.grams)}g</Text>
              <Text style={styles.itemName}>{it.product_name}</Text>
              <Text style={styles.itemPrice}>₹{Math.round(it.price)}</Text>
            </View>
          ))}
        </View>

        <View style={styles.nutritionBar}>
          <Ionicons name="flame" size={12} color={Z_RED} />
          <Text style={styles.nutritionText}>{Math.round(item.total_calories)} cal</Text>
          <Text style={styles.nutritionSep}>•</Text>
          <Text style={styles.nutritionText}>P: {Math.round(item.total_protein)}g</Text>
          <Text style={styles.nutritionText}>C: {Math.round(item.total_carbs)}g</Text>
          <Text style={styles.nutritionText}>F: {Math.round(item.total_fat)}g</Text>
        </View>
      </View>
    );
  };

  if (loading) return <SafeAreaView style={styles.safe}><View style={styles.center}><ActivityIndicator size="large" color={Z_RED} /></View></SafeAreaView>;

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}><Text style={styles.title}>My Orders</Text></View>
      {orders.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="receipt-outline" size={64} color="#E8E8E8" />
          <Text style={styles.emptyText}>No orders yet</Text>
          <Text style={styles.emptySub}>Your orders will appear here</Text>
        </View>
      ) : (
        <FlatList data={orders} keyExtractor={i => i.id} renderItem={renderOrder}
          contentContainerStyle={styles.list} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Z_RED} />}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F8F8F8' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 8 },
  header: { backgroundColor: '#FFF', padding: 16, paddingTop: 8, borderBottomWidth: 1, borderBottomColor: '#EFEFEF' },
  title: { fontSize: 24, fontWeight: '800', color: '#1C1C2E' },
  emptyText: { color: '#1C1C2E', fontSize: 16, fontWeight: '600' },
  emptySub: { color: '#9C9C9C', fontSize: 13 },
  list: { padding: 16 },
  card: { backgroundColor: '#FFF', borderRadius: 14, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: '#EFEFEF' },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 },
  orderId: { fontSize: 16, fontWeight: '700', color: '#1C1C2E' },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 },
  metaText: { fontSize: 12, color: '#9C9C9C', textTransform: 'capitalize' },
  metaDot: { color: '#D0D0D0' },
  orderPrice: { fontSize: 18, fontWeight: '800', color: '#1C1C2E' },
  timeline: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 14 },
  tlStep: { alignItems: 'center', flex: 1 },
  tlDotCol: { alignItems: 'center', flexDirection: 'row' },
  tlDot: { width: 24, height: 24, borderRadius: 12, backgroundColor: '#E8E8E8', alignItems: 'center', justifyContent: 'center', zIndex: 1 },
  tlDotDone: { backgroundColor: '#267E3E' },
  tlDotActive: { backgroundColor: Z_RED, borderWidth: 2, borderColor: '#FDE8EA' },
  tlLine: { height: 2, flex: 1, backgroundColor: '#E8E8E8', position: 'absolute', left: 24, right: -24, top: 11 },
  tlLineDone: { backgroundColor: '#267E3E' },
  tlLabel: { fontSize: 9, color: '#B0B0B0', marginTop: 4, textAlign: 'center' },
  tlLabelDone: { color: '#267E3E' },
  tlLabelActive: { color: Z_RED, fontWeight: '700' },
  itemsBox: { backgroundColor: '#FAFAFA', borderRadius: 8, padding: 10, marginBottom: 10 },
  itemRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 3 },
  itemQty: { width: 50, fontSize: 12, fontWeight: '700', color: '#696969' },
  itemName: { flex: 1, fontSize: 13, color: '#1C1C2E' },
  itemPrice: { fontSize: 13, fontWeight: '600', color: '#1C1C2E' },
  nutritionBar: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#EFEFEF' },
  nutritionText: { fontSize: 11, color: '#9C9C9C' },
  nutritionSep: { color: '#D0D0D0' },
});
