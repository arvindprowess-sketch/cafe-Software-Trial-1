import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { FUEL, FONT, RADIUS, SPACE } from '../../utils/theme';
import { useCart } from '../../utils/CartContext';

// Persistent floating cart pill shown on browsing screens.
// Tapping opens the unified Cart page.
export default function CartPill({ bottom = 80 }: { bottom?: number }) {
  const router = useRouter();
  const { count, subtotal } = useCart();
  if (count <= 0) return null;
  return (
    <TouchableOpacity
      testID="cart-pill"
      activeOpacity={0.9}
      style={[styles.pill, { bottom }]}
      onPress={() => router.push('/cart')}
    >
      <View style={styles.left}>
        <View style={styles.badge}>
          <Ionicons name="basket" size={16} color={FUEL.ink} />
        </View>
        <View>
          <Text style={styles.title}>Cart · {count} item{count > 1 ? 's' : ''}</Text>
          <Text style={styles.sub}>₹{Math.round(subtotal)}</Text>
        </View>
      </View>
      <View style={styles.right}>
        <Text style={styles.viewText}>View Cart</Text>
        <Ionicons name="arrow-forward" size={16} color={FUEL.lime} />
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  pill: {
    position: 'absolute', left: 16, right: 16,
    backgroundColor: FUEL.ink, borderRadius: RADIUS.pill,
    paddingVertical: SPACE.m, paddingHorizontal: SPACE.l,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    shadowColor: '#000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.3, shadowRadius: 12, elevation: 14,
    zIndex: 200,
  },
  left: { flexDirection: 'row', alignItems: 'center', gap: SPACE.m },
  badge: { width: 34, height: 34, borderRadius: 17, backgroundColor: FUEL.lime, alignItems: 'center', justifyContent: 'center' }, // circle
  title: { color: FUEL.white, fontSize: 13, fontFamily: FONT.bodyExtrabold },
  sub: { color: FUEL.lime, fontSize: 15, fontFamily: FONT.display, marginTop: 1 },
  right: { flexDirection: 'row', alignItems: 'center', gap: SPACE.s },
  viewText: { color: FUEL.lime, fontSize: 14, fontFamily: FONT.bodyExtrabold, textTransform: 'uppercase', letterSpacing: 0.5 },
});
