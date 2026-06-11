import React, { useEffect, useState } from 'react';
import { View, StyleProp, ViewStyle, DimensionValue } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  cancelAnimation,
} from 'react-native-reanimated';
import { FUEL, RADIUS, SPACE } from '../../utils/theme';
import { useReduceMotion } from './PressableScale';

const PULSE_MIN = 0.45;
const PULSE_MAX = 0.9;
const PULSE_MS = 700;

export type SkeletonProps = {
  width?: DimensionValue;
  height?: DimensionValue;
  borderRadius?: number;
  style?: StyleProp<ViewStyle>;
};

// Sand-tone shimmering block: FUEL.sandBorder background whose opacity pulses.
// Falls back to a static block when the user has Reduce Motion enabled.
export default function Skeleton({
  width,
  height = 16,
  borderRadius = RADIUS.md,
  style,
}: SkeletonProps) {
  const reduceMotion = useReduceMotion();
  // The shared hook is ref-based (no re-render); read it once after mount so
  // the OS setting (resolved async) is respected without animating first.
  const [animate, setAnimate] = useState(false);
  const opacity = useSharedValue(PULSE_MAX);

  useEffect(() => {
    const id = setTimeout(() => setAnimate(!reduceMotion.current), 0);
    return () => clearTimeout(id);
  }, [reduceMotion]);

  useEffect(() => {
    if (!animate) return;
    opacity.value = withRepeat(
      withTiming(PULSE_MIN, { duration: PULSE_MS }),
      -1,
      true,
    );
    return () => {
      cancelAnimation(opacity);
      opacity.value = PULSE_MAX;
    };
  }, [animate, opacity]);

  const animatedStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  const base: ViewStyle = {
    width,
    height,
    borderRadius,
    backgroundColor: FUEL.sandBorder,
  };

  if (!animate) {
    return <View style={[base, { opacity: (PULSE_MIN + PULSE_MAX) / 2 }, style]} />;
  }
  return <Animated.View style={[base, animatedStyle, style]} />;
}

// Convenience composition: photo square + two text lines (menu/orders style row).
export function SkeletonRow({
  photoSize = 72,
  style,
}: {
  photoSize?: number;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[{ flexDirection: 'row', gap: SPACE.m, alignItems: 'center' }, style]}>
      <Skeleton width={photoSize} height={photoSize} />
      <View style={{ flex: 1, gap: SPACE.s }}>
        <Skeleton width="70%" height={14} borderRadius={RADIUS.xs} />
        <Skeleton width="45%" height={12} borderRadius={RADIUS.xs} />
        <Skeleton width="30%" height={12} borderRadius={RADIUS.xs} />
      </View>
    </View>
  );
}
