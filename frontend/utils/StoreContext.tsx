import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiCall } from './api';

// ============================================================================
// STORE SELECTION — every customer order is tied to a store (multi-store).
// Loads the active store list from the backend, remembers the customer's
// selected store, and exposes it so the cart can stamp store_id on the order.
// ============================================================================

export type Store = {
  store_id: string;
  name: string;
  code?: string;
  address?: string | null;
  lat?: number | null;
  lng?: number | null;
  phone?: string | null;
  open_hours?: string | null;
};

const SELECTED_KEY = 'fuel_store_id_v1';

type StoreCtx = {
  stores: Store[];
  selectedStoreId: string | null;
  selectedStore: Store | null;
  selectStore: (id: string) => void;
  loading: boolean;
};

const Ctx = createContext<StoreCtx | null>(null);

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [stores, setStores] = useState<Store[]>([]);
  const [selectedStoreId, setSelectedStoreId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const saved = await AsyncStorage.getItem(SELECTED_KEY);
        const list: Store[] = await apiCall('/stores/public');
        setStores(list || []);
        // Prefer the saved store if it still exists, else default to the first.
        const valid = saved && list?.some((s) => s.store_id === saved);
        const next = valid ? saved : list?.[0]?.store_id || null;
        setSelectedStoreId(next);
        if (next && next !== saved) AsyncStorage.setItem(SELECTED_KEY, next).catch(() => {});
      } catch {
        // Offline / not yet seeded — leave empty; the order will fall back to
        // the default store on the backend.
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const selectStore = useCallback((id: string) => {
    setSelectedStoreId(id);
    AsyncStorage.setItem(SELECTED_KEY, id).catch(() => {});
  }, []);

  const selectedStore = stores.find((s) => s.store_id === selectedStoreId) || null;

  return (
    <Ctx.Provider value={{ stores, selectedStoreId, selectedStore, selectStore, loading }}>
      {children}
    </Ctx.Provider>
  );
}

export function useStore() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useStore must be used within StoreProvider');
  return c;
}
