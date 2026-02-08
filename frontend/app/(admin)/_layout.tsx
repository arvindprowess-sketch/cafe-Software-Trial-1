import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { StyleSheet } from 'react-native';

const Z_RED = '#E23744';

export default function AdminLayout() {
  return (
    <Tabs screenOptions={{ headerShown: false, tabBarStyle: styles.tabBar, tabBarActiveTintColor: Z_RED, tabBarInactiveTintColor: '#9C9C9C', tabBarLabelStyle: styles.tabLabel }}>
      <Tabs.Screen name="dashboard" options={{ title: 'Dashboard', tabBarIcon: ({ color, size }) => <Ionicons name="grid" size={size} color={color} /> }} />
      <Tabs.Screen name="products" options={{ title: 'Products', tabBarIcon: ({ color, size }) => <Ionicons name="nutrition" size={size} color={color} /> }} />
      <Tabs.Screen name="staff" options={{ title: 'Staff', tabBarIcon: ({ color, size }) => <Ionicons name="people" size={size} color={color} /> }} />
      {/* Hidden screens - accessible via dashboard quick actions */}
      <Tabs.Screen name="kitchen" options={{ href: null }} />
      <Tabs.Screen name="categories" options={{ href: null }} />
      <Tabs.Screen name="offers" options={{ href: null }} />
      <Tabs.Screen name="packs" options={{ href: null }} />
      <Tabs.Screen name="analytics" options={{ href: null }} />
      <Tabs.Screen name="tables" options={{ href: null }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBar: { backgroundColor: '#FFF', borderTopColor: '#EFEFEF', borderTopWidth: 1, height: 60, paddingBottom: 6, paddingTop: 6, elevation: 8 },
  tabLabel: { fontSize: 10, fontWeight: '600' },
});
