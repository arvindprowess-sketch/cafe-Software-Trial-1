import React, { useEffect, useRef } from 'react';
import {
  Pressable,
  PressableProps,
  AccessibilityInfo,
  GestureResponderEvent,
  StyleProp,
  ViewStyle,
} from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withSpring } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

const SPRING_CONFIG = { damping: 20, stiffness: 300 };

// Shared reduced-motion tracker: reads the OS setting once and stays in sync
// via the change listener. Returned as a ref so handlers always see the latest
// value without re-rendering.
export function useReduceMotion() {
  const reduceMotion = useRef(false);
  useEffect(() => {
    let mounted = true;
    try {
      AccessibilityInfo.isReduceMotionEnabled()
        .then(enabled => { if (mounted) reduceMotion.current = !!enabled; })
        .catch(() => {});
    } catch {}
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', enabled => {
      reduceMotion.current = !!enabled;
    });
    return () => { mounted = false; sub?.remove?.(); };
  }, []);
  return reduceMotion;
}

export type PressableScaleProps = Omit<PressableProps, 'style'> & {
  /** Fire a light impact haptic on press-in (no-op on web). */
  haptic?: boolean;
  style?: StyleProp<ViewStyle>;
};

// Drop-in Pressable that springs to 0.97 scale while pressed.
// Skips the animation entirely when the user has Reduce Motion enabled.
export default function PressableScale({
  haptic = false,
  style,
  onPressIn,
  onPressOut,
  children,
  ...rest
}: PressableScaleProps) {
  const scale = useSharedValue(1);
  const reduceMotion = useReduceMotion();

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = (e: GestureResponderEvent) => {
    if (haptic) {
      try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); } catch {}
    }
    if (!reduceMotion.current) {
      scale.value = withSpring(0.97, SPRING_CONFIG);
    }
    onPressIn?.(e);
  };

  const handlePressOut = (e: GestureResponderEvent) => {
    if (reduceMotion.current) {
      scale.value = 1; // no animation, just ensure reset
    } else {
      scale.value = withSpring(1, SPRING_CONFIG);
    }
    onPressOut?.(e);
  };

  return (
    <AnimatedPressable
      {...rest}
      style={[style, animatedStyle]}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
    >
      {children}
    </AnimatedPressable>
  );
}
