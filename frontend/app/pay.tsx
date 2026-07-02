import React, { useState, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { verifyPayment, getStoredUser } from '../utils/api';
import { useCart } from '../utils/CartContext';
import { FUEL, FONT, RADIUS, SPACE } from '../utils/theme';

const hapticSuccess = () => { try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {}); } catch {} };

// Razorpay Standard Checkout hosted in a WebView. The checkout success handler
// posts {razorpay_payment_id, razorpay_order_id, razorpay_signature} back to RN.
function checkoutHtml(opts: { keyId: string; rzpOrderId: string; amount: string; currency: string; name?: string; email?: string; contact?: string }) {
  const prefill = JSON.stringify({ name: opts.name || '', email: opts.email || '', contact: opts.contact || '' });
  return `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1"></head>
<body style="margin:0;background:#15140F;">
<script src="https://checkout.razorpay.com/v1/checkout.js"></script>
<script>
  function post(m){ if(window.ReactNativeWebView){ window.ReactNativeWebView.postMessage(JSON.stringify(m)); } }
  var options = {
    key: ${JSON.stringify(opts.keyId)},
    order_id: ${JSON.stringify(opts.rzpOrderId)},
    amount: ${JSON.stringify(Number(opts.amount) || 0)},
    currency: ${JSON.stringify(opts.currency || 'INR')},
    name: "BORAROC",
    description: "Order payment",
    prefill: ${prefill},
    theme: { color: "#C7F24E" },
    handler: function(resp){ post({ type: 'success', razorpay_payment_id: resp.razorpay_payment_id, razorpay_order_id: resp.razorpay_order_id, razorpay_signature: resp.razorpay_signature }); },
    modal: { ondismiss: function(){ post({ type: 'dismiss' }); } }
  };
  try {
    var rzp = new Razorpay(options);
    rzp.on('payment.failed', function(resp){ post({ type: 'failed', message: (resp && resp.error && resp.error.description) || 'Payment failed' }); });
    rzp.open();
  } catch (e) { post({ type: 'failed', message: 'Could not start checkout' }); }
</script>
</body></html>`;
}

export default function PayScreen() {
  const router = useRouter();
  const { clear } = useCart();
  const params = useLocalSearchParams();
  const orderId = String(params.orderId || '');
  const rzpOrderId = String(params.rzpOrderId || '');
  const amount = String(params.amount || '0');
  const currency = String(params.currency || 'INR');
  const keyId = String(params.keyId || '');
  const isMock = String(params.mock || '0') === '1';

  // idle -> (mock: show simulate | real: webview) ; verifying ; success ; failed
  const [phase, setPhase] = useState<'idle' | 'verifying' | 'success' | 'failed'>('idle');
  const [failMsg, setFailMsg] = useState('');
  const [webLoading, setWebLoading] = useState(true);
  const [prefill, setPrefill] = useState<{ name?: string; email?: string; contact?: string }>({});
  const handledRef = useRef(false); // guard against double-verify

  React.useEffect(() => {
    getStoredUser().then(u => { if (u) setPrefill({ name: u.name, email: u.email, contact: u.phone }); }).catch(() => {});
  }, []);

  const runVerify = useCallback(async (paymentId: string, signature: string) => {
    if (handledRef.current) return;
    handledRef.current = true;
    setPhase('verifying');
    try {
      const res = await verifyPayment({
        razorpay_order_id: rzpOrderId,
        razorpay_payment_id: paymentId,
        razorpay_signature: signature,
        order_id: orderId,
      });
      if (res?.status === 'paid') {
        clear();
        hapticSuccess();
        setPhase('success');
        setTimeout(() => router.replace({ pathname: '/order-detail', params: { orderId } }), 900);
      } else {
        handledRef.current = false;
        setFailMsg('Payment could not be confirmed.');
        setPhase('failed');
      }
    } catch (e: any) {
      handledRef.current = false;
      setFailMsg(e?.message || 'Payment verification failed.');
      setPhase('failed');
    }
  }, [rzpOrderId, orderId, clear, router]);

  const onMessage = (event: any) => {
    let msg: any = {};
    try { msg = JSON.parse(event?.nativeEvent?.data || '{}'); } catch { return; }
    if (msg.type === 'success' && msg.razorpay_payment_id) {
      runVerify(msg.razorpay_payment_id, msg.razorpay_signature || '');
    } else if (msg.type === 'dismiss') {
      setFailMsg('Payment cancelled — you can retry from your order.');
      setPhase('failed');
    } else if (msg.type === 'failed') {
      setFailMsg(msg.message || 'Payment not completed — you can retry from your order.');
      setPhase('failed');
    }
  };

  const goToOrder = () => router.replace({ pathname: '/order-detail', params: { orderId } });

  // ----- Verifying / success / failed overlays -----
  if (phase === 'verifying' || phase === 'success') {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.center}>
          {phase === 'verifying' ? (
            <>
              <ActivityIndicator size="large" color={FUEL.lime} />
              <Text style={styles.centerText}>Confirming your payment…</Text>
            </>
          ) : (
            <>
              <View style={styles.successCircle}><Ionicons name="checkmark" size={40} color={FUEL.ink} /></View>
              <Text style={styles.centerText}>Payment successful</Text>
            </>
          )}
        </View>
      </SafeAreaView>
    );
  }

  if (phase === 'failed') {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.center}>
          <View style={styles.failCircle}><Ionicons name="close" size={36} color={FUEL.white} /></View>
          <Text style={styles.centerText}>Payment not completed</Text>
          <Text style={styles.failSub}>{failMsg}</Text>
          <TouchableOpacity testID="pay-retry" style={styles.cta} onPress={goToOrder} activeOpacity={0.9}>
            <Text style={styles.ctaText}>GO TO ORDER</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // ----- idle: mock simulate button OR real WebView -----
  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={goToOrder} testID="pay-back">
          <Ionicons name="close" size={22} color={FUEL.sand} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Payment</Text>
        <View style={{ width: 40 }} />
      </View>

      {isMock ? (
        <View style={styles.center}>
          <View style={styles.mockBadge}><Text style={styles.mockBadgeText}>MOCK MODE</Text></View>
          <Text style={styles.amount}>₹{(Number(amount) / 100).toFixed(0)}</Text>
          <Text style={styles.mockNote}>No live Razorpay keys are configured, so checkout is simulated for testing.</Text>
          <TouchableOpacity testID="pay-simulate-mock" style={styles.cta} onPress={() => runVerify(`pay_mock_${Date.now()}`, '')} activeOpacity={0.9}>
            <Ionicons name="flash" size={18} color={FUEL.ink} />
            <Text style={styles.ctaText}>SIMULATE PAYMENT</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={goToOrder} activeOpacity={0.8} style={{ marginTop: SPACE.l }}>
            <Text style={styles.cancelLink}>Cancel</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={{ flex: 1 }}>
          <WebView
            testID="pay-webview"
            source={{ html: checkoutHtml({ keyId, rzpOrderId, amount, currency, ...prefill }) }}
            onMessage={onMessage}
            onLoadEnd={() => setWebLoading(false)}
            javaScriptEnabled
            domStorageEnabled
            originWhitelist={['*']}
            style={{ flex: 1, backgroundColor: FUEL.ink }}
          />
          {webLoading && (
            <View style={styles.webLoading}>
              <ActivityIndicator size="large" color={FUEL.lime} />
              <Text style={styles.centerText}>Loading secure checkout…</Text>
            </View>
          )}
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: FUEL.sand },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: SPACE.l, paddingVertical: SPACE.m, backgroundColor: FUEL.ink },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: FUEL.inkSoft, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontFamily: FONT.display, fontSize: 20, color: FUEL.sand, letterSpacing: 0.5 },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: SPACE.xl, gap: SPACE.m },
  centerText: { fontFamily: FONT.bodyExtrabold, fontSize: 16, color: FUEL.ink, marginTop: SPACE.s },

  amount: { fontFamily: FONT.display, fontSize: 44, color: FUEL.ink },
  mockBadge: { backgroundColor: FUEL.ink, borderRadius: RADIUS.pill, paddingHorizontal: SPACE.m, paddingVertical: 5 },
  mockBadgeText: { fontFamily: FONT.bodyExtrabold, fontSize: 11, color: FUEL.lime, letterSpacing: 1 },
  mockNote: { fontFamily: FONT.body, fontSize: 13, color: FUEL.muted, textAlign: 'center', lineHeight: 19, maxWidth: 300 },

  cta: { flexDirection: 'row', alignItems: 'center', gap: SPACE.s, backgroundColor: FUEL.lime, borderRadius: RADIUS.pill, paddingHorizontal: SPACE.xl, paddingVertical: SPACE.m, marginTop: SPACE.m, minWidth: 220, justifyContent: 'center' },
  ctaText: { fontFamily: FONT.bodyExtrabold, fontSize: 14, color: FUEL.ink, letterSpacing: 0.5 },
  cancelLink: { fontFamily: FONT.bodySemibold, fontSize: 13, color: FUEL.muted },

  successCircle: { width: 72, height: 72, borderRadius: 36, backgroundColor: FUEL.lime, alignItems: 'center', justifyContent: 'center' },
  failCircle: { width: 68, height: 68, borderRadius: 34, backgroundColor: FUEL.error, alignItems: 'center', justifyContent: 'center' },
  failSub: { fontFamily: FONT.body, fontSize: 13, color: FUEL.muted, textAlign: 'center', maxWidth: 300, lineHeight: 19 },

  webLoading: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', backgroundColor: FUEL.sand, gap: SPACE.s },
});
