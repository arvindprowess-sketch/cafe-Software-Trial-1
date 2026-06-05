import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Image,
  ActivityIndicator, Alert, Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiCall, getStoredUser } from '../utils/api';
import { useCart, itemPrice, CartItem } from '../utils/CartContext';
import { useStore } from '../utils/StoreContext';
import { FUEL, FONT } from '../utils/theme';

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
      clear();
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
            <View style={{ marginTop: 28, width: '100%' }}>
              <Text style={styles.sectionTitle}>Popular right now</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingVertical: 8 }}>
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
        <TouchableOpacity testID="clear-cart-btn" onPress={() => Alert.alert('Clear cart?', 'Remove all items?', [{ text: 'No' }, { text: 'Yes', onPress: clear }])}>
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
              <View style={[styles.otBtn, styles.otBtnActive, { alignSelf: 'flex-start', paddingHorizontal: 16 }]}>
                <Ionicons name="storefront" size={18} color={FUEL.ink} />
                <Text style={[styles.otText, styles.otTextActive]}>{stores[0].name}</Text>
              </View>
            ) : (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 2 }}>
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
            <Text style={styles.savingsText}>Add ₹{Math.round(nextTier.threshold - subtotal)} more to unlock <Text style={{ fontWeight: '800' }}>{nextTier.label}</Text></Text>
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
          <View style={{ marginTop: 14 }}>
            <Text style={styles.sectionTitle}>Forgot something? Add more</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingVertical: 8 }}>
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
            <TextInput testID="business-name-input" style={[styles.gstInput, { marginTop: 8 }]} value={businessName} onChangeText={setBusinessName} placeholder="Business name" placeholderTextColor={FUEL.muted} />
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
        <Text style={styles.payHint}>Online payment (Razorpay) coming soon — pay by {paymentMode.toUpperCase()} for now.</Text>

        <View style={{ height: 110 }} />
      </ScrollView>

      {/* BOTTOM BAR */}
      <View style={styles.bottomBar}>
        <View>
          <Text style={styles.bottomLabel}>To Pay</Text>
          <Text style={styles.bottomTotal}>₹{Math.round(grandTotal)}{quoting && <Text style={styles.bottomQuoting}>  …</Text>}</Text>
        </View>
        <TouchableOpacity testID="place-order-btn" style={[styles.payBtn, placing && { opacity: 0.6 }]} disabled={placing} onPress={() => placeOrder(false)}>
          {placing ? <ActivityIndicator color={FUEL.ink} /> : (
            <>
              <Text style={styles.payBtnText}>{isScheduled ? 'Schedule Order' : 'Place Order'}</Text>
              <Ionicons name="arrow-forward" size={18} color={FUEL.ink} />
            </>
          )}
        </TouchableOpacity>
      </View>
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
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: FUEL.white, borderBottomWidth: 1, borderBottomColor: FUEL.sandBorder },
  hBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: FUEL.sand, alignItems: 'center', justifyContent: 'center' },
  hTitle: { flex: 1, marginLeft: 12, fontFamily: FONT.display, fontSize: 22, color: FUEL.ink, textTransform: 'uppercase', letterSpacing: 0.5 },
  hRight: { minWidth: 40, alignItems: 'flex-end' },
  clearText: { color: FUEL.error, fontSize: 13, fontWeight: '800' },

  scroll: { padding: 16, paddingBottom: 40 },
  sectionTitle: { fontFamily: FONT.display, fontSize: 16, color: FUEL.ink, textTransform: 'uppercase', letterSpacing: 0.3, marginTop: 18, marginBottom: 10 },

  // macros
  macroCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: FUEL.ink, borderRadius: 20, padding: 16 },
  macroKcalBox: { alignItems: 'center', paddingRight: 14 },
  macroKcal: { fontFamily: FONT.display, fontSize: 30, color: FUEL.lime },
  macroKcalLabel: { fontSize: 10, color: 'rgba(244,241,233,0.7)', fontWeight: '800', letterSpacing: 1 },
  macroDivider: { width: 1, height: 46, backgroundColor: 'rgba(244,241,233,0.2)' },
  macroRow: { flex: 1, flexDirection: 'row', justifyContent: 'space-around', marginLeft: 8 },
  macroPill: { alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12 },
  macroVal: { fontFamily: FONT.bodyExtrabold, fontSize: 16, fontWeight: '800' },
  macroLbl: { fontSize: 9, color: FUEL.ink, fontWeight: '700', textTransform: 'uppercase', marginTop: 1 },

  // order type / payment
  orderTypeRow: { flexDirection: 'row', gap: 8 },
  otBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, borderRadius: 14, backgroundColor: FUEL.white, borderWidth: 2, borderColor: FUEL.sandBorder },
  otBtnActive: { backgroundColor: FUEL.lime, borderColor: FUEL.lime },
  otText: { fontSize: 12, fontWeight: '800', color: FUEL.muted, textTransform: 'uppercase' },
  otTextActive: { color: FUEL.ink },

  block: { backgroundColor: FUEL.white, borderRadius: 14, padding: 14, marginTop: 10, borderWidth: 1, borderColor: FUEL.sandBorder },
  addrRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  addrInput: { flex: 1, fontSize: 14, color: FUEL.ink, fontWeight: '600', paddingVertical: 4 },
  tipLabel: { fontSize: 12, fontWeight: '700', color: FUEL.muted, marginTop: 12, marginBottom: 8 },
  tipRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  tipChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: FUEL.sand, borderWidth: 1.5, borderColor: FUEL.sandBorder },
  tipChipActive: { backgroundColor: FUEL.lime, borderColor: FUEL.lime },
  tipChipText: { fontSize: 13, fontWeight: '800', color: FUEL.muted },
  tipCustom: { flex: 1, backgroundColor: FUEL.sand, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8, fontSize: 13, color: FUEL.ink, borderWidth: 1.5, borderColor: FUEL.sandBorder },

  // savings
  savingsBar: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: FUEL.limeTint, borderRadius: 12, padding: 12, marginTop: 12 },
  savingsText: { flex: 1, fontSize: 12, color: FUEL.inkSoft, fontWeight: '600' },
  savedLine: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 },
  savedText: { fontSize: 12.5, color: FUEL.success, fontWeight: '700' },

  // items
  itemCard: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: FUEL.white, borderRadius: 14, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: FUEL.sandBorder },
  vegBox: { width: 16, height: 16, borderRadius: 3, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  vegDot: { width: 8, height: 8, borderRadius: 4 },
  itemName: { fontSize: 14, fontWeight: '800', color: FUEL.ink },
  itemMeta: { fontSize: 11, color: FUEL.muted, marginTop: 2 },
  itemRight: { alignItems: 'flex-end', gap: 6 },
  stepper: { flexDirection: 'row', alignItems: 'center', backgroundColor: FUEL.sand, borderRadius: 16, borderWidth: 1.5, borderColor: FUEL.sandBorder },
  stepBtn: { paddingHorizontal: 8, paddingVertical: 6 },
  stepVal: { fontSize: 12, fontWeight: '800', color: FUEL.ink, minWidth: 40, textAlign: 'center' },
  itemPrice: { fontSize: 14, fontWeight: '800', color: FUEL.ink },
  removeBtn: { padding: 4 },

  // addons
  addonCard: { width: 130, backgroundColor: FUEL.white, borderRadius: 14, padding: 8, borderWidth: 1, borderColor: FUEL.sandBorder },
  addonImg: { width: '100%', height: 70, borderRadius: 10, backgroundColor: FUEL.sand },
  addonName: { fontSize: 12, fontWeight: '800', color: FUEL.ink, marginTop: 6 },
  addonFoot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 },
  addonPrice: { fontSize: 13, fontWeight: '800', color: FUEL.ink },
  addonUnit: { fontSize: 9, fontWeight: '400', color: FUEL.muted },
  addonAdd: { width: 28, height: 28, borderRadius: 14, backgroundColor: FUEL.lime, alignItems: 'center', justifyContent: 'center' },

  // coupon
  couponRow: { flexDirection: 'row', gap: 8 },
  couponInput: { flex: 1, backgroundColor: FUEL.white, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: FUEL.ink, borderWidth: 1.5, borderColor: FUEL.sandBorder, borderStyle: 'dashed' },
  couponApply: { paddingHorizontal: 20, justifyContent: 'center', backgroundColor: FUEL.ink, borderRadius: 12 },
  couponApplyText: { color: FUEL.lime, fontSize: 14, fontWeight: '800', textTransform: 'uppercase' },
  couponApplied: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: FUEL.limeTint, borderRadius: 12, padding: 12, marginTop: 8 },
  couponAppliedText: { flex: 1, fontSize: 13, fontWeight: '800', color: FUEL.ink },
  couponError: { fontSize: 12, color: FUEL.error, fontWeight: '600', marginTop: 8 },
  offerCard: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: FUEL.white, borderRadius: 12, padding: 12, marginTop: 8, borderWidth: 1, borderColor: FUEL.sandBorder },
  offerTag: { width: 30, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  offerTitle: { fontSize: 13, fontWeight: '800', color: FUEL.ink },
  offerCode: { color: FUEL.limeDeep },
  offerSub: { fontSize: 11, color: FUEL.muted, marginTop: 1 },
  offerApply: { fontSize: 12, fontWeight: '800', color: FUEL.limeDeep },

  // toggles
  toggleBlock: { flexDirection: 'row', alignItems: 'center', backgroundColor: FUEL.white, borderRadius: 14, padding: 14, marginTop: 12, borderWidth: 1, borderColor: FUEL.sandBorder },
  toggleTitle: { fontSize: 14, fontWeight: '800', color: FUEL.ink },
  toggleHint: { fontSize: 11, color: FUEL.muted, marginTop: 2 },
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  timeInput: { width: 56, backgroundColor: FUEL.white, borderRadius: 10, paddingVertical: 10, textAlign: 'center', fontSize: 16, fontWeight: '800', color: FUEL.ink, borderWidth: 1.5, borderColor: FUEL.sandBorder },
  timeColon: { fontSize: 18, fontWeight: '800', color: FUEL.ink },
  timeHint: { flex: 1, fontSize: 11, color: FUEL.muted },
  gstInput: { backgroundColor: FUEL.sand, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: FUEL.ink, borderWidth: 1.5, borderColor: FUEL.sandBorder },

  // bill
  billCard: { backgroundColor: FUEL.white, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: FUEL.sandBorder },
  billRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 4 },
  billLabel: { fontSize: 13, color: FUEL.muted, fontWeight: '600' },
  billValue: { fontSize: 13, color: FUEL.ink, fontWeight: '700' },
  gstNote: { fontSize: 10, color: FUEL.muted, marginTop: 4 },
  billDivider: { height: 1, backgroundColor: FUEL.sandBorder, marginVertical: 8 },
  billTotalLabel: { fontSize: 15, fontWeight: '800', color: FUEL.ink },
  billTotalValue: { fontFamily: FONT.display, fontSize: 22, color: FUEL.ink },
  payHint: { fontSize: 11, color: FUEL.muted, marginTop: 8 },

  // bottom bar
  bottomBar: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: FUEL.white, borderTopWidth: 1, borderTopColor: FUEL.sandBorder, padding: 16, paddingBottom: 26, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  bottomLabel: { fontSize: 11, color: FUEL.muted, fontWeight: '700', textTransform: 'uppercase' },
  bottomTotal: { fontFamily: FONT.display, fontSize: 24, color: FUEL.ink },
  bottomQuoting: { fontSize: 13, color: FUEL.muted },
  payBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: FUEL.lime, borderRadius: 16, paddingHorizontal: 26, paddingVertical: 15 },
  payBtnText: { fontSize: 15, fontWeight: '800', color: FUEL.ink, textTransform: 'uppercase', letterSpacing: 0.3 },

  // empty
  emptyWrap: { flexGrow: 1, alignItems: 'center', padding: 24, paddingTop: 50 },
  emptyIcon: { width: 90, height: 90, borderRadius: 45, backgroundColor: FUEL.white, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: FUEL.sandBorder },
  emptyTitle: { fontFamily: FONT.display, fontSize: 22, color: FUEL.ink, marginTop: 18, textTransform: 'uppercase' },
  emptySub: { fontSize: 14, color: FUEL.muted, marginTop: 4 },
  emptyAiBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: FUEL.lime, borderRadius: 16, paddingHorizontal: 22, paddingVertical: 14, marginTop: 22 },
  emptyAiText: { fontSize: 14, fontWeight: '800', color: FUEL.ink, textTransform: 'uppercase' },
  emptyMenuBtn: { marginTop: 12, paddingHorizontal: 22, paddingVertical: 12 },
  emptyMenuText: { fontSize: 14, fontWeight: '800', color: FUEL.limeDeep, textTransform: 'uppercase' },
});
