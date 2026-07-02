import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl,
  ActivityIndicator
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { apiCall } from '../../utils/api';
import { useRealtime } from '../../utils/realtime';
import { FUEL, FONT, RADIUS, SPACE } from '../../utils/theme';
import { useCart } from '../../utils/CartContext';
import { SkeletonList } from '../components/Skeleton';

// F6: 4-step progress tracker config per order type.
const TRACKER_STEPS: Record<string, string[]> = {
  'dine-in': ['Placed', 'Accepted', 'Ready', 'Served'],
  'delivery': ['Placed', 'Preparing', 'Picked up', 'Delivered'],
  'takeaway': ['Placed', 'Preparing', 'Ready', 'Collected'],
};

// Map an order status to the current step index (0-3) for the given order type.
const trackerStepIndex = (orderType: string, status: string): number => {
  if (status === 'completed') return 3;
  if (orderType === 'delivery') {
    if (status === 'out_for_delivery') return 2;
    if (status === 'preparing' || status === 'accepted' || status === 'ready') return 1;
    return 0;
  }
  // dine-in / takeaway
  if (status === 'ready') return 2;
  if (status === 'preparing' || status === 'accepted') return 1;
  return 0; // pending / scheduled
};

export default function OrdersScreen() {
  const router = useRouter();
  const { replaceCart } = useCart();
  const [activeTab, setActiveTab] = useState<'recent' | 'monthly' | 'favorites'>('recent');
  const [recentOrders, setRecentOrders] = useState<any[]>([]);
  const [monthlyOrders, setMonthlyOrders] = useState<any[]>([]);
  const [favoriteOrders, setFavoriteOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    loadOrders();
  }, []);

  // Live updates: refresh when order status changes or a new order is placed (C1/C2)
  useRealtime((msg) => {
    if (['order_status', 'new_order'].includes(msg.type)) {
      loadOrders();
    }
  });

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

      // Favorite orders
      const favorites = allOrders.filter((order: any) => order.is_favorite === true)
        .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

      setRecentOrders(recent);
      setMonthlyOrders(thisMonth);
      setFavoriteOrders(favorites);
    } catch (e) {
      console.error('Error loading orders:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  const toggleFavorite = async (orderId: string, currentFavorite: boolean) => {
    try {
      // Update local state immediately for better UX
      const updateOrderFavorite = (order: any) =>
        order.id === orderId ? { ...order, is_favorite: !currentFavorite } : order;

      setRecentOrders(prev => prev.map(updateOrderFavorite));
      setMonthlyOrders(prev => prev.map(updateOrderFavorite));

      if (!currentFavorite) {
        // Added to favorites
        const order = [...recentOrders, ...monthlyOrders].find(o => o.id === orderId);
        if (order) {
          setFavoriteOrders(prev => [{ ...order, is_favorite: true }, ...prev]);
        }
      } else {
        // Removed from favorites
        setFavoriteOrders(prev => prev.filter(o => o.id !== orderId));
      }

      // Try to update backend (optional - will fail silently if endpoint doesn't exist)
      await apiCall(`/orders/${orderId}/favorite`, {
        method: 'POST',
        body: { is_favorite: !currentFavorite }
      }).catch(() => {
        // Backend update failed, but local state is already updated
        console.log('Favorite stored locally');
      });
    } catch (e) {
      console.error('Error toggling favorite:', e);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadOrders();
    setRefreshing(false);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return FUEL.success;
      case 'ready': return FUEL.success;
      case 'pending': return FUEL.warning;
      case 'accepted': return FUEL.fat;
      case 'preparing': return FUEL.warning;
      case 'cancelled': return FUEL.error;
      case 'scheduled': return FUEL.fat;
      default: return FUEL.muted;
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed': return 'checkmark-circle';
      case 'ready': return 'checkmark-done-circle';
      case 'pending': return 'time';
      case 'accepted': return 'thumbs-up';
      case 'preparing': return 'flame';
      case 'cancelled': return 'close-circle';
      case 'scheduled': return 'calendar';
      default: return 'ellipse';
    }
  };

  // F6: re-seed the cart from a past order and jump to checkout.
  const handleReorder = (order: any) => {
    if (!order.items?.length) { Alert.alert('Nothing to reorder', 'This order has no items.'); return; }
    replaceCart(order.items);
    router.push('/cart');
  };

  // F6: minutes until ready, when the order carries an ETA field; else null.
  const etaMinutes = (order: any): number | null => {
    const raw = order.estimated_ready_at || order.scheduled_ready_time;
    if (!raw) return null;
    const mins = Math.round((new Date(raw).getTime() - Date.now()) / 60000);
    return mins > 0 ? mins : null;
  };

  const renderOrder = ({ item }: { item: any }) => {
    const orderDate = new Date(item.created_at);
    const isToday = orderDate.toDateString() === new Date().toDateString();
    const statusColor = getStatusColor(item.status);
    const statusIcon = getStatusIcon(item.status);
    const isCancelled = item.status === 'cancelled';
    const steps = TRACKER_STEPS[item.order_type] || TRACKER_STEPS['dine-in'];
    const curStep = trackerStepIndex(item.order_type, item.status);
    const eta = etaMinutes(item);

    return (
      <TouchableOpacity
        style={styles.orderCard}
        onPress={() => router.push({ pathname: '/order-detail', params: { orderId: item.id } })}
        activeOpacity={0.9}
        testID={`order-card-${item.id}`}
      >
        {/* First Row: Order Info and Order Type Icon */}
        <View style={styles.orderHeader}>
          <View style={styles.orderHeaderLeft}>
            <Ionicons name={statusIcon as any} size={20} color={statusColor} />
            <View style={styles.orderInfo}>
              <Text style={styles.orderId}>Order #{item.id.slice(0, 8)}</Text>
              <Text style={styles.orderDate}>
                {isToday ? 'Today' : orderDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} • {orderDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
              </Text>
            </View>
          </View>
          {/* Order Type Icon - Moved to Right */}
          {item.order_type && (
            <View style={styles.orderTypeIconBadge}>
              <Ionicons
                name={item.order_type === 'delivery' ? 'bicycle' : item.order_type === 'dine-in' ? 'restaurant' : 'bag-handle'}
                size={20}
                color={FUEL.ink}
              />
            </View>
          )}
        </View>

        {/* Second Row: Status Badge and Heart */}
        <View style={styles.orderMetaRow}>
          <View style={styles.badgesContainer}>
            <View style={[styles.statusBadge, { backgroundColor: statusColor }]}>
              <Text style={styles.statusText}>{item.status.toUpperCase()}</Text>
            </View>
            {/* P7: rated badge */}
            {item.rating?.stars ? (
              <View style={styles.ratedBadge} testID={`order-rating-badge-${item.id}`}>
                <Ionicons name="star" size={10} color={FUEL.ink} />
                <Text style={styles.ratedBadgeText}>{item.rating.stars}</Text>
              </View>
            ) : null}
          </View>
          <TouchableOpacity
            onPress={(e) => {
              e.stopPropagation();
              toggleFavorite(item.id, item.is_favorite);
            }}
            style={styles.favoriteBtn}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            testID={`favorite-btn-${item.id}`}
          >
            <Ionicons
              name={item.is_favorite ? "heart" : "heart-outline"}
              size={22}
              color={item.is_favorite ? FUEL.limeDeep : FUEL.muted}
            />
          </TouchableOpacity>
        </View>

        <View style={styles.orderItems}>
          {item.items?.slice(0, 3).map((orderItem: any, idx: number) => (
            <View key={idx} style={styles.itemRow}>
              <View style={[styles.dietDot, { borderColor: orderItem.diet_type === 'non-veg' ? FUEL.nonVeg : FUEL.veg }]}>
                <View style={[styles.dietDotFill, { backgroundColor: orderItem.diet_type === 'non-veg' ? FUEL.nonVeg : FUEL.veg }]} />
              </View>
              <Text style={styles.itemName} numberOfLines={1}>
                {orderItem.name || orderItem.product_name || 'Item'} ({orderItem.grams || orderItem.quantity || 0}g)
              </Text>
            </View>
          ))}
          {item.items?.length > 3 && (
            <Text style={styles.moreItems}>+{item.items.length - 3} more items</Text>
          )}
        </View>

        {/* F6: 4-step progress tracker (hidden for cancelled orders) */}
        {!isCancelled && (
          <View style={styles.tracker} testID={`order-tracker-${item.id}`}>
            {steps.map((label, i) => {
              const done = i <= curStep;
              return (
                <View key={label} style={styles.trackStep}>
                  <View style={styles.trackDotRow}>
                    {i > 0 && <View style={[styles.trackLine, i <= curStep && styles.trackLineActive]} />}
                    <View style={[styles.trackDot, done && styles.trackDotActive]} />
                    {i < steps.length - 1 && <View style={[styles.trackLine, i < curStep && styles.trackLineActive]} />}
                  </View>
                  <Text style={[styles.trackLabel, done && styles.trackLabelActive]} numberOfLines={1}>{label}</Text>
                </View>
              );
            })}
          </View>
        )}

        <View style={styles.orderFooter}>
          <View style={styles.orderStats}>
            <Ionicons name="restaurant" size={14} color={FUEL.muted} />
            <Text style={styles.statsText}>{item.items?.length || 0} items</Text>
            <Ionicons name="flame" size={14} color={FUEL.warning} style={{ marginLeft: SPACE.m }} />
            <Text style={styles.statsText}>{Math.round(item.total_calories || 0)} cal</Text>
          </View>
          <Text style={styles.orderTotal}>₹{Math.round(item.total_price || 0)}</Text>
        </View>

        {/* F6: ETA (conditional) + Reorder + Track (delivery only) */}
        {eta != null && (
          <View style={styles.etaRow}>
            <Ionicons name="time" size={13} color={FUEL.limeDeep} />
            <Text style={styles.etaText}>Ready in ~{eta} min</Text>
          </View>
        )}
        <View style={styles.actionRow}>
          <TouchableOpacity
            style={styles.reorderBtn}
            onPress={(e) => { e.stopPropagation(); handleReorder(item); }}
            testID={`order-reorder-${item.id}`}
            activeOpacity={0.85}
          >
            <Ionicons name="repeat" size={15} color={FUEL.ink} />
            <Text style={styles.reorderBtnText}>Reorder</Text>
          </TouchableOpacity>
          {item.order_type === 'delivery' && (
            <TouchableOpacity
              style={styles.trackBtn}
              onPress={(e) => { e.stopPropagation(); router.push({ pathname: '/delivery-tracking', params: { id: item.id } }); }}
              testID={`order-track-${item.id}`}
              activeOpacity={0.85}
            >
              <Ionicons name="navigate" size={15} color={FUEL.lime} />
              <Text style={styles.trackBtnText}>Track</Text>
            </TouchableOpacity>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  const displayOrders = activeTab === 'recent' ? recentOrders : activeTab === 'monthly' ? monthlyOrders : favoriteOrders;

  if (loading) {
    return (
      <SafeAreaView style={styles.safe} testID="orders-skeleton">
        <SkeletonList count={6} />
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
          <Ionicons name="time" size={16} color={activeTab === 'recent' ? FUEL.ink : FUEL.muted} />
          <Text style={[styles.tabText, activeTab === 'recent' && styles.tabTextActive]}>Recent</Text>
          {recentOrders.length > 0 && (
            <View style={[styles.badge, activeTab === 'recent' && styles.badgeActive]}>
              <Text style={[styles.badgeText, activeTab === 'recent' && styles.badgeTextActive]}>{recentOrders.length}</Text>
            </View>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tab, activeTab === 'monthly' && styles.tabActive]}
          onPress={() => setActiveTab('monthly')}
        >
          <Ionicons name="calendar" size={16} color={activeTab === 'monthly' ? FUEL.ink : FUEL.muted} />
          <Text style={[styles.tabText, activeTab === 'monthly' && styles.tabTextActive]}>Monthly</Text>
          {monthlyOrders.length > 0 && (
            <View style={[styles.badge, activeTab === 'monthly' && styles.badgeActive]}>
              <Text style={[styles.badgeText, activeTab === 'monthly' && styles.badgeTextActive]}>{monthlyOrders.length}</Text>
            </View>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tab, activeTab === 'favorites' && styles.tabActive]}
          onPress={() => setActiveTab('favorites')}
        >
          <Ionicons name="heart" size={16} color={activeTab === 'favorites' ? FUEL.ink : FUEL.muted} />
          <Text style={[styles.tabText, activeTab === 'favorites' && styles.tabTextActive]}>Favorites</Text>
          {favoriteOrders.length > 0 && (
            <View style={[styles.badge, activeTab === 'favorites' && styles.badgeActive]}>
              <Text style={[styles.badgeText, activeTab === 'favorites' && styles.badgeTextActive]}>{favoriteOrders.length}</Text>
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
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={FUEL.ink} />}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Ionicons name="receipt-outline" size={64} color={FUEL.sandBorder} />
            <Text style={styles.emptyTitle}>No Orders Yet</Text>
            <Text style={styles.emptyText}>
              {activeTab === 'recent'
                ? 'You haven\'t placed any orders in the last 7 days'
                : activeTab === 'monthly'
                ? 'No orders this month'
                : 'No favorite orders yet. Tap the ❤️ icon on any order to add it to favorites!'}
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
  safe: { flex: 1, backgroundColor: FUEL.sand },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  header: {
    backgroundColor: FUEL.ink,
    paddingHorizontal: SPACE.l,
    paddingVertical: SPACE.l,
  },
  headerTitle: { fontFamily: FONT.display, fontSize: 22, color: FUEL.sand, textTransform: 'uppercase', letterSpacing: 0.5 },

  tabContainer: {
    flexDirection: 'row',
    backgroundColor: FUEL.ink,
    paddingHorizontal: SPACE.l,
    paddingBottom: SPACE.m,
    gap: SPACE.s,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACE.xs,
    paddingVertical: SPACE.m,
    paddingHorizontal: SPACE.s,
    borderRadius: RADIUS.pill,
    backgroundColor: FUEL.inkSoft,
  },
  tabActive: {
    backgroundColor: FUEL.lime,
  },
  tabText: {
    fontFamily: FONT.bodyBold,
    fontSize: 11,
    color: FUEL.muted,
    textTransform: 'uppercase',
  },
  tabTextActive: {
    color: FUEL.ink,
    fontFamily: FONT.bodyExtrabold,
  },
  badge: {
    backgroundColor: FUEL.lime,
    paddingHorizontal: SPACE.s,
    paddingVertical: 2,
    borderRadius: RADIUS.sm,
    minWidth: 24,
    alignItems: 'center',
  },
  badgeActive: {
    backgroundColor: FUEL.ink,
  },
  badgeText: { fontFamily: FONT.bodyExtrabold, fontSize: 11, color: FUEL.ink },
  badgeTextActive: { color: FUEL.lime },

  summaryCard: {
    flexDirection: 'row',
    backgroundColor: FUEL.white,
    marginHorizontal: SPACE.l,
    marginTop: SPACE.l,
    borderRadius: RADIUS.md,
    padding: SPACE.l,
    borderWidth: 1,
    borderColor: FUEL.sandBorder,
  },
  summaryItem: { flex: 1, alignItems: 'center' },
  summaryValue: { fontFamily: FONT.display, fontSize: 20, color: FUEL.ink },
  summaryLabel: { fontFamily: FONT.bodyMedium, fontSize: 11, color: FUEL.muted, marginTop: SPACE.xs, textTransform: 'uppercase' },
  summaryDivider: { width: 1, backgroundColor: FUEL.sandBorder, marginHorizontal: SPACE.s },

  orderCard: {
    backgroundColor: FUEL.white,
    borderRadius: RADIUS.md,
    padding: SPACE.l,
    marginBottom: SPACE.m,
    borderWidth: 1,
    borderColor: FUEL.sandBorder,
  },
  orderHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACE.m,
  },
  orderHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: SPACE.m, flex: 1 },
  orderInfo: { flex: 1 },
  orderId: { fontFamily: FONT.bodyExtrabold, fontSize: 16, color: FUEL.ink },
  orderDate: { fontFamily: FONT.body, fontSize: 12, color: FUEL.muted, marginTop: 2 },
  orderTypeIconBadge: {
    width: 44,
    height: 44,
    borderRadius: RADIUS.md,
    backgroundColor: FUEL.limeTint,
    alignItems: 'center',
    justifyContent: 'center',
  },

  orderMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACE.m,
  },
  badgesContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.s,
    flex: 1,
    marginRight: SPACE.m,
  },
  statusBadge: {
    paddingHorizontal: SPACE.m,
    paddingVertical: SPACE.xs,
    borderRadius: RADIUS.lg,
  },
  statusText: { fontFamily: FONT.bodyExtrabold, fontSize: 9, color: FUEL.white },
  // P7: rated badge — lime chip "★ 4"
  ratedBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: FUEL.lime, paddingHorizontal: SPACE.m, paddingVertical: SPACE.xs, borderRadius: RADIUS.lg },
  ratedBadgeText: { fontFamily: FONT.bodyExtrabold, fontSize: 10, color: FUEL.ink },
  favoriteBtn: { padding: SPACE.xs, marginLeft: SPACE.s },

  listContent: { padding: SPACE.l, paddingBottom: 120 }, // clears the absolute tab bar

  orderItems: { marginBottom: SPACE.m },
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: SPACE.s, marginBottom: SPACE.s },
  dietDot: { width: 14, height: 14, borderRadius: RADIUS.xs, borderWidth: 2, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  dietDotFill: { width: 7, height: 7, borderRadius: RADIUS.xs },
  itemName: { flex: 1, fontFamily: FONT.bodySemibold, fontSize: 14, color: FUEL.ink },
  moreItems: { fontFamily: FONT.body, fontSize: 12, color: FUEL.muted, fontStyle: 'italic', marginTop: SPACE.xs },

  orderFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: SPACE.m,
    borderTopWidth: 1,
    borderTopColor: FUEL.sandBorder,
  },
  orderStats: { flexDirection: 'row', alignItems: 'center', gap: SPACE.s },
  statsText: { fontFamily: FONT.body, fontSize: 12, color: FUEL.muted },
  orderTotal: { fontFamily: FONT.display, fontSize: 20, color: FUEL.ink },

  // F6: progress tracker
  tracker: { flexDirection: 'row', marginBottom: SPACE.m },
  trackStep: { flex: 1, alignItems: 'center' },
  trackDotRow: { flexDirection: 'row', alignItems: 'center', width: '100%', justifyContent: 'center' },
  trackDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: FUEL.sandBorder },
  trackDotActive: { backgroundColor: FUEL.limeDeep },
  trackLine: { flex: 1, height: 2, backgroundColor: FUEL.sandBorder },
  trackLineActive: { backgroundColor: FUEL.limeDeep },
  trackLabel: { fontFamily: FONT.bodyBold, fontSize: 9, color: FUEL.muted, marginTop: SPACE.xs, textTransform: 'uppercase', letterSpacing: 0.2 },
  trackLabelActive: { color: FUEL.ink },

  // F6: ETA + action buttons
  etaRow: { flexDirection: 'row', alignItems: 'center', gap: SPACE.xs, marginTop: SPACE.m },
  etaText: { fontFamily: FONT.bodyExtrabold, fontSize: 12, color: FUEL.limeDeep },
  actionRow: { flexDirection: 'row', gap: SPACE.s, marginTop: SPACE.m },
  reorderBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACE.xs, paddingVertical: SPACE.m, borderRadius: RADIUS.pill, backgroundColor: FUEL.lime },
  reorderBtnText: { fontFamily: FONT.bodyExtrabold, fontSize: 13, color: FUEL.ink, textTransform: 'uppercase', letterSpacing: 0.3 },
  trackBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACE.xs, paddingVertical: SPACE.m, borderRadius: RADIUS.pill, backgroundColor: FUEL.ink },
  trackBtnText: { fontFamily: FONT.bodyExtrabold, fontSize: 13, color: FUEL.lime, textTransform: 'uppercase', letterSpacing: 0.3 },

  emptyState: {
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyTitle: { fontFamily: FONT.display, fontSize: 18, color: FUEL.ink, marginTop: SPACE.l, textTransform: 'uppercase' },
  emptyText: { fontFamily: FONT.body, fontSize: 14, color: FUEL.muted, textAlign: 'center', marginTop: SPACE.s, paddingHorizontal: SPACE.xxl },
  emptyBtn: {
    backgroundColor: FUEL.lime,
    paddingHorizontal: SPACE.xxl,
    paddingVertical: SPACE.l,
    borderRadius: RADIUS.pill,
    marginTop: SPACE.xl,
  },
  emptyBtnText: { fontFamily: FONT.display, fontSize: 15, color: FUEL.ink, textTransform: 'uppercase' },
});
