import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { StyleSheet } from 'react-native';

const ORANGE = '#FF9F0A';

export default function KitchenLayout() {
  return (
    <Tabs screenOptions={{ headerShown: false, tabBarStyle: styles.tabBar, tabBarActiveTintColor: ORANGE, tabBarInactiveTintColor: '#9C9C9C', tabBarLabelStyle: styles.tabLabel }}>
      <Tabs.Screen name="orders" options={{ title: 'Orders', tabBarIcon: ({ color, size }) => <Ionicons name="receipt" size={size} color={color} /> }} />
      <Tabs.Screen name="inventory" options={{ title: 'Inventory', tabBarIcon: ({ color, size }) => <Ionicons name="cube" size={size} color={color} /> }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBar: { backgroundColor: '#FFF', borderTopColor: '#EFEFEF', borderTopWidth: 1, height: 60, paddingBottom: 6, paddingTop: 6, elevation: 8 },
  tabLabel: { fontSize: 11, fontWeight: '600' },
});
