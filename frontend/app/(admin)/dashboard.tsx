import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl, SafeAreaView
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { apiCall, logout } from '../../utils/api';

export default function AdminDashboard() {
  const router = useRouter();
  const [stats, setStats] = useState({ products: 0, pendingOrders: 0, todayOrders: 0, revenue: 0 });
  const [refreshing, setRefreshing] = useState(false);

  const loadStats = useCallback(async () => {
    try {
      const [products, orders] = await Promise.all([
        apiCall('/products/all'),
        apiCall('/orders/all'),
      ]);
      const today = new Date().toISOString().split('T')[0];
      const todayOrders = orders.filter((o: any) => o.created_at?.startsWith(today));
      const pending = orders.filter((o: any) => ['pending', 'preparing'].includes(o.status));
      const revenue = todayOrders.reduce((sum: number, o: any) => sum + (o.total_price || 0), 0);
      setStats({
        products: products.length,
        pendingOrders: pending.length,
        todayOrders: todayOrders.length,
        revenue,
      });
    } catch (e) {}
  }, []);

  useEffect(() => { loadStats(); }, []);
  const onRefresh = async () => { setRefreshing(true); await loadStats(); setRefreshing(false); };

  const handleLogout = async () => { await logout(); router.replace('/'); };

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        style={styles.container}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#FF3B30" />}
      >
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.title}>Admin Dashboard</Text>
            <Text style={styles.subtitle}>Diet Cafe Management</Text>
          </View>
          <TouchableOpacity testID="admin-logout-btn" style={styles.logoutBtn} onPress={handleLogout}>
            <Ionicons name="log-out" size={20} color="#FF453A" />
          </TouchableOpacity>
        </View>

        <View style={styles.statsGrid}>
          {[
            { label: 'Products', value: stats.products, icon: 'nutrition' as const, color: '#32D74B' },
            { label: 'Pending Orders', value: stats.pendingOrders, icon: 'time' as const, color: '#FF9F0A' },
            { label: "Today's Orders", value: stats.todayOrders, icon: 'receipt' as const, color: '#007AFF' },
            { label: "Today's Revenue", value: `₹${Math.round(stats.revenue)}`, icon: 'cash' as const, color: '#FF3B30' },
          ].map(s => (
            <View key={s.label} style={styles.statCard} testID={`stat-${s.label.toLowerCase().replace(/[^a-z]/g, '-')}`}>
              <Ionicons name={s.icon} size={28} color={s.color} />
              <Text style={styles.statValue}>{s.value}</Text>
              <Text style={styles.statLabel}>{s.label}</Text>
            </View>
          ))}
        </View>

        <Text style={styles.sectionTitle}>Quick Actions</Text>
        <View style={styles.actionsCol}>
          <TouchableOpacity
            testID="goto-products-btn"
            style={styles.actionItem}
            onPress={() => router.push('/(admin)/products')}
          >
            <View style={[styles.actionIcon, { backgroundColor: 'rgba(50,215,75,0.15)' }]}>
              <Ionicons name="add-circle" size={24} color="#32D74B" />
            </View>
            <View style={styles.actionInfo}>
              <Text style={styles.actionTitle}>Manage Products</Text>
              <Text style={styles.actionDesc}>Add, edit, or remove menu items</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#48484A" />
          </TouchableOpacity>
          <TouchableOpacity
            testID="goto-kitchen-btn"
            style={styles.actionItem}
            onPress={() => router.push('/(admin)/kitchen')}
          >
            <View style={[styles.actionIcon, { backgroundColor: 'rgba(255,159,10,0.15)' }]}>
              <Ionicons name="flame" size={24} color="#FF9F0A" />
            </View>
            <View style={styles.actionInfo}>
              <Text style={styles.actionTitle}>Kitchen View</Text>
              <Text style={styles.actionDesc}>View and manage active orders</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#48484A" />
          </TouchableOpacity>
        </View>

        <View style={{ height: 32 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#000' },
  container: { flex: 1, padding: 16 },
  headerRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: 24, marginTop: 8,
  },
  title: { fontSize: 28, fontWeight: '800', color: '#FFF' },
  subtitle: { fontSize: 13, color: '#8E8E93', marginTop: 2 },
  logoutBtn: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: '#1C1C1E',
    alignItems: 'center', justifyContent: 'center',
  },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 28 },
  statCard: {
    width: '47%', backgroundColor: '#121212', borderRadius: 16, padding: 16,
    borderWidth: 1, borderColor: '#2C2C2E', gap: 8,
  },
  statValue: { fontSize: 28, fontWeight: '800', color: '#FFF' },
  statLabel: { fontSize: 12, color: '#8E8E93', fontWeight: '500' },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: '#FFF', marginBottom: 12 },
  actionsCol: { gap: 10 },
  actionItem: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: '#121212', borderRadius: 14, padding: 16,
    borderWidth: 1, borderColor: '#2C2C2E',
  },
  actionIcon: { width: 48, height: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  actionInfo: { flex: 1 },
  actionTitle: { fontSize: 15, fontWeight: '700', color: '#FFF' },
  actionDesc: { fontSize: 12, color: '#8E8E93', marginTop: 2 },
});
