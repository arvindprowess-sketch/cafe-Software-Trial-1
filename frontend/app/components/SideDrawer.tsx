import React from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Modal, Animated,
  Dimensions, ScrollView, Pressable
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { logout } from '../../utils/api';

const { width } = Dimensions.get('window');
const DRAWER_WIDTH = width * 0.8;
const Z_RED = '#E23744';
const GREEN = '#267E3E';

interface SideDrawerProps {
  visible: boolean;
  onClose: () => void;
  user: any;
}

const MENU_ITEMS = [
  { id: 'orders', label: 'Recent Orders', icon: 'time-outline', route: '/(tabs)/orders' },
  { id: 'addresses', label: 'Saved Addresses', icon: 'location-outline', route: null },
  { id: 'deals', label: 'Saved Deals', icon: 'pricetag-outline', route: null },
  { id: 'divider1', type: 'divider' },
  { id: 'nutrition', label: 'Nutrition Info', icon: 'nutrition-outline', route: '/(tabs)/profile' },
  { id: 'faq', label: 'FAQs & Support', icon: 'help-circle-outline', route: null },
  { id: 'divider2', type: 'divider' },
  { id: 'logout', label: 'Logout', icon: 'log-out-outline', route: 'logout', color: Z_RED },
];

export default function SideDrawer({ visible, onClose, user }: SideDrawerProps) {
  const router = useRouter();
  const slideAnim = React.useRef(new Animated.Value(-DRAWER_WIDTH)).current;

  React.useEffect(() => {
    Animated.timing(slideAnim, {
      toValue: visible ? 0 : -DRAWER_WIDTH,
      duration: 250,
      useNativeDriver: true,
    }).start();
  }, [visible]);

  const handleItemPress = async (item: any) => {
    if (item.route === 'logout') {
      await logout();
      onClose();
      router.replace('/');
    } else if (item.route) {
      onClose();
      router.push(item.route);
    } else {
      // Coming soon
      onClose();
    }
  };

  if (!visible) return null;

  return (
    <Modal transparent visible={visible} animationType="none" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <Animated.View style={[styles.drawer, { transform: [{ translateX: slideAnim }] }]}>
          {/* Header with User Info */}
          <View style={styles.header}>
            <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
              <Ionicons name="arrow-back" size={24} color="#1C1C2E" />
            </TouchableOpacity>
            <TouchableOpacity style={styles.notifBtn}>
              <Ionicons name="notifications-outline" size={22} color="#1C1C2E" />
            </TouchableOpacity>
          </View>

          {/* User Profile */}
          <View style={styles.profile}>
            <View style={styles.avatar}>
              <Ionicons name="person" size={28} color={Z_RED} />
            </View>
            <View style={styles.userInfo}>
              <View style={styles.nameRow}>
                <Text style={styles.userName}>{user?.name || 'Guest User'}</Text>
                <Ionicons name="pencil" size={14} color="#9C9C9C" />
              </View>
              <Text style={styles.userPhone}>{user?.phone || user?.email || ''}</Text>
            </View>
          </View>

          {/* Fitness Goal Card */}
          <View style={styles.goalCard}>
            <View style={styles.goalIcon}>
              <Ionicons name="fitness" size={20} color="#FFF" />
            </View>
            <Text style={styles.goalText}>
              {user?.fitness_goal === 'fat_loss' ? 'Fat Loss' : 
               user?.fitness_goal === 'muscle_gain' ? 'Muscle Gain' : 'Maintenance'}
            </Text>
            <TouchableOpacity style={styles.goalBtn} onPress={() => { onClose(); router.push('/(tabs)/profile'); }}>
              <Text style={styles.goalBtnText}>Update</Text>
            </TouchableOpacity>
          </View>

          {/* Menu Items */}
          <ScrollView style={styles.menuList} showsVerticalScrollIndicator={false}>
            {MENU_ITEMS.map((item) => {
              if (item.type === 'divider') {
                return <View key={item.id} style={styles.divider} />;
              }
              return (
                <TouchableOpacity
                  key={item.id}
                  style={styles.menuItem}
                  onPress={() => handleItemPress(item)}
                  testID={`drawer-${item.id}`}
                >
                  <Ionicons 
                    name={item.icon as any} 
                    size={22} 
                    color={item.color || '#1C1C2E'} 
                  />
                  <Text style={[styles.menuLabel, item.color && { color: item.color }]}>
                    {item.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {/* App Version */}
          <Text style={styles.version}>Diet Cafe v1.3</Text>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, flexDirection: 'row' },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
  drawer: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: DRAWER_WIDTH,
    backgroundColor: '#FFF8F0',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 50,
    paddingBottom: 10,
  },
  closeBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  notifBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  profile: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 20,
    gap: 14,
  },
  avatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#FDE8EA',
    alignItems: 'center',
    justifyContent: 'center',
  },
  userInfo: { flex: 1 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  userName: { fontSize: 20, fontWeight: '700', color: '#1C1C2E' },
  userPhone: { fontSize: 14, color: '#696969', marginTop: 2 },
  
  goalCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#4A3728',
    marginHorizontal: 16,
    borderRadius: 14,
    padding: 14,
    gap: 12,
  },
  goalIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Z_RED,
    alignItems: 'center',
    justifyContent: 'center',
  },
  goalText: { flex: 1, fontSize: 14, fontWeight: '600', color: '#FFF' },
  goalBtn: {
    backgroundColor: Z_RED,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  goalBtnText: { color: '#FFF', fontSize: 12, fontWeight: '700' },
  
  menuList: { flex: 1, marginTop: 20 },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    gap: 16,
  },
  menuLabel: { fontSize: 16, fontWeight: '600', color: '#1C1C2E' },
  divider: { height: 1, backgroundColor: '#E8E8E8', marginVertical: 8, marginHorizontal: 20 },
  
  version: { 
    textAlign: 'center', 
    color: '#B0B0B0', 
    fontSize: 12, 
    paddingBottom: 30,
    paddingTop: 10,
  },
});
