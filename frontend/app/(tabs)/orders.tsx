import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl,
  ActivityIndicator
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { apiCall } from '../../utils/api';

const BK_RED = '#D62300';
const BK_ORANGE = '#FF8732';
const BK_BROWN = '#502314';
const BK_CREAM = '#F5EBDC';
const BK_GREEN = '#509E2F';
const BK_WHITE = '#FFFFFF';
const BK_TEXT_LIGHT = '#8B6F61';

export default function OrdersScreen() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'recent' | 'monthly'>('recent');
  const [recentOrders, setRecentOrders] = useState<any[]>([]);
  const [monthlyOrders, setMonthlyOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    loadOrders();
  }, []);

  const loadOrders = useCallback(async () => {
    try {
      const allOrders = await apiCall('/orders');
      
      // Recent orders: Last 7 days
      const now = new Date();
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const recent = allOrders.filter((order: any) => {
        const orderDate = new Date(order.created_at);
        return orderDate >= sevenDaysAgo;
      }).sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      
      // Monthly orders: Current month
      const thisMonth = allOrders.filter((order: any) => {
        const orderDate = new Date(order.created_at);
        return orderDate.getMonth() === now.getMonth() && orderDate.getFullYear() === now.getFullYear();
      }).sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      
      setRecentOrders(recent);
      setMonthlyOrders(thisMonth);
    } catch (e) {
      console.error('Error loading orders:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadOrders();
    setRefreshing(false);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return BK_GREEN;
      case 'pending': return BK_ORANGE;
      case 'cancelled': return BK_RED;
      case 'scheduled': return '#FF9F0A';
      default: return BK_TEXT_LIGHT;
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed': return 'checkmark-circle';
      case 'pending': return 'time';
      case 'cancelled': return 'close-circle';
      case 'scheduled': return 'calendar';
      default: return 'ellipse';
    }
  };

  const renderOrder = ({ item }: { item: any }) => {
    const orderDate = new Date(item.created_at);
    const isToday = orderDate.toDateString() === new Date().toDateString();
    const statusColor = getStatusColor(item.status);
    const statusIcon = getStatusIcon(item.status);

    return (
      <TouchableOpacity 
        style={styles.orderCard}
        onPress={() => {/* Navigate to order detail */}}
        activeOpacity={0.9}
      >
        <View style={styles.orderHeader}>
          <View style={styles.orderHeaderLeft}>
            <Ionicons name={statusIcon as any} size={20} color={statusColor} />
            <View>
              <Text style={styles.orderId}>Order #{item.id.slice(0, 8)}</Text>
              <Text style={styles.orderDate}>
                {isToday ? 'Today' : orderDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} • {orderDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
              </Text>
            </View>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: statusColor }]}>
            <Text style={styles.statusText}>{item.status.toUpperCase()}</Text>
          </View>
        </View>

        <View style={styles.orderItems}>
          {item.items?.slice(0, 3).map((orderItem: any, idx: number) => (
            <View key={idx} style={styles.itemRow}>
              <View style={[styles.dietDot, { borderColor: orderItem.diet_type === 'non-veg' ? BK_RED : BK_GREEN }]}>
                <View style={[styles.dietDotFill, { backgroundColor: orderItem.diet_type === 'non-veg' ? BK_RED : BK_GREEN }]} />
              </View>
              <Text style={styles.itemName} numberOfLines={1}>
                {orderItem.name} ({orderItem.grams || orderItem.quantity}g)
              </Text>
            </View>
          ))}
          {item.items?.length > 3 && (
            <Text style={styles.moreItems}>+{item.items.length - 3} more items</Text>
          )}
        </View>

        <View style={styles.orderFooter}>
          <View style={styles.orderStats}>
            <Ionicons name="restaurant" size={14} color={BK_TEXT_LIGHT} />
            <Text style={styles.statsText}>{item.items?.length || 0} items</Text>
            <Ionicons name="flame" size={14} color={BK_ORANGE} style={{ marginLeft: 12 }} />
            <Text style={styles.statsText}>{Math.round(item.total_calories || 0)} cal</Text>
          </View>
          <Text style={styles.orderTotal}>₹{Math.round(item.total_price || 0)}</Text>
        </View>

        {item.order_type && (
          <View style={styles.orderTypeBadge}>
            <Ionicons 
              name={item.order_type === 'delivery' ? 'bicycle' : item.order_type === 'dine-in' ? 'restaurant' : 'bag-handle'} 
              size={12} 
              color={BK_TEXT_LIGHT} 
            />
            <Text style={styles.orderTypeText}>{item.order_type}</Text>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  const displayOrders = activeTab === 'recent' ? recentOrders : monthlyOrders;

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={BK_RED} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>My Orders</Text>
      </View>

      {/* Tab Selector */}
      <View style={styles.tabContainer}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'recent' && styles.tabActive]}
          onPress={() => setActiveTab('recent')}
        >
          <Ionicons name="time" size={18} color={activeTab === 'recent' ? BK_CREAM : BK_TEXT_LIGHT} />
          <Text style={[styles.tabText, activeTab === 'recent' && styles.tabTextActive]}>
            Recent Orders
          </Text>
          {recentOrders.length > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{recentOrders.length}</Text>
            </View>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tab, activeTab === 'monthly' && styles.tabActive]}
          onPress={() => setActiveTab('monthly')}
        >
          <Ionicons name="calendar" size={18} color={activeTab === 'monthly' ? BK_CREAM : BK_TEXT_LIGHT} />
          <Text style={[styles.tabText, activeTab === 'monthly' && styles.tabTextActive]}>
            This Month
          </Text>
          {monthlyOrders.length > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{monthlyOrders.length}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      {/* Summary Stats */}
      {displayOrders.length > 0 && (
        <View style={styles.summaryCard}>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryValue}>{displayOrders.length}</Text>
            <Text style={styles.summaryLabel}>Total Orders</Text>
          </View>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryItem}>
            <Text style={styles.summaryValue}>
              ₹{Math.round(displayOrders.reduce((sum, o) => sum + (o.total_price || 0), 0))}
            </Text>
            <Text style={styles.summaryLabel}>Total Spent</Text>
          </View>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryItem}>
            <Text style={styles.summaryValue}>
              {Math.round(displayOrders.reduce((sum, o) => sum + (o.total_calories || 0), 0))}
            </Text>
            <Text style={styles.summaryLabel}>Total Calories</Text>
          </View>
        </View>
      )}

      {/* Orders List */}
      <FlatList
        data={displayOrders}
        keyExtractor={item => item.id}
        renderItem={renderOrder}
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={BK_RED} />}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Ionicons name="receipt-outline" size={64} color="#D0D0D0" />
            <Text style={styles.emptyTitle}>No Orders Yet</Text>
            <Text style={styles.emptyText}>
              {activeTab === 'recent' 
                ? 'You haven\'t placed any orders in the last 7 days' 
                : 'No orders this month'}
            </Text>
            <TouchableOpacity style={styles.emptyBtn} onPress={() => router.push('/(tabs)/menu')}>
              <Text style={styles.emptyBtnText}>Browse Menu</Text>
            </TouchableOpacity>
          </View>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: BK_CREAM },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  
  header: {
    backgroundColor: BK_BROWN,
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  headerTitle: { fontSize: 22, fontWeight: '800', color: BK_CREAM, textTransform: 'uppercase', letterSpacing: 0.5 },
  
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: BK_BROWN,
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 8,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 25,
    backgroundColor: 'rgba(245,235,220,0.1)',
  },
  tabActive: {
    backgroundColor: BK_RED,
  },
  tabText: {
    fontSize: 13,
    fontWeight: '700',
    color: BK_TEXT_LIGHT,
    textTransform: 'uppercase',
  },
  tabTextActive: {
    color: BK_CREAM,
    fontWeight: '800',
  },
  badge: {
    backgroundColor: BK_ORANGE,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    minWidth: 24,
    alignItems: 'center',
  },
  badgeText: { fontSize: 11, fontWeight: '800', color: BK_WHITE },
  
  summaryCard: {
    flexDirection: 'row',
    backgroundColor: BK_WHITE,
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 16,
    padding: 16,
    borderWidth: 2,
    borderColor: '#E8DDD4',
  },
  summaryItem: { flex: 1, alignItems: 'center' },
  summaryValue: { fontSize: 20, fontWeight: '800', color: BK_BROWN },
  summaryLabel: { fontSize: 11, color: BK_TEXT_LIGHT, marginTop: 4, textTransform: 'uppercase' },
  summaryDivider: { width: 1, backgroundColor: '#E8DDD4', marginHorizontal: 8 },
  
  listContent: { padding: 16, paddingBottom: 100 },
  
  orderCard: {
    backgroundColor: BK_WHITE,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 2,
    borderColor: '#E8DDD4',
  },
  orderHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  orderHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  orderId: { fontSize: 16, fontWeight: '800', color: BK_BROWN },
  orderDate: { fontSize: 12, color: BK_TEXT_LIGHT, marginTop: 2 },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  statusText: { fontSize: 10, fontWeight: '800', color: BK_WHITE },
  
  orderItems: { marginBottom: 12 },
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  dietDot: { width: 14, height: 14, borderRadius: 2, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  dietDotFill: { width: 7, height: 7, borderRadius: 4 },
  itemName: { flex: 1, fontSize: 14, color: BK_BROWN },
  moreItems: { fontSize: 12, color: BK_TEXT_LIGHT, fontStyle: 'italic', marginTop: 4 },
  
  orderFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#E8DDD4',
  },
  orderStats: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  statsText: { fontSize: 12, color: BK_TEXT_LIGHT },
  orderTotal: { fontSize: 20, fontWeight: '800', color: BK_RED },
  
  orderTypeBadge: {
    position: 'absolute',
    top: 12,
    right: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: BK_CREAM,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  orderTypeText: { fontSize: 10, fontWeight: '700', color: BK_TEXT_LIGHT, textTransform: 'uppercase' },
  
  emptyState: {
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyTitle: { fontSize: 18, fontWeight: '800', color: BK_BROWN, marginTop: 16 },
  emptyText: { fontSize: 14, color: BK_TEXT_LIGHT, textAlign: 'center', marginTop: 8, paddingHorizontal: 40 },
  emptyBtn: {
    backgroundColor: BK_RED,
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 25,
    marginTop: 24,
  },
  emptyBtnText: { fontSize: 15, fontWeight: '800', color: BK_CREAM, textTransform: 'uppercase' },
});
