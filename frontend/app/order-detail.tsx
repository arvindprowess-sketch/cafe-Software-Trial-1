import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { apiCall } from '../utils/api';
import { useCart } from '../utils/CartContext';
import { FUEL, FONT } from '../utils/theme';

export default function OrderDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { replaceCart, setOrderType } = useCart();
  const [order, setOrder] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Reorder via backend guard (drops/flags unavailable or price-changed items), then → cart.
  const handleReorder = async () => {
    if (!order) return;
    try {
      const res = await apiCall(`/orders/${order.id}/reorder`, { method: 'POST' });
      if (!res.cart_items?.length) {
        Alert.alert('Items unavailable', 'None of these items are available right now.');
        return;
      }
      replaceCart(res.cart_items);
      if (res.order_type) setOrderType(res.order_type);
      if (res.unavailable?.length) {
        Alert.alert('Some items skipped', `No longer available: ${res.unavailable.join(', ')}. The rest are in your cart.`);
      }
      router.push('/cart');
    } catch (e: any) {
      Alert.alert('Could not reorder', e?.message || 'Please try again.');
    }
  };

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
      case 'completed': return FUEL.success;
      case 'ready': return FUEL.success;
      case 'preparing': return FUEL.warning;
      case 'pending': return FUEL.warning;
      case 'cancelled': return FUEL.error;
      case 'scheduled': return FUEL.fat;
      default: return FUEL.muted;
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
          <ActivityIndicator size="large" color={FUEL.ink} />
        </View>
      </SafeAreaView>
    );
  }

  if (!order) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <Ionicons name="receipt-outline" size={64} color={FUEL.sandBorder} />
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
          <Ionicons name="arrow-back" size={24} color={FUEL.sand} />
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
                color={FUEL.ink}
              />
              <Text style={styles.orderTypeText}>{order.order_type?.toUpperCase() || 'DINE-IN'}</Text>
            </View>
            {order.payment_mode && (
              <View style={styles.paymentBadge}>
                <Ionicons name="card" size={14} color={FUEL.success} />
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
                  <View style={[styles.dietDot, { borderColor: item.diet_type === 'non-veg' ? FUEL.nonVeg : FUEL.veg }]}>
                    <View style={[styles.dietDotFill, { backgroundColor: item.diet_type === 'non-veg' ? FUEL.nonVeg : FUEL.veg }]} />
                  </View>
                  <View style={styles.itemInfo}>
                    <Text style={styles.itemName}>{item.name || item.product_name}</Text>
                    <Text style={styles.itemDetails}>
                      {item.grams}g • {Math.round(item.calories || 0)} cal
                    </Text>
                    <View style={styles.macroRow}>
                      <Text style={[styles.macroText, { color: FUEL.protein }]}>P: {Math.round(item.protein || 0)}g</Text>
                      <Text style={[styles.macroText, { color: FUEL.carbs }]}>C: {Math.round(item.carbs || 0)}g</Text>
                      <Text style={[styles.macroText, { color: FUEL.fat }]}>F: {Math.round(item.fat || 0)}g</Text>
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
                <Ionicons name="flame" size={20} color={FUEL.ink} />
                <Text style={styles.nutritionValue}>{Math.round(order.total_calories || 0)}</Text>
                <Text style={styles.nutritionLabel}>Calories</Text>
              </View>
              <View style={styles.nutritionItem}>
                <Ionicons name="barbell" size={20} color={FUEL.protein} />
                <Text style={styles.nutritionValue}>{Math.round(order.total_protein || 0)}g</Text>
                <Text style={styles.nutritionLabel}>Protein</Text>
              </View>
              <View style={styles.nutritionItem}>
                <Ionicons name="leaf" size={20} color={FUEL.carbs} />
                <Text style={styles.nutritionValue}>{Math.round(order.total_carbs || 0)}g</Text>
                <Text style={styles.nutritionLabel}>Carbs</Text>
              </View>
              <View style={styles.nutritionItem}>
                <Ionicons name="water" size={20} color={FUEL.fat} />
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
                <Text style={[styles.invoiceLabel, { color: FUEL.success }]}>
                  Discount {order.coupon_code ? `(${order.coupon_code})` : ''}
                </Text>
                <Text style={[styles.invoiceValue, { color: FUEL.success }]}>-₹{order.discount.toFixed(2)}</Text>
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
                color={order.payment_status === 'paid' ? FUEL.success : FUEL.warning}
              />
              <Text style={[styles.paymentStatusText, {
                color: order.payment_status === 'paid' ? FUEL.success : FUEL.warning
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
                <Ionicons name="person" size={16} color={FUEL.muted} />
                <Text style={styles.infoText}>{order.customer_name}</Text>
              </View>
              {order.user_name && order.user_name !== order.customer_name && (
                <View style={styles.infoRow}>
                  <Ionicons name="call" size={16} color={FUEL.muted} />
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
          onPress={handleReorder}
          testID="reorder-button"
        >
          <Ionicons name="repeat" size={20} color={FUEL.ink} />
          <Text style={styles.reorderBtnText}>Reorder</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: FUEL.sand },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: FUEL.ink,
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  headerBackBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: FUEL.inkSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontFamily: FONT.display,
    fontSize: 20,
    color: FUEL.sand,
    textTransform: 'uppercase',
    letterSpacing: 0.5
  },

  content: { flex: 1 },

  section: { marginTop: 16 },
  sectionTitle: {
    fontFamily: FONT.display,
    fontSize: 14,
    color: FUEL.ink,
    marginHorizontal: 16,
    marginBottom: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.5
  },

  orderHeaderCard: {
    backgroundColor: FUEL.white,
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: FUEL.sandBorder,
  },
  orderIdRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  orderIdLeft: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, flex: 1 },
  orderId: { fontFamily: FONT.bodyExtrabold, fontSize: 18, color: FUEL.ink },
  orderDate: { fontFamily: FONT.body, fontSize: 12, color: FUEL.muted, marginTop: 4 },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  statusText: { fontFamily: FONT.bodyExtrabold, fontSize: 10, color: FUEL.white },

  orderTypeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  orderTypeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: FUEL.limeTint,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
  },
  orderTypeText: { fontFamily: FONT.bodyBold, fontSize: 12, color: FUEL.ink },
  paymentBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: FUEL.limeTint,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 20,
  },
  paymentText: { fontFamily: FONT.bodyBold, fontSize: 11, color: FUEL.success },

  itemsCard: {
    backgroundColor: FUEL.white,
    marginHorizontal: 16,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: FUEL.sandBorder,
  },
  itemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: FUEL.sandBorder,
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
  itemName: { fontFamily: FONT.bodyBold, fontSize: 15, color: FUEL.ink, marginBottom: 4 },
  itemDetails: { fontFamily: FONT.body, fontSize: 12, color: FUEL.muted, marginBottom: 4 },
  macroRow: { flexDirection: 'row', gap: 12 },
  macroText: { fontFamily: FONT.bodySemibold, fontSize: 11, color: FUEL.muted },
  itemPrice: { fontFamily: FONT.display, fontSize: 16, color: FUEL.ink, marginLeft: 12 },

  nutritionCard: {
    backgroundColor: FUEL.white,
    marginHorizontal: 16,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: FUEL.sandBorder,
  },
  nutritionGrid: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  nutritionItem: { alignItems: 'center' },
  nutritionValue: { fontFamily: FONT.bodyExtrabold, fontSize: 18, color: FUEL.ink, marginTop: 6 },
  nutritionLabel: { fontFamily: FONT.bodyMedium, fontSize: 10, color: FUEL.muted, marginTop: 4, textTransform: 'uppercase' },

  invoiceCard: {
    backgroundColor: FUEL.white,
    marginHorizontal: 16,
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: FUEL.sandBorder,
  },
  invoiceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  invoiceLabel: { fontFamily: FONT.body, fontSize: 14, color: FUEL.muted },
  invoiceValue: { fontFamily: FONT.bodySemibold, fontSize: 14, color: FUEL.ink },
  taxSection: {
    backgroundColor: FUEL.sand,
    padding: 12,
    borderRadius: 12,
    marginVertical: 8,
  },
  taxHeader: { fontFamily: FONT.bodyBold, fontSize: 13, color: FUEL.ink, marginBottom: 8 },
  taxLabel: { fontFamily: FONT.body, fontSize: 13, color: FUEL.muted, paddingLeft: 12 },
  divider: { height: 1, backgroundColor: FUEL.sandBorder, marginVertical: 8 },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 12,
  },
  totalLabel: { fontFamily: FONT.display, fontSize: 16, color: FUEL.ink, textTransform: 'uppercase' },
  totalValue: { fontFamily: FONT.display, fontSize: 24, color: FUEL.ink },
  paymentStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: FUEL.sandBorder,
  },
  paymentStatusText: { fontFamily: FONT.bodyBold, fontSize: 13 },

  infoCard: {
    backgroundColor: FUEL.white,
    marginHorizontal: 16,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: FUEL.sandBorder,
  },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
  infoText: { fontFamily: FONT.bodySemibold, fontSize: 14, color: FUEL.ink },

  bottomBar: {
    backgroundColor: FUEL.white,
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: FUEL.sandBorder,
  },
  reorderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: FUEL.lime,
    paddingVertical: 16,
    borderRadius: 28,
  },
  reorderBtnText: {
    fontFamily: FONT.display,
    fontSize: 16,
    color: FUEL.ink,
    textTransform: 'uppercase',
    letterSpacing: 0.5
  },

  emptyTitle: { fontFamily: FONT.display, fontSize: 18, color: FUEL.ink, marginTop: 16, textTransform: 'uppercase' },
  backBtn: {
    backgroundColor: FUEL.lime,
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 25,
    marginTop: 24,
  },
  backBtnText: { fontFamily: FONT.display, fontSize: 15, color: FUEL.ink, textTransform: 'uppercase' },
});
