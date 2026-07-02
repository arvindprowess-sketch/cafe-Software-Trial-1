import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput, ActivityIndicator, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { apiCall } from '../utils/api';
import { useStore } from '../utils/StoreContext';
import { FUEL, FONT, RADIUS, SPACE } from '../utils/theme';

// Manual table entry — the fallback when QR scanning isn't available (or the
// poster is missing). Mirrors scan-table's post-confirm flow: occupy the table
// for the chosen store, then drop the customer straight into dine-in ordering.
export default function TableSelectScreen() {
  const router = useRouter();
  const { stores, selectedStoreId, selectStore } = useStore();

  const [table, setTable] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const storeId = selectedStoreId || (stores[0]?.store_id ?? null);
  const canConfirm = !!table.trim() && !isNaN(parseInt(table)) && parseInt(table) > 0 && !loading;

  const confirm = async () => {
    const num = parseInt(table);
    if (!num || num <= 0) { setError('Enter a valid table number.'); return; }
    setError('');
    setLoading(true);
    const storeQ = storeId ? `?store_id=${encodeURIComponent(storeId)}` : '';
    try {
      // Occupy the table for the selected store (backend accepts ?store_id=).
      await apiCall(`/tables/${num}/occupy${storeQ}`, { method: 'POST' });
      // Mirror scan-table's "Start Ordering": dine-in, scoped to this store/table.
      router.replace({ pathname: '/(tabs)/menu', params: { tableNumber: num, orderType: 'dine-in' } });
    } catch (e: any) {
      // Inline error (not Alert-only) — surfaces "already occupied" etc.
      const detail = e?.detail || e?.message;
      setError(typeof detail === 'string' ? detail : 'Could not select that table. Try another.');
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={FUEL.ink} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Enter Table</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        {/* Store picker — skipped when there's only one store */}
        {stores.length > 1 && (
          <>
            <Text style={styles.label}>Store</Text>
            <View style={styles.storeWrap}>
              {stores.map(s => {
                const active = storeId === s.store_id;
                return (
                  <TouchableOpacity
                    key={s.store_id}
                    testID={`table-select-store-${s.store_id}`}
                    style={[styles.storeBtn, active && styles.storeBtnActive]}
                    onPress={() => selectStore(s.store_id)}
                    activeOpacity={0.85}
                  >
                    <Ionicons name="storefront" size={16} color={active ? FUEL.ink : FUEL.muted} />
                    <Text style={[styles.storeText, active && styles.storeTextActive]}>{s.name}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </>
        )}

        <Text style={styles.label}>Table number</Text>
        <TextInput
          testID="table-select-input"
          style={[styles.input, error && styles.inputError]}
          value={table}
          onChangeText={(t) => { setTable(t.replace(/[^0-9]/g, '')); if (error) setError(''); }}
          placeholder="e.g. 5"
          placeholderTextColor={FUEL.muted}
          keyboardType="number-pad"
          maxLength={4}
        />

        {error ? (
          <View style={styles.errorRow} testID="table-select-error">
            <Ionicons name="alert-circle" size={16} color={FUEL.error} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        <TouchableOpacity
          testID="table-select-confirm"
          style={[styles.confirmBtn, !canConfirm && styles.confirmBtnDisabled]}
          onPress={confirm}
          disabled={!canConfirm}
          activeOpacity={0.9}
        >
          {loading ? (
            <ActivityIndicator color={FUEL.ink} />
          ) : (
            <>
              <Text style={styles.confirmText}>Confirm Table</Text>
              <Ionicons name="arrow-forward" size={18} color={FUEL.ink} />
            </>
          )}
        </TouchableOpacity>

        <View style={styles.tip}>
          <Ionicons name="information-circle" size={16} color={FUEL.muted} />
          <Text style={styles.tipText}>Your table is released after payment.</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: FUEL.sand },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: SPACE.l, paddingVertical: SPACE.m, backgroundColor: FUEL.white, borderBottomWidth: 1, borderBottomColor: FUEL.sandBorder },
  backBtn: { width: 40, height: 40, borderRadius: RADIUS.pill, backgroundColor: FUEL.sand, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontFamily: FONT.display, fontSize: 20, color: FUEL.ink, textTransform: 'uppercase', letterSpacing: 0.5 },

  body: { padding: SPACE.l },
  label: { fontFamily: FONT.display, fontSize: 15, color: FUEL.ink, textTransform: 'uppercase', letterSpacing: 0.3, marginTop: SPACE.l, marginBottom: SPACE.m },

  storeWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.s },
  storeBtn: { flexDirection: 'row', alignItems: 'center', gap: SPACE.s, paddingHorizontal: SPACE.l, paddingVertical: SPACE.m, borderRadius: RADIUS.md, backgroundColor: FUEL.white, borderWidth: 2, borderColor: FUEL.sandBorder },
  storeBtnActive: { backgroundColor: FUEL.lime, borderColor: FUEL.lime },
  storeText: { fontFamily: FONT.bodyExtrabold, fontSize: 12, color: FUEL.muted, textTransform: 'uppercase' },
  storeTextActive: { color: FUEL.ink },

  input: { backgroundColor: FUEL.white, borderRadius: RADIUS.md, borderWidth: 1.5, borderColor: FUEL.sandBorder, paddingHorizontal: SPACE.l, paddingVertical: SPACE.l, fontFamily: FONT.bodyExtrabold, fontSize: 20, color: FUEL.ink },
  inputError: { borderColor: FUEL.error },

  errorRow: { flexDirection: 'row', alignItems: 'center', gap: SPACE.s, marginTop: SPACE.m },
  errorText: { flex: 1, fontFamily: FONT.bodySemibold, fontSize: 13, color: FUEL.error },

  confirmBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACE.s, backgroundColor: FUEL.lime, borderRadius: RADIUS.md, paddingVertical: SPACE.l, marginTop: SPACE.xl },
  confirmBtnDisabled: { opacity: 0.5 },
  confirmText: { fontFamily: FONT.bodyExtrabold, fontSize: 15, color: FUEL.ink, textTransform: 'uppercase', letterSpacing: 0.3 },

  tip: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACE.s, marginTop: SPACE.xl },
  tipText: { fontFamily: FONT.body, fontSize: 12, color: FUEL.muted },
});
