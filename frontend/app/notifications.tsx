import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useFocusEffect } from 'expo-router';
import { apiCall } from '../utils/api';
import { FUEL, FONT, RADIUS, SPACE } from '../utils/theme';

// Map notification type -> icon (falls back to a bell).
const TYPE_ICON: Record<string, string> = {
  new_order: 'receipt',
  scheduled_order: 'time',
  order_status: 'bicycle',
  offer: 'pricetag',
  promo: 'megaphone',
};

// Compact relative time ("2h", "3d") from an ISO string.
function timeAgo(iso?: string): string {
  if (!iso) return '';
  const then = new Date(iso).getTime();
  if (isNaN(then)) return '';
  const s = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (s < 60) return 'now';
  const m = Math.floor(s / 60); if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24); if (d < 7) return `${d}d`;
  return `${Math.floor(d / 7)}w`;
}

export default function NotificationsScreen() {
  const router = useRouter();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try { setItems(await apiCall('/notifications')); } catch {} finally { setLoading(false); }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const markRead = async (n: any) => {
    if (!n.read) {
      setItems(prev => prev.map(x => x.id === n.id ? { ...x, read: true } : x)); // optimistic
      try { await apiCall(`/notifications/${n.id}/read`, { method: 'PUT' }); } catch {}
    }
    if (n.order_id) router.push({ pathname: '/order-detail', params: { orderId: n.order_id } });
  };

  const markAllRead = async () => {
    if (!items.some(x => !x.read)) return;
    setItems(prev => prev.map(x => ({ ...x, read: true })));
    try { await apiCall('/notifications/read-all', { method: 'PUT' }); } catch {}
  };

  const unread = items.filter(x => !x.read).length;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} testID="notif-back">
          <Ionicons name="arrow-back" size={22} color={FUEL.sand} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Notifications</Text>
        {unread > 0 ? (
          <TouchableOpacity onPress={markAllRead} testID="notif-mark-all"><Text style={styles.markAll}>Mark all</Text></TouchableOpacity>
        ) : <View style={{ width: 60 }} />}
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={FUEL.ink} /></View>
      ) : (
        <ScrollView
          contentContainerStyle={items.length === 0 ? styles.emptyWrap : styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={FUEL.ink} />}
          showsVerticalScrollIndicator={false}
        >
          {items.length === 0 ? (
            <View style={styles.empty} testID="notif-empty">
              <Ionicons name="notifications-off-outline" size={44} color={FUEL.sandBorder} />
              <Text style={styles.emptyText}>No notifications yet</Text>
              <Text style={styles.emptySub}>Order updates and offers will show up here.</Text>
            </View>
          ) : items.map((n) => (
            <TouchableOpacity
              key={n.id}
              testID={`notif-row-${n.id}`}
              style={[styles.card, !n.read && styles.cardUnread]}
              activeOpacity={0.85}
              onPress={() => markRead(n)}
            >
              <View style={[styles.iconBox, !n.read && styles.iconBoxUnread]}>
                <Ionicons name={(TYPE_ICON[n.type] as any) || 'notifications'} size={18} color={!n.read ? FUEL.ink : FUEL.limeDeep} />
              </View>
              <View style={{ flex: 1 }}>
                <View style={styles.cardTop}>
                  <Text style={styles.cardTitle} numberOfLines={1}>{n.title || 'Update'}</Text>
                  <Text style={styles.cardTime}>{timeAgo(n.created_at)}</Text>
                </View>
                {!!n.body && <Text style={styles.cardBody} numberOfLines={2}>{n.body}</Text>}
              </View>
              {!n.read && <View style={styles.unreadDot} />}
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: FUEL.sand },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: SPACE.l, paddingVertical: SPACE.m, backgroundColor: FUEL.ink },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: FUEL.inkSoft, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontFamily: FONT.display, fontSize: 20, color: FUEL.sand, letterSpacing: 0.5 },
  markAll: { fontFamily: FONT.bodyExtrabold, fontSize: 12, color: FUEL.lime, width: 60, textAlign: 'right' },

  list: { padding: SPACE.l, gap: SPACE.m },
  card: { flexDirection: 'row', alignItems: 'center', gap: SPACE.m, backgroundColor: FUEL.white, borderRadius: RADIUS.md, padding: SPACE.m, borderWidth: 1, borderColor: FUEL.sandBorder },
  cardUnread: { borderColor: FUEL.lime, backgroundColor: '#FCFEF5' },
  iconBox: { width: 40, height: 40, borderRadius: RADIUS.sm, backgroundColor: FUEL.limeTint, alignItems: 'center', justifyContent: 'center' },
  iconBoxUnread: { backgroundColor: FUEL.lime },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: SPACE.s },
  cardTitle: { flex: 1, fontFamily: FONT.bodyExtrabold, fontSize: 14, color: FUEL.ink },
  cardTime: { fontFamily: FONT.bodyMedium, fontSize: 11, color: FUEL.muted },
  cardBody: { fontFamily: FONT.body, fontSize: 12.5, color: FUEL.muted, marginTop: 2, lineHeight: 17 },
  unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: FUEL.lime },

  emptyWrap: { flexGrow: 1, justifyContent: 'center' },
  empty: { alignItems: 'center', padding: SPACE.xl, gap: SPACE.s },
  emptyText: { fontFamily: FONT.bodyExtrabold, fontSize: 15, color: FUEL.ink, marginTop: SPACE.s },
  emptySub: { fontFamily: FONT.body, fontSize: 12.5, color: FUEL.muted, textAlign: 'center' },
});
