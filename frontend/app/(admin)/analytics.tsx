import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator,
  Dimensions, RefreshControl
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { apiCall } from '../../utils/api';

const Z_RED = '#E23744';
const GREEN = '#267E3E';
const PURPLE = '#5B5FE0';
const ORANGE = '#FF9F0A';
const { width } = Dimensions.get('window');

export default function AnalyticsScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [analytics, setAnalytics] = useState<any>(null);
  const [aiInsights, setAiInsights] = useState<any>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [profitData, setProfitData] = useState<any>(null);

  useEffect(() => {
    loadAnalytics();
  }, []);

  const loadAnalytics = async () => {
    try {
      const [analyticsData, profitMargins] = await Promise.all([
        apiCall('/admin/analytics'),
        apiCall('/admin/profit-calculator'),
      ]);
      setAnalytics(analyticsData);
      setProfitData(profitMargins);
    } catch (e) {
      console.error('Analytics error:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const loadAiInsights = async () => {
    setAiLoading(true);
    try {
      const insights = await apiCall('/admin/ai-insights', { method: 'POST' });
      setAiInsights(insights);
    } catch (e) {
      console.error('AI insights error:', e);
    } finally {
      setAiLoading(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadAnalytics();
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={Z_RED} />
          <Text style={styles.loadingText}>Loading analytics...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#1C1C2E" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Business Analytics</Text>
        <TouchableOpacity onPress={loadAiInsights} style={styles.aiBtn} disabled={aiLoading}>
          {aiLoading ? (
            <ActivityIndicator size="small" color="#FFF" />
          ) : (
            <Ionicons name="sparkles" size={20} color="#FFF" />
          )}
        </TouchableOpacity>
      </View>

      <ScrollView 
        style={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Z_RED} />}
      >
        {/* Revenue Cards */}
        <View style={styles.revenueRow}>
          <View style={[styles.revenueCard, { backgroundColor: Z_RED }]}>
            <Ionicons name="today" size={22} color="#FFF" />
            <Text style={styles.revenueLabel}>Today</Text>
            <Text style={styles.revenueValue}>₹{analytics?.today?.revenue || 0}</Text>
            <Text style={styles.revenueOrders}>{analytics?.today?.orders || 0} orders</Text>
          </View>
          <View style={[styles.revenueCard, { backgroundColor: GREEN }]}>
            <Ionicons name="calendar" size={22} color="#FFF" />
            <Text style={styles.revenueLabel}>This Week</Text>
            <Text style={styles.revenueValue}>₹{analytics?.week?.revenue || 0}</Text>
            <Text style={styles.revenueOrders}>{analytics?.week?.orders || 0} orders</Text>
          </View>
        </View>

        {/* Monthly Stats */}
        <View style={styles.monthCard}>
          <View style={styles.monthHeader}>
            <Ionicons name="trending-up" size={22} color={PURPLE} />
            <Text style={styles.monthTitle}>This Month</Text>
          </View>
          <View style={styles.monthStats}>
            <View style={styles.monthStat}>
              <Text style={styles.monthStatValue}>₹{analytics?.month?.revenue || 0}</Text>
              <Text style={styles.monthStatLabel}>Revenue</Text>
            </View>
            <View style={styles.monthDivider} />
            <View style={styles.monthStat}>
              <Text style={styles.monthStatValue}>{analytics?.month?.orders || 0}</Text>
              <Text style={styles.monthStatLabel}>Orders</Text>
            </View>
            <View style={styles.monthDivider} />
            <View style={styles.monthStat}>
              <Text style={styles.monthStatValue}>₹{analytics?.month?.avg_order_value || 0}</Text>
              <Text style={styles.monthStatLabel}>Avg Order</Text>
            </View>
            <View style={styles.monthDivider} />
            <View style={styles.monthStat}>
              <Text style={styles.monthStatValue}>{analytics?.month?.unique_customers || 0}</Text>
              <Text style={styles.monthStatLabel}>Customers</Text>
            </View>
          </View>
        </View>

        {/* AI Insights */}
        {aiInsights && (
          <View style={styles.aiCard}>
            <View style={styles.aiHeader}>
              <Ionicons name="sparkles" size={20} color={PURPLE} />
              <Text style={styles.aiTitle}>AI Business Insights</Text>
            </View>
            <Text style={styles.aiInsightsText}>{aiInsights.insights}</Text>
            <Text style={styles.aiTimestamp}>Generated: {new Date(aiInsights.generated_at).toLocaleString()}</Text>
          </View>
        )}

        {/* Best Sellers */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="trophy" size={20} color={ORANGE} />
            <Text style={styles.sectionTitle}>Best Sellers (This Month)</Text>
          </View>
          {analytics?.best_sellers?.slice(0, 5).map((item: any, index: number) => (
            <View key={index} style={styles.sellerRow}>
              <View style={styles.sellerRank}>
                <Text style={styles.sellerRankText}>#{index + 1}</Text>
              </View>
              <View style={styles.sellerInfo}>
                <Text style={styles.sellerName}>{item.name}</Text>
                <Text style={styles.sellerStats}>{item.orders} orders • {Math.round(item.quantity_grams / 1000)}kg sold</Text>
              </View>
              <Text style={styles.sellerRevenue}>₹{Math.round(item.revenue)}</Text>
            </View>
          ))}
        </View>

        {/* Order Type Breakdown */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="pie-chart" size={20} color={PURPLE} />
            <Text style={styles.sectionTitle}>Order Types</Text>
          </View>
          <View style={styles.orderTypesRow}>
            {analytics?.order_types && Object.entries(analytics.order_types).map(([type, count]: any) => {
              const total = Object.values(analytics.order_types as Record<string, number>).reduce((a: number, b: number) => a + b, 0) || 1;
              const pct = Math.round((count / total) * 100);
              return (
                <View key={type} style={styles.orderTypeCard}>
                  <Ionicons 
                    name={type === 'dine-in' ? 'restaurant' : type === 'takeaway' ? 'bag' : 'bicycle'} 
                    size={24} 
                    color={type === 'dine-in' ? Z_RED : type === 'takeaway' ? ORANGE : PURPLE} 
                  />
                  <Text style={styles.orderTypeName}>{type}</Text>
                  <Text style={styles.orderTypeCount}>{count}</Text>
                  <Text style={styles.orderTypePct}>{pct}%</Text>
                </View>
              );
            })}
          </View>
        </View>

        {/* Peak Hours */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="time" size={20} color={GREEN} />
            <Text style={styles.sectionTitle}>Peak Hours</Text>
          </View>
          <View style={styles.peakHoursRow}>
            {analytics?.peak_hours?.slice(0, 5).map((item: any, index: number) => (
              <View key={index} style={styles.peakHourItem}>
                <Text style={styles.peakHourTime}>{item.hour}:00</Text>
                <View style={[styles.peakHourBar, { height: Math.max(20, (item.orders / (analytics.peak_hours[0]?.orders || 1)) * 60) }]} />
                <Text style={styles.peakHourCount}>{item.orders}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Profit Margins */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="cash" size={20} color={GREEN} />
            <Text style={styles.sectionTitle}>Profit Margins</Text>
          </View>
          <View style={styles.profitSummary}>
            <Text style={styles.profitAvg}>Average Margin: <Text style={{ color: GREEN }}>{profitData?.summary?.avg_margin}%</Text></Text>
          </View>
          {profitData?.products?.slice(0, 6).map((item: any, index: number) => (
            <View key={index} style={styles.profitRow}>
              <View style={styles.profitInfo}>
                <Text style={styles.profitName}>{item.name}</Text>
                <Text style={styles.profitPrice}>₹{item.selling_price}/100g → ₹{item.profit_per_100g} profit</Text>
              </View>
              <View style={[
                styles.profitBadge,
                { backgroundColor: item.margin_percentage >= 50 ? GREEN : item.margin_percentage >= 30 ? ORANGE : Z_RED }
              ]}>
                <Text style={styles.profitBadgeText}>{item.margin_percentage}%</Text>
              </View>
            </View>
          ))}
        </View>

        {/* Low Stock Alerts */}
        {analytics?.low_stock_alerts?.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Ionicons name="warning" size={20} color={Z_RED} />
              <Text style={styles.sectionTitle}>Low Stock Alerts</Text>
            </View>
            {analytics.low_stock_alerts.map((item: any, index: number) => (
              <View key={index} style={styles.alertRow}>
                <Ionicons name="alert-circle" size={18} color={Z_RED} />
                <Text style={styles.alertText}>{item.name}</Text>
                <Text style={styles.alertStock}>{item.stock}g left</Text>
              </View>
            ))}
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F8F8F8' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { fontSize: 14, color: '#696969', marginTop: 12 },
  
  // Header
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#FFF', paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#EFEFEF' },
  backBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#1C1C2E' },
  aiBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: PURPLE, alignItems: 'center', justifyContent: 'center' },
  
  scroll: { flex: 1 },
  
  // Revenue Cards
  revenueRow: { flexDirection: 'row', gap: 12, padding: 16 },
  revenueCard: { flex: 1, borderRadius: 16, padding: 16 },
  revenueLabel: { color: 'rgba(255,255,255,0.8)', fontSize: 12, marginTop: 8 },
  revenueValue: { color: '#FFF', fontSize: 24, fontWeight: '800', marginTop: 4 },
  revenueOrders: { color: 'rgba(255,255,255,0.7)', fontSize: 11, marginTop: 4 },
  
  // Month Card
  monthCard: { backgroundColor: '#FFF', marginHorizontal: 16, borderRadius: 16, padding: 16, marginBottom: 12 },
  monthHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16 },
  monthTitle: { fontSize: 16, fontWeight: '700', color: '#1C1C2E' },
  monthStats: { flexDirection: 'row', justifyContent: 'space-around' },
  monthStat: { alignItems: 'center' },
  monthStatValue: { fontSize: 18, fontWeight: '800', color: '#1C1C2E' },
  monthStatLabel: { fontSize: 11, color: '#9C9C9C', marginTop: 4 },
  monthDivider: { width: 1, backgroundColor: '#EFEFEF' },
  
  // AI Card
  aiCard: { backgroundColor: '#F8F5FF', marginHorizontal: 16, borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: '#E8E0FF' },
  aiHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  aiTitle: { fontSize: 16, fontWeight: '700', color: PURPLE },
  aiInsightsText: { fontSize: 13, color: '#1C1C2E', lineHeight: 20 },
  aiTimestamp: { fontSize: 10, color: '#9C9C9C', marginTop: 12 },
  
  // Section
  section: { backgroundColor: '#FFF', marginHorizontal: 16, borderRadius: 16, padding: 16, marginBottom: 12 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#1C1C2E' },
  
  // Best Sellers
  sellerRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#F5F5F5' },
  sellerRank: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#FDE8EA', alignItems: 'center', justifyContent: 'center' },
  sellerRankText: { fontSize: 12, fontWeight: '700', color: Z_RED },
  sellerInfo: { flex: 1, marginLeft: 12 },
  sellerName: { fontSize: 14, fontWeight: '600', color: '#1C1C2E' },
  sellerStats: { fontSize: 11, color: '#9C9C9C', marginTop: 2 },
  sellerRevenue: { fontSize: 14, fontWeight: '700', color: GREEN },
  
  // Order Types
  orderTypesRow: { flexDirection: 'row', justifyContent: 'space-around' },
  orderTypeCard: { alignItems: 'center', padding: 12 },
  orderTypeName: { fontSize: 11, color: '#696969', marginTop: 6, textTransform: 'capitalize' },
  orderTypeCount: { fontSize: 18, fontWeight: '800', color: '#1C1C2E', marginTop: 4 },
  orderTypePct: { fontSize: 11, color: '#9C9C9C' },
  
  // Peak Hours
  peakHoursRow: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'flex-end', height: 100 },
  peakHourItem: { alignItems: 'center' },
  peakHourTime: { fontSize: 10, color: '#696969' },
  peakHourBar: { width: 30, backgroundColor: PURPLE, borderRadius: 4, marginVertical: 6 },
  peakHourCount: { fontSize: 11, fontWeight: '600', color: '#1C1C2E' },
  
  // Profit
  profitSummary: { backgroundColor: '#F5F5F5', borderRadius: 8, padding: 10, marginBottom: 12 },
  profitAvg: { fontSize: 14, fontWeight: '600', color: '#1C1C2E' },
  profitRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#F5F5F5' },
  profitInfo: { flex: 1 },
  profitName: { fontSize: 14, fontWeight: '600', color: '#1C1C2E' },
  profitPrice: { fontSize: 11, color: '#9C9C9C', marginTop: 2 },
  profitBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  profitBadgeText: { fontSize: 12, fontWeight: '700', color: '#FFF' },
  
  // Alerts
  alertRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#F5F5F5' },
  alertText: { flex: 1, fontSize: 14, color: '#1C1C2E' },
  alertStock: { fontSize: 12, fontWeight: '600', color: Z_RED },
});
