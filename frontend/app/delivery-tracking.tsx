import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, ScrollView,
  Dimensions, Platform, Linking
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { apiCall } from '../utils/api';
import { useRealtime } from '../utils/realtime';

import { FUEL, FONT, RADIUS, SPACE } from '../utils/theme';
const Z_RED = FUEL.ink;
const GREEN = '#3FA34D';
const PURPLE = '#15140F';
const { width, height } = Dimensions.get('window');

// Status steps (each maps one or more backend statuses)
const DELIVERY_STEPS = [
  { key: 'placed', label: 'Order Placed', icon: 'receipt', statuses: ['pending', 'placed'] },
  { key: 'accepted', label: 'Accepted', icon: 'thumbs-up', statuses: ['accepted'] },
  { key: 'preparing', label: 'Preparing', icon: 'flame', statuses: ['preparing'] },
  { key: 'ready', label: 'Ready', icon: 'checkmark-circle', statuses: ['ready'] },
  { key: 'out_for_delivery', label: 'Out for Delivery', icon: 'bicycle', statuses: ['out_for_delivery'] },
  { key: 'delivered', label: 'Delivered', icon: 'home', statuses: ['delivered', 'completed'] },
];

export default function DeliveryTrackingScreen() {
  const router = useRouter();
  const { orderId } = useLocalSearchParams();
  const [loading, setLoading] = useState(true);
  const [tracking, setTracking] = useState<any>(null);
  const [error, setError] = useState('');
  const intervalRef = useRef<any>(null);

  useEffect(() => {
    loadTracking();
    // Safety fallback poll; real-time push is primary
    intervalRef.current = setInterval(loadTracking, 30000);
    return () => clearInterval(intervalRef.current);
  }, [orderId]);

  // Live status updates pushed to this customer (C1)
  useRealtime((msg) => {
    if (msg.type === 'order_status' && msg.data?.id === orderId) {
      loadTracking();
    }
  });

  const loadTracking = async () => {
    try {
      const data = await apiCall(`/orders/${orderId}/tracking`);
      setTracking(data);
      setError('');
    } catch (e: any) {
      setError(e.message || 'Failed to load tracking');
    } finally {
      setLoading(false);
    }
  };

  const getStatusIndex = (status: string) => {
    const i = DELIVERY_STEPS.findIndex(s => (s as any).statuses.includes(status));
    return i < 0 ? 0 : i;
  };

  const openMaps = () => {
    if (!tracking?.driver_location) return;
    const { latitude, longitude } = tracking.driver_location;
    const url = Platform.select({
      ios: `maps://app?daddr=${latitude},${longitude}`,
      android: `google.navigation:q=${latitude},${longitude}`,
      default: `https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}`
    });
    Linking.openURL(url);
  };

  const callDriver = () => {
    // In production, this would be the driver's phone number
    Linking.openURL('tel:+919876543210');
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

  if (error) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <Ionicons name="alert-circle" size={60} color={Z_RED} />
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={loadTracking}>
            <Text style={styles.retryBtnText}>Retry</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const currentStatusIndex = getStatusIndex(tracking?.order_status || 'placed');
  const isDelivery = tracking?.order_type === 'delivery';

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#15140F" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Track Order</Text>
        <TouchableOpacity onPress={loadTracking} style={styles.refreshBtn}>
          <Ionicons name="refresh" size={22} color="#696969" />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scroll}>
        {/* Map Preview (Static for web) */}
        <View style={styles.mapContainer}>
          {isDelivery && tracking?.driver_location ? (
            <View style={styles.mapPlaceholder}>
              <Ionicons name="location" size={40} color={Z_RED} />
              <Text style={styles.mapText}>Driver is on the way!</Text>
              <TouchableOpacity style={styles.openMapBtn} onPress={openMaps}>
                <Ionicons name="navigate" size={18} color="#FFF" />
                <Text style={styles.openMapBtnText}>Open in Maps</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.mapPlaceholder}>
              <Ionicons name="restaurant" size={40} color={Z_RED} />
              <Text style={styles.mapText}>
                {isDelivery ? 'Waiting for driver assignment' : 'Your order is being prepared'}
              </Text>
            </View>
          )}
        </View>

        {/* Driver Info (for delivery) */}
        {isDelivery && tracking?.driver_name && (
          <View style={styles.driverCard}>
            <View style={styles.driverAvatar}>
              <Ionicons name="person" size={24} color="#FFF" />
            </View>
            <View style={styles.driverInfo}>
              <Text style={styles.driverName}>{tracking.driver_name}</Text>
              <Text style={styles.driverLabel}>Your delivery partner</Text>
            </View>
            <View style={styles.driverActions}>
              <TouchableOpacity style={styles.driverBtn} onPress={callDriver}>
                <Ionicons name="call" size={20} color={GREEN} />
              </TouchableOpacity>
              <TouchableOpacity style={styles.driverBtn} onPress={openMaps}>
                <Ionicons name="navigate" size={20} color={PURPLE} />
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* ETA Card */}
        <View style={styles.etaCard}>
          <Ionicons name="time" size={24} color={Z_RED} />
          <View style={styles.etaInfo}>
            <Text style={styles.etaLabel}>Estimated Time</Text>
            <Text style={styles.etaValue}>{tracking?.estimated_arrival || '15-25 mins'}</Text>
          </View>
        </View>

        {/* Status Timeline */}
        <View style={styles.timelineCard}>
          <Text style={styles.sectionTitle}>Order Status</Text>
          
          {DELIVERY_STEPS.map((step, index) => {
            const isCompleted = index <= currentStatusIndex;
            const isCurrent = index === currentStatusIndex;
            const showStep = isDelivery || step.key !== 'out_for_delivery'; // Hide "Out for Delivery" for non-delivery orders
            
            if (!showStep) return null;
            
            return (
              <View key={step.key} style={styles.timelineItem}>
                <View style={styles.timelineLeft}>
                  <View style={[
                    styles.timelineDot,
                    isCompleted && styles.timelineDotCompleted,
                    isCurrent && styles.timelineDotCurrent
                  ]}>
                    <Ionicons 
                      name={step.icon as any} 
                      size={16} 
                      color={isCompleted ? '#FFF' : FUEL.muted} 
                    />
                  </View>
                  {index < DELIVERY_STEPS.length - 1 && showStep && (
                    <View style={[
                      styles.timelineLine,
                      isCompleted && styles.timelineLineCompleted
                    ]} />
                  )}
                </View>
                <View style={styles.timelineRight}>
                  <Text style={[
                    styles.timelineLabel,
                    isCompleted && styles.timelineLabelCompleted,
                    isCurrent && styles.timelineLabelCurrent
                  ]}>
                    {step.label}
                  </Text>
                  {isCurrent && (
                    <View style={styles.currentBadge}>
                      <View style={styles.pulsingDot} />
                      <Text style={styles.currentBadgeText}>Current</Text>
                    </View>
                  )}
                </View>
              </View>
            );
          })}
        </View>

        {/* Delivery Address */}
        {isDelivery && tracking?.delivery_address && (
          <View style={styles.addressCard}>
            <Ionicons name="location" size={22} color={Z_RED} />
            <View style={styles.addressInfo}>
              <Text style={styles.addressLabel}>Delivering to</Text>
              <Text style={styles.addressText}>{tracking.delivery_address}</Text>
            </View>
          </View>
        )}

        {/* Order ID */}
        <View style={styles.orderIdCard}>
          <Text style={styles.orderIdLabel}>Order ID</Text>
          <Text style={styles.orderIdValue}>{orderId}</Text>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Need Help */}
      <View style={styles.helpBar}>
        <TouchableOpacity style={styles.helpBtn}>
          <Ionicons name="chatbubble-ellipses" size={20} color={PURPLE} />
          <Text style={styles.helpBtnText}>Need Help?</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: FUEL.sand },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: SPACE.xxl },
  errorText: { fontSize: 14, color: FUEL.muted, textAlign: 'center', marginTop: SPACE.l },
  retryBtn: { backgroundColor: Z_RED, borderRadius: RADIUS.sm, paddingHorizontal: SPACE.xl, paddingVertical: SPACE.m, marginTop: SPACE.l },
  retryBtnText: { color: '#FFF', fontSize: 14, fontFamily: FONT.bodyBold },
  
  // Header
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#FFF', paddingHorizontal: SPACE.m, paddingVertical: SPACE.m, borderBottomWidth: 1, borderBottomColor: FUEL.sandBorder },
  backBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' }, // circle
  headerTitle: { fontSize: 18, fontFamily: FONT.bodyBold, color: FUEL.ink },
  refreshBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' }, // circle
  
  scroll: { flex: 1 },
  
  // Map
  mapContainer: { height: 200, backgroundColor: FUEL.sandBorder, marginHorizontal: SPACE.l, marginTop: SPACE.l, borderRadius: RADIUS.md, overflow: 'hidden' },
  mapPlaceholder: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: FUEL.limeTint },
  mapText: { fontSize: 14, color: FUEL.muted, marginTop: SPACE.m, textAlign: 'center', paddingHorizontal: SPACE.xl },
  openMapBtn: { flexDirection: 'row', alignItems: 'center', gap: SPACE.s, backgroundColor: Z_RED, borderRadius: RADIUS.sm, paddingHorizontal: SPACE.l, paddingVertical: SPACE.m, marginTop: SPACE.m },
  openMapBtnText: { color: '#FFF', fontSize: 14, fontFamily: FONT.bodySemibold },
  
  // Driver
  driverCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', marginHorizontal: SPACE.l, marginTop: SPACE.m, borderRadius: RADIUS.md, padding: SPACE.l, borderWidth: 1, borderColor: FUEL.sandBorder },
  driverAvatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: GREEN, alignItems: 'center', justifyContent: 'center' }, // circle
  driverInfo: { flex: 1, marginLeft: SPACE.m },
  driverName: { fontSize: 16, fontFamily: FONT.bodyBold, color: FUEL.ink },
  driverLabel: { fontSize: 12, color: FUEL.muted, marginTop: 2 },
  driverActions: { flexDirection: 'row', gap: SPACE.s },
  driverBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: FUEL.sand, alignItems: 'center', justifyContent: 'center' }, // circle
  
  // ETA
  etaCard: { flexDirection: 'row', alignItems: 'center', gap: SPACE.m, backgroundColor: '#FFF', marginHorizontal: SPACE.l, marginTop: SPACE.m, borderRadius: RADIUS.md, padding: SPACE.l, borderWidth: 1, borderColor: FUEL.sandBorder },
  etaInfo: { flex: 1 },
  etaLabel: { fontSize: 12, color: FUEL.muted },
  etaValue: { fontSize: 20, fontFamily: FONT.bodyExtrabold, color: FUEL.ink, marginTop: 2 },
  
  // Timeline
  timelineCard: { backgroundColor: '#FFF', marginHorizontal: SPACE.l, marginTop: SPACE.m, borderRadius: RADIUS.md, padding: SPACE.l, borderWidth: 1, borderColor: FUEL.sandBorder },
  sectionTitle: { fontSize: 16, fontFamily: FONT.bodyBold, color: FUEL.ink, marginBottom: SPACE.l },
  timelineItem: { flexDirection: 'row', marginBottom: 0 },
  timelineLeft: { width: 40, alignItems: 'center' },
  timelineDot: { width: 36, height: 36, borderRadius: 18, backgroundColor: FUEL.sandBorder, alignItems: 'center', justifyContent: 'center' }, // circle
  timelineDotCompleted: { backgroundColor: GREEN },
  timelineDotCurrent: { backgroundColor: Z_RED },
  timelineLine: { width: 2, height: 30, backgroundColor: FUEL.sandBorder, marginVertical: SPACE.xs },
  timelineLineCompleted: { backgroundColor: GREEN },
  timelineRight: { flex: 1, paddingLeft: SPACE.m, paddingBottom: SPACE.xl },
  timelineLabel: { fontSize: 14, color: FUEL.muted, fontFamily: FONT.bodyMedium },
  timelineLabelCompleted: { color: FUEL.ink },
  timelineLabelCurrent: { color: Z_RED, fontFamily: FONT.bodyBold },
  currentBadge: { flexDirection: 'row', alignItems: 'center', gap: SPACE.s, marginTop: SPACE.xs },
  pulsingDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Z_RED }, // circle
  currentBadgeText: { fontSize: 11, color: Z_RED, fontFamily: FONT.bodySemibold },
  
  // Address
  addressCard: { flexDirection: 'row', alignItems: 'flex-start', gap: SPACE.m, backgroundColor: '#FFF', marginHorizontal: SPACE.l, marginTop: SPACE.m, borderRadius: RADIUS.md, padding: SPACE.l, borderWidth: 1, borderColor: FUEL.sandBorder },
  addressInfo: { flex: 1 },
  addressLabel: { fontSize: 12, color: FUEL.muted },
  addressText: { fontSize: 14, color: FUEL.ink, marginTop: SPACE.xs, lineHeight: 20 },
  
  // Order ID
  orderIdCard: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: FUEL.sand, marginHorizontal: SPACE.l, marginTop: SPACE.m, borderRadius: RADIUS.sm, paddingHorizontal: SPACE.l, paddingVertical: SPACE.m },
  orderIdLabel: { fontSize: 12, color: FUEL.muted },
  orderIdValue: { fontSize: 12, color: FUEL.muted, fontFamily: FONT.bodySemibold },
  
  // Help
  helpBar: { backgroundColor: '#FFF', paddingHorizontal: SPACE.l, paddingVertical: SPACE.m, borderTopWidth: 1, borderTopColor: FUEL.sandBorder },
  helpBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACE.s, backgroundColor: FUEL.limeTint, borderRadius: RADIUS.sm, paddingVertical: SPACE.m },
  helpBtnText: { color: PURPLE, fontSize: 14, fontFamily: FONT.bodySemibold },
});
