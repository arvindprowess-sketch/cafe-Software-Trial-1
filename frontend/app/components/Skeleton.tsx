import React, { useEffect } from 'react';
import { View, StyleSheet, ViewStyle, StyleProp, DimensionValue } from 'react-native';
import Animated, {
  useSharedValue, useAnimatedStyle, withRepeat, withTiming, Easing,
} from 'react-native-reanimated';
import { RADIUS, SPACE } from '../../utils/theme';
import { useReduceMotion } from './PressableScale';

// FUEL-tinted skeleton palette: a sand-ish base that pulses toward a lighter
// highlight. Motion only — same layout/colors as the real content that follows.
const BASE = '#ECE8DE';
const HIGHLIGHT = '#F4F1E9';

type SkeletonProps = {
  width?: DimensionValue;
  height?: number;
  radius?: number;
  style?: StyleProp<ViewStyle>;
};

// One shimmer block. Pulses opacity 0.45 -> 1 on a ~1s loop (UI thread).
// Reduce Motion -> a static light block, no pulse (content still loads).
export function Skeleton({ width = '100%', height = 16, radius = RADIUS.sm, style }: SkeletonProps) {
  const reduceMotion = useReduceMotion();
  const pulse = useSharedValue(1);

  useEffect(() => {
    if (reduceMotion.current) return;
    pulse.value = withRepeat(
      withTiming(0.45, { duration: 850, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({ opacity: pulse.value }));

  return (
    <Animated.View
      style={[{ width, height, borderRadius: radius, backgroundColor: BASE }, animatedStyle, style]}
    />
  );
}

// A single skeleton highlight-tinted block for accents (e.g. price/button).
export function SkeletonBlock(props: SkeletonProps) {
  return <Skeleton {...props} style={[{ backgroundColor: HIGHLIGHT }, props.style]} />;
}

// ---- Composed, content-shaped skeletons ----

// Menu product row: photo square + two text lines + price + ADD block.
export function MenuRowSkeleton() {
  return (
    <View style={styles.menuRow}>
      <Skeleton width={72} height={72} radius={RADIUS.md} />
      <View style={styles.menuBody}>
        <Skeleton width="70%" height={14} />
        <Skeleton width="45%" height={11} style={{ marginTop: 8 }} />
        <View style={styles.menuFooter}>
          <Skeleton width={64} height={20} radius={RADIUS.sm} />
          <Skeleton width={72} height={30} radius={RADIUS.lg} />
        </View>
      </View>
    </View>
  );
}

// Generic list row: leading dot/badge + two lines + trailing value.
export function ListRowSkeleton() {
  return (
    <View style={styles.listRow}>
      <Skeleton width={40} height={40} radius={RADIUS.md} />
      <View style={{ flex: 1 }}>
        <Skeleton width="55%" height={13} />
        <Skeleton width="35%" height={11} style={{ marginTop: 8 }} />
      </View>
      <Skeleton width={56} height={22} radius={RADIUS.sm} />
    </View>
  );
}

// N rows of a given skeleton, laid out with card spacing.
export function SkeletonList({ count = 6, row = 'list' as 'list' | 'menu' }) {
  const Row = row === 'menu' ? MenuRowSkeleton : ListRowSkeleton;
  return (
    <View style={styles.listWrap}>
      {Array.from({ length: count }).map((_, i) => <Row key={i} />)}
    </View>
  );
}

// Home skeleton: hero block + goal chips row + a section of cards.
export function HomeSkeleton() {
  return (
    <View style={styles.homeWrap}>
      <Skeleton height={150} radius={RADIUS.lg} />
      <View style={styles.chipRow}>
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} width={84} height={34} radius={RADIUS.pill} />)}
      </View>
      <Skeleton width="45%" height={16} style={{ marginTop: SPACE.l }} />
      <View style={styles.cardRow}>
        {Array.from({ length: 3 }).map((_, i) => (
          <View key={i} style={styles.card}>
            <Skeleton height={96} radius={RADIUS.md} />
            <Skeleton width="80%" height={12} style={{ marginTop: 8 }} />
            <Skeleton width="50%" height={11} style={{ marginTop: 6 }} />
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  menuRow: { flexDirection: 'row', gap: SPACE.m, backgroundColor: '#FFFFFF', borderRadius: RADIUS.md, borderWidth: 1, borderColor: '#E6E1D4', padding: SPACE.m, marginBottom: 10 },
  menuBody: { flex: 1, justifyContent: 'center' },
  menuFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 14 },
  listRow: { flexDirection: 'row', alignItems: 'center', gap: SPACE.m, backgroundColor: '#FFFFFF', borderRadius: RADIUS.md, borderWidth: 1, borderColor: '#E6E1D4', padding: SPACE.m, marginBottom: SPACE.s },
  listWrap: { paddingHorizontal: SPACE.s, paddingTop: SPACE.s },
  homeWrap: { paddingHorizontal: SPACE.l, paddingTop: SPACE.l },
  chipRow: { flexDirection: 'row', gap: SPACE.s, marginTop: SPACE.l },
  cardRow: { flexDirection: 'row', gap: SPACE.m, marginTop: SPACE.m },
  card: { flex: 1, backgroundColor: '#FFFFFF', borderRadius: RADIUS.md, borderWidth: 1, borderColor: '#E6E1D4', padding: SPACE.s },
});
