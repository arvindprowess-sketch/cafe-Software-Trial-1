import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useFocusEffect } from 'expo-router';
import { apiCall } from '../utils/api';
import { FUEL, FONT, RADIUS, SPACE } from '../utils/theme';
import { SkeletonList } from './components/Skeleton';

// Tier thresholds by total_earned (mirrors backend /loyalty/points).
const TIERS = [
  { name: 'Bronze', min: 0, next: 500, color: FUEL.protein },
  { name: 'Silver', min: 500, next: 1500, color: FUEL.fat },
  { name: 'Gold', min: 1500, next: 5000, color: FUEL.carbs },
  { name: 'Platinum', min: 5000, next: null as number | null, color: FUEL.limeDeep },
];
const tierMeta = (name: string) => TIERS.find(t => t.name === name) || TIERS[0];

// Redeem is gated until Phase-2 wires the discount into checkout (owner call).
const REDEEM_ENABLED = false;
const REDEEM_CHIPS = [50, 100, 200];

function fmtDate(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

export default function RewardsScreen() {
  const router = useRouter();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try { setData(await apiCall('/loyalty/points')); } catch {} finally { setLoading(false); }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const points = data?.points || 0;
  const totalEarned = data?.total_earned || 0;
  const totalRedeemed = data?.total_redeemed || 0;
  const tier = data?.tier || 'Bronze';
  const meta = tierMeta(tier);
  const history: any[] = Array.isArray(data?.history) ? [...data.history].reverse() : [];

  // Progress toward the next tier.
  const nextAt = meta.next;
  const pct = nextAt ? Math.min(100, Math.max(0, ((totalEarned - meta.min) / (nextAt - meta.min)) * 100)) : 100;
  const toNext = nextAt ? Math.max(0, nextAt - totalEarned) : 0;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} testID="rewards-back">
          <Ionicons name="arrow-back" size={22} color={FUEL.sand} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Rewards</Text>
        <View style={{ width: 40 }} />
      </View>

      {loading ? (
        <SkeletonList count={5} />
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: SPACE.l, paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={FUEL.ink} />}
        >
          {/* Balance + tier */}
          <View style={styles.balanceCard}>
            <View style={styles.balanceTop}>
              <View>
                <Text style={styles.balanceLabel}>YOUR POINTS</Text>
                <Text style={styles.balanceValue} testID="rewards-balance">{points}</Text>
              </View>
              <View style={[styles.tierBadge, { backgroundColor: meta.color }]} testID="tier-badge">
                <Ionicons name="ribbon" size={14} color={FUEL.ink} />
                <Text style={styles.tierBadgeText}>{tier}</Text>
              </View>
            </View>

            <View style={styles.tierProgressWrap}>
              <View style={styles.tierProgressBg}>
                <View style={[styles.tierProgressFill, { width: `${pct}%`, backgroundColor: meta.color }]} />
              </View>
              <Text style={styles.tierProgressText}>
                {nextAt ? `${toNext} pts to ${TIERS[TIERS.indexOf(meta) + 1]?.name}` : 'Top tier reached 🎉'}
              </Text>
            </View>

            <View style={styles.balanceStatsRow}>
              <View style={styles.balanceStat}><Text style={styles.balanceStatN}>{totalEarned}</Text><Text style={styles.balanceStatL}>earned</Text></View>
              <View style={styles.balanceStatDivider} />
              <View style={styles.balanceStat}><Text style={styles.balanceStatN}>{totalRedeemed}</Text><Text style={styles.balanceStatL}>redeemed</Text></View>
            </View>
          </View>

          {/* Redeem (gated) */}
          <View style={styles.sectionHeadRow}>
            <Text style={styles.sectionTitle}>Redeem</Text>
            {!REDEEM_ENABLED && <View style={styles.soonPill}><Text style={styles.soonPillText}>COMING SOON</Text></View>}
          </View>
          <View style={styles.redeemCard}>
            <Text style={styles.redeemRate}>10 points = ₹1 · minimum 50 points</Text>
            <View style={styles.chipRow}>
              {REDEEM_CHIPS.map(v => (
                <View key={v} testID={`redeem-${v}`} style={[styles.chip, styles.chipDisabled]}>
                  <Text style={styles.chipTextDisabled}>{v} pts</Text>
                  <Text style={styles.chipSub}>₹{v / 10}</Text>
                </View>
              ))}
            </View>
            <View style={[styles.redeemBtn, styles.redeemBtnDisabled]} testID="redeem-btn">
              <Ionicons name="lock-closed" size={15} color={FUEL.muted} />
              <Text style={styles.redeemBtnTextDisabled}>Redeem unlocks soon</Text>
            </View>
            <Text style={styles.redeemNote}>You'll be able to spend points as a discount at checkout in an upcoming update. Keep earning — points never expire here.</Text>
          </View>

          {/* History */}
          <Text style={[styles.sectionTitle, { marginTop: SPACE.l }]}>History</Text>
          {history.length === 0 ? (
            <View style={styles.emptyHistory}>
              <Ionicons name="sparkles-outline" size={34} color={FUEL.sandBorder} />
              <Text style={styles.emptyText}>No points activity yet</Text>
              <Text style={styles.emptySub}>Earn points automatically on every paid order.</Text>
            </View>
          ) : history.map((h, i) => {
            const earned = h.type === 'earned';
            return (
              <View key={i} style={styles.historyRow} testID="rewards-history-row">
                <View style={[styles.historyIcon, { backgroundColor: earned ? FUEL.limeTint : FUEL.proteinTint }]}>
                  <Ionicons name={earned ? 'add' : 'remove'} size={16} color={earned ? FUEL.limeDeep : FUEL.protein} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.historyTitle}>{earned ? 'Points earned' : `Redeemed for ₹${h.discount ?? Math.abs(h.points) / 10}`}</Text>
                  <Text style={styles.historyDate}>{fmtDate(h.date)}{h.order_id ? ` · order #${String(h.order_id).slice(-6)}` : ''}</Text>
                </View>
                <Text style={[styles.historyPts, { color: earned ? FUEL.limeDeep : FUEL.protein }]}>
                  {earned ? '+' : ''}{h.points}
                </Text>
              </View>
            );
          })}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: FUEL.sand },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: SPACE.l, paddingVertical: SPACE.m, backgroundColor: FUEL.ink },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: FUEL.inkSoft, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontFamily: FONT.display, fontSize: 20, color: FUEL.sand, letterSpacing: 0.5 },

  balanceCard: { backgroundColor: FUEL.ink, borderRadius: RADIUS.lg, padding: SPACE.l },
  balanceTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  balanceLabel: { fontFamily: FONT.bodyExtrabold, fontSize: 10.5, letterSpacing: 1, color: 'rgba(244,241,233,0.6)' },
  balanceValue: { fontFamily: FONT.display, fontSize: 48, color: FUEL.lime, lineHeight: 52 },
  tierBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: RADIUS.pill, paddingHorizontal: SPACE.m, paddingVertical: 6 },
  tierBadgeText: { fontFamily: FONT.bodyExtrabold, fontSize: 12, color: FUEL.ink, letterSpacing: 0.5 },

  tierProgressWrap: { marginTop: SPACE.m },
  tierProgressBg: { height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.12)', overflow: 'hidden' },
  tierProgressFill: { height: 8, borderRadius: 4 },
  tierProgressText: { fontFamily: FONT.bodyMedium, fontSize: 11.5, color: 'rgba(244,241,233,0.75)', marginTop: 6 },

  balanceStatsRow: { flexDirection: 'row', alignItems: 'center', marginTop: SPACE.l, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: RADIUS.md, paddingVertical: SPACE.m },
  balanceStat: { flex: 1, alignItems: 'center' },
  balanceStatN: { fontFamily: FONT.display, fontSize: 20, color: FUEL.sand },
  balanceStatL: { fontFamily: FONT.body, fontSize: 11, color: 'rgba(244,241,233,0.6)' },
  balanceStatDivider: { width: 1, alignSelf: 'stretch', backgroundColor: 'rgba(255,255,255,0.12)' },

  sectionHeadRow: { flexDirection: 'row', alignItems: 'center', gap: SPACE.s, marginTop: SPACE.xl, marginBottom: SPACE.s },
  sectionTitle: { fontFamily: FONT.display, fontSize: 18, color: FUEL.ink, letterSpacing: 0.3 },
  soonPill: { backgroundColor: FUEL.sandBorder, borderRadius: RADIUS.pill, paddingHorizontal: SPACE.s, paddingVertical: 3 },
  soonPillText: { fontFamily: FONT.bodyExtrabold, fontSize: 9, color: FUEL.muted, letterSpacing: 0.6 },

  redeemCard: { backgroundColor: FUEL.white, borderRadius: RADIUS.md, padding: SPACE.l, borderWidth: 1, borderColor: FUEL.sandBorder },
  redeemRate: { fontFamily: FONT.bodySemibold, fontSize: 12.5, color: FUEL.muted, marginBottom: SPACE.m },
  chipRow: { flexDirection: 'row', gap: SPACE.s },
  chip: { flex: 1, alignItems: 'center', borderRadius: RADIUS.md, paddingVertical: SPACE.m, borderWidth: 1.5, borderColor: FUEL.sandBorder, backgroundColor: FUEL.sand },
  chipDisabled: { opacity: 0.55 },
  chipTextDisabled: { fontFamily: FONT.bodyExtrabold, fontSize: 14, color: FUEL.ink },
  chipSub: { fontFamily: FONT.body, fontSize: 11, color: FUEL.muted, marginTop: 2 },
  redeemBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACE.s, borderRadius: RADIUS.pill, paddingVertical: SPACE.m, marginTop: SPACE.m },
  redeemBtnDisabled: { backgroundColor: FUEL.sand, borderWidth: 1, borderColor: FUEL.sandBorder },
  redeemBtnTextDisabled: { fontFamily: FONT.bodyExtrabold, fontSize: 13, color: FUEL.muted, letterSpacing: 0.3 },
  redeemNote: { fontFamily: FONT.body, fontSize: 11.5, color: FUEL.muted, lineHeight: 17, marginTop: SPACE.m },

  emptyHistory: { alignItems: 'center', gap: SPACE.s, paddingVertical: SPACE.xl },
  emptyText: { fontFamily: FONT.bodyExtrabold, fontSize: 14, color: FUEL.ink, marginTop: SPACE.s },
  emptySub: { fontFamily: FONT.body, fontSize: 12, color: FUEL.muted, textAlign: 'center' },

  historyRow: { flexDirection: 'row', alignItems: 'center', gap: SPACE.m, backgroundColor: FUEL.white, borderRadius: RADIUS.md, padding: SPACE.m, borderWidth: 1, borderColor: FUEL.sandBorder, marginTop: SPACE.s },
  historyIcon: { width: 36, height: 36, borderRadius: RADIUS.sm, alignItems: 'center', justifyContent: 'center' },
  historyTitle: { fontFamily: FONT.bodyExtrabold, fontSize: 13.5, color: FUEL.ink },
  historyDate: { fontFamily: FONT.body, fontSize: 11.5, color: FUEL.muted, marginTop: 1 },
  historyPts: { fontFamily: FONT.display, fontSize: 18 },
});
