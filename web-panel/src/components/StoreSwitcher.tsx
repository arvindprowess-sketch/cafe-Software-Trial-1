import React from 'react';
import { useStores } from '../context/StoreContext';

/**
 * Global store switcher for the HQ portal.
 * - super_admin: all stores + an "All stores" option.
 * - area_manager: only own-cluster stores (no "All").
 * - store_manager: locked to own store (no dropdown).
 * cashier/kitchen never see this (they don't enter the HQ portal).
 */
export default function StoreSwitcher() {
  const { stores, loading, selectedStoreId, setSelectedStoreId, canSwitch, allowAll, selectedStore } = useStores();

  if (loading) return <span style={{ color: '#9C9C9C', fontSize: 13 }}>Loading stores…</span>;

  if (!canSwitch) {
    // store_manager — locked to their store
    return (
      <div data-testid="store-switcher-locked" style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
        <span style={{ color: '#9C9C9C' }}>Store</span>
        <strong style={{ color: '#15140F' }}>{selectedStore?.name || stores[0]?.name || '—'}</strong>
      </div>
    );
  }

  return (
    <div data-testid="store-switcher" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ color: '#9C9C9C', fontSize: 13 }}>Store</span>
      <select
        data-testid="store-switcher-select"
        value={selectedStoreId ?? '__all__'}
        onChange={(e) => setSelectedStoreId(e.target.value === '__all__' ? null : e.target.value)}
        style={{ padding: '8px 12px', borderRadius: 10, border: '2px solid #E8E8E8', fontSize: 13, fontWeight: 600, minWidth: 180, background: '#FFF' }}
      >
        {allowAll && <option value="__all__">All stores</option>}
        {stores.map((s) => (
          <option key={s.store_id} value={s.store_id}>{s.name}</option>
        ))}
      </select>
    </div>
  );
}
