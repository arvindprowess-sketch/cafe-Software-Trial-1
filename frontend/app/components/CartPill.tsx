import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withSequence, withSpring } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { FUEL, FONT, RADIUS, SPACE } from '../../utils/theme';
import { useCart } from '../../utils/CartContext';
import PressableScale, { useReduceMotion } from './PressableScale';

// Persistent floating cart pill shown on browsing screens.
// Tapping opens the unified Cart page.
export default function CartPill({ bottom = 80 }: { bottom?: number }) {
  const router = useRouter();
  const { count, subtotal } = useCart();
  const reduceMotion = useReduceMotion();

  // PR-C: small spring bounce (1 → 1.12 → 1) on the count area whenever the
  // cart count changes. Skipped under Reduce Motion (content still updates).
  const bounce = useSharedValue(1);
  const prevCount = useRef(count);
  useEffect(() => {
    if (prevCount.current !== count && count > 0 && !reduceMotion.current) {
      bounce.value = withSequence(
        withSpring(1.12, { damping: 14, stiffness: 320 }),
        withSpring(1, { damping: 14, stiffness: 320 }),
      );
    }
    prevCount.current = count;
  }, [count]);

  const bounceStyle = useAnimatedStyle(() => ({
    transform: [{ scale: bounce.value }],
  }));

  if (count <= 0) return null;
  return (
    <PressableScale
      testID="cart-pill"
      style={[styles.pill, { bottom }]}
      onPress={() => router.push('/cart')}
    >
      <Animated.View style={[styles.left, bounceStyle]}>
        <View style={styles.badge}>
          <Ionicons name="basket" size={16} color={FUEL.ink} />
        </View>
        <View>
          <Text style={styles.title}>Cart · {count} item{count > 1 ? 's' : ''}</Text>
          <Text style={styles.sub}>₹{Math.round(subtotal)}</Text>
        </View>
      </Animated.View>
      <View style={styles.right}>
        <Text style={styles.viewText}>View Cart</Text>
        <Ionicons name="arrow-forward" size={16} color={FUEL.lime} />
      </View>
    </PressableScale>
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
