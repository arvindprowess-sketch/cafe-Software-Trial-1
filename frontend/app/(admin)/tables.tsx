import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator,
  RefreshControl, Alert
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { apiCall } from '../../utils/api';

const Z_RED = '#E23744';
const GREEN = '#267E3E';
const PURPLE = '#5B5FE0';
const ORANGE = '#FF9F0A';

export default function TablesScreen() {
  const router = useRouter();
  const [tables, setTables] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    loadTables();
  }, []);

  const loadTables = async () => {
    try {
      const data = await apiCall('/tables');
      setTables(data);
    } catch (e) {
      console.error('Tables error:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const releaseTable = async (tableNumber: number) => {
    Alert.alert(
      'Release Table',
      `Are you sure you want to release Table ${tableNumber}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Release',
          style: 'destructive',
          onPress: async () => {
            try {
              await apiCall(`/tables/${tableNumber}/release`, { method: 'POST' });
              loadTables();
            } catch (e: any) {
              Alert.alert('Error', e.message);
            }
          }
        }
      ]
    );
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'available': return GREEN;
      case 'occupied': return Z_RED;
      case 'reserved': return ORANGE;
      default: return '#9C9C9C';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'available': return 'checkmark-circle';
      case 'occupied': return 'people';
      case 'reserved': return 'time';
      default: return 'help-circle';
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={Z_RED} />
        </View>
      </SafeAreaView>
    );
  }

  const availableCount = tables.filter(t => t.status === 'available').length;
  const occupiedCount = tables.filter(t => t.status === 'occupied').length;

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#1C1C2E" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Manage Tables</Text>
        <TouchableOpacity onPress={loadTables} style={styles.refreshBtn}>
          <Ionicons name="refresh" size={22} color="#696969" />
        </TouchableOpacity>
      </View>

      {/* Summary Cards */}
      <View style={styles.summaryRow}>
        <View style={[styles.summaryCard, { backgroundColor: GREEN }]}>
          <Ionicons name="checkmark-circle" size={24} color="#FFF" />
          <Text style={styles.summaryValue}>{availableCount}</Text>
          <Text style={styles.summaryLabel}>Available</Text>
        </View>
        <View style={[styles.summaryCard, { backgroundColor: Z_RED }]}>
          <Ionicons name="people" size={24} color="#FFF" />
          <Text style={styles.summaryValue}>{occupiedCount}</Text>
          <Text style={styles.summaryLabel}>Occupied</Text>
        </View>
        <View style={[styles.summaryCard, { backgroundColor: PURPLE }]}>
          <Ionicons name="grid" size={24} color="#FFF" />
          <Text style={styles.summaryValue}>{tables.length}</Text>
          <Text style={styles.summaryLabel}>Total</Text>
        </View>
      </View>

      <ScrollView 
        style={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadTables(); }} tintColor={Z_RED} />}
      >
        <Text style={styles.sectionTitle}>All Tables</Text>

        <View style={styles.tablesGrid}>
          {tables.map(table => (
            <View key={table.id} style={styles.tableCard}>
              <View style={[styles.statusIndicator, { backgroundColor: getStatusColor(table.status) }]}>
                <Ionicons name={getStatusIcon(table.status) as any} size={16} color="#FFF" />
              </View>
              
              <View style={styles.tableIconBg}>
                <Ionicons name="restaurant" size={28} color={getStatusColor(table.status)} />
              </View>
              
              <Text style={styles.tableNumber}>Table {table.table_number}</Text>
              <Text style={styles.tableSeats}>{table.seats} Seats</Text>
              
              <View style={[styles.statusBadge, { backgroundColor: `${getStatusColor(table.status)}15` }]}>
                <Text style={[styles.statusText, { color: getStatusColor(table.status) }]}>
                  {table.status.charAt(0).toUpperCase() + table.status.slice(1)}
                </Text>
              </View>

              {table.status === 'occupied' && (
                <TouchableOpacity 
                  style={styles.releaseBtn}
                  onPress={() => releaseTable(table.table_number)}
                >
                  <Text style={styles.releaseBtnText}>Release</Text>
                </TouchableOpacity>
              )}

              {/* QR Code Info */}
              <View style={styles.qrInfo}>
                <Ionicons name="qr-code" size={14} color="#9C9C9C" />
                <Text style={styles.qrText}>{table.qr_code}</Text>
              </View>
            </View>
          ))}
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F8F8F8' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  
  // Header
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#FFF', paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#EFEFEF' },
  backBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#1C1C2E' },
  refreshBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  
  // Summary
  summaryRow: { flexDirection: 'row', gap: 10, padding: 16 },
  summaryCard: { flex: 1, borderRadius: 14, padding: 14, alignItems: 'center' },
  summaryValue: { fontSize: 24, fontWeight: '800', color: '#FFF', marginTop: 6 },
  summaryLabel: { fontSize: 11, color: 'rgba(255,255,255,0.8)', marginTop: 2 },
  
  scroll: { flex: 1 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#1C1C2E', paddingHorizontal: 16, marginBottom: 12 },
  
  // Tables Grid
  tablesGrid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 12, gap: 12 },
  tableCard: { width: '47%', backgroundColor: '#FFF', borderRadius: 16, padding: 16, alignItems: 'center', borderWidth: 1, borderColor: '#EFEFEF', position: 'relative' },
  statusIndicator: { position: 'absolute', top: 10, right: 10, width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  tableIconBg: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#F5F5F5', alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  tableNumber: { fontSize: 18, fontWeight: '800', color: '#1C1C2E' },
  tableSeats: { fontSize: 12, color: '#9C9C9C', marginTop: 2 },
  statusBadge: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 10, marginTop: 10 },
  statusText: { fontSize: 12, fontWeight: '600' },
  releaseBtn: { backgroundColor: '#FDE8EA', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8, marginTop: 10 },
  releaseBtnText: { fontSize: 12, fontWeight: '600', color: Z_RED },
  qrInfo: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 10 },
  qrText: { fontSize: 9, color: '#B0B0B0' },
});
