import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl,
  TextInput, Alert, Modal, ActivityIndicator, Platform
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { apiCall } from '../../utils/api';

const Z_RED = '#E23744';

type Staff = {
  id: string;
  name: string;
  role: 'kitchen' | 'cashier';
  pin: string;
  is_active: boolean;
  created_at?: string;
};

export default function StaffManagement() {
  const [staff, setStaff] = useState<Staff[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [newName, setNewName] = useState('');
  const [newRole, setNewRole] = useState<'kitchen' | 'cashier'>('kitchen');
  const [newPin, setNewPin] = useState('');
  const [saving, setSaving] = useState(false);

  const loadStaff = useCallback(async () => {
    try {
      const data = await apiCall('/staff');
      setStaff(data);
    } catch (e) {
      console.log('Staff load error:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadStaff(); }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadStaff();
    setRefreshing(false);
  };

  const handleCreate = async () => {
    if (!newName.trim() || !newPin.trim()) {
      Alert.alert('Error', 'Name and PIN are required');
      return;
    }
    if (newPin.length < 4 || newPin.length > 6 || !/^\d+$/.test(newPin)) {
      Alert.alert('Error', 'PIN must be 4-6 digits');
      return;
    }
    setSaving(true);
    try {
      await apiCall('/staff', { method: 'POST', body: { name: newName.trim(), role: newRole, pin: newPin } });
      setShowModal(false);
      setNewName('');
      setNewPin('');
      await loadStaff();
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to create staff');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (s: Staff) => {
    Alert.alert('Delete Staff', `Remove ${s.name}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive', onPress: async () => {
          try {
            await apiCall(`/staff/${s.id}`, { method: 'DELETE' });
            await loadStaff();
          } catch (e: any) {
            Alert.alert('Error', e.message);
          }
        }
      }
    ]);
  };

  const handleToggle = async (s: Staff) => {
    try {
      await apiCall(`/staff/${s.id}`, { method: 'PUT', body: { is_active: !s.is_active } });
      await loadStaff();
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
  };

  const roleColors = { kitchen: '#FF9F0A', cashier: '#5B5FE0' };
  const roleIcons = { kitchen: 'flame' as const, cashier: 'card' as const };

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}><ActivityIndicator size="large" color={Z_RED} /></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Z_RED} />}
        contentContainerStyle={styles.content}
      >
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.title}>Staff</Text>
            <Text style={styles.sub}>{staff.length} members</Text>
          </View>
          <TouchableOpacity
            data-testid="add-staff-btn"
            style={styles.addBtn}
            onPress={() => setShowModal(true)}
          >
            <Ionicons name="add" size={22} color="#FFF" />
          </TouchableOpacity>
        </View>

        {staff.length === 0 && (
          <View style={styles.emptyState}>
            <Ionicons name="people-outline" size={48} color="#D0D0D0" />
            <Text style={styles.emptyTitle}>No staff yet</Text>
            <Text style={styles.emptyDesc}>Add kitchen or cashier staff with PIN login</Text>
          </View>
        )}

        {staff.map(s => (
          <View key={s.id} style={[styles.staffCard, !s.is_active && styles.staffInactive]}>
            <View style={[styles.roleIcon, { backgroundColor: `${roleColors[s.role]}15` }]}>
              <Ionicons name={roleIcons[s.role]} size={22} color={roleColors[s.role]} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.staffName}>{s.name}</Text>
              <View style={styles.staffMeta}>
                <View style={[styles.roleBadge, { backgroundColor: `${roleColors[s.role]}15` }]}>
                  <Text style={[styles.roleText, { color: roleColors[s.role] }]}>
                    {s.role.charAt(0).toUpperCase() + s.role.slice(1)}
                  </Text>
                </View>
                <Text style={styles.pinText}>PIN: {s.pin}</Text>
                {!s.is_active && <Text style={styles.inactiveLabel}>Inactive</Text>}
              </View>
            </View>
            <View style={styles.staffActions}>
              <TouchableOpacity
                data-testid={`toggle-staff-${s.id}`}
                onPress={() => handleToggle(s)}
                style={[styles.toggleBtn, s.is_active ? styles.toggleActive : styles.toggleInactive]}
              >
                <Ionicons name={s.is_active ? 'checkmark-circle' : 'close-circle'} size={18} color={s.is_active ? '#267E3E' : '#9C9C9C'} />
              </TouchableOpacity>
              <TouchableOpacity data-testid={`delete-staff-${s.id}`} onPress={() => handleDelete(s)} style={styles.deleteBtn}>
                <Ionicons name="trash-outline" size={18} color={Z_RED} />
              </TouchableOpacity>
            </View>
          </View>
        ))}
      </ScrollView>

      {/* Create Staff Modal */}
      <Modal visible={showModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Add Staff</Text>
              <TouchableOpacity onPress={() => setShowModal(false)}>
                <Ionicons name="close" size={24} color="#1C1C2E" />
              </TouchableOpacity>
            </View>

            <Text style={styles.label}>Name</Text>
            <TextInput
              data-testid="staff-name-input"
              style={styles.input}
              value={newName}
              onChangeText={setNewName}
              placeholder="Staff name"
              placeholderTextColor="#B0B0B0"
            />

            <Text style={styles.label}>Role</Text>
            <View style={styles.roleSelector}>
              {(['kitchen', 'cashier'] as const).map(r => (
                <TouchableOpacity
                  key={r}
                  data-testid={`role-${r}`}
                  style={[styles.roleOption, newRole === r && { backgroundColor: `${roleColors[r]}15`, borderColor: roleColors[r] }]}
                  onPress={() => setNewRole(r)}
                >
                  <Ionicons name={roleIcons[r]} size={20} color={newRole === r ? roleColors[r] : '#9C9C9C'} />
                  <Text style={[styles.roleOptionText, newRole === r && { color: roleColors[r] }]}>
                    {r.charAt(0).toUpperCase() + r.slice(1)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.label}>PIN (4-6 digits)</Text>
            <TextInput
              data-testid="staff-pin-input"
              style={styles.input}
              value={newPin}
              onChangeText={setNewPin}
              placeholder="Enter PIN"
              placeholderTextColor="#B0B0B0"
              keyboardType="number-pad"
              maxLength={6}
              secureTextEntry
            />

            <TouchableOpacity
              data-testid="save-staff-btn"
              style={[styles.saveBtn, (!newName.trim() || !newPin.trim()) && styles.saveBtnDisabled]}
              onPress={handleCreate}
              disabled={saving || !newName.trim() || !newPin.trim()}
            >
              {saving ? <ActivityIndicator color="#FFF" /> : <Text style={styles.saveBtnText}>Create Staff</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F8F8F8' },
  content: { padding: 16 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, marginTop: 8 },
  title: { fontSize: 26, fontWeight: '800', color: '#1C1C2E' },
  sub: { fontSize: 13, color: '#9C9C9C', marginTop: 2 },
  addBtn: { width: 44, height: 44, borderRadius: 14, backgroundColor: Z_RED, alignItems: 'center', justifyContent: 'center' },
  emptyState: { alignItems: 'center', padding: 40 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: '#1C1C2E', marginTop: 16 },
  emptyDesc: { fontSize: 13, color: '#9C9C9C', marginTop: 4, textAlign: 'center' },
  staffCard: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: '#FFF', borderRadius: 14, padding: 16, borderWidth: 1, borderColor: '#EFEFEF', marginBottom: 10 },
  staffInactive: { opacity: 0.5 },
  roleIcon: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  staffName: { fontSize: 16, fontWeight: '700', color: '#1C1C2E' },
  staffMeta: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  roleBadge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 },
  roleText: { fontSize: 11, fontWeight: '700' },
  pinText: { fontSize: 12, color: '#9C9C9C', fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  inactiveLabel: { fontSize: 11, color: Z_RED, fontWeight: '600' },
  staffActions: { flexDirection: 'row', gap: 8 },
  toggleBtn: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  toggleActive: { backgroundColor: '#E8F5E9' },
  toggleInactive: { backgroundColor: '#F5F5F5' },
  deleteBtn: { width: 34, height: 34, borderRadius: 10, backgroundColor: '#FDE8EA', alignItems: 'center', justifyContent: 'center' },
  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#FFF', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 },
  modalTitle: { fontSize: 20, fontWeight: '800', color: '#1C1C2E' },
  label: { fontSize: 13, fontWeight: '600', color: '#1C1C2E', marginBottom: 8, marginTop: 16 },
  input: { backgroundColor: '#F5F5F5', borderRadius: 12, padding: 14, fontSize: 16, color: '#1C1C2E' },
  roleSelector: { flexDirection: 'row', gap: 12 },
  roleOption: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 14, borderRadius: 12, borderWidth: 2, borderColor: '#EFEFEF' },
  roleOptionText: { fontSize: 14, fontWeight: '600', color: '#9C9C9C' },
  saveBtn: { backgroundColor: Z_RED, borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginTop: 24 },
  saveBtnDisabled: { backgroundColor: '#D0D0D0' },
  saveBtnText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
});
