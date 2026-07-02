import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Image,
  ActivityIndicator, Alert, Switch, Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiCall, getStoredUser, createPayment } from '../utils/api';
import { useCart, itemPrice, CartItem } from '../utils/CartContext';
import { useStore } from '../utils/StoreContext';
import { FUEL, FONT, RADIUS, SPACE } from '../utils/theme';
import PressableScale from './components/PressableScale';
import * as Haptics from 'expo-haptics';

// PR-C: success haptic on the order-placed moment (safe no-op on web)
const hapticSuccess = () => {
  try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {}); } catch {}
};

const TIP_PRESETS = [10, 20, 30, 50];
const ORDER_TYPES = [
  { key: 'dine-in', label: 'Dine-in', icon: 'restaurant' },
  { key: 'takeaway', label: 'Takeaway', icon: 'bag-handle' },
  { key: 'delivery', label: 'Delivery', icon: 'bicycle' },
];
const PAY_MODES = [
  { key: 'cash', label: 'Cash', icon: 'cash' },
  { key: 'upi', label: 'UPI', icon: 'qr-code' },
  { key: 'card', label: 'Card', icon: 'card' },
  { key: 'online', label: 'Pay Online', icon: 'globe' },
];

const lineMacros = (i: CartItem) => {
  const f = i.product_type === 'ready_made' ? ((i.serving_grams || 300) / 100) * (i.quantity || 1) : i.grams / 100;
  return {
    price: itemPrice(i),
    calories: i.calories_per_100g * f,
    protein: i.protein_per_100g * f,
    carbs: i.carbs_per_100g * f,
    fat: i.fat_per_100g * f,
  };
};

export default function CartScreen() {
  const router = useRouter();
  const cart = useCart();
  const { items, orderType, setOrderType, incItem, decItem, removeItem, clear, addItem } = cart;
  const { stores, selectedStoreId, selectStore } = useStore();

  const [user, setUser] = useState<any>(null);
  const [showClearConfirm, setShowClearConfirm] = useState(false); // web-safe Clear confirm (Alert collapses to window.confirm on web)
  const [quote, setQuote] = useState<any>(null);
  const [quoting, setQuoting] = useState(false);
  const [placing, setPlacing] = useState(false);

  const [couponInput, setCouponInput] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState('');
  const [offers, setOffers] = useState<any[]>([]);
  const [addons, setAddons] = useState<any[]>([]);

  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [tableNumber, setTableNumber] = useState('');
  const [tip, setTip] = useState(0);
  const [customTip, setCustomTip] = useState('');

  const [gstOn, setGstOn] = useState(false);
  const [gstin, setGstin] = useState('');
  const [businessName, setBusinessName] = useState('');

  const [isScheduled, setIsScheduled] = useState(false);
  const [schedHour, setSchedHour] = useState('');
  const [schedMin, setSchedMin] = useState('');

  const [paymentMode, setPaymentMode] = useState('cash');

  useEffect(() => {
    getStoredUser().then(setUser);
    AsyncStorage.getItem('delivery_address').then(a => { if (a) setDeliveryAddress(a); }).catch(() => {});
    apiCall('/offers').then(setOffers).catch(() => {});
    apiCall('/products/top-selling-by-category')
      .then((p: any[]) => { if (Array.isArray(p) && p.length) setAddons(p); })
      .catch(() => {
        // Fallback: derive from full catalog if the endpoint is unavailable
        apiCall('/products')
          .then((all: any[]) => setAddons(all.slice(0, 10)))
          .catch(() => {});
      });
  }, []);

  // Build the items payload for the server quote
  const itemsPayload = useCallback(() => items.map(i => ({
    product_id: i.product_id, product_type: i.product_type, grams: i.grams,
    quantity: i.quantity, cost_per_100g: i.cost_per_100g, name: i.name,
  })), [items]);

  const fetchQuote = useCallback(async () => {
    if (items.length === 0) { setQuote(null); return; }
    setQuoting(true);
    try {
      const q = await apiCall('/cart/quote', {
        method: 'POST',
        body: { items: itemsPayload(), order_type: orderType, coupon_code: appliedCoupon || null, tip },
      });
      setQuote(q);
      if (q.coupon_error && appliedCoupon) { setAppliedCoupon(''); }
    } catch (e) { /* keep last quote */ } finally { setQuoting(false); }
  }, [items, orderType, appliedCoupon, tip, itemsPayload]);

  const debounce = useRef<any>(null);
  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(fetchQuote, 250);
    return () => debounce.current && clearTimeout(debounce.current);
  }, [fetchQuote]);

  const applyCoupon = (code: string) => {
    if (!code.trim()) return;
    setAppliedCoupon(code.trim().toUpperCase());
    setCouponInput('');
  };

  const getScheduledReadyTime = (): string | null => {
    if (!isScheduled || !schedHour || !schedMin) return null;
    const now = new Date();
    const s = new Date(now.getFullYear(), now.getMonth(), now.getDate(), parseInt(schedHour), parseInt(schedMin), 0);
    if (s.getTime() <= now.getTime()) s.setDate(s.getDate() + 1);
    return s.toISOString();
  };

  const placeOrder = async (confirmDuplicate = false) => {
    if (items.length === 0) return;
    if (orderType === 'delivery' && !deliveryAddress.trim()) {
      Alert.alert('Address needed', 'Please add a delivery address.'); return;
    }
    if (isScheduled && (!schedHour || !schedMin)) {
      Alert.alert('Set time', 'Choose a ready time for your scheduled order.'); return;
    }
    if (gstOn && !gstin.trim()) {
      Alert.alert('GSTIN needed', 'Enter your GSTIN for the GST invoice.'); return;
    }
    setPlacing(true);
    try {
      // Stock recheck (authoritative)
      const fresh = await apiCall('/cart/quote', {
        method: 'POST',
        body: { items: itemsPayload(), order_type: orderType, coupon_code: appliedCoupon || null, tip },
      });
      setQuote(fresh);
      if (fresh.out_of_stock?.length) {
        const names = fresh.out_of_stock.map((o: any) => o.name).join(', ');
        setPlacing(false);
        Alert.alert('Out of stock', `These items are no longer available: ${names}. Remove them to continue?`, [
          { text: 'Keep editing', style: 'cancel' },
          { text: 'Remove & continue', onPress: () => { fresh.out_of_stock.forEach((o: any) => removeItem(o.product_id)); } },
        ]);
        return;
      }

      const orderBody: any = {
        order_type: orderType,
        store_id: selectedStoreId || undefined,
        items: items.map(i => {
          const m = lineMacros(i);
          return {
            product_id: i.product_id, product_name: i.name, product_type: i.product_type,
            grams: i.grams, quantity: i.quantity, price: Math.round(m.price),
            calories: m.calories, protein: m.protein, carbs: m.carbs, fat: m.fat,
          };
        }),
        total_price: fresh.net_food,
        item_subtotal: fresh.subtotal,
        discount: fresh.discount,
        coupon_code: appliedCoupon || null,
        delivery_fee: fresh.delivery_fee,
        tip: fresh.tip,
        total_calories: fresh.macros.calories,
        total_protein: fresh.macros.protein,
        total_carbs: fresh.macros.carbs,
        total_fat: fresh.macros.fat,
        payment_mode: paymentMode,
        is_scheduled: isScheduled,
        confirm_duplicate: confirmDuplicate,
      };
      if (orderType === 'delivery') { orderBody.delivery_address = deliveryAddress.trim(); orderBody.delivery_time = isScheduled ? getScheduledReadyTime() : 'ASAP'; }
      if (orderType === 'dine-in' && tableNumber) orderBody.table_number = parseInt(tableNumber);
      if (gstOn) { orderBody.gstin = gstin.trim(); orderBody.business_name = businessName.trim(); }
      if (isScheduled) orderBody.scheduled_ready_time = getScheduledReadyTime();

      const order = await apiCall('/orders', { method: 'POST', body: orderBody });

      // Online payment: the order is held (pending_payment) until verified.
      // Create the Razorpay order and hand off to the payment screen; the cart
      // is only cleared once payment succeeds (handled in /pay).
      if (paymentMode === 'online') {
        const pay = await createPayment(order.id);
        setPlacing(false);
        router.replace({
          pathname: '/pay',
          params: {
            orderId: order.id,
            rzpOrderId: pay.razorpay_order_id,
            amount: String(pay.amount),
            currency: pay.currency || 'INR',
            keyId: pay.key_id,
            mock: pay.mock ? '1' : '0',
          },
        });
        return;
      }

      clear();
      hapticSuccess(); // PR-C: order-placed success moment
      Alert.alert(isScheduled ? 'Order Scheduled!' : 'Order Placed!', `₹${Math.round(fresh.grand_total)} · ${orderType}`);
      router.replace({ pathname: '/order-detail', params: { orderId: order.id } });
    } catch (e: any) {
      const detail = e?.detail || e?.message;
      if (e?.status === 409 || (typeof detail === 'object' && detail?.warning === 'duplicate_order')) {
        setPlacing(false);
        Alert.alert('Duplicate order?', 'An identical order was just placed. Place it again?', [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Place again', onPress: () => placeOrder(true) },
        ]);
        return;
      }
      Alert.alert('Could not place order', typeof detail === 'string' ? detail : 'Please try again.');
    } finally {
      setPlacing(false);
    }
  };

  // ---------- EMPTY STATE ----------
  if (items.length === 0) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <Header title="Your Cart" onBack={() => router.back()} />
        <ScrollView contentContainerStyle={styles.emptyWrap}>
          <View style={styles.emptyIcon}><Ionicons name="basket-outline" size={48} color={FUEL.muted} /></View>
          <Text style={styles.emptyTitle}>Your cart is empty</Text>
          <Text style={styles.emptySub}>Add a meal to get started</Text>
          <TouchableOpacity testID="empty-ai-picks" style={styles.emptyAiBtn} onPress={() => router.replace({ pathname: '/(tabs)/home', params: { openAi: '1' } })}>
            <Ionicons name="sparkles" size={18} color={FUEL.ink} />
            <Text style={styles.emptyAiText}>AI Picks — build my meal</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.emptyMenuBtn} onPress={() => router.replace('/(tabs)/menu')}>
            <Text style={styles.emptyMenuText}>Browse Menu</Text>
          </TouchableOpacity>

          {addons.length > 0 && (
            <View style={{ marginTop: SPACE.xxl, width: '100%' }}>
              <Text style={styles.sectionTitle}>Popular right now</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: SPACE.m, paddingVertical: SPACE.s }}>
                {addons.map(a => <AddonCard key={a.id} a={a} onAdd={() => addItem(a)} />)}
              </ScrollView>
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    );
  }

  const q = quote || {};
  const subtotal = q.subtotal ?? cart.subtotal;
  const macros = q.macros || { calories: cart.calories, protein: cart.protein, carbs: cart.carbs, fat: cart.fat };
  const grandTotal = q.grand_total ?? cart.subtotal;
  const nextTier = q.next_tier;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <Header title="Your Cart" onBack={() => router.back()} right={
        <TouchableOpacity testID="clear-cart-btn" onPress={() => setShowClearConfirm(true)}>
          <Text style={styles.clearText}>Clear</Text>
        </TouchableOpacity>
      } />

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* MACROS SUMMARY — our hero */}
        <View style={styles.macroCard} testID="cart-macros">
          <View style={styles.macroKcalBox}>
            <Text style={styles.macroKcal}>{Math.round(macros.calories)}</Text>
            <Text style={styles.macroKcalLabel}>KCAL</Text>
          </View>
          <View style={styles.macroDivider} />
          <View style={styles.macroRow}>
            <Macro label="Protein" value={macros.protein} color={FUEL.protein} tint={FUEL.proteinTint} />
            <Macro label="Carbs" value={macros.carbs} color={'#9A6E1E'} tint={FUEL.carbsTint} />
            <Macro label="Fat" value={macros.fat} color={'#3E6E8A'} tint={FUEL.fatTint} />
          </View>
        </View>

        {/* STORE SELECTION — every order is tied to a store */}
        {stores.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Store</Text>
            {stores.length === 1 ? (
              <View style={[styles.otBtn, styles.otBtnActive, { alignSelf: 'flex-start', paddingHorizontal: SPACE.l }]}>
                <Ionicons name="storefront" size={18} color={FUEL.ink} />
                <Text style={[styles.otText, styles.otTextActive]}>{stores[0].name}</Text>
              </View>
            ) : (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: SPACE.s, paddingVertical: 2 }}>
                {stores.map(s => (
                  <TouchableOpacity key={s.store_id} testID={`store-${s.store_id}`}
                    style={[styles.otBtn, selectedStoreId === s.store_id && styles.otBtnActive]}
                    onPress={() => selectStore(s.store_id)}>
                    <Ionicons name="storefront" size={16} color={selectedStoreId === s.store_id ? FUEL.ink : FUEL.muted} />
                    <Text style={[styles.otText, selectedStoreId === s.store_id && styles.otTextActive]}>{s.name}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
          </>
        )}

        {/* ORDER TYPE */}
        <Text style={styles.sectionTitle}>Order type</Text>
        <View style={styles.orderTypeRow}>
          {ORDER_TYPES.map(t => (
            <TouchableOpacity key={t.key} testID={`ordertype-${t.key}`}
              style={[styles.otBtn, orderType === t.key && styles.otBtnActive]}
              onPress={() => setOrderType(t.key)}>
              <Ionicons name={t.icon as any} size={18} color={orderType === t.key ? FUEL.ink : FUEL.muted} />
              <Text style={[styles.otText, orderType === t.key && styles.otTextActive]}>{t.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* DELIVERY-only: address + tip */}
        {orderType === 'delivery' && (
          <View style={styles.block}>
            <View style={styles.addrRow}>
              <Ionicons name="location" size={16} color={FUEL.protein} />
              <TextInput testID="cart-delivery-address" style={styles.addrInput} value={deliveryAddress}
                onChangeText={t => { setDeliveryAddress(t); AsyncStorage.setItem('delivery_address', t).catch(() => {}); }}
                placeholder="Delivery address" placeholderTextColor={FUEL.muted} multiline />
            </View>
            <Text style={styles.tipLabel}>Add a tip for your rider</Text>
            <View style={styles.tipRow}>
              {TIP_PRESETS.map(t => (
                <TouchableOpacity key={t} testID={`tip-${t}`} style={[styles.tipChip, tip === t && styles.tipChipActive]} onPress={() => { setTip(tip === t ? 0 : t); setCustomTip(''); }}>
                  <Text style={[styles.tipChipText, tip === t && { color: FUEL.ink }]}>₹{t}</Text>
                </TouchableOpacity>
              ))}
              <TextInput testID="tip-custom" style={styles.tipCustom} value={customTip} onChangeText={(v) => { setCustomTip(v); setTip(parseFloat(v) || 0); }} placeholder="Custom" placeholderTextColor={FUEL.muted} keyboardType="number-pad" />
            </View>
          </View>
        )}

        {/* DINE-IN: table number */}
        {orderType === 'dine-in' && (
          <View style={styles.block}>
            <View style={styles.addrRow}>
              <Ionicons name="grid" size={16} color={FUEL.ink} />
              <TextInput testID="cart-table-number" style={styles.addrInput} value={tableNumber} onChangeText={setTableNumber} placeholder="Table number (optional)" placeholderTextColor={FUEL.muted} keyboardType="number-pad" />
            </View>
          </View>
        )}

        {/* SAVINGS BAR */}
        {nextTier && (
          <View style={styles.savingsBar} testID="savings-bar">
            <Ionicons name="pricetags" size={15} color={FUEL.limeDeep} />
            <Text style={styles.savingsText}>Add ₹{Math.round(nextTier.threshold - subtotal)} more to unlock <Text style={{ fontFamily: FONT.bodyExtrabold }}>{nextTier.label}</Text></Text>
          </View>
        )}
        {q.total_savings > 0 && (
          <View style={styles.savedLine} testID="saved-line">
            <Ionicons name="checkmark-circle" size={15} color={FUEL.success} />
            <Text style={styles.savedText}>You saved ₹{Math.round(q.total_savings)} on this order</Text>
          </View>
        )}

        {/* ITEMS */}
        <Text style={styles.sectionTitle}>Items ({items.length})</Text>
        {items.map(i => {
          const m = lineMacros(i);
          return (
            <View key={i.id} style={styles.itemCard} testID={`cart-item-${i.id}`}>
              <View style={[styles.vegBox, { borderColor: i.diet_type === 'non-veg' ? FUEL.nonVeg : FUEL.veg }]}>
                <View style={[styles.vegDot, { backgroundColor: i.diet_type === 'non-veg' ? FUEL.nonVeg : FUEL.veg }]} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.itemName} numberOfLines={1}>{i.name}</Text>
                <Text style={styles.itemMeta}>{i.product_type === 'ready_made' ? `${i.quantity} plate${i.quantity > 1 ? 's' : ''}` : `${i.grams}g`} · {Math.round(m.calories)} cal · P {Math.round(m.protein)}g</Text>
              </View>
              <View style={styles.itemRight}>
                <View style={styles.stepper}>
                  <TouchableOpacity testID={`cart-dec-${i.id}`} style={styles.stepBtn} onPress={() => decItem(i.id)}><Ionicons name="remove" size={15} color={FUEL.ink} /></TouchableOpacity>
                  <Text style={styles.stepVal}>{i.product_type === 'ready_made' ? i.quantity : `${i.grams}g`}</Text>
                  <TouchableOpacity testID={`cart-inc-${i.id}`} style={styles.stepBtn} onPress={() => incItem(i.id)}><Ionicons name="add" size={15} color={FUEL.ink} /></TouchableOpacity>
                </View>
                <Text style={styles.itemPrice}>₹{Math.round(m.price)}</Text>
              </View>
              <TouchableOpacity testID={`cart-remove-${i.id}`} style={styles.removeBtn} onPress={() => removeItem(i.id)}>
                <Ionicons name="close" size={14} color={FUEL.muted} />
              </TouchableOpacity>
            </View>
          );
        })}

        {/* ADD MORE carousel */}
        {addons.length > 0 && (
          <View style={{ marginTop: SPACE.l }}>
            <Text style={styles.sectionTitle}>Forgot something? Add more</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: SPACE.m, paddingVertical: SPACE.s }}>
              {addons.map(a => <AddonCard key={a.id} a={a} onAdd={() => addItem(a)} />)}
            </ScrollView>
          </View>
        )}

        {/* COUPONS & OFFERS */}
        <Text style={styles.sectionTitle}>Coupons & offers</Text>
        <View style={styles.couponRow}>
          <TextInput testID="coupon-input" style={styles.couponInput} value={couponInput} onChangeText={setCouponInput} placeholder="Enter coupon code" placeholderTextColor={FUEL.muted} autoCapitalize="characters" />
          <TouchableOpacity testID="apply-coupon-btn" style={styles.couponApply} onPress={() => applyCoupon(couponInput)}>
            <Text style={styles.couponApplyText}>Apply</Text>
          </TouchableOpacity>
        </View>
        {appliedCoupon ? (
          <View style={styles.couponApplied} testID="coupon-applied">
            <Ionicons name="checkmark-circle" size={16} color={FUEL.success} />
            <Text style={styles.couponAppliedText}>{appliedCoupon} applied{q.discount ? ` · −₹${Math.round(q.discount)}` : ''}</Text>
            <TouchableOpacity onPress={() => setAppliedCoupon('')}><Ionicons name="close-circle" size={18} color={FUEL.muted} /></TouchableOpacity>
          </View>
        ) : null}
        {q.coupon_error ? <Text style={styles.couponError} testID="coupon-error">{q.coupon_error}</Text> : null}
        {offers.filter(o => o.coupon_code).map(o => {
          const locked = (o.min_order_value || 0) > subtotal;
          return (
            <TouchableOpacity key={o.id} testID={`offer-${o.coupon_code}`} disabled={locked} style={[styles.offerCard, locked && { opacity: 0.55 }]} onPress={() => applyCoupon(o.coupon_code)}>
              <View style={[styles.offerTag, { backgroundColor: o.banner_color || FUEL.ink }]}>
                <Ionicons name={locked ? 'lock-closed' : 'pricetag'} size={14} color={FUEL.lime} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.offerTitle}>{o.title} <Text style={styles.offerCode}>· {o.coupon_code}</Text></Text>
                <Text style={styles.offerSub}>{o.subtitle || (locked ? `Min order ₹${o.min_order_value}` : 'Tap to apply')}</Text>
              </View>
              {!locked && <Text style={styles.offerApply}>APPLY</Text>}
            </TouchableOpacity>
          );
        })}

        {/* SCHEDULE */}
        <View style={styles.toggleBlock}>
          <View style={{ flex: 1 }}>
            <Text style={styles.toggleTitle}>Schedule for later</Text>
            <Text style={styles.toggleHint}>Use prep time to be ready on time</Text>
          </View>
          <Switch testID="schedule-switch" value={isScheduled} onValueChange={setIsScheduled} trackColor={{ true: FUEL.lime, false: '#D8D2C4' }} thumbColor={FUEL.ink} />
        </View>
        {isScheduled && (
          <View style={styles.timeRow}>
            <TextInput testID="sched-hour" style={styles.timeInput} value={schedHour} onChangeText={setSchedHour} placeholder="HH" placeholderTextColor={FUEL.muted} keyboardType="number-pad" maxLength={2} />
            <Text style={styles.timeColon}>:</Text>
            <TextInput testID="sched-min" style={styles.timeInput} value={schedMin} onChangeText={setSchedMin} placeholder="MM" placeholderTextColor={FUEL.muted} keyboardType="number-pad" maxLength={2} />
            <Text style={styles.timeHint}>24h ready time {q.max_prep_minutes ? `· ~${q.max_prep_minutes} min to cook` : ''}</Text>
          </View>
        )}

        {/* GST INVOICE */}
        <View style={styles.toggleBlock}>
          <View style={{ flex: 1 }}>
            <Text style={styles.toggleTitle}>GST invoice</Text>
            <Text style={styles.toggleHint}>For business / company claims</Text>
          </View>
          <Switch testID="gst-switch" value={gstOn} onValueChange={setGstOn} trackColor={{ true: FUEL.lime, false: '#D8D2C4' }} thumbColor={FUEL.ink} />
        </View>
        {gstOn && (
          <View style={styles.block}>
            <TextInput testID="gstin-input" style={styles.gstInput} value={gstin} onChangeText={setGstin} placeholder="GSTIN" placeholderTextColor={FUEL.muted} autoCapitalize="characters" />
            <TextInput testID="business-name-input" style={[styles.gstInput, { marginTop: SPACE.s }]} value={businessName} onChangeText={setBusinessName} placeholder="Business name" placeholderTextColor={FUEL.muted} />
          </View>
        )}

        {/* BILL */}
        <Text style={styles.sectionTitle}>Bill details</Text>
        <View style={styles.billCard} testID="bill-card">
          <BillRow label="Item total" value={subtotal} />
          {q.discount > 0 && <BillRow label="Discount" value={-q.discount} green />}
          {orderType !== 'dine-in' && <BillRow label={orderType === 'delivery' ? (q.delivery_fee === 0 ? 'Delivery (FREE)' : 'Delivery fee') : 'Packaging'} value={q.delivery_fee || 0} green={q.delivery_fee === 0 && orderType === 'delivery'} />}
          {q.tip > 0 && <BillRow label="Rider tip" value={q.tip} />}
          <Text style={styles.gstNote}>Incl. GST ₹{Math.round(q.gst_amount || 0)} (5%)</Text>
          <View style={styles.billDivider} />
          <View style={styles.billRow}>
            <Text style={styles.billTotalLabel}>To Pay</Text>
            <Text style={styles.billTotalValue}>₹{Math.round(grandTotal)}</Text>
          </View>
        </View>

        {/* PAYMENT MODE */}
        <Text style={styles.sectionTitle}>Payment</Text>
        <View style={styles.orderTypeRow}>
          {PAY_MODES.map(p => (
            <TouchableOpacity key={p.key} testID={`pay-${p.key}`} style={[styles.otBtn, paymentMode === p.key && styles.otBtnActive]} onPress={() => setPaymentMode(p.key)}>
              <Ionicons name={p.icon as any} size={18} color={paymentMode === p.key ? FUEL.ink : FUEL.muted} />
              <Text style={[styles.otText, paymentMode === p.key && styles.otTextActive]}>{p.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
        {paymentMode === 'online' ? (
          <Text style={styles.payHint}>Secure online payment via Razorpay. You'll complete payment on the next screen.</Text>
        ) : (
          <Text style={styles.payHint}>Pay by {paymentMode.toUpperCase()} at pickup/delivery.</Text>
        )}

        <View style={{ height: 110 }} />
      </ScrollView>

      {/* BOTTOM BAR */}
      <View style={styles.bottomBar}>
        <View>
          <Text style={styles.bottomLabel}>To Pay</Text>
          <Text style={styles.bottomTotal}>₹{Math.round(grandTotal)}{quoting && <Text style={styles.bottomQuoting}>  …</Text>}</Text>
        </View>
        <PressableScale haptic testID="place-order-btn" style={[styles.payBtn, placing && { opacity: 0.6 }]} disabled={placing} onPress={() => placeOrder(false)}>
          {placing ? <ActivityIndicator color={FUEL.ink} /> : (
            <>
              <Text style={styles.payBtnText}>{isScheduled ? 'Schedule Order' : 'Place Order'}</Text>
              <Ionicons name="arrow-forward" size={18} color={FUEL.ink} />
            </>
          )}
        </PressableScale>
      </View>

      {/* Web-safe Clear confirmation (Alert.alert collapses to window.confirm on Expo Web) */}
      <Modal visible={showClearConfirm} transparent animationType="fade" onRequestClose={() => setShowClearConfirm(false)}>
        <View style={styles.clearOverlay}>
          <View style={styles.clearCard} testID="clear-confirm-modal">
            <Text style={styles.clearTitle}>Clear cart?</Text>
            <Text style={styles.clearMsg}>Remove all items from your cart?</Text>
            <View style={styles.clearActions}>
              <TouchableOpacity testID="clear-confirm-no" style={[styles.clearBtn, styles.clearBtnCancel]} onPress={() => setShowClearConfirm(false)} activeOpacity={0.85}>
                <Text style={styles.clearBtnCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity testID="clear-confirm-yes" style={[styles.clearBtn, styles.clearBtnConfirm]} onPress={() => { clear(); setShowClearConfirm(false); }} activeOpacity={0.85}>
                <Text style={styles.clearBtnConfirmText}>Clear</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// ---------- small components ----------
const Header = ({ title, onBack, right }: any) => (
  <View style={styles.header}>
    <TouchableOpacity testID="cart-back-btn" style={styles.hBtn} onPress={onBack}><Ionicons name="arrow-back" size={20} color={FUEL.ink} /></TouchableOpacity>
    <Text style={styles.hTitle}>{title}</Text>
    <View style={styles.hRight}>{right}</View>
  </View>
);
const Macro = ({ label, value, color, tint }: any) => (
  <View style={[styles.macroPill, { backgroundColor: tint }]}>
    <Text style={[styles.macroVal, { color }]}>{Math.round(value)}g</Text>
    <Text style={styles.macroLbl}>{label}</Text>
  </View>
);
const BillRow = ({ label, value, green }: any) => (
  <View style={styles.billRow}>
    <Text style={styles.billLabel}>{label}</Text>
    <Text style={[styles.billValue, green && { color: FUEL.success }]}>{value < 0 ? '−' : ''}₹{Math.round(Math.abs(value))}</Text>
  </View>
);
const AddonCard = ({ a, onAdd }: any) => {
  const price = a.product_type === 'ready_made' ? (a.fixed_price || Math.round(a.cost_per_100g * (a.serving_grams || 300) / 100)) : a.cost_per_100g;
  return (
    <View style={styles.addonCard} testID={`addon-${a.id}`}>
      {a.image_url ? <Image source={{ uri: a.image_url }} style={styles.addonImg} /> : <View style={[styles.addonImg, { alignItems: 'center', justifyContent: 'center' }]}><Ionicons name="fast-food" size={22} color="#D0D0D0" /></View>}
      <Text style={styles.addonName} numberOfLines={1}>{a.name}</Text>
      <View style={styles.addonFoot}>
        <Text style={styles.addonPrice}>₹{price}{a.product_type !== 'ready_made' && <Text style={styles.addonUnit}>/100g</Text>}</Text>
        <TouchableOpacity testID={`addon-add-${a.id}`} style={styles.addonAdd} onPress={onAdd}><Ionicons name="add" size={16} color={FUEL.ink} /></TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: FUEL.sand },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACE.l, paddingVertical: SPACE.m, backgroundColor: FUEL.white, borderBottomWidth: 1, borderBottomColor: FUEL.sandBorder },
  hBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: FUEL.sand, alignItems: 'center', justifyContent: 'center' }, // circle
  hTitle: { flex: 1, marginLeft: SPACE.m, fontFamily: FONT.display, fontSize: 22, color: FUEL.ink, textTransform: 'uppercase', letterSpacing: 0.5 },
  hRight: { minWidth: 40, alignItems: 'flex-end' },
  clearText: { color: FUEL.error, fontSize: 13, fontFamily: FONT.bodyExtrabold },
  // Clear-cart confirm modal (web-safe)
  clearOverlay: { flex: 1, backgroundColor: 'rgba(21,20,15,0.45)', alignItems: 'center', justifyContent: 'center', padding: SPACE.xl },
  clearCard: { width: '100%', maxWidth: 360, backgroundColor: FUEL.white, borderRadius: RADIUS.lg, padding: SPACE.xl },
  clearTitle: { fontFamily: FONT.display, fontSize: 20, color: FUEL.ink, textTransform: 'uppercase', letterSpacing: 0.3 },
  clearMsg: { fontFamily: FONT.body, fontSize: 14, color: FUEL.muted, marginTop: SPACE.s, marginBottom: SPACE.l },
  clearActions: { flexDirection: 'row', gap: SPACE.m },
  clearBtn: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: SPACE.m, borderRadius: RADIUS.pill },
  clearBtnCancel: { backgroundColor: FUEL.white, borderWidth: 1.5, borderColor: FUEL.sandBorder },
  clearBtnCancelText: { fontFamily: FONT.bodyExtrabold, fontSize: 14, color: FUEL.ink, textTransform: 'uppercase', letterSpacing: 0.3 },
  clearBtnConfirm: { backgroundColor: FUEL.error },
  clearBtnConfirmText: { fontFamily: FONT.bodyExtrabold, fontSize: 14, color: FUEL.white, textTransform: 'uppercase', letterSpacing: 0.3 },

  scroll: { padding: SPACE.l, paddingBottom: SPACE.xxl },
  sectionTitle: { fontFamily: FONT.display, fontSize: 16, color: FUEL.ink, textTransform: 'uppercase', letterSpacing: 0.3, marginTop: SPACE.l, marginBottom: SPACE.m },

  // macros
  macroCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: FUEL.ink, borderRadius: RADIUS.lg, padding: SPACE.l },
  macroKcalBox: { alignItems: 'center', paddingRight: SPACE.l },
  macroKcal: { fontFamily: FONT.display, fontSize: 30, color: FUEL.lime },
  macroKcalLabel: { fontSize: 10, color: 'rgba(244,241,233,0.7)', fontFamily: FONT.bodyExtrabold, letterSpacing: 1 },
  macroDivider: { width: 1, height: 46, backgroundColor: 'rgba(244,241,233,0.2)' },
  macroRow: { flex: 1, flexDirection: 'row', justifyContent: 'space-around', marginLeft: SPACE.s },
  macroPill: { alignItems: 'center', paddingHorizontal: SPACE.m, paddingVertical: SPACE.s, borderRadius: RADIUS.md },
  macroVal: { fontFamily: FONT.bodyExtrabold, fontSize: 16 },
  macroLbl: { fontSize: 9, color: FUEL.ink, fontFamily: FONT.bodyBold, textTransform: 'uppercase', marginTop: 1 },

  // order type / payment
  orderTypeRow: { flexDirection: 'row', gap: SPACE.s },
  otBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACE.s, paddingVertical: SPACE.m, borderRadius: RADIUS.md, backgroundColor: FUEL.white, borderWidth: 2, borderColor: FUEL.sandBorder },
  otBtnActive: { backgroundColor: FUEL.lime, borderColor: FUEL.lime },
  otText: { fontSize: 12, fontFamily: FONT.bodyExtrabold, color: FUEL.muted, textTransform: 'uppercase' },
  otTextActive: { color: FUEL.ink },

  block: { backgroundColor: FUEL.white, borderRadius: RADIUS.md, padding: SPACE.l, marginTop: SPACE.m, borderWidth: 1, borderColor: FUEL.sandBorder },
  addrRow: { flexDirection: 'row', alignItems: 'center', gap: SPACE.s },
  addrInput: { flex: 1, fontSize: 14, color: FUEL.ink, fontFamily: FONT.bodySemibold, paddingVertical: SPACE.xs },
  tipLabel: { fontSize: 12, fontFamily: FONT.bodyBold, color: FUEL.muted, marginTop: SPACE.m, marginBottom: SPACE.s },
  tipRow: { flexDirection: 'row', gap: SPACE.s, alignItems: 'center' },
  tipChip: { paddingHorizontal: SPACE.l, paddingVertical: SPACE.s, borderRadius: RADIUS.lg, backgroundColor: FUEL.sand, borderWidth: 1.5, borderColor: FUEL.sandBorder },
  tipChipActive: { backgroundColor: FUEL.lime, borderColor: FUEL.lime },
  tipChipText: { fontSize: 13, fontFamily: FONT.bodyExtrabold, color: FUEL.muted },
  tipCustom: { flex: 1, backgroundColor: FUEL.sand, borderRadius: RADIUS.lg, paddingHorizontal: SPACE.l, paddingVertical: SPACE.s, fontSize: 13, color: FUEL.ink, borderWidth: 1.5, borderColor: FUEL.sandBorder },

  // savings
  savingsBar: { flexDirection: 'row', alignItems: 'center', gap: SPACE.s, backgroundColor: FUEL.limeTint, borderRadius: RADIUS.md, padding: SPACE.m, marginTop: SPACE.m },
  savingsText: { flex: 1, fontSize: 12, color: FUEL.inkSoft, fontFamily: FONT.bodySemibold },
  savedLine: { flexDirection: 'row', alignItems: 'center', gap: SPACE.s, marginTop: SPACE.s },
  savedText: { fontSize: 12.5, color: FUEL.success, fontFamily: FONT.bodyBold },

  // items
  itemCard: { flexDirection: 'row', alignItems: 'center', gap: SPACE.m, backgroundColor: FUEL.white, borderRadius: RADIUS.md, padding: SPACE.m, marginBottom: SPACE.s, borderWidth: 1, borderColor: FUEL.sandBorder },
  vegBox: { width: 16, height: 16, borderRadius: RADIUS.xs, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  vegDot: { width: 8, height: 8, borderRadius: 4 }, // circle
  itemName: { fontSize: 14, fontFamily: FONT.bodyExtrabold, color: FUEL.ink },
  itemMeta: { fontSize: 11, color: FUEL.muted, marginTop: 2 },
  itemRight: { alignItems: 'flex-end', gap: SPACE.s },
  stepper: { flexDirection: 'row', alignItems: 'center', backgroundColor: FUEL.sand, borderRadius: RADIUS.md, borderWidth: 1.5, borderColor: FUEL.sandBorder },
  stepBtn: { paddingHorizontal: SPACE.s, paddingVertical: SPACE.s },
  stepVal: { fontSize: 12, fontFamily: FONT.bodyExtrabold, color: FUEL.ink, minWidth: 40, textAlign: 'center' },
  itemPrice: { fontSize: 14, fontFamily: FONT.bodyExtrabold, color: FUEL.ink },
  removeBtn: { padding: SPACE.xs },

  // addons
  addonCard: { width: 130, backgroundColor: FUEL.white, borderRadius: RADIUS.md, padding: SPACE.s, borderWidth: 1, borderColor: FUEL.sandBorder },
  addonImg: { width: '100%', height: 70, borderRadius: RADIUS.sm, backgroundColor: FUEL.sand },
  addonName: { fontSize: 12, fontFamily: FONT.bodyExtrabold, color: FUEL.ink, marginTop: SPACE.s },
  addonFoot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: SPACE.s },
  addonPrice: { fontSize: 13, fontFamily: FONT.bodyExtrabold, color: FUEL.ink },
  addonUnit: { fontSize: 9, fontFamily: FONT.body, color: FUEL.muted },
  addonAdd: { width: 28, height: 28, borderRadius: 14, backgroundColor: FUEL.lime, alignItems: 'center', justifyContent: 'center' }, // circle

  // coupon
  couponRow: { flexDirection: 'row', gap: SPACE.s },
  couponInput: { flex: 1, backgroundColor: FUEL.white, borderRadius: RADIUS.md, paddingHorizontal: SPACE.l, paddingVertical: SPACE.m, fontSize: 14, color: FUEL.ink, borderWidth: 1.5, borderColor: FUEL.sandBorder, borderStyle: 'dashed' },
  couponApply: { paddingHorizontal: SPACE.xl, justifyContent: 'center', backgroundColor: FUEL.ink, borderRadius: RADIUS.md },
  couponApplyText: { color: FUEL.lime, fontSize: 14, fontFamily: FONT.bodyExtrabold, textTransform: 'uppercase' },
  couponApplied: { flexDirection: 'row', alignItems: 'center', gap: SPACE.s, backgroundColor: FUEL.limeTint, borderRadius: RADIUS.md, padding: SPACE.m, marginTop: SPACE.s },
  couponAppliedText: { flex: 1, fontSize: 13, fontFamily: FONT.bodyExtrabold, color: FUEL.ink },
  couponError: { fontSize: 12, color: FUEL.error, fontFamily: FONT.bodySemibold, marginTop: SPACE.s },
  offerCard: { flexDirection: 'row', alignItems: 'center', gap: SPACE.m, backgroundColor: FUEL.white, borderRadius: RADIUS.md, padding: SPACE.m, marginTop: SPACE.s, borderWidth: 1, borderColor: FUEL.sandBorder },
  offerTag: { width: 30, height: 30, borderRadius: RADIUS.sm, alignItems: 'center', justifyContent: 'center' },
  offerTitle: { fontSize: 13, fontFamily: FONT.bodyExtrabold, color: FUEL.ink },
  offerCode: { color: FUEL.limeDeep },
  offerSub: { fontSize: 11, color: FUEL.muted, marginTop: 1 },
  offerApply: { fontSize: 12, fontFamily: FONT.bodyExtrabold, color: FUEL.limeDeep },

  // toggles
  toggleBlock: { flexDirection: 'row', alignItems: 'center', backgroundColor: FUEL.white, borderRadius: RADIUS.md, padding: SPACE.l, marginTop: SPACE.m, borderWidth: 1, borderColor: FUEL.sandBorder },
  toggleTitle: { fontSize: 14, fontFamily: FONT.bodyExtrabold, color: FUEL.ink },
  toggleHint: { fontSize: 11, color: FUEL.muted, marginTop: 2 },
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: SPACE.s, marginTop: SPACE.s },
  timeInput: { width: 56, backgroundColor: FUEL.white, borderRadius: RADIUS.sm, paddingVertical: SPACE.m, textAlign: 'center', fontSize: 16, fontFamily: FONT.bodyExtrabold, color: FUEL.ink, borderWidth: 1.5, borderColor: FUEL.sandBorder },
  timeColon: { fontSize: 18, fontFamily: FONT.bodyExtrabold, color: FUEL.ink },
  timeHint: { flex: 1, fontSize: 11, color: FUEL.muted },
  gstInput: { backgroundColor: FUEL.sand, borderRadius: RADIUS.sm, paddingHorizontal: SPACE.m, paddingVertical: SPACE.m, fontSize: 14, color: FUEL.ink, borderWidth: 1.5, borderColor: FUEL.sandBorder },

  // bill
  billCard: { backgroundColor: FUEL.white, borderRadius: RADIUS.md, padding: SPACE.l, borderWidth: 1, borderColor: FUEL.sandBorder },
  billRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: SPACE.xs },
  billLabel: { fontSize: 13, color: FUEL.muted, fontFamily: FONT.bodySemibold },
  billValue: { fontSize: 13, color: FUEL.ink, fontFamily: FONT.bodyBold },
  gstNote: { fontSize: 10, color: FUEL.muted, marginTop: SPACE.xs },
  billDivider: { height: 1, backgroundColor: FUEL.sandBorder, marginVertical: SPACE.s },
  billTotalLabel: { fontSize: 15, fontFamily: FONT.bodyExtrabold, color: FUEL.ink },
  billTotalValue: { fontFamily: FONT.display, fontSize: 22, color: FUEL.ink },
  payHint: { fontSize: 11, color: FUEL.muted, marginTop: SPACE.s },

  // bottom bar
  bottomBar: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: FUEL.white, borderTopWidth: 1, borderTopColor: FUEL.sandBorder, padding: SPACE.l, paddingBottom: SPACE.xl, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  bottomLabel: { fontSize: 11, color: FUEL.muted, fontFamily: FONT.bodyBold, textTransform: 'uppercase' },
  bottomTotal: { fontFamily: FONT.display, fontSize: 24, color: FUEL.ink },
  bottomQuoting: { fontSize: 13, color: FUEL.muted },
  payBtn: { flexDirection: 'row', alignItems: 'center', gap: SPACE.s, backgroundColor: FUEL.lime, borderRadius: RADIUS.md, paddingHorizontal: SPACE.xl, paddingVertical: SPACE.l },
  payBtnText: { fontSize: 15, fontFamily: FONT.bodyExtrabold, color: FUEL.ink, textTransform: 'uppercase', letterSpacing: 0.3 },

  // empty
  emptyWrap: { flexGrow: 1, alignItems: 'center', padding: SPACE.xl, paddingTop: 50 },
  emptyIcon: { width: 90, height: 90, borderRadius: 45, backgroundColor: FUEL.white, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: FUEL.sandBorder }, // circle
  emptyTitle: { fontFamily: FONT.display, fontSize: 22, color: FUEL.ink, marginTop: SPACE.l, textTransform: 'uppercase' },
  emptySub: { fontSize: 14, color: FUEL.muted, marginTop: SPACE.xs },
  emptyAiBtn: { flexDirection: 'row', alignItems: 'center', gap: SPACE.s, backgroundColor: FUEL.lime, borderRadius: RADIUS.md, paddingHorizontal: SPACE.xl, paddingVertical: SPACE.l, marginTop: SPACE.xl },
  emptyAiText: { fontSize: 14, fontFamily: FONT.bodyExtrabold, color: FUEL.ink, textTransform: 'uppercase' },
  emptyMenuBtn: { marginTop: SPACE.m, paddingHorizontal: SPACE.xl, paddingVertical: SPACE.m },
  emptyMenuText: { fontSize: 14, fontFamily: FONT.bodyExtrabold, color: FUEL.limeDeep, textTransform: 'uppercase' },
});
