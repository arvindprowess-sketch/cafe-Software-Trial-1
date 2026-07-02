import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Alert, KeyboardAvoidingView, Platform, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { apiCall, getStoredUser, logout } from '../../utils/api';
import { GOALS as FUEL_GOALS, FUEL, FONT, RADIUS, SPACE } from '../../utils/theme';

// UPDATED: 2026-06-05 - Profile goals now use the canonical shared GOALS (theme.ts)
// so the value sent to the backend matches GOAL_CAL_FACTOR / GOAL_PROTEIN_PER_KG keys.
const Z_RED = '#15140F';
const GOALS = FUEL_GOALS;

export default function ProfileScreen() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [goal, setGoal] = useState('maintenance');
  const [calories, setCalories] = useState('2000');
  const [protein, setProtein] = useState('100');
  const [carbs, setCarbs] = useState('250');
  const [fat, setFat] = useState('65');
  const [saving, setSaving] = useState(false);
  const [target, setTarget] = useState<any>(null);
  // P8 compliance: delete-account flow
  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);

  const loadTarget = async () => {
    try { setTarget(await apiCall('/user/daily-target')); } catch {}
  };

  // Log to verify goals array
  console.log('GOALS array length:', GOALS.length);
  console.log('GOALS:', GOALS.map(g => g.key));

  useEffect(() => {
    (async () => {
      const u = await getStoredUser();
      if (u) { setUser(u); setGoal(u.fitness_goal || 'maintenance'); setCalories(String(u.daily_calories || 2000)); setProtein(String(u.daily_protein || 100)); setCarbs(String(u.daily_carbs || 250)); setFat(String(u.daily_fat || 65)); }
      loadTarget();
    })();
  }, []);

  const saveGoals = async () => {
    setSaving(true);
    try {
      await apiCall('/user/goals', { method: 'PUT', body: { fitness_goal: goal, daily_calories: parseInt(calories) || 2000, daily_protein: parseInt(protein) || 100, daily_carbs: parseInt(carbs) || 250, daily_fat: parseInt(fat) || 65 } });
      await loadTarget();
      Alert.alert('Saved!', 'Your fitness goals have been updated');
    } catch (e: any) { Alert.alert('Error', e.message); }
    finally { setSaving(false); }
  };

  const handleLogout = async () => { await logout(); router.replace('/'); };

  const openDeleteModal = () => { setDeleteConfirmText(''); setDeleteModalVisible(true); };

  const handleDeleteAccount = async () => {
    if (deleteConfirmText.trim() !== 'DELETE' || deleting) return;
    setDeleting(true);
    try {
      await apiCall('/users/me', { method: 'DELETE' });
      setDeleteModalVisible(false);
      await logout(); // clear auth_token / user_data (old token is revoked server-side too)
      router.replace('/');
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Could not delete your account. Please try again.');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.titleRow}>
            <Image source={require('../../assets/images/boraroc-monogram.png')} style={styles.titleLogo} contentFit="contain" />
            <Text style={styles.title}>Profile</Text>
          </View>

          <View style={styles.userCard}>
            <View style={styles.avatar}><Ionicons name="person" size={24} color={Z_RED} /></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.userName}>{user?.name || 'User'}</Text>
              <Text style={styles.userEmail}>{user?.email || ''}</Text>
            </View>
            <TouchableOpacity testID="logout-btn" onPress={handleLogout} style={styles.logoutBtn}>
              <Ionicons name="log-out-outline" size={20} color={Z_RED} />
            </TouchableOpacity>
          </View>

          <Text style={styles.section}>Fitness Goal ({GOALS.length} options)</Text>
          <View style={styles.goalsRow}>
            {GOALS.map(g => (
              <TouchableOpacity key={g.key} testID={`goal-${g.key}`} style={[styles.goalCard, goal === g.key && { borderColor: g.color, backgroundColor: `${g.color}10` }]} onPress={() => setGoal(g.key)}>
                <View style={[styles.goalIcon, { backgroundColor: goal === g.key ? g.color : FUEL.sand }]}>
                  <Ionicons name={g.icon as any} size={20} color={goal === g.key ? '#FFF' : FUEL.muted} />
                </View>
                <Text style={[styles.goalLabel, goal === g.key && { color: g.color, fontFamily: FONT.bodyBold }]}>{g.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.section}>Daily Targets</Text>
          {/* Phase 2: personalized target from body stats (auto-computed) */}
          {target?.has_body_stats ? (
            <View style={styles.targetHero} testID="profile-daily-target">
              <View style={styles.targetHeroRow}>
                <View>
                  <Text style={styles.targetHeroLabel}>PERSONALIZED TARGET</Text>
                  <Text style={styles.targetHeroValue} testID="profile-target-calories">{target.daily_calories} kcal · <Text style={{ color: '#E2603F' }} >{target.daily_protein}g protein</Text></Text>
                  <Text style={styles.targetHeroSub}>BMR ~{target.bmr} · TDEE ~{target.tdee} · {target.weight_kg}kg</Text>
                </View>
                <TouchableOpacity testID="profile-edit-stats" style={styles.editStatsBtn} onPress={() => router.push({ pathname: '/goal-setup', params: { goal: goal, next: 'home' } })}>
                  <Ionicons name="create-outline" size={16} color="#15140F" />
                  <Text style={styles.editStatsText}>Edit</Text>
                </TouchableOpacity>
              </View>
              <TouchableOpacity testID="profile-plan-meals" style={styles.planMealsBtn} onPress={() => router.push('/meal-plan')}>
                <Ionicons name="restaurant" size={15} color="#15140F" />
                <Text style={styles.planMealsText}>Plan my meals</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity testID="profile-setup-target" style={styles.setupTargetBtn} onPress={() => router.push({ pathname: '/goal-setup', params: { goal: goal, next: 'home' } })}>
              <Ionicons name="sparkles" size={16} color="#A6D62E" />
              <Text style={styles.setupTargetText}>Get a personalized target from your body stats</Text>
              <Ionicons name="chevron-forward" size={16} color="#6B6A5E" />
            </TouchableOpacity>
          )}
          <TouchableOpacity testID="profile-progress-link" style={styles.progressRow} onPress={() => router.push('/progress')}>
            <Ionicons name="stats-chart" size={18} color="#15140F" />
            <Text style={styles.progressRowText}>View my progress & weight log</Text>
            <Ionicons name="chevron-forward" size={16} color="#6B6A5E" />
          </TouchableOpacity>

          <TouchableOpacity testID="profile-rewards-link" style={styles.progressRow} onPress={() => router.push('/rewards')}>
            <Ionicons name="ribbon" size={18} color="#15140F" />
            <Text style={styles.progressRowText}>Rewards & loyalty points</Text>
            <Ionicons name="chevron-forward" size={16} color="#6B6A5E" />
          </TouchableOpacity>

          <TouchableOpacity testID="profile-history-link" style={styles.progressRow} onPress={() => router.push('/history')}>
            <Ionicons name="time" size={18} color="#15140F" />
            <Text style={styles.progressRowText}>Meal history & macros</Text>
            <Ionicons name="chevron-forward" size={16} color="#6B6A5E" />
          </TouchableOpacity>
          <Text style={styles.subLabel}>You can fine-tune the numbers below anytime.</Text>
          <View style={styles.targetsGrid}>
            {[
              { label: 'Calories (kcal)', val: calories, set: setCalories, color: Z_RED },
              { label: 'Protein (g)', val: protein, set: setProtein, color: Z_RED },
              { label: 'Carbs (g)', val: carbs, set: setCarbs, color: '#D69A35' },
              { label: 'Fat (g)', val: fat, set: setFat, color: FUEL.ink },
            ].map(t => (
              <View key={t.label} style={styles.targetCard}>
                <Text style={[styles.targetLabel, { color: t.color }]}>{t.label}</Text>
                <TextInput testID={`target-${t.label.split(' ')[0].toLowerCase()}`} style={styles.targetInput} value={t.val} onChangeText={t.set} keyboardType="number-pad" />
              </View>
            ))}
          </View>

          <TouchableOpacity testID="save-goals-btn" style={styles.saveBtn} onPress={saveGoals} disabled={saving}>
            <Text style={styles.saveBtnText}>{saving ? 'Saving...' : 'Save Goals'}</Text>
          </TouchableOpacity>

          {/* P8 compliance: danger zone — permanent account deletion */}
          <View style={styles.dangerZone}>
            <Text style={styles.dangerZoneTitle}>Danger zone</Text>
            <Text style={styles.dangerZoneText}>Permanently delete your account and personal data.</Text>
            <TouchableOpacity testID="delete-account-btn" style={styles.deleteAccountBtn} onPress={openDeleteModal}>
              <Ionicons name="trash-outline" size={16} color={FUEL.error} />
              <Text style={styles.deleteAccountBtnText}>Delete my account</Text>
            </TouchableOpacity>
          </View>
          <View style={{ height: 40 }} />
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Delete-account confirmation modal */}
      <Modal visible={deleteModalVisible} transparent animationType="fade" onRequestClose={() => setDeleteModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalIcon}><Ionicons name="warning" size={26} color={FUEL.error} /></View>
            <Text style={styles.modalTitle}>Delete account?</Text>
            <Text style={styles.modalBody}>
              This is permanent and cannot be undone.{'\n\n'}
              • Your profile, saved meals, meal history and body stats are deleted{'\n'}
              • Past order records are kept for tax (GST) purposes, unlinked to your identity{'\n'}
              • You will be logged out on every device immediately
            </Text>
            <Text style={styles.modalHint}>Type DELETE to confirm</Text>
            <TextInput
              testID="delete-confirm-input"
              style={styles.modalInput}
              value={deleteConfirmText}
              onChangeText={setDeleteConfirmText}
              placeholder="DELETE"
              placeholderTextColor={FUEL.muted}
              autoCapitalize="characters"
              autoCorrect={false}
            />
            <TouchableOpacity
              testID="delete-confirm-btn"
              style={[styles.modalDeleteBtn, (deleteConfirmText.trim() !== 'DELETE' || deleting) && styles.modalDeleteBtnDisabled]}
              onPress={handleDeleteAccount}
              disabled={deleteConfirmText.trim() !== 'DELETE' || deleting}
            >
              <Text style={styles.modalDeleteBtnText}>{deleting ? 'Deleting...' : 'Delete my account forever'}</Text>
            </TouchableOpacity>
            <TouchableOpacity testID="delete-cancel-btn" style={styles.modalCancelBtn} onPress={() => setDeleteModalVisible(false)} disabled={deleting}>
              <Text style={styles.modalCancelBtnText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: FUEL.sand },
  content: { padding: SPACE.l, paddingBottom: 120 }, // clears the absolute tab bar
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: SPACE.s, marginBottom: SPACE.l, marginTop: SPACE.s },
  titleLogo: { width: 28, height: 28 },
  title: { fontSize: 24, fontFamily: FONT.bodyExtrabold, color: FUEL.ink },
  userCard: { flexDirection: 'row', alignItems: 'center', gap: SPACE.m, backgroundColor: '#FFF', borderRadius: RADIUS.md, padding: SPACE.l, borderWidth: 1, borderColor: FUEL.sandBorder, marginBottom: SPACE.xl },
  avatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: FUEL.proteinTint, alignItems: 'center', justifyContent: 'center' }, // circle
  userName: { fontSize: 17, fontFamily: FONT.bodyBold, color: FUEL.ink },
  userEmail: { fontSize: 13, color: FUEL.muted, marginTop: 2 },
  logoutBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: FUEL.proteinTint, alignItems: 'center', justifyContent: 'center' }, // circle
  section: { fontSize: 17, fontFamily: FONT.bodyBold, color: FUEL.ink, marginBottom: SPACE.m },
  subLabel: { fontSize: 12.5, color: FUEL.muted, marginBottom: SPACE.m, marginTop: -4 },
  targetHero: { backgroundColor: FUEL.ink, borderRadius: RADIUS.md, padding: SPACE.l, marginBottom: SPACE.l },
  targetHeroRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  targetHeroLabel: { fontSize: 10.5, color: FUEL.sand, opacity: 0.7, letterSpacing: 1, fontFamily: FONT.bodyBold },
  targetHeroValue: { fontSize: 18, color: FUEL.lime, fontFamily: FONT.bodyExtrabold, marginTop: SPACE.xs },
  targetHeroSub: { fontSize: 11.5, color: FUEL.sand, opacity: 0.6, marginTop: SPACE.xs },
  editStatsBtn: { flexDirection: 'row', alignItems: 'center', gap: SPACE.xs, backgroundColor: FUEL.lime, borderRadius: RADIUS.lg, paddingHorizontal: SPACE.m, paddingVertical: SPACE.s },
  editStatsText: { fontSize: 12.5, fontFamily: FONT.bodyExtrabold, color: FUEL.ink },
  planMealsBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACE.s, backgroundColor: FUEL.lime, borderRadius: RADIUS.md, paddingVertical: SPACE.m, marginTop: SPACE.l },
  planMealsText: { fontSize: 14, fontFamily: FONT.bodyExtrabold, color: FUEL.ink },
  setupTargetBtn: { flexDirection: 'row', alignItems: 'center', gap: SPACE.m, backgroundColor: '#FFF', borderRadius: RADIUS.md, padding: SPACE.l, borderWidth: 1.5, borderColor: FUEL.sandBorder, marginBottom: SPACE.l },
  setupTargetText: { flex: 1, fontSize: 13.5, fontFamily: FONT.bodyBold, color: FUEL.ink },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: SPACE.m, backgroundColor: '#FFF', borderRadius: RADIUS.md, padding: SPACE.l, borderWidth: 1.5, borderColor: FUEL.sandBorder, marginBottom: SPACE.l },
  progressRowText: { flex: 1, fontSize: 14, fontFamily: FONT.bodyBold, color: FUEL.ink },
  goalsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.m, marginBottom: SPACE.xl, justifyContent: 'flex-start' },
  goalCard: { width: '30.5%', alignItems: 'center', gap: SPACE.s, backgroundColor: '#FFF', borderRadius: RADIUS.md, padding: SPACE.l, borderWidth: 1.5, borderColor: FUEL.sandBorder },
  goalIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' }, // circle
  goalLabel: { fontSize: 12, fontFamily: FONT.bodySemibold, color: FUEL.muted },
  targetsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.m, marginBottom: SPACE.xl },
  targetCard: { width: '48%', backgroundColor: '#FFF', borderRadius: RADIUS.md, padding: SPACE.l, borderWidth: 1, borderColor: FUEL.sandBorder },
  targetLabel: { fontSize: 12, fontFamily: FONT.bodySemibold, marginBottom: SPACE.s },
  targetInput: { backgroundColor: FUEL.sand, borderRadius: RADIUS.sm, padding: SPACE.m, color: FUEL.ink, fontSize: 18, fontFamily: FONT.bodyBold },
  saveBtn: { backgroundColor: Z_RED, borderRadius: RADIUS.md, paddingVertical: SPACE.l, alignItems: 'center' },
  saveBtnText: { color: '#FFF', fontSize: 16, fontFamily: FONT.bodyBold },

  // P8 compliance: danger zone + delete-account modal
  dangerZone: { marginTop: SPACE.xxl, paddingTop: SPACE.xl, borderTopWidth: 1, borderTopColor: FUEL.sandBorder },
  dangerZoneTitle: { fontSize: 13, fontFamily: FONT.bodyBold, color: FUEL.muted, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: SPACE.xs },
  dangerZoneText: { fontSize: 12.5, color: FUEL.muted, marginBottom: SPACE.m },
  deleteAccountBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACE.s, backgroundColor: '#FFF', borderRadius: RADIUS.md, paddingVertical: SPACE.m, borderWidth: 1.5, borderColor: FUEL.error },
  deleteAccountBtnText: { fontSize: 14, fontFamily: FONT.bodyBold, color: FUEL.error },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(21,20,15,0.6)', alignItems: 'center', justifyContent: 'center', padding: SPACE.xl },
  modalCard: { width: '100%', backgroundColor: '#FFF', borderRadius: RADIUS.lg, padding: SPACE.xl },
  modalIcon: { width: 48, height: 48, borderRadius: 24, backgroundColor: FUEL.proteinTint, alignItems: 'center', justifyContent: 'center', alignSelf: 'center', marginBottom: SPACE.m }, // circle
  modalTitle: { fontSize: 18, fontFamily: FONT.bodyExtrabold, color: FUEL.ink, textAlign: 'center', marginBottom: SPACE.m },
  modalBody: { fontSize: 13, color: FUEL.muted, lineHeight: 19, marginBottom: SPACE.l },
  modalHint: { fontSize: 12.5, fontFamily: FONT.bodySemibold, color: FUEL.ink, marginBottom: SPACE.s },
  modalInput: { backgroundColor: FUEL.sand, borderRadius: RADIUS.sm, padding: SPACE.m, color: FUEL.ink, fontSize: 16, fontFamily: FONT.bodyBold, borderWidth: 1.5, borderColor: FUEL.sandBorder, letterSpacing: 2, marginBottom: SPACE.l },
  modalDeleteBtn: { backgroundColor: FUEL.error, borderRadius: RADIUS.md, paddingVertical: SPACE.l, alignItems: 'center' },
  modalDeleteBtnDisabled: { opacity: 0.4 },
  modalDeleteBtnText: { color: '#FFF', fontSize: 15, fontFamily: FONT.bodyBold },
  modalCancelBtn: { paddingVertical: SPACE.m, alignItems: 'center', marginTop: SPACE.s },
  modalCancelBtnText: { color: FUEL.muted, fontSize: 14, fontFamily: FONT.bodySemibold },
});
