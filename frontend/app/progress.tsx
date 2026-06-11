import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput,
  ActivityIndicator, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { apiCall } from '../utils/api';
import { FUEL, FONT, RADIUS, SPACE } from '../utils/theme';

// Phase 4 — Progress: weight log + simple graph + streak/points (customer app only).
export default function ProgressScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [data, setData] = useState<any>(null);
  const [weight, setWeight] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const d = await apiCall('/user/weight-log');
      setData(d);
      if (d?.latest_weight && !weight) setWeight(String(d.latest_weight));
    } catch {}
    finally { setLoading(false); }
  }, [weight]);

  useEffect(() => { load(); }, []);
  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const logWeight = async () => {
    setError('');
    const w = parseFloat(weight);
    if (!w || w < 25 || w > 400) { setError('Enter a valid weight in kg.'); return; }
    setSaving(true);
    try {
      const d = await apiCall('/user/weight-log', { method: 'POST', body: { weight_kg: w } });
      setData(d);
    } catch (e: any) { setError(e.message || 'Could not save.'); }
    finally { setSaving(false); }
  };

  if (loading) {
    return <SafeAreaView style={styles.safe}><View style={styles.center}><ActivityIndicator size="large" color={FUEL.ink} /></View></SafeAreaView>;
  }

  const logs: any[] = (data?.logs || []).slice(-14);
  const weights = logs.map(l => l.weight_kg);
  const minW = weights.length ? Math.min(...weights) : 0;
  const maxW = weights.length ? Math.max(...weights) : 1;
  const range = Math.max(1, maxW - minW);
  const barH = (w: number) => 24 + ((w - minW) / range) * 96; // 24..120px

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity testID="progress-back" style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={22} color={FUEL.sand} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Progress</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>

        {/* Streak + points */}
        <View style={styles.statsRow}>
          <View style={styles.statCard} testID="progress-streak">
            <Ionicons name="flame" size={20} color={FUEL.protein} />
            <Text style={styles.statBig}>{data?.current_streak || 0}</Text>
            <Text style={styles.statLbl}>day streak</Text>
          </View>
          <View style={styles.statCard} testID="progress-points">
            <Ionicons name="star" size={20} color={FUEL.carbs} />
            <Text style={styles.statBig}>{data?.points || 0}</Text>
            <Text style={styles.statLbl}>points</Text>
          </View>
          <View style={styles.statCard} testID="progress-change">
            <Ionicons name={(data?.change || 0) <= 0 ? 'trending-down' : 'trending-up'} size={20} color={FUEL.limeDeep} />
            <Text style={styles.statBig}>{data?.change != null ? `${data.change > 0 ? '+' : ''}${data.change}` : '—'}</Text>
            <Text style={styles.statLbl}>kg change</Text>
          </View>
        </View>

        {/* Log weight */}
        <View style={styles.logCard}>
          <Text style={styles.logLabel}>Log today's weight (kg)</Text>
          <View style={styles.logRow}>
            <TextInput testID="progress-weight-input" style={styles.input} value={weight} onChangeText={setWeight}
              keyboardType="decimal-pad" placeholder="e.g. 74.5" placeholderTextColor="#B8B4A6" />
            <TouchableOpacity testID="progress-log-btn" style={styles.logBtn} onPress={logWeight} disabled={saving}>
              <Text style={styles.logBtnText}>{saving ? '…' : 'Log'}</Text>
            </TouchableOpacity>
          </View>
          {error ? <Text style={styles.error} testID="progress-error">{error}</Text> : null}
        </View>

        {/* Graph */}
        <Text style={styles.sectionTitle}>Weight over time</Text>
        {logs.length === 0 ? (
          <View style={styles.emptyGraph} testID="progress-graph-empty"><Text style={styles.emptyText}>Log your weight to see your trend here.</Text></View>
        ) : (
          <View style={styles.graphCard} testID="progress-graph">
            <View style={styles.bars}>
              {logs.map((l, i) => (
                <View key={i} style={styles.barCol}>
                  <Text style={styles.barVal}>{l.weight_kg}</Text>
                  <View style={[styles.bar, { height: barH(l.weight_kg) }]} />
                  <Text style={styles.barDate}>{l.date.slice(5)}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Summary */}
        <View style={styles.summaryRow}>
          <View style={styles.sumBox}><Text style={styles.sumLbl}>Start</Text><Text style={styles.sumVal}>{data?.start_weight ?? '—'} kg</Text></View>
          <View style={styles.sumBox}><Text style={styles.sumLbl}>Latest</Text><Text style={styles.sumVal}>{data?.latest_weight ?? '—'} kg</Text></View>
          <View style={styles.sumBox}><Text style={styles.sumLbl}>Target</Text><Text style={styles.sumVal}>{data?.target_weight_kg ?? '—'} kg</Text></View>
        </View>

        <Text style={styles.disclaimer}>Progress isn't linear — celebrate the trend, not a single day. This isn't medical advice.</Text>
        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: FUEL.sand },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: FUEL.ink, paddingHorizontal: SPACE.m, paddingVertical: SPACE.m },
  backBtn: { width: 40, height: 40, borderRadius: RADIUS.lg, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontFamily: FONT.display, fontSize: 20, color: FUEL.sand, textTransform: 'uppercase', letterSpacing: 1 },
  content: { padding: SPACE.l },
  statsRow: { flexDirection: 'row', gap: SPACE.m, marginBottom: SPACE.l },
  statCard: { flex: 1, alignItems: 'center', backgroundColor: FUEL.white, borderRadius: RADIUS.md, paddingVertical: SPACE.l, borderWidth: 1, borderColor: FUEL.sandBorder, gap: 2 },
  statBig: { fontFamily: FONT.display, fontSize: 26, color: FUEL.ink },
  statLbl: { fontSize: 11, color: FUEL.muted },
  logCard: { backgroundColor: FUEL.white, borderRadius: RADIUS.md, padding: SPACE.l, borderWidth: 1, borderColor: FUEL.sandBorder, marginBottom: SPACE.l },
  logLabel: { fontSize: 13, fontFamily: FONT.bodyBold, color: FUEL.ink, marginBottom: SPACE.s },
  logRow: { flexDirection: 'row', gap: SPACE.m },
  input: { flex: 1, backgroundColor: FUEL.sand, borderRadius: RADIUS.sm, borderWidth: 1.5, borderColor: FUEL.sandBorder, padding: SPACE.m, fontSize: 17, fontFamily: FONT.bodyBold, color: FUEL.ink },
  logBtn: { backgroundColor: FUEL.lime, borderRadius: RADIUS.sm, paddingHorizontal: SPACE.xl, alignItems: 'center', justifyContent: 'center' },
  logBtnText: { fontFamily: FONT.display, fontSize: 16, color: FUEL.ink, textTransform: 'uppercase' },
  error: { color: FUEL.error, fontSize: 12.5, fontFamily: FONT.bodySemibold, marginTop: SPACE.s },
  sectionTitle: { fontFamily: FONT.display, fontSize: 18, color: FUEL.ink, textTransform: 'uppercase', marginBottom: SPACE.m },
  emptyGraph: { backgroundColor: FUEL.white, borderRadius: RADIUS.md, padding: SPACE.xl, borderWidth: 1, borderColor: FUEL.sandBorder, alignItems: 'center', marginBottom: SPACE.l },
  emptyText: { fontSize: 13, color: FUEL.muted },
  graphCard: { backgroundColor: FUEL.white, borderRadius: RADIUS.md, padding: SPACE.l, borderWidth: 1, borderColor: FUEL.sandBorder, marginBottom: SPACE.l },
  bars: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-around', minHeight: 150 },
  barCol: { alignItems: 'center', flex: 1 },
  barVal: { fontSize: 9.5, color: FUEL.muted, marginBottom: 3 },
  bar: { width: 14, borderRadius: RADIUS.xs, backgroundColor: FUEL.limeDeep },
  barDate: { fontSize: 9, color: FUEL.muted, marginTop: SPACE.xs },
  summaryRow: { flexDirection: 'row', gap: SPACE.m, marginBottom: SPACE.l },
  sumBox: { flex: 1, alignItems: 'center', backgroundColor: FUEL.ink, borderRadius: RADIUS.md, paddingVertical: SPACE.m },
  sumLbl: { fontSize: 11, color: FUEL.sand, opacity: 0.7 },
  sumVal: { fontSize: 16, color: FUEL.lime, fontFamily: FONT.bodyExtrabold, marginTop: 2 },
  disclaimer: { fontSize: 11.5, color: '#9C9883', lineHeight: 16, fontStyle: 'italic' },
});
