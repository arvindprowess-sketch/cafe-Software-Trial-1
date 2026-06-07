import React, { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react';
import { api } from '../utils/api';
import { useAuth } from './AuthContext';

// ============================================================================
// HQ PORTAL store switcher (Phase 1B). The list comes from GET /stores, which
// the backend already scopes by role (super_admin = all, area_manager = own
// cluster, store_manager = own store). The selected store_id flows into the
// catalog editor and menu views. Server remains the real authority.
// ============================================================================

export type Store = {
  store_id: string;
  name: string;
  code?: string;
  address?: string | null;
  gst_no?: string | null;
  fssai_license?: string | null;
  open_hours?: string | null;
  lat?: number | null;
  lng?: number | null;
  phone?: string | null;
  area_manager_id?: string | null;
  status?: string;
};

const SELECTED_KEY = 'hq_selected_store_id';

type StoreCtx = {
  stores: Store[];
  loading: boolean;
  selectedStoreId: string | null;          // null = "All stores" (super_admin only)
  setSelectedStoreId: (id: string | null) => void;
  selectedStore: Store | null;
  canSwitch: boolean;                       // false => store_manager (locked)
  allowAll: boolean;                        // true only for super_admin/HQ
  reload: () => void;
};

const Ctx = createContext<StoreCtx>({} as StoreCtx);
export const useStores = () => useContext(Ctx);

export function StoreProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [stores, setStores] = useState<Store[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedStoreId, setSel] = useState<string | null>(() => localStorage.getItem(SELECTED_KEY));

  const role = user?.role;
  const isHQ = role === 'super_admin' || role === 'admin';
  const allowAll = isHQ;
  const canSwitch = role !== 'store_manager';

  const setSelectedStoreId = useCallback((id: string | null) => {
    setSel(id);
    if (id) localStorage.setItem(SELECTED_KEY, id);
    else localStorage.removeItem(SELECTED_KEY);
  }, []);

  const load = useCallback(async () => {
    if (!user) { setStores([]); setLoading(false); return; }
    setLoading(true);
    try {
      const list: Store[] = await api('/stores');
      setStores(list);
      setSel((prev) => {
        if (role === 'store_manager') return user.store_id || list[0]?.store_id || null;
        if (prev && list.some((s) => s.store_id === prev)) return prev;
        return isHQ ? null : (list[0]?.store_id || null); // HQ defaults to "All"
      });
    } catch {
      setStores([]);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, role]);

  useEffect(() => { load(); }, [load]);

  const selectedStore = stores.find((s) => s.store_id === selectedStoreId) || null;

  return (
    <Ctx.Provider value={{ stores, loading, selectedStoreId, setSelectedStoreId, selectedStore, canSwitch, allowAll, reload: load }}>
      {children}
    </Ctx.Provider>
  );
}
