import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { apiCall, logout } from '../../utils/api';

const Z_RED = '#E23744';

export default function AdminDashboard() {
  const router = useRouter();
  const [stats, setStats] = useState({ products: 0, pendingOrders: 0, todayOrders: 0, revenue: 0 });
  const [refreshing, setRefreshing] = useState(false);

  const loadStats = useCallback(async () => {
    try {
      const [products, orders] = await Promise.all([apiCall('/products/all'), apiCall('/orders/all')]);
      const today = new Date().toISOString().split('T')[0];
      const todayOrders = orders.filter((o: any) => o.created_at?.startsWith(today));
      setStats({ products: products.length, pendingOrders: orders.filter((o: any) => ['pending', 'preparing'].includes(o.status)).length, todayOrders: todayOrders.length, revenue: todayOrders.reduce((s: number, o: any) => s + (o.total_price || 0), 0) });
    } catch (e) {}
  }, []);

  useEffect(() => { loadStats(); }, []);
  const onRefresh = async () => { setRefreshing(true); await loadStats(); setRefreshing(false); };
  const handleLogout = async () => { await logout(); router.replace('/'); };

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Z_RED} />} contentContainerStyle={styles.content}>
        <View style={styles.headerRow}>
          <View><Text style={styles.title}>Dashboard</Text><Text style={styles.sub}>Diet Cafe Admin</Text></View>
          <TouchableOpacity testID="admin-logout-btn" style={styles.logoutBtn} onPress={handleLogout}><Ionicons name="log-out-outline" size={20} color={Z_RED} /></TouchableOpacity>
        </View>

        <View style={styles.grid}>
          {[
            { label: 'Products', value: stats.products, icon: 'nutrition' as const, color: '#267E3E' },
            { label: 'Pending', value: stats.pendingOrders, icon: 'time' as const, color: '#FF9F0A' },
            { label: "Today's Orders", value: stats.todayOrders, icon: 'receipt' as const, color: '#5B5FE0' },
            { label: 'Revenue', value: `₹${Math.round(stats.revenue)}`, icon: 'cash' as const, color: Z_RED },
          ].map(s => (
            <View key={s.label} style={styles.statCard} testID={`stat-${s.label.toLowerCase().replace(/[^a-z]/g, '-')}`}>
              <View style={[styles.statIcon, { backgroundColor: `${s.color}15` }]}><Ionicons name={s.icon} size={22} color={s.color} /></View>
              <Text style={styles.statValue}>{s.value}</Text>
              <Text style={styles.statLabel}>{s.label}</Text>
            </View>
          ))}
        </View>

        <Text style={styles.section}>Quick Actions</Text>
        {[
          { title: 'Manage Products', desc: 'Add, edit, or remove menu items', icon: 'add-circle' as const, color: '#267E3E', route: '/(admin)/products' },
          { title: 'Manage Categories', desc: 'Create & customize menu categories', icon: 'grid' as const, color: '#9C27B0', route: '/(admin)/categories' },
          { title: 'Kitchen View', desc: 'View and manage active orders', icon: 'flame' as const, color: '#FF9F0A', route: '/(admin)/kitchen' },
          { title: 'Business Analytics', desc: 'Revenue, insights & AI recommendations', icon: 'analytics' as const, color: '#5B5FE0', route: '/(admin)/analytics' },
          { title: 'Manage Tables', desc: 'View café tables and QR codes', icon: 'qr-code' as const, color: '#E23744', route: '/(admin)/tables' },
          { title: 'Manage Offers', desc: 'Create discounts, coupons & banners', icon: 'pricetag' as const, color: '#FF6B6B', route: '/(admin)/offers' },
          { title: 'Manage Packs', desc: 'Create goal-based meal packs', icon: 'fitness' as const, color: '#4CAF50', route: '/(admin)/packs' },
        ].map(a => (
          <TouchableOpacity key={a.title} testID={`goto-${a.title.toLowerCase().replace(/ /g, '-')}`} style={styles.actionRow} onPress={() => router.push(a.route as any)}>
            <View style={[styles.actionIcon, { backgroundColor: `${a.color}15` }]}><Ionicons name={a.icon} size={22} color={a.color} /></View>
            <View style={{ flex: 1 }}><Text style={styles.actionTitle}>{a.title}</Text><Text style={styles.actionDesc}>{a.desc}</Text></View>
            <Ionicons name="chevron-forward" size={20} color="#D0D0D0" />
          </TouchableOpacity>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F8F8F8' },
  content: { padding: 16 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, marginTop: 8 },
  title: { fontSize: 26, fontWeight: '800', color: '#1C1C2E' },
  sub: { fontSize: 13, color: '#9C9C9C', marginTop: 2 },
  logoutBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#FDE8EA', alignItems: 'center', justifyContent: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 24 },
  statCard: { width: '48%', backgroundColor: '#FFF', borderRadius: 14, padding: 16, borderWidth: 1, borderColor: '#EFEFEF' },
  statIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  statValue: { fontSize: 26, fontWeight: '800', color: '#1C1C2E' },
  statLabel: { fontSize: 12, color: '#9C9C9C', marginTop: 2 },
  section: { fontSize: 18, fontWeight: '700', color: '#1C1C2E', marginBottom: 12 },
  actionRow: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: '#FFF', borderRadius: 14, padding: 16, borderWidth: 1, borderColor: '#EFEFEF', marginBottom: 10 },
  actionIcon: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  actionTitle: { fontSize: 15, fontWeight: '700', color: '#1C1C2E' },
  actionDesc: { fontSize: 12, color: '#9C9C9C', marginTop: 2 },
});
