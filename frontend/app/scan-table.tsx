import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Alert, ActivityIndicator, Platform
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { apiCall } from '../utils/api';

const Z_RED = '#D62300';
const GREEN = '#509E2F';
const PURPLE = '#FF8732';

export default function ScanTableScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [loading, setLoading] = useState(false);
  const [tableInfo, setTableInfo] = useState<any>(null);
  const [manualTable, setManualTable] = useState('');

  // If table number passed directly (manual entry)
  useEffect(() => {
    if (params.table) {
      handleTableNumber(parseInt(params.table as string));
    }
  }, [params.table]);

  const handleBarCodeScanned = async ({ type, data }: { type: string, data: string }) => {
    if (scanned) return;
    setScanned(true);
    
    // Parse QR code - expected format: DIETCAFE-TABLE-{number}
    const match = data.match(/DIETCAFE-TABLE-(\d+)/i);
    if (match) {
      await handleTableNumber(parseInt(match[1]));
    } else {
      Alert.alert('Invalid QR', 'This QR code is not from Diet Café', [
        { text: 'Scan Again', onPress: () => setScanned(false) }
      ]);
    }
  };

  const handleTableNumber = async (tableNum: number) => {
    setLoading(true);
    try {
      // Get table info
      const table = await apiCall(`/tables/${tableNum}`);
      setTableInfo(table);
      
      // Occupy the table
      await apiCall(`/tables/${tableNum}/occupy`, { method: 'POST' });
      
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Could not access table');
      setScanned(false);
    } finally {
      setLoading(false);
    }
  };

  const startOrdering = () => {
    router.push({
      pathname: '/(tabs)/menu',
      params: { tableNumber: tableInfo.table_number, orderType: 'dine-in' }
    });
  };

  if (!permission) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={Z_RED} />
        </View>
      </SafeAreaView>
    );
  }

  if (!permission.granted) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.permissionBox}>
          <Ionicons name="camera" size={60} color={Z_RED} />
          <Text style={styles.permTitle}>Camera Permission</Text>
          <Text style={styles.permDesc}>We need camera access to scan table QR codes</Text>
          <TouchableOpacity style={styles.permBtn} onPress={requestPermission}>
            <Text style={styles.permBtnText}>Allow Camera</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.manualBtn} onPress={() => router.push('/table-select')}>
            <Text style={styles.manualBtnText}>Enter Table Manually</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // Table confirmed - show options
  if (tableInfo) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={24} color="#1C1C2E" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Your Table</Text>
          <View style={{ width: 40 }} />
        </View>

        <View style={styles.tableCard}>
          <View style={styles.tableIconBg}>
            <Ionicons name="restaurant" size={40} color="#FFF" />
          </View>
          <Text style={styles.tableNumber}>Table {tableInfo.table_number}</Text>
          <Text style={styles.tableSeats}>{tableInfo.seats} Seats</Text>
          
          <View style={styles.statusBadge}>
            <Ionicons name="checkmark-circle" size={18} color={GREEN} />
            <Text style={styles.statusText}>Reserved for you</Text>
          </View>

          {tableInfo.current_order && (
            <View style={styles.existingOrder}>
              <Ionicons name="receipt" size={18} color={PURPLE} />
              <Text style={styles.existingOrderText}>
                You have an ongoing order (₹{Math.round(tableInfo.current_order.total_price)})
              </Text>
            </View>
          )}
        </View>

        <View style={styles.actions}>
          <TouchableOpacity style={styles.primaryBtn} onPress={startOrdering}>
            <Ionicons name="add-circle" size={22} color="#FFF" />
            <Text style={styles.primaryBtnText}>Start Ordering</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={styles.secondaryBtn} 
            onPress={() => router.push({ pathname: '/(tabs)/budget-meal', params: { tableNumber: tableInfo.table_number } })}
          >
            <Ionicons name="wallet" size={20} color={PURPLE} />
            <Text style={styles.secondaryBtnText}>Budget Meal Builder</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={styles.secondaryBtn} 
            onPress={() => router.push('/ai-chat')}
          >
            <Ionicons name="chatbubbles" size={20} color={PURPLE} />
            <Text style={styles.secondaryBtnText}>AI Meal Assistant</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.tip}>
          <Ionicons name="information-circle" size={18} color="#9C9C9C" />
          <Text style={styles.tipText}>Your table will be released after payment</Text>
        </View>
      </SafeAreaView>
    );
  }

  // Scanner view
  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#FFF" />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: '#FFF' }]}>Scan Table QR</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.scannerContainer}>
        {Platform.OS !== 'web' ? (
          <CameraView
            style={styles.camera}
            barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
            onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
          />
        ) : (
          <View style={styles.webFallback}>
            <Ionicons name="qr-code" size={80} color="#D0D0D0" />
            <Text style={styles.webFallbackText}>QR scanning not available on web</Text>
          </View>
        )}
        
        <View style={styles.overlay}>
          <View style={styles.scanFrame}>
            <View style={[styles.corner, styles.cornerTL]} />
            <View style={[styles.corner, styles.cornerTR]} />
            <View style={[styles.corner, styles.cornerBL]} />
            <View style={[styles.corner, styles.cornerBR]} />
          </View>
        </View>

        {loading && (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator size="large" color="#FFF" />
            <Text style={styles.loadingText}>Getting table info...</Text>
          </View>
        )}
      </View>

      <View style={styles.bottomInfo}>
        <Text style={styles.scanHint}>Point camera at the QR code on your table</Text>
        <TouchableOpacity 
          style={styles.manualEntry} 
          onPress={() => router.push('/table-select')}
        >
          <Ionicons name="keypad" size={18} color={Z_RED} />
          <Text style={styles.manualEntryText}>Enter table number manually</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#502314' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  
  // Header
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12 },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#502314' },
  
  // Permission
  permissionBox: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40, backgroundColor: '#FFF' },
  permTitle: { fontSize: 22, fontWeight: '800', color: '#502314', marginTop: 20 },
  permDesc: { fontSize: 14, color: '#8B6F61', textAlign: 'center', marginTop: 8 },
  permBtn: { backgroundColor: Z_RED, borderRadius: 12, paddingHorizontal: 32, paddingVertical: 14, marginTop: 24 },
  permBtnText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
  manualBtn: { marginTop: 16 },
  manualBtnText: { color: PURPLE, fontSize: 14, fontWeight: '600' },
  
  // Scanner
  scannerContainer: { flex: 1, position: 'relative' },
  camera: { flex: 1 },
  webFallback: { flex: 1, backgroundColor: '#2C2C3E', alignItems: 'center', justifyContent: 'center' },
  webFallbackText: { color: '#8B6F61', fontSize: 14, marginTop: 16 },
  overlay: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  scanFrame: { width: 250, height: 250, position: 'relative' },
  corner: { position: 'absolute', width: 40, height: 40, borderColor: Z_RED, borderWidth: 4 },
  cornerTL: { top: 0, left: 0, borderRightWidth: 0, borderBottomWidth: 0 },
  cornerTR: { top: 0, right: 0, borderLeftWidth: 0, borderBottomWidth: 0 },
  cornerBL: { bottom: 0, left: 0, borderRightWidth: 0, borderTopWidth: 0 },
  cornerBR: { bottom: 0, right: 0, borderLeftWidth: 0, borderTopWidth: 0 },
  loadingOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.7)', alignItems: 'center', justifyContent: 'center' },
  loadingText: { color: '#FFF', fontSize: 14, marginTop: 12 },
  
  // Bottom
  bottomInfo: { backgroundColor: '#FFF', padding: 24, borderTopLeftRadius: 24, borderTopRightRadius: 24 },
  scanHint: { fontSize: 14, color: '#8B6F61', textAlign: 'center' },
  manualEntry: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 16, paddingVertical: 12, backgroundColor: '#FDE8E4', borderRadius: 10 },
  manualEntryText: { color: Z_RED, fontSize: 14, fontWeight: '600' },
  
  // Table Card
  tableCard: { backgroundColor: '#FFF', marginHorizontal: 16, marginTop: 20, borderRadius: 20, padding: 24, alignItems: 'center' },
  tableIconBg: { width: 80, height: 80, borderRadius: 40, backgroundColor: Z_RED, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  tableNumber: { fontSize: 32, fontWeight: '800', color: '#502314' },
  tableSeats: { fontSize: 14, color: '#8B6F61', marginTop: 4 },
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#E8F5E9', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, marginTop: 16 },
  statusText: { color: GREEN, fontSize: 13, fontWeight: '600' },
  existingOrder: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#F0F0FF', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10, marginTop: 12 },
  existingOrderText: { color: PURPLE, fontSize: 12, fontWeight: '500' },
  
  // Actions
  actions: { padding: 16, gap: 12 },
  primaryBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: Z_RED, borderRadius: 14, paddingVertical: 16 },
  primaryBtnText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
  secondaryBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: '#FFF', borderRadius: 14, paddingVertical: 14, borderWidth: 1.5, borderColor: '#E8DDD4' },
  secondaryBtnText: { color: '#502314', fontSize: 15, fontWeight: '600' },
  
  // Tip
  tip: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, padding: 16 },
  tipText: { color: '#8B6F61', fontSize: 12 },
});
