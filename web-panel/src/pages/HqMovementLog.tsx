import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { useStores } from '../context/StoreContext';

// Page 3 — Append-only inventory movement ledger. 100% READ-ONLY: no edit or
// delete control exists anywhere on this page by design.
// Roles: super_admin, area_manager, store_manager.

type MovementType = 'inward' | 'sale' | 'discard' | 'transfer_out' | 'transfer_in' | 'adjust' | 'refund' | 'physical_count';

interface Movement {
  id: string;
  store_id: string;
  item_id: string;
  product_id?: string | null;
  type: MovementType | string;
  qty_delta: number;
  qty_after: number;
  reason?: string;
  user_id?: string;
  ref_id?: string | null;
  unit_cost_at_time?: number;   // stripped server-side for cashier/kitchen
  created_at: string;
}

interface InvItemLite { id: string; name: string; unit: string; }
interface StaffLite { id: string; name: string; }

const TYPE_BADGE: Record<string, string> = {
  inward: 'badge-green', sale: 'badge-blue', discard: 'badge-red',
  transfer_out: 'badge-purple', transfer_in: 'badge-purple', adjust: 'badge-orange',
  refund: 'badge-yellow', physical_count: 'badge-orange',
};

const ALL_TYPES: MovementType[] = ['inward', 'sale', 'discard', 'transfer_out', 'transfer_in', 'adjust', 'refund', 'physical_count'];
const PAGE = 500;

export default function HqMovementLog() {
  const { user } = useAuth();
  const { selectedStoreId, loading: storesLoading, stores, setSelectedStoreId } = useStores();
  // PR-3: store-required page — auto-pick the first store instead of an empty state.
  useEffect(() => {
    if (!storesLoading && !selectedStoreId && stores.length) setSelectedStoreId(stores[0].store_id);
  }, [storesLoading, selectedStoreId, stores, setSelectedStoreId]);
  const canSeeCost = user?.role !== 'cashier' && user?.role !== 'kitchen';

  const [rows, setRows] = useState<Movement[]>([]);
  const [itemNames, setItemNames] = useState<Record<string, InvItemLite>>({});
  const [staffNames, setStaffNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [visible, setVisible] = useState(PAGE);

  // filters (client-side; the endpoint returns the full store ledger newest-first)
  const [typeFilter, setTypeFilter] = useState<Set<string>>(new Set());
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [search, setSearch] = useState('');

  const load = async (storeId: string) => {
    setLoading(true);
    setError('');
    try {
      const data: Movement[] = await api(`/inventory/${storeId}/movements`);
      setRows(data);
      setVisible(PAGE);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load movement log');
      setRows([]);
    } finally {
      setLoading(false);
    }
    // resolve item + staff names (best-effort; failures are non-fatal)
    try {
      const items: InvItemLite[] = await api(`/inventory/${storeId}/items`);
      const map: Record<string, InvItemLite> = {};
      items.forEach((i) => { map[i.id] = i; });
      setItemNames(map);
    } catch { /* names optional */ }
    try {
      const staff: StaffLite[] = await api('/staff');
      const map: Record<string, string> = {};
      staff.forEach((s) => { map[s.id] = s.name; });
      setStaffNames(map);
    } catch { /* names optional */ }
  };

  useEffect(() => {
    if (selectedStoreId) load(selectedStoreId);
    else setRows([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedStoreId]);

  const toggleType = (t: string) => {
    setTypeFilter((prev) => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t); else next.add(t);
      return next;
    });
  };

  const filtered = useMemo(() => {
    return rows.filter((m) => {
      if (typeFilter.size > 0 && !typeFilter.has(m.type)) return false;
      if (fromDate && m.created_at < fromDate) return false;
      if (toDate && m.created_at > toDate + 'T23:59:59.999') return false;
      if (search.trim()) {
        const name = itemNames[m.item_id]?.name || '';
        if (!name.toLowerCase().includes(search.trim().toLowerCase())) return false;
      }
      return true;
    });
  }, [rows, typeFilter, fromDate, toDate, search, itemNames]);

  const shown = filtered.slice(0, visible);
  const itemName = (id: string) => itemNames[id]?.name || id.slice(0, 8);
  const userName = (id?: string) => (id ? (staffNames[id] || id.slice(0, 8)) : '—');
  const moneyValue = (m: Movement) => (m.unit_cost_at_time != null ? `₹${(m.unit_cost_at_time * Math.abs(m.qty_delta)).toFixed(2)}` : '—');

  if (storesLoading) return <div className="empty-state" data-testid="ml-loading">Loading…</div>;
  if (!selectedStoreId) {
    return <div className="empty-state" data-testid="ml-no-store">Select a specific store from the switcher above to view its movement log.</div>;
  }

  return (
    <div data-testid="movement-log-page">
      <div className="page-header">
        <div>
          <h1>Movement Log</h1>
          <p>{filtered.length} movement(s){filtered.length !== rows.length ? ` of ${rows.length}` : ''}</p>
        </div>
      </div>

      <div className="card" data-testid="append-only-banner" style={{ background: '#FFF8E6', border: '1px solid #F2D98C', padding: '10px 14px', marginBottom: 14, fontSize: 13, fontWeight: 600, color: '#7A5A00' }}>
        🔒 APPEND-ONLY — entries are never edited or deleted.
      </div>

      {/* Filter bar */}
      <div className="card" style={{ padding: 12, marginBottom: 14 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }} data-testid="type-filters">
          {ALL_TYPES.map((t) => (
            <button
              key={t}
              className={`btn btn-sm ${typeFilter.has(t) ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => toggleType(t)}
              data-testid={`type-filter-${t}`}
            >{t}</button>
          ))}
          {typeFilter.size > 0 && <button className="btn btn-sm btn-secondary" onClick={() => setTypeFilter(new Set())} data-testid="type-filter-clear">Clear</button>}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end' }}>
          <div className="form-group" style={{ margin: 0 }}><label>From</label><input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} data-testid="filter-from" /></div>
          <div className="form-group" style={{ margin: 0 }}><label>To</label><input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} data-testid="filter-to" /></div>
          <div className="form-group" style={{ margin: 0, flex: 1, minWidth: 160 }}><label>Search item</label><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="item name…" data-testid="filter-search" /></div>
        </div>
      </div>

      {error && <div className="badge badge-red" data-testid="ml-error" style={{ display: 'block', padding: 10, marginBottom: 12 }}>{error}</div>}

      {loading ? (
        <div className="empty-state">Loading movements…</div>
      ) : shown.length === 0 ? (
        <div className="empty-state" data-testid="ml-empty">No movements match the current filters.</div>
      ) : (
        <>
          <table className="data-table" data-testid="movements-table">
            <thead>
              <tr>
                <th>Time</th><th>Type</th><th>Item</th><th>Δ Qty</th><th>After</th><th>Reason</th><th>Ref</th><th>User</th>{canSeeCost && <th>Value</th>}
              </tr>
            </thead>
            <tbody>
              {shown.map((m) => (
                <tr key={m.id} data-testid={`movement-row-${m.id}`}>
                  <td style={{ fontSize: 12, color: '#696969', whiteSpace: 'nowrap' }}>{new Date(m.created_at).toLocaleString()}</td>
                  <td><span className={`badge ${TYPE_BADGE[m.type] || 'badge-gray'}`}>{m.type}</span></td>
                  <td>{itemName(m.item_id)}</td>
                  <td style={{ fontWeight: 700, color: m.qty_delta < 0 ? '#E5484D' : '#2E9E44' }}>{m.qty_delta > 0 ? '+' : ''}{m.qty_delta}</td>
                  <td>{m.qty_after}</td>
                  <td style={{ fontSize: 13, color: '#696969' }}>{m.reason || '—'}</td>
                  <td style={{ fontSize: 12, color: '#9C9C9C' }}>{m.ref_id ? m.ref_id.slice(0, 8) : '—'}</td>
                  <td style={{ fontSize: 13 }}>{userName(m.user_id)}</td>
                  {canSeeCost && <td data-testid={`movement-value-${m.id}`}>{moneyValue(m)}</td>}
                </tr>
              ))}
            </tbody>
          </table>
          {visible < filtered.length && (
            <div style={{ textAlign: 'center', marginTop: 14 }}>
              <button className="btn btn-secondary" onClick={() => setVisible((v) => v + PAGE)} data-testid="load-more-btn">Load more ({filtered.length - visible} remaining)</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
