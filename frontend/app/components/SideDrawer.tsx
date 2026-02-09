import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Modal, Animated,
  Dimensions, ScrollView, Pressable, TextInput, Alert
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { apiCall, logout } from '../../utils/api';

const { width } = Dimensions.get('window');
const DRAWER_WIDTH = width * 0.85;
const Z_RED = '#D62300';
const GREEN = '#509E2F';
const PURPLE = '#FF8732';

interface SideDrawerProps {
  visible: boolean;
  onClose: () => void;
  user: any;
}

const GOALS = [
  { key: 'fat_loss', label: 'Fat Loss', icon: 'trending-down' as const, color: Z_RED },
  { key: 'muscle_gain', label: 'Muscle Gain', icon: 'trending-up' as const, color: GREEN },
  { key: 'maintenance', label: 'Maintain', icon: 'swap-horizontal' as const, color: PURPLE },
];

const MENU_ITEMS = [
  { id: 'orders', label: 'Recent Orders', icon: 'time-outline', route: '/(tabs)/orders' },
  { id: 'addresses', label: 'Saved Addresses', icon: 'location-outline', route: null },
  { id: 'deals', label: 'Saved Deals', icon: 'pricetag-outline', route: null },
  { id: 'divider1', type: 'divider' },
  { id: 'faq', label: 'FAQs & Support', icon: 'help-circle-outline', route: null },
];

export default function SideDrawer({ visible, onClose, user }: SideDrawerProps) {
  const router = useRouter();
  const slideAnim = React.useRef(new Animated.Value(-DRAWER_WIDTH)).current;

  // Profile state
  const [showGoals, setShowGoals] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState(user?.name || 'Guest User');
  const [savingName, setSavingName] = useState(false);
  const [goal, setGoal] = useState(user?.fitness_goal || 'maintenance');
  const [calories, setCalories] = useState(String(user?.daily_calories || 2000));
  const [protein, setProtein] = useState(String(user?.daily_protein || 100));
  const [carbs, setCarbs] = useState(String(user?.daily_carbs || 250));
  const [fat, setFat] = useState(String(user?.daily_fat || 65));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (user) {
      setGoal(user.fitness_goal || 'maintenance');
      setNameValue(user.name || 'Guest User');
      setCalories(String(user.daily_calories || 2000));
      setProtein(String(user.daily_protein || 100));
      setCarbs(String(user.daily_carbs || 250));
      setFat(String(user.daily_fat || 65));
    }
  }, [user]);

  const saveName = async () => {
    if (!nameValue.trim()) return;
    setSavingName(true);
    try {
      await apiCall('/user/profile', { method: 'PUT', body: { name: nameValue.trim() } });
      setEditingName(false);
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setSavingName(false);
    }
  };

  React.useEffect(() => {
    Animated.timing(slideAnim, {
      toValue: visible ? 0 : -DRAWER_WIDTH,
      duration: 250,
      useNativeDriver: true,
    }).start();
  }, [visible]);

  const saveGoals = async () => {
    setSaving(true);
    try {
      await apiCall('/user/goals', {
        method: 'PUT',
        body: {
          fitness_goal: goal,
          daily_calories: parseInt(calories) || 2000,
          daily_protein: parseInt(protein) || 100,
          daily_carbs: parseInt(carbs) || 250,
          daily_fat: parseInt(fat) || 65,
        },
      });
      Alert.alert('Saved!', 'Your fitness goals updated');
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleItemPress = async (item: any) => {
    if (item.route) {
      onClose();
      router.push(item.route);
    } else {
      onClose();
    }
  };

  const handleLogout = async () => {
    await logout();
    onClose();
    router.replace('/');
  };

  if (!visible) return null;

  return (
    <Modal transparent visible={visible} animationType="none" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <Animated.View style={[styles.drawer, { transform: [{ translateX: slideAnim }] }]}>
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity style={styles.closeBtn} onPress={onClose} data-testid="drawer-close-btn">
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
              {editingName ? (
                <View style={styles.editNameRow}>
                  <TextInput
                    style={styles.editNameInput}
                    value={nameValue}
                    onChangeText={setNameValue}
                    autoFocus
                    data-testid="drawer-edit-name-input"
                  />
                  <TouchableOpacity onPress={saveName} disabled={savingName} data-testid="drawer-save-name-btn">
                    <Ionicons name="checkmark-circle" size={28} color={GREEN} />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => { setEditingName(false); setNameValue(user?.name || 'Guest User'); }}>
                    <Ionicons name="close-circle" size={28} color="#9C9C9C" />
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={styles.nameRow}>
                  <Text style={styles.userName}>{nameValue}</Text>
                  <TouchableOpacity onPress={() => setEditingName(true)} data-testid="drawer-edit-name-btn">
                    <Ionicons name="pencil" size={14} color="#9C9C9C" />
                  </TouchableOpacity>
                </View>
              )}
              <Text style={styles.userPhone}>{user?.phone || user?.email || ''}</Text>
            </View>
          </View>

          {/* Fitness Goal Toggle Card */}
          <TouchableOpacity
            style={styles.goalCard}
            onPress={() => setShowGoals(!showGoals)}
            data-testid="drawer-fitness-toggle"
          >
            <View style={styles.goalIconBox}>
              <Ionicons name="fitness" size={20} color="#FFF" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.goalText}>
                {goal === 'fat_loss' ? 'Fat Loss' : goal === 'muscle_gain' ? 'Muscle Gain' : 'Maintenance'}
              </Text>
              <Text style={styles.goalSub}>{calories} kcal target</Text>
            </View>
            <Ionicons name={showGoals ? 'chevron-up' : 'chevron-down'} size={20} color="#FFF" />
          </TouchableOpacity>

          <ScrollView style={styles.menuList} showsVerticalScrollIndicator={false}>
            {/* Expandable Goals Section */}
            {showGoals && (
              <View style={styles.goalsSection} data-testid="drawer-goals-section">
                <Text style={styles.sectionTitle}>Fitness Goal</Text>
                <View style={styles.goalsRow}>
                  {GOALS.map(g => (
                    <TouchableOpacity
                      key={g.key}
                      data-testid={`drawer-goal-${g.key}`}
                      style={[styles.goalPill, goal === g.key && { borderColor: g.color, backgroundColor: `${g.color}15` }]}
                      onPress={() => setGoal(g.key)}
                    >
                      <Ionicons name={g.icon} size={16} color={goal === g.key ? g.color : '#8B6F61'} />
                      <Text style={[styles.goalPillText, goal === g.key && { color: g.color, fontWeight: '700' }]}>{g.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <Text style={styles.sectionTitle}>Daily Targets</Text>
                <View style={styles.targetsGrid}>
                  {[
                    { label: 'Calories', val: calories, set: setCalories, unit: 'kcal', color: Z_RED },
                    { label: 'Protein', val: protein, set: setProtein, unit: 'g', color: Z_RED },
                    { label: 'Carbs', val: carbs, set: setCarbs, unit: 'g', color: '#FF9F0A' },
                    { label: 'Fat', val: fat, set: setFat, unit: 'g', color: PURPLE },
                  ].map(t => (
                    <View key={t.label} style={styles.targetCard}>
                      <Text style={[styles.targetLabel, { color: t.color }]}>{t.label}</Text>
                      <View style={styles.targetInputRow}>
                        <TextInput
                          data-testid={`drawer-target-${t.label.toLowerCase()}`}
                          style={styles.targetInput}
                          value={t.val}
                          onChangeText={t.set}
                          keyboardType="number-pad"
                        />
                        <Text style={styles.targetUnit}>{t.unit}</Text>
                      </View>
                    </View>
                  ))}
                </View>

                <TouchableOpacity
                  style={styles.saveBtn}
                  onPress={saveGoals}
                  disabled={saving}
                  data-testid="drawer-save-goals-btn"
                >
                  <Ionicons name="checkmark-circle" size={18} color="#FFF" />
                  <Text style={styles.saveBtnText}>{saving ? 'Saving...' : 'Save Goals'}</Text>
                </TouchableOpacity>

                <View style={styles.divider} />
              </View>
            )}

            {/* Menu Items */}
            {MENU_ITEMS.map((item) => {
              if (item.type === 'divider') {
                return <View key={item.id} style={styles.divider} />;
              }
              return (
                <TouchableOpacity
                  key={item.id}
                  style={styles.menuItem}
                  onPress={() => handleItemPress(item)}
                  data-testid={`drawer-${item.id}`}
                >
                  <Ionicons name={item.icon as any} size={22} color="#1C1C2E" />
                  <Text style={styles.menuLabel}>{item.label}</Text>
                </TouchableOpacity>
              );
            })}

            <View style={styles.divider} />

            {/* Logout */}
            <TouchableOpacity
              style={styles.menuItem}
              onPress={handleLogout}
              data-testid="drawer-logout"
            >
              <Ionicons name="log-out-outline" size={22} color={Z_RED} />
              <Text style={[styles.menuLabel, { color: Z_RED }]}>Logout</Text>
            </TouchableOpacity>
          </ScrollView>

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
    left: 0, top: 0, bottom: 0,
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
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: '#FFF',
    alignItems: 'center', justifyContent: 'center',
  },
  notifBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: '#FFF',
    alignItems: 'center', justifyContent: 'center',
  },
  profile: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 16, gap: 14,
  },
  avatar: {
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: '#FDE8E4',
    alignItems: 'center', justifyContent: 'center',
  },
  userInfo: { flex: 1 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  userName: { fontSize: 20, fontWeight: '700', color: '#502314' },
  userPhone: { fontSize: 14, color: '#8B6F61', marginTop: 2 },
  editNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  editNameInput: {
    flex: 1, backgroundColor: '#FFF', borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 6,
    fontSize: 18, fontWeight: '700', color: '#502314',
    borderWidth: 1.5, borderColor: Z_RED,
  },

  goalCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#502314',
    marginHorizontal: 16, borderRadius: 14,
    padding: 14, gap: 12,
  },
  goalIconBox: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: Z_RED,
    alignItems: 'center', justifyContent: 'center',
  },
  goalText: { fontSize: 15, fontWeight: '700', color: '#FFF' },
  goalSub: { fontSize: 12, color: '#C4A882', marginTop: 2 },

  menuList: { flex: 1, marginTop: 12 },

  // Goals expandable section
  goalsSection: { paddingHorizontal: 16, paddingTop: 8 },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: '#502314', marginBottom: 8, marginTop: 4 },
  goalsRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  goalPill: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 10, borderRadius: 20,
    backgroundColor: '#FFF', borderWidth: 1.5, borderColor: '#E8E8E8',
  },
  goalPillText: { fontSize: 11, fontWeight: '600', color: '#8B6F61' },

  targetsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 },
  targetCard: {
    width: '47%', backgroundColor: '#FFF', borderRadius: 10,
    padding: 10, borderWidth: 1, borderColor: '#E8DDD4',
  },
  targetLabel: { fontSize: 11, fontWeight: '600', marginBottom: 4 },
  targetInputRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  targetInput: {
    flex: 1, backgroundColor: '#F5EBDC', borderRadius: 6,
    padding: 8, color: '#502314', fontSize: 16, fontWeight: '700',
  },
  targetUnit: { fontSize: 11, color: '#8B6F61', fontWeight: '600' },

  saveBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, backgroundColor: Z_RED, borderRadius: 10,
    paddingVertical: 12, marginBottom: 8,
  },
  saveBtnText: { color: '#FFF', fontSize: 14, fontWeight: '700' },

  menuItem: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 16, gap: 16,
  },
  menuLabel: { fontSize: 16, fontWeight: '600', color: '#502314' },
  divider: { height: 1, backgroundColor: '#E8E8E8', marginVertical: 8, marginHorizontal: 20 },

  version: {
    textAlign: 'center', color: '#B0B0B0', fontSize: 12,
    paddingBottom: 30, paddingTop: 10,
  },
});
