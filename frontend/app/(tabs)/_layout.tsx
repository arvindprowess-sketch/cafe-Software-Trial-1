import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

const Z_RED = '#D62300';
const BK_BROWN = '#502314';
const BK_ORANGE = '#FF8732';
const BK_CREAM = '#F5EBDC';

export default function TabLayout() {
  return (
    <Tabs screenOptions={{ headerShown: false, tabBarStyle: styles.tabBar, tabBarActiveTintColor: BK_ORANGE, tabBarInactiveTintColor: 'rgba(245,235,220,0.5)', tabBarLabelStyle: styles.tabLabel }}>
      <Tabs.Screen name="home" options={{ title: 'Home', tabBarIcon: ({ color, size }) => <Ionicons name="compass" size={size} color={color} /> }} />
      <Tabs.Screen 
        name="budget-meal" 
        options={{ 
          title: 'Budget', 
          tabBarIcon: ({ color, focused }) => (
            <View style={focused ? styles.budgetIconActive : styles.budgetIcon}>
              <Ionicons name="wallet" size={focused ? 22 : 20} color={focused ? BK_CREAM : color} />
            </View>
          ),
          tabBarLabelStyle: styles.budgetLabel,
        }} 
      />
      <Tabs.Screen name="menu" options={{ title: 'Menu', tabBarIcon: ({ color, size }) => <Ionicons name="restaurant" size={size} color={color} /> }} />
      <Tabs.Screen name="orders" options={{ title: 'Orders', tabBarIcon: ({ color, size }) => <Ionicons name="receipt" size={size} color={color} /> }} />
      <Tabs.Screen name="profile" options={{ href: null }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBar: { backgroundColor: BK_BROWN, borderTopColor: 'rgba(245,235,220,0.1)', borderTopWidth: 1, height: 62, paddingBottom: 6, paddingTop: 6, elevation: 8 },
  tabLabel: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  budgetLabel: { fontSize: 10, fontWeight: '800', textTransform: 'uppercase' },
  budgetIcon: { },
  budgetIconActive: { 
    backgroundColor: Z_RED, 
    width: 42, 
    height: 42, 
    borderRadius: 21, 
    alignItems: 'center', 
    justifyContent: 'center',
    marginTop: -15,
    shadowColor: Z_RED,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
});
