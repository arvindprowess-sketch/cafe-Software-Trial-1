import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useFocusEffect } from 'expo-router';
import { apiCall } from '../utils/api';
import { FUEL, FONT, RADIUS, SPACE } from '../utils/theme';

// /user/history returns per-day meal_history docs:
//   { date: "YYYY-MM-DD", meals: [{order_id, calories, protein, carbs, fat, time}],
//     total_calories, total_protein, total_carbs, total_fat }
function fmtDate(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
}

export default function HistoryScreen() {
  const router = useRouter();
  const [days, setDays] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const d = await apiCall('/user/history');
      setDays(Array.isArray(d) ? d : []);
    } catch {} finally { setLoading(false); }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} testID="history-back">
          <Ionicons name="arrow-back" size={22} color={FUEL.sand} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Meal History</Text>
        <View style={{ width: 40 }} />
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={FUEL.ink} /></View>
      ) : (
        <ScrollView
          contentContainerStyle={days.length === 0 ? styles.emptyWrap : { padding: SPACE.l, paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={FUEL.ink} />}
          testID="history-list"
        >
          {days.length === 0 ? (
            <View style={styles.empty} testID="history-empty">
              <Ionicons name="time-outline" size={44} color={FUEL.sandBorder} />
              <Text style={styles.emptyText}>No meal history yet</Text>
              <Text style={styles.emptySub}>Your daily meals and macros will appear here after your orders.</Text>
            </View>
          ) : days.map((day) => {
            const meals = Array.isArray(day.meals) ? day.meals : [];
            return (
              <View key={day.date} style={styles.dayCard} testID={`history-row-${day.date}`}>
                <View style={styles.dayHeader}>
                  <Text style={styles.dayDate}>{fmtDate(day.date)}</Text>
                  <Text style={styles.dayMeals}>{meals.length} meal{meals.length === 1 ? '' : 's'}</Text>
                </View>
                <View style={styles.macroRow}>
                  <View style={styles.macroCell}><Text style={styles.macroBig}>{Math.round(day.total_calories || 0)}</Text><Text style={styles.macroLbl}>kcal</Text></View>
                  <View style={styles.macroCell}><Text style={[styles.macroBig, { color: FUEL.protein }]}>{Math.round(day.total_protein || 0)}g</Text><Text style={styles.macroLbl}>protein</Text></View>
                  <View style={styles.macroCell}><Text style={[styles.macroBig, { color: FUEL.carbs }]}>{Math.round(day.total_carbs || 0)}g</Text><Text style={styles.macroLbl}>carbs</Text></View>
                  <View style={styles.macroCell}><Text style={[styles.macroBig, { color: FUEL.fat }]}>{Math.round(day.total_fat || 0)}g</Text><Text style={styles.macroLbl}>fat</Text></View>
                </View>
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

  dayCard: { backgroundColor: FUEL.white, borderRadius: RADIUS.md, padding: SPACE.l, borderWidth: 1, borderColor: FUEL.sandBorder, marginBottom: SPACE.m },
  dayHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: SPACE.m },
  dayDate: { fontFamily: FONT.bodyExtrabold, fontSize: 14, color: FUEL.ink },
  dayMeals: { fontFamily: FONT.bodyMedium, fontSize: 12, color: FUEL.muted },
  macroRow: { flexDirection: 'row' },
  macroCell: { flex: 1, alignItems: 'center' },
  macroBig: { fontFamily: FONT.display, fontSize: 18, color: FUEL.ink },
  macroLbl: { fontFamily: FONT.body, fontSize: 11, color: FUEL.muted, marginTop: 2 },

  emptyWrap: { flexGrow: 1, justifyContent: 'center' },
  empty: { alignItems: 'center', padding: SPACE.xl, gap: SPACE.s },
  emptyText: { fontFamily: FONT.bodyExtrabold, fontSize: 15, color: FUEL.ink, marginTop: SPACE.s },
  emptySub: { fontFamily: FONT.body, fontSize: 12.5, color: FUEL.muted, textAlign: 'center' },
});
