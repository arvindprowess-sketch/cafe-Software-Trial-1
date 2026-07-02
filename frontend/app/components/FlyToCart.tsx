import React, { createContext, useCallback, useContext, useRef, useState, useEffect } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import Animated, {
  useSharedValue, useAnimatedStyle, withTiming, Easing, runOnJS,
} from 'react-native-reanimated';
import { FUEL, RADIUS } from '../../utils/theme';
import { useReduceMotion } from './PressableScale';

// ============================================================================
// FLY-TO-CART — one app-root overlay any screen can trigger. On ADD, the
// pressed thumbnail's screen rect is measured and a floating copy arcs down to
// the cart pill (bottom-centre), shrinking + fading. The pill's own count-change
// bounce + the caller's success haptic are the landing reaction.
// Reduce Motion -> fly() is a no-op; the caller still adds + bounces + buzzes.
// ============================================================================

export type FlyOrigin = { x: number; y: number; width: number; height: number; imageUri?: string | null };
type FlyCtx = { fly: (origin: FlyOrigin) => void; reduceMotion: React.MutableRefObject<boolean> };

const Ctx = createContext<FlyCtx | null>(null);

type Flight = FlyOrigin & { id: number };

export function FlyToCartProvider({ children }: { children: React.ReactNode }) {
  const [flights, setFlights] = useState<Flight[]>([]);
  const nextId = useRef(0);
  const reduceMotion = useReduceMotion();

  const fly = useCallback((origin: FlyOrigin) => {
    if (reduceMotion.current) return;            // caller keeps the bounce + haptic
    if (!origin || !origin.width) return;
    const id = nextId.current++;
    setFlights((f) => [...f, { ...origin, id }]);
  }, []);

  const remove = useCallback((id: number) => {
    setFlights((f) => f.filter((x) => x.id !== id));
  }, []);

  return (
    <Ctx.Provider value={{ fly, reduceMotion }}>
      {children}
      <View pointerEvents="none" style={styles.overlay}>
        {flights.map((f) => <FlyingItem key={f.id} flight={f} onDone={() => remove(f.id)} />)}
      </View>
    </Ctx.Provider>
  );
}

function FlyingItem({ flight, onDone }: { flight: Flight; onDone: () => void }) {
  const { width, height } = useWindowDimensions();
  const progress = useSharedValue(0);

  // Target: the cart pill sits bottom-centre (pill is ~full-width above the tab
  // bar). Aim a little above the bottom so it lands on the pill.
  const targetX = width / 2 - flight.width * 0.1;
  const targetY = height - 120;

  useEffect(() => {
    progress.value = withTiming(1, { duration: 450, easing: Easing.inOut(Easing.ease) }, (finished) => {
      if (finished) runOnJS(onDone)();
    });
  }, []);

  const style = useAnimatedStyle(() => {
    const p = progress.value;
    const x = flight.x + (targetX - flight.x) * p;
    // Gentle upward arc on the way down (premium curve, not a straight line).
    const arc = -70 * Math.sin(p * Math.PI);
    const y = flight.y + (targetY - flight.y) * p + arc;
    const scale = 1 - 0.8 * p;                    // 1 -> 0.2
    const opacity = p < 0.75 ? 1 : 1 - (p - 0.75) / 0.25;
    return { transform: [{ translateX: x }, { translateY: y }, { scale }], opacity };
  });

  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.flying, { width: flight.width, height: flight.height }, style]}
    >
      {flight.imageUri ? (
        <ExpoImage source={{ uri: flight.imageUri }} style={styles.img} contentFit="cover" />
      ) : (
        <View style={styles.dot} />
      )}
    </Animated.View>
  );
}

export function useFlyToCart() {
  return useContext(Ctx);
}

const styles = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFillObject, zIndex: 999, elevation: 999 },
  flying: { position: 'absolute', left: 0, top: 0, borderRadius: RADIUS.md, overflow: 'hidden' },
  img: { width: '100%', height: '100%', borderRadius: RADIUS.md },
  dot: { width: '100%', height: '100%', borderRadius: 999, backgroundColor: FUEL.lime },
});
