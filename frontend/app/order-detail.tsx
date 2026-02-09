import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { apiCall } from '../utils/api';

const BK_RED = '#D62300';
const BK_ORANGE = '#FF8732';
const BK_BROWN = '#502314';
const BK_CREAM = '#F5EBDC';
const BK_GREEN = '#509E2F';
const BK_WHITE = '#FFFFFF';
const BK_TEXT_LIGHT = '#8B6F61';

export default function OrderDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const [order, setOrder] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadOrderDetails();
  }, []);

  const loadOrderDetails = async () => {
    try {
      const orders = await apiCall('/orders');
      const foundOrder = orders.find((o: any) => o.id === params.orderId);
      setOrder(foundOrder);
    } catch (e) {
      console.error('Error loading order:', e);
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return BK_GREEN;
      case 'ready': return '#FF9F0A';
      case 'preparing': return BK_ORANGE;
      case 'pending': return BK_RED;
      case 'cancelled': return '#888';
      case 'scheduled': return '#5B5FE0';
      default: return BK_TEXT_LIGHT;
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed': return 'checkmark-circle';
      case 'ready': return 'checkmark-done';
      case 'preparing': return 'restaurant';
      case 'pending': return 'time';
      case 'cancelled': return 'close-circle';
      case 'scheduled': return 'calendar';
      default: return 'ellipse';
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={BK_RED} />
        </View>
      </SafeAreaView>
    );
  }

  if (!order) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <Ionicons name="receipt-outline" size={64} color="#D0D0D0" />
          <Text style={styles.emptyTitle}>Order Not Found</Text>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
            <Text style={styles.backBtnText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const orderDate = new Date(order.created_at);
  const statusColor = getStatusColor(order.status);
  const statusIcon = getStatusIcon(order.status);

  // Calculate base amount (without GST)
  const baseAmount = order.base_amount || Math.round((order.total_price * 100) / 105);
  const gstAmount = order.gst_amount || Math.round(order.total_price - baseAmount);
  const cgst = Math.round(gstAmount / 2);
  const sgst = Math.round(gstAmount / 2);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity 
          style={styles.headerBackBtn} 
          onPress={() => router.back()}
          testID="back-button"
        >
          <Ionicons name="arrow-back" size={24} color={BK_CREAM} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Order Details</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Order Header Card */}
        <View style={styles.orderHeaderCard}>
          <View style={styles.orderIdRow}>
            <View style={styles.orderIdLeft}>
              <Ionicons name={statusIcon as any} size={28} color={statusColor} />
              <View>
                <Text style={styles.orderId}>Order #{order.id}</Text>
                <Text style={styles.orderDate}>
                  {orderDate.toLocaleDateString('en-US', { 
                    year: 'numeric', 
                    month: 'long', 
                    day: 'numeric' 
                  })} • {orderDate.toLocaleTimeString('en-US', { 
                    hour: '2-digit', 
                    minute: '2-digit' 
                  })}
                </Text>
              </View>
            </View>
            <View style={[styles.statusBadge, { backgroundColor: statusColor }]}>
              <Text style={styles.statusText}>{order.status.toUpperCase()}</Text>
            </View>
          </View>

          <View style={styles.orderTypeRow}>
            <View style={styles.orderTypeBadge}>
              <Ionicons 
                name={order.order_type === 'delivery' ? 'bicycle' : order.order_type === 'dine-in' ? 'restaurant' : 'bag-handle'} 
                size={16} 
                color={BK_RED} 
              />
              <Text style={styles.orderTypeText}>{order.order_type?.toUpperCase() || 'DINE-IN'}</Text>
            </View>
            {order.payment_mode && (
              <View style={styles.paymentBadge}>
                <Ionicons name="card" size={14} color={BK_GREEN} />
                <Text style={styles.paymentText}>{order.payment_mode.toUpperCase()}</Text>
              </View>
            )}
          </View>
        </View>

        {/* Items Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Order Items</Text>
          <View style={styles.itemsCard}>
            {order.items?.map((item: any, idx: number) => (
              <View key={idx} style={styles.itemRow}>
                <View style={styles.itemLeft}>
                  <View style={[styles.dietDot, { borderColor: item.diet_type === 'non-veg' ? BK_RED : BK_GREEN }]}>
                    <View style={[styles.dietDotFill, { backgroundColor: item.diet_type === 'non-veg' ? BK_RED : BK_GREEN }]} />
                  </View>
                  <View style={styles.itemInfo}>
                    <Text style={styles.itemName}>{item.name || item.product_name}</Text>
                    <Text style={styles.itemDetails}>
                      {item.grams}g • {Math.round(item.calories || 0)} cal
                    </Text>
                    <View style={styles.macroRow}>
                      <Text style={styles.macroText}>P: {Math.round(item.protein || 0)}g</Text>
                      <Text style={styles.macroText}>C: {Math.round(item.carbs || 0)}g</Text>
                      <Text style={styles.macroText}>F: {Math.round(item.fat || 0)}g</Text>
                    </View>
                  </View>
                </View>
                <Text style={styles.itemPrice}>₹{Math.round(item.price || 0)}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Nutrition Summary */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Nutrition Summary</Text>
          <View style={styles.nutritionCard}>
            <View style={styles.nutritionGrid}>
              <View style={styles.nutritionItem}>
                <Ionicons name="flame" size={20} color={BK_RED} />
                <Text style={styles.nutritionValue}>{Math.round(order.total_calories || 0)}</Text>
                <Text style={styles.nutritionLabel}>Calories</Text>
              </View>
              <View style={styles.nutritionItem}>
                <Ionicons name="barbell" size={20} color={BK_RED} />
                <Text style={styles.nutritionValue}>{Math.round(order.total_protein || 0)}g</Text>
                <Text style={styles.nutritionLabel}>Protein</Text>
              </View>
              <View style={styles.nutritionItem}>
                <Ionicons name="leaf" size={20} color="#FF9F0A" />
                <Text style={styles.nutritionValue}>{Math.round(order.total_carbs || 0)}g</Text>
                <Text style={styles.nutritionLabel}>Carbs</Text>
              </View>
              <View style={styles.nutritionItem}>
                <Ionicons name="water" size={20} color={BK_ORANGE} />
                <Text style={styles.nutritionValue}>{Math.round(order.total_fat || 0)}g</Text>
                <Text style={styles.nutritionLabel}>Fat</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Invoice Details */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Invoice Details</Text>
          <View style={styles.invoiceCard}>
            <View style={styles.invoiceRow}>
              <Text style={styles.invoiceLabel}>Base Amount</Text>
              <Text style={styles.invoiceValue}>₹{baseAmount.toFixed(2)}</Text>
            </View>
            
            {order.extra_charge > 0 && (
              <View style={styles.invoiceRow}>
                <Text style={styles.invoiceLabel}>
                  {order.order_type === 'delivery' ? 'Delivery Charge' : 'Extra Charge'}
                </Text>
                <Text style={styles.invoiceValue}>₹{order.extra_charge.toFixed(2)}</Text>
              </View>
            )}

            {order.discount > 0 && (
              <View style={styles.invoiceRow}>
                <Text style={[styles.invoiceLabel, { color: BK_GREEN }]}>
                  Discount {order.coupon_code ? `(${order.coupon_code})` : ''}
                </Text>
                <Text style={[styles.invoiceValue, { color: BK_GREEN }]}>-₹{order.discount.toFixed(2)}</Text>
              </View>
            )}

            <View style={styles.divider} />

            <View style={styles.invoiceRow}>
              <Text style={styles.invoiceLabel}>Subtotal</Text>
              <Text style={styles.invoiceValue}>₹{baseAmount.toFixed(2)}</Text>
            </View>

            <View style={styles.taxSection}>
              <Text style={styles.taxHeader}>Tax Breakdown (5% GST):</Text>
              <View style={styles.invoiceRow}>
                <Text style={styles.taxLabel}>CGST (2.5%)</Text>
                <Text style={styles.invoiceValue}>₹{cgst.toFixed(2)}</Text>
              </View>
              <View style={styles.invoiceRow}>
                <Text style={styles.taxLabel}>SGST (2.5%)</Text>
                <Text style={styles.invoiceValue}>₹{sgst.toFixed(2)}</Text>
              </View>
              <View style={styles.invoiceRow}>
                <Text style={styles.invoiceLabel}>Total GST</Text>
                <Text style={styles.invoiceValue}>₹{gstAmount.toFixed(2)}</Text>
              </View>
            </View>

            <View style={styles.divider} />

            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Total Amount</Text>
              <Text style={styles.totalValue}>₹{order.total_price.toFixed(2)}</Text>
            </View>

            <View style={styles.paymentStatusRow}>
              <Ionicons 
                name={order.payment_status === 'paid' ? 'checkmark-circle' : 'time'} 
                size={16} 
                color={order.payment_status === 'paid' ? BK_GREEN : BK_ORANGE} 
              />
              <Text style={[styles.paymentStatusText, { 
                color: order.payment_status === 'paid' ? BK_GREEN : BK_ORANGE 
              }]}>
                Payment {order.payment_status === 'paid' ? 'Completed' : 'Pending'}
              </Text>
            </View>
          </View>
        </View>

        {/* Customer Info */}
        {order.customer_name && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Customer Details</Text>
            <View style={styles.infoCard}>
              <View style={styles.infoRow}>
                <Ionicons name="person" size={16} color={BK_TEXT_LIGHT} />
                <Text style={styles.infoText}>{order.customer_name}</Text>
              </View>
              {order.user_name && order.user_name !== order.customer_name && (
                <View style={styles.infoRow}>
                  <Ionicons name="call" size={16} color={BK_TEXT_LIGHT} />
                  <Text style={styles.infoText}>Ordered by: {order.user_name}</Text>
                </View>
              )}
            </View>
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Reorder Button */}
      <View style={styles.bottomBar}>
        <TouchableOpacity 
          style={styles.reorderBtn}
          onPress={() => {
            // Navigate to customize with order items
            router.push({
              pathname: '/customize',
              params: { 
                cart: JSON.stringify(order.items.map((item: any) => ({
                  id: item.product_id,
                  name: item.product_name || item.name,
                  grams: item.grams,
                  ...item
                }))),
                orderType: order.order_type
              }
            });
          }}
          testID="reorder-button"
        >
          <Ionicons name="repeat" size={20} color={BK_WHITE} />
          <Text style={styles.reorderBtnText}>Reorder</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: BK_CREAM },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: BK_BROWN,
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  headerBackBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(245,235,220,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { 
    fontSize: 20, 
    fontWeight: '800', 
    color: BK_CREAM, 
    textTransform: 'uppercase', 
    letterSpacing: 0.5 
  },
  
  content: { flex: 1 },
  
  section: { marginTop: 16 },
  sectionTitle: { 
    fontSize: 14, 
    fontWeight: '800', 
    color: BK_BROWN, 
    marginHorizontal: 16, 
    marginBottom: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.5
  },
  
  orderHeaderCard: {
    backgroundColor: BK_WHITE,
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 16,
    padding: 18,
    borderWidth: 2,
    borderColor: '#E8DDD4',
  },
  orderIdRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  orderIdLeft: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, flex: 1 },
  orderId: { fontSize: 18, fontWeight: '800', color: BK_BROWN },
  orderDate: { fontSize: 12, color: BK_TEXT_LIGHT, marginTop: 4 },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  statusText: { fontSize: 10, fontWeight: '800', color: BK_WHITE },
  
  orderTypeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  orderTypeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FDE8E4',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
  },
  orderTypeText: { fontSize: 12, fontWeight: '700', color: BK_RED },
  paymentBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#E8F5E1',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 20,
  },
  paymentText: { fontSize: 11, fontWeight: '700', color: BK_GREEN },
  
  itemsCard: {
    backgroundColor: BK_WHITE,
    marginHorizontal: 16,
    borderRadius: 16,
    padding: 16,
    borderWidth: 2,
    borderColor: '#E8DDD4',
  },
  itemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E8DDD4',
  },
  itemLeft: { flexDirection: 'row', gap: 12, flex: 1 },
  dietDot: { 
    width: 18, 
    height: 18, 
    borderRadius: 3, 
    borderWidth: 2, 
    alignItems: 'center', 
    justifyContent: 'center',
    marginTop: 2,
  },
  dietDotFill: { width: 9, height: 9, borderRadius: 5 },
  itemInfo: { flex: 1 },
  itemName: { fontSize: 15, fontWeight: '700', color: BK_BROWN, marginBottom: 4 },
  itemDetails: { fontSize: 12, color: BK_TEXT_LIGHT, marginBottom: 4 },
  macroRow: { flexDirection: 'row', gap: 12 },
  macroText: { fontSize: 11, color: BK_TEXT_LIGHT, fontWeight: '600' },
  itemPrice: { fontSize: 16, fontWeight: '800', color: BK_RED, marginLeft: 12 },
  
  nutritionCard: {
    backgroundColor: BK_WHITE,
    marginHorizontal: 16,
    borderRadius: 16,
    padding: 16,
    borderWidth: 2,
    borderColor: '#E8DDD4',
  },
  nutritionGrid: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  nutritionItem: { alignItems: 'center' },
  nutritionValue: { fontSize: 18, fontWeight: '800', color: BK_BROWN, marginTop: 6 },
  nutritionLabel: { fontSize: 10, color: BK_TEXT_LIGHT, marginTop: 4, textTransform: 'uppercase' },
  
  invoiceCard: {
    backgroundColor: BK_WHITE,
    marginHorizontal: 16,
    borderRadius: 16,
    padding: 18,
    borderWidth: 2,
    borderColor: '#E8DDD4',
  },
  invoiceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  invoiceLabel: { fontSize: 14, color: BK_TEXT_LIGHT },
  invoiceValue: { fontSize: 14, fontWeight: '600', color: BK_BROWN },
  taxSection: {
    backgroundColor: BK_CREAM,
    padding: 12,
    borderRadius: 12,
    marginVertical: 8,
  },
  taxHeader: { fontSize: 13, fontWeight: '700', color: BK_BROWN, marginBottom: 8 },
  taxLabel: { fontSize: 13, color: BK_TEXT_LIGHT, paddingLeft: 12 },
  divider: { height: 1, backgroundColor: '#E8DDD4', marginVertical: 8 },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 12,
  },
  totalLabel: { fontSize: 16, fontWeight: '800', color: BK_BROWN, textTransform: 'uppercase' },
  totalValue: { fontSize: 24, fontWeight: '800', color: BK_RED },
  paymentStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#E8DDD4',
  },
  paymentStatusText: { fontSize: 13, fontWeight: '700' },
  
  infoCard: {
    backgroundColor: BK_WHITE,
    marginHorizontal: 16,
    borderRadius: 16,
    padding: 16,
    borderWidth: 2,
    borderColor: '#E8DDD4',
  },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
  infoText: { fontSize: 14, color: BK_BROWN, fontWeight: '600' },
  
  bottomBar: {
    backgroundColor: BK_WHITE,
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderTopWidth: 2,
    borderTopColor: '#E8DDD4',
  },
  reorderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: BK_RED,
    paddingVertical: 16,
    borderRadius: 28,
  },
  reorderBtnText: { 
    fontSize: 16, 
    fontWeight: '800', 
    color: BK_WHITE, 
    textTransform: 'uppercase',
    letterSpacing: 0.5
  },
  
  emptyTitle: { fontSize: 18, fontWeight: '800', color: BK_BROWN, marginTop: 16 },
  backBtn: {
    backgroundColor: BK_RED,
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 25,
    marginTop: 24,
  },
  backBtnText: { fontSize: 15, fontWeight: '800', color: BK_CREAM, textTransform: 'uppercase' },
});
