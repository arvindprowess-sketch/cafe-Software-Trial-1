// ============================================================================
// Tab bar hide/show — shared singleton driven by the Home scroll position.
// The (tabs) layout applies `tabBarTranslateY` to the tab bar's transform;
// screens call setTabBarHidden() to slide it away on scroll-down and back on
// scroll-up. Kept as a module singleton so screens and the layout stay
// decoupled (no context wiring across the Tabs navigator).
// ============================================================================
import { Animated } from 'react-native';

// 0 = fully visible, HIDE_OFFSET = slid down out of view.
export const HIDE_OFFSET = 120;
export const tabBarTranslateY = new Animated.Value(0);

let hidden = false;

export function setTabBarHidden(next: boolean) {
  if (next === hidden) return;
  hidden = next;
  Animated.timing(tabBarTranslateY, {
    toValue: next ? HIDE_OFFSET : 0,
    duration: 240,
    useNativeDriver: true,
  }).start();
}

// Reset to visible (e.g. when a screen mounts/regains focus).
export function resetTabBar() {
  hidden = false;
  tabBarTranslateY.setValue(0);
}
