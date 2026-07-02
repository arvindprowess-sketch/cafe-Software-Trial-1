import { Tabs } from 'expo-router';
import { BottomTabBar } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { Animated, StyleSheet, View, Text } from 'react-native';
import { FUEL, FONT, SPACE } from '../../utils/theme';
import { tabBarTranslateY } from '../../utils/tabBar';

export default function TabLayout() {
  return (
    <Tabs
      // Slide the nav away on scroll-down via our OWN Animated.View wrapper
      // rather than injecting the transform into tabBarStyle: BottomTabBar
      // applies its own translateY transform to the same node, and the two
      // conflict (works on Android, silently no-ops on iOS). Owning the
      // transform on a separate wrapper decouples us from that internal node.
      tabBar={(props) => (
        <Animated.View style={[styles.tabBarWrap, { transform: [{ translateY: tabBarTranslateY }] }]}>
          <BottomTabBar {...props} />
        </Animated.View>
      )}
      screenOptions={{
        headerShown: false,
        tabBarStyle: styles.tabBar,
        tabBarActiveTintColor: FUEL.lime,
        tabBarInactiveTintColor: 'rgba(244,241,233,0.55)',
        tabBarLabelStyle: styles.tabLabel,
      }}
    >
      <Tabs.Screen
        name="home"
        options={{ title: 'Home', tabBarButtonTestID: 'tab-home', tabBarIcon: ({ color, size }) => <Ionicons name="compass" size={size} color={color} /> }}
      />
      <Tabs.Screen
        name="menu"
        options={{ title: 'Menu', tabBarButtonTestID: 'tab-menu', tabBarIcon: ({ color, size }) => <Ionicons name="restaurant" size={size} color={color} /> }}
      />
      {/* Raised circular lime center button — "⚡ Build my meal" */}
      <Tabs.Screen
        name="budget-meal"
        options={{
          title: 'Build',
          tabBarButtonTestID: 'tab-build',
          tabBarLabel: () => null,
          tabBarIcon: ({ focused }) => (
            <View style={styles.centerWrap} pointerEvents="none">
              <View style={[styles.centerBtn, focused && styles.centerBtnActive]}>
                <Ionicons name="flash" size={24} color={FUEL.ink} />
              </View>
              <Text style={styles.centerLabel}>BUILD</Text>
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="orders"
        options={{ title: 'Orders', tabBarButtonTestID: 'tab-orders', tabBarIcon: ({ color, size }) => <Ionicons name="receipt" size={size} color={color} /> }}
      />
      <Tabs.Screen name="profile" options={{ href: null }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  // The wrapper owns absolute positioning (and our hide/show transform) so the
  // bar reserves no layout slot and reveals the sand scene when it slides away.
  tabBarWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
  },
  tabBar: {
    backgroundColor: FUEL.ink,
    borderTopWidth: 0,
    height: 66,
    paddingBottom: SPACE.s,
    paddingTop: SPACE.s,
    elevation: 8,
  },
  tabLabel: {
    fontSize: 10,
    fontFamily: FONT.bodyExtrabold,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  centerWrap: { alignItems: 'center', justifyContent: 'center', width: 64 },
  centerBtn: {
    width: 56,
    height: 56,
    borderRadius: 28, // circle
    backgroundColor: FUEL.lime,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -24,
    borderWidth: 4,
    borderColor: FUEL.ink,
    shadowColor: FUEL.lime,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 8,
    elevation: 10,
  },
  centerBtnActive: { backgroundColor: FUEL.limeDeep },
  centerLabel: {
    fontSize: 9,
    fontFamily: FONT.bodyExtrabold,
    color: FUEL.lime,
    letterSpacing: 0.6,
    marginTop: 3,
  },
});
