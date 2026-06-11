import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Modal, Animated,
  Dimensions, ScrollView, Pressable, TextInput, Alert
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { apiCall, logout } from '../../utils/api';
import { GOALS, getGoal, FUEL, FONT, RADIUS, SPACE } from '../../utils/theme';

const { width } = Dimensions.get('window');
const DRAWER_WIDTH = width * 0.85;
const Z_RED = '#15140F';
const GREEN = '#3FA34D';
const PURPLE = '#15140F';

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
            <TouchableOpacity style={styles.closeBtn} onPress={onClose} testID="drawer-close-btn">
              <Ionicons name="arrow-back" size={24} color="#15140F" />
            </TouchableOpacity>
            <TouchableOpacity style={styles.notifBtn}>
              <Ionicons name="notifications-outline" size={22} color="#15140F" />
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
                    testID="drawer-edit-name-input"
                  />
                  <TouchableOpacity onPress={saveName} disabled={savingName} testID="drawer-save-name-btn">
                    <Ionicons name="checkmark-circle" size={28} color={GREEN} />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => { setEditingName(false); setNameValue(user?.name || 'Guest User'); }}>
                    <Ionicons name="close-circle" size={28} color="#9C9C9C" />
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={styles.nameRow}>
                  <Text style={styles.userName}>{nameValue}</Text>
                  <TouchableOpacity onPress={() => setEditingName(true)} testID="drawer-edit-name-btn">
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
            testID="drawer-fitness-toggle"
          >
            <View style={styles.goalIconBox}>
              <Ionicons name="fitness" size={20} color="#FFF" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.goalText}>
                {getGoal(goal)?.label || 'Maintenance'}
              </Text>
              <Text style={styles.goalSub}>{calories} kcal target</Text>
            </View>
            <Ionicons name={showGoals ? 'chevron-up' : 'chevron-down'} size={20} color="#FFF" />
          </TouchableOpacity>

          <ScrollView style={styles.menuList} showsVerticalScrollIndicator={false}>
            {/* Expandable Goals Section */}
            {showGoals && (
              <View style={styles.goalsSection} testID="drawer-goals-section">
                <Text style={styles.sectionTitle}>Fitness Goal</Text>
                <View style={styles.goalsRow}>
                  {GOALS.map(g => (
                    <TouchableOpacity
                      key={g.key}
                      testID={`drawer-goal-${g.key}`}
                      style={[styles.goalPill, goal === g.key && { borderColor: g.color, backgroundColor: `${g.color}15` }]}
                      onPress={() => setGoal(g.key)}
                    >
                      <Ionicons name={g.icon as any} size={15} color={goal === g.key ? g.color : FUEL.muted} />
                      <Text style={[styles.goalPillText, goal === g.key && { color: g.color, fontFamily: FONT.bodyBold }]}>{g.shortLabel}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <Text style={styles.sectionTitle}>Daily Targets</Text>
                <View style={styles.targetsGrid}>
                  {[
                    { label: 'Calories', val: calories, set: setCalories, unit: 'kcal', color: Z_RED },
                    { label: 'Protein', val: protein, set: setProtein, unit: 'g', color: Z_RED },
                    { label: 'Carbs', val: carbs, set: setCarbs, unit: 'g', color: '#D69A35' },
                    { label: 'Fat', val: fat, set: setFat, unit: 'g', color: PURPLE },
                  ].map(t => (
                    <View key={t.label} style={styles.targetCard}>
                      <Text style={[styles.targetLabel, { color: t.color }]}>{t.label}</Text>
                      <View style={styles.targetInputRow}>
                        <TextInput
                          testID={`drawer-target-${t.label.toLowerCase()}`}
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
                  testID="drawer-save-goals-btn"
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
                  testID={`drawer-${item.id}`}
                >
                  <Ionicons name={item.icon as any} size={22} color="#15140F" />
                  <Text style={styles.menuLabel}>{item.label}</Text>
                </TouchableOpacity>
              );
            })}

            <View style={styles.divider} />

            {/* Logout */}
            <TouchableOpacity
              style={styles.menuItem}
              onPress={handleLogout}
              testID="drawer-logout"
            >
              <Ionicons name="log-out-outline" size={22} color={Z_RED} />
              <Text style={[styles.menuLabel, { color: Z_RED }]}>Logout</Text>
            </TouchableOpacity>
          </ScrollView>

          <Text style={styles.version}>BORAROC v1.3</Text>
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
    backgroundColor: '#F7F4EC',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACE.l,
    paddingTop: 50,
    paddingBottom: SPACE.m,
  },
  closeBtn: {
    width: 40, height: 40, borderRadius: 20, // circle
    backgroundColor: '#FFF',
    alignItems: 'center', justifyContent: 'center',
  },
  notifBtn: {
    width: 40, height: 40, borderRadius: 20, // circle
    backgroundColor: '#FFF',
    alignItems: 'center', justifyContent: 'center',
  },
  profile: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: SPACE.xl, paddingVertical: SPACE.l, gap: SPACE.l,
  },
  avatar: {
    width: 56, height: 56, borderRadius: 28, // circle
    backgroundColor: FUEL.proteinTint,
    alignItems: 'center', justifyContent: 'center',
  },
  userInfo: { flex: 1 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: SPACE.s },
  userName: { fontSize: 20, fontFamily: FONT.bodyBold, color: FUEL.ink },
  userPhone: { fontSize: 14, color: FUEL.muted, marginTop: 2 },
  editNameRow: { flexDirection: 'row', alignItems: 'center', gap: SPACE.s },
  editNameInput: {
    flex: 1, backgroundColor: '#FFF', borderRadius: RADIUS.sm,
    paddingHorizontal: SPACE.m, paddingVertical: SPACE.s,
    fontSize: 18, fontFamily: FONT.bodyBold, color: FUEL.ink,
    borderWidth: 1.5, borderColor: Z_RED,
  },

  goalCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: FUEL.ink,
    marginHorizontal: SPACE.l, borderRadius: RADIUS.md,
    padding: SPACE.l, gap: SPACE.m,
  },
  goalIconBox: {
    width: 40, height: 40, borderRadius: 20, // circle
    backgroundColor: Z_RED,
    alignItems: 'center', justifyContent: 'center',
  },
  goalText: { fontSize: 15, fontFamily: FONT.bodyBold, color: '#FFF' },
  goalSub: { fontSize: 12, color: '#CFC8B8', marginTop: 2 },

  menuList: { flex: 1, marginTop: SPACE.m },

  // Goals expandable section
  goalsSection: { paddingHorizontal: SPACE.l, paddingTop: SPACE.s },
  sectionTitle: { fontSize: 14, fontFamily: FONT.bodyBold, color: FUEL.ink, marginBottom: SPACE.s, marginTop: SPACE.xs },
  goalsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.s, marginBottom: SPACE.l },
  goalPill: {
    minWidth: '30%', flexGrow: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: SPACE.xs, paddingVertical: SPACE.m, paddingHorizontal: SPACE.s, borderRadius: RADIUS.lg,
    backgroundColor: '#FFF', borderWidth: 1.5, borderColor: FUEL.sandBorder,
  },
  goalPillText: { fontSize: 11, fontFamily: FONT.bodySemibold, color: FUEL.muted },

  targetsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.s, marginBottom: SPACE.l },
  targetCard: {
    width: '47%', backgroundColor: '#FFF', borderRadius: RADIUS.sm,
    padding: SPACE.m, borderWidth: 1, borderColor: FUEL.sandBorder,
  },
  targetLabel: { fontSize: 11, fontFamily: FONT.bodySemibold, marginBottom: SPACE.xs },
  targetInputRow: { flexDirection: 'row', alignItems: 'center', gap: SPACE.xs },
  targetInput: {
    flex: 1, backgroundColor: FUEL.sand, borderRadius: RADIUS.xs,
    padding: SPACE.s, color: FUEL.ink, fontSize: 16, fontFamily: FONT.bodyBold,
  },
  targetUnit: { fontSize: 11, color: FUEL.muted, fontFamily: FONT.bodySemibold },

  saveBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: SPACE.s, backgroundColor: Z_RED, borderRadius: RADIUS.sm,
    paddingVertical: SPACE.m, marginBottom: SPACE.s,
  },
  saveBtnText: { color: '#FFF', fontSize: 14, fontFamily: FONT.bodyBold },

  menuItem: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: SPACE.xl, paddingVertical: SPACE.l, gap: SPACE.l,
  },
  menuLabel: { fontSize: 16, fontFamily: FONT.bodySemibold, color: FUEL.ink },
  divider: { height: 1, backgroundColor: FUEL.sandBorder, marginVertical: SPACE.s, marginHorizontal: SPACE.xl },

  version: {
    textAlign: 'center', color: FUEL.muted, fontSize: 12,
    paddingBottom: SPACE.xxl, paddingTop: SPACE.m,
  },
});
