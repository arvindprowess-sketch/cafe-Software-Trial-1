import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

const Z_RED = '#E23744';
const PURPLE = '#5B5FE0';

export default function TabLayout() {
  return (
    <Tabs screenOptions={{ headerShown: false, tabBarStyle: styles.tabBar, tabBarActiveTintColor: Z_RED, tabBarInactiveTintColor: '#9C9C9C', tabBarLabelStyle: styles.tabLabel }}>
      <Tabs.Screen name="home" options={{ title: 'Home', tabBarIcon: ({ color, size }) => <Ionicons name="compass" size={size} color={color} /> }} />
      <Tabs.Screen 
        name="budget-meal" 
        options={{ 
          title: 'Budget', 
          tabBarIcon: ({ color, focused }) => (
            <View style={focused ? styles.budgetIconActive : styles.budgetIcon}>
              <Ionicons name="wallet" size={focused ? 22 : 20} color={focused ? '#FFF' : color} />
            </View>
          ),
          tabBarLabelStyle: styles.budgetLabel,
        }} 
      />
      <Tabs.Screen name="menu" options={{ title: 'Menu', tabBarIcon: ({ color, size }) => <Ionicons name="restaurant" size={size} color={color} /> }} />
      <Tabs.Screen name="orders" options={{ title: 'Orders', tabBarIcon: ({ color, size }) => <Ionicons name="receipt" size={size} color={color} /> }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile', tabBarIcon: ({ color, size }) => <Ionicons name="person" size={size} color={color} /> }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBar: { backgroundColor: '#FFF', borderTopColor: '#EFEFEF', borderTopWidth: 1, height: 60, paddingBottom: 6, paddingTop: 6, elevation: 8 },
  tabLabel: { fontSize: 10, fontWeight: '600' },
  budgetLabel: { fontSize: 10, fontWeight: '700' },
  budgetIcon: { },
  budgetIconActive: { 
    backgroundColor: PURPLE, 
    width: 40, 
    height: 40, 
    borderRadius: 20, 
    alignItems: 'center', 
    justifyContent: 'center',
    marginTop: -15,
    shadowColor: PURPLE,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
});
