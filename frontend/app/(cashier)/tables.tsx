import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl,
  Alert, ActivityIndicator
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { apiCall } from '../../utils/api';

const PURPLE = '#5B5FE0';
const Z_RED = '#E23744';
const GREEN = '#267E3E';

export default function CashierTables() {
  const [tables, setTables] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadTables = useCallback(async () => {
    try {
      const data = await apiCall('/tables');
      setTables(data);
    } catch (e) {
      console.log('Tables error:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadTables(); }, []);
  const onRefresh = async () => { setRefreshing(true); await loadTables(); setRefreshing(false); };

  const toggleTable = async (tableNumber: number, isOccupied: boolean) => {
    try {
      if (isOccupied) {
        await apiCall(`/tables/${tableNumber}/release`, { method: 'POST' });
      } else {
        await apiCall(`/tables/${tableNumber}/occupy`, { method: 'POST' });
      }
      await loadTables();
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
  };

  if (loading) {
    return <SafeAreaView style={styles.safe}><View style={styles.center}><ActivityIndicator size="large" color={PURPLE} /></View></SafeAreaView>;
  }

  const occupied = tables.filter(t => t.is_occupied).length;

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={PURPLE} />}
        contentContainerStyle={styles.content}
      >
        <Text style={styles.title}>Tables</Text>
        <Text style={styles.sub}>{occupied}/{tables.length} occupied</Text>

        <View style={styles.legend}>
          <View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: GREEN }]} /><Text style={styles.legendText}>Available</Text></View>
          <View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: Z_RED }]} /><Text style={styles.legendText}>Occupied</Text></View>
        </View>

        <View style={styles.grid}>
          {tables.map(table => (
            <TouchableOpacity
              key={table.table_number}
              data-testid={`table-${table.table_number}`}
              style={[styles.tableCard, table.is_occupied ? styles.tableOccupied : styles.tableAvailable]}
              onPress={() => toggleTable(table.table_number, table.is_occupied)}
            >
              <Ionicons
                name={table.is_occupied ? 'people' : 'restaurant-outline'}
                size={28}
                color={table.is_occupied ? Z_RED : GREEN}
              />
              <Text style={[styles.tableNumber, { color: table.is_occupied ? Z_RED : GREEN }]}>
                T{table.table_number}
              </Text>
              <Text style={styles.tableStatus}>
                {table.is_occupied ? 'Occupied' : 'Free'}
              </Text>
              {table.is_occupied && table.occupied_by && (
                <Text style={styles.tableUser} numberOfLines={1}>{table.occupied_by}</Text>
              )}
            </TouchableOpacity>
          ))}
        </View>

        {tables.length === 0 && (
          <View style={styles.emptyState}>
            <Ionicons name="grid-outline" size={48} color="#D0D0D0" />
            <Text style={styles.emptyTitle}>No tables configured</Text>
            <Text style={styles.emptyDesc}>Ask admin to set up tables</Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F8F8F8' },
  content: { padding: 16 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 26, fontWeight: '800', color: '#1C1C2E', marginTop: 8 },
  sub: { fontSize: 13, color: '#9C9C9C', marginTop: 2, marginBottom: 16 },
  legend: { flexDirection: 'row', gap: 20, marginBottom: 20 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendText: { fontSize: 13, color: '#9C9C9C' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  tableCard: { width: '30%', aspectRatio: 1, borderRadius: 16, alignItems: 'center', justifyContent: 'center', gap: 4, borderWidth: 2 },
  tableAvailable: { backgroundColor: '#E8F5E9', borderColor: '#C8E6C9' },
  tableOccupied: { backgroundColor: '#FDE8EA', borderColor: '#FFCDD2' },
  tableNumber: { fontSize: 18, fontWeight: '800' },
  tableStatus: { fontSize: 11, color: '#9C9C9C', fontWeight: '600' },
  tableUser: { fontSize: 10, color: '#9C9C9C', maxWidth: '80%' },
  emptyState: { alignItems: 'center', padding: 40 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: '#1C1C2E', marginTop: 16 },
  emptyDesc: { fontSize: 13, color: '#9C9C9C', marginTop: 4 },
});
