import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { useStores } from '../context/StoreContext';

// ============================================================================
// Store ↔ Store transfers (UI-3, Page 4).
// Source store manager requests a raw transfer; area_manager (same cluster)
// or HQ approves. Confirmed DB status values = requested / completed / rejected
// (no `approved` state) — approving a `requested` row moves it to `completed`.
// area_manager is cluster-restricted; cross-cluster is HQ-only (backend 403s,
// surfaced inline). Reuses api()/useAuth()/useStores() + the global
// StoreSwitcher already rendered by HqLayout.
// ============================================================================

type TransferStatus = 'requested' | 'completed' | 'rejected';

type Transfer = {
  id?: string;
  transfer_id?: string;
  from_store_id: string;
  to_store_id: string;
  item_id?: string | null;
  product_id?: string | null;
  qty: number;
  status: TransferStatus;
  requested_by?: string | null;
  approved_by?: string | null;
  created_at?: string;
  item_name?: string | null;
  from_store_name?: string | null;
  to_store_name?: string | null;
};

type NamedRef = { id?: string; item_id?: string; product_id?: string; name?: string };

type Tab = { key: TransferStatus; label: string };
const TABS: Tab[] = [
  { key: 'requested', label: 'Requested' },
  { key: 'completed', label: 'Completed' },
  { key: 'rejected', label: 'Rejected' },
];

const STATUS_BADGE: Record<TransferStatus, string> = {
  requested: 'badge-orange',
  completed: 'badge-green',
  rejected: 'badge-red',
};

const errMsg = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong');
const refId = (r: NamedRef) => r.id || r.item_id || r.product_id || '';
const txId = (t: Transfer) => t.transfer_id || t.id || '';

export default function HqTransfers() {
  const { user } = useAuth();
  const { stores, selectedStoreId } = useStores();
  const role = user?.role ?? '';

  const canRequest = role === 'store_manager' || role === 'super_admin' || role === 'admin';
  const canDecideRole = role === 'area_manager' || role === 'super_admin' || role === 'admin';

  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [tab, setTab] = useState<TransferStatus>('requested');

  // request modal
  const [showForm, setShowForm] = useState(false);
  const [fromStore, setFromStore] = useState('');
  const [toStore, setToStore] = useState('');
  const [items, setItems] = useState<NamedRef[]>([]);
  const [itemId, setItemId] = useState('');
  const [qty, setQty] = useState('');
  const [saving, setSaving] = useState(false);

  const showToast = (m: string) => { setToast(m); window.setTimeout(() => setToast(''), 3500); };
  const storeName = (id: string) => stores.find((s) => s.store_id === id)?.name || id.slice(0, 8);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const qs = new URLSearchParams();
      if (selectedStoreId) qs.set('store_id', selectedStoreId);
      qs.set('status', tab);
      const list: Transfer[] = await api(`/transfers?${qs.toString()}`);
      setTransfers(list);
    } catch (e) {
      setError(errMsg(e));
      setTransfers([]);
    } finally {
      setLoading(false);
    }
  }, [selectedStoreId, tab]);

  useEffect(() => { load(); }, [load]);

  // item picker depends on the chosen source store
  const loadItems = useCallback(async (sid: string) => {
    if (!sid) { setItems([]); return; }
    try {
      const raw: NamedRef[] = await api(`/inventory/${sid}/items`);
      setItems(raw);
    } catch { setItems([]); }
  }, []);

  const itemMap = useMemo(() => {
    const m: Record<string, string> = {};
    items.forEach((i) => { const id = refId(i); if (id) m[id] = i.name ?? id; });
    return m;
  }, [items]);

  const openForm = () => {
    const def = role === 'store_manager' ? (user?.store_id ?? '') : (selectedStoreId ?? '');
    setFromStore(def); setToStore(''); setItemId(''); setQty('');
    setError('');
    setShowForm(true);
    if (def) loadItems(def);
  };

  const onFromChange = (sid: string) => {
    setFromStore(sid);
    setItemId('');
    loadItems(sid);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fromStore || !toStore) { setError('Pick both source and destination stores.'); return; }
    if (fromStore === toStore) { setError('Source and destination must differ.'); return; }
    if (!itemId) { setError('Pick an item to transfer.'); return; }
    const q = parseFloat(qty);
    if (isNaN(q) || q <= 0) { setError('Enter a valid quantity.'); return; }
    setSaving(true);
    setError('');
    try {
      await api('/transfers', {
        method: 'POST',
        body: { from_store_id: fromStore, to_store_id: toStore, item_id: itemId, qty: q },
      });
      setShowForm(false);
      showToast('Transfer requested');
      setTab('requested');
      await load();
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setSaving(false);
    }
  };

  const decide = async (t: Transfer, action: 'approve' | 'reject') => {
    setError('');
    try {
      await api(`/transfers/${txId(t)}/decide`, { method: 'PUT', body: { action } });
      if (action === 'approve') showToast('Source qty ↓ Destination qty ↑ Avg cost re-weighted');
      else showToast('Transfer rejected');
      await load();
    } catch (e) {
      setError(errMsg(e)); // inline 403 (cross-cluster / requester ≠ approver)
    }
  };

  // requester can't approve their own request; only requested rows are actionable.
  const canDecide = (t: Transfer) =>
    canDecideRole && t.status === 'requested' && t.requested_by !== user?.id;

  const rowItem = (t: Transfer) => t.item_name || itemMap[t.item_id ?? ''] || (t.item_id || t.product_id || '').slice(0, 8) || '—';

  return (
    <div data-testid="transfers-page">
      <div className="page-header">
        <div><h1>Transfers</h1><p>Store ↔ store raw transfers</p></div>
        {canRequest && <button className="btn btn-primary" data-testid="request-transfer-btn" onClick={openForm}>➕ Request transfer</button>}
      </div>

      {error && <div className="badge badge-red" style={{ display: 'block', padding: 12, marginBottom: 14 }} data-testid="transfers-error">{error}</div>}
      {toast && <div className="badge badge-green" style={{ display: 'block', padding: 12, marginBottom: 14 }} data-testid="transfers-toast">{toast}</div>}

      <div className="login-tabs" style={{ maxWidth: 460 }}>
        {TABS.map((t) => (
          <button key={t.key} className={`login-tab ${tab === t.key ? 'active' : ''}`} data-testid={`transfer-tab-${t.key}`} onClick={() => setTab(t.key)}>{t.label}</button>
        ))}
      </div>

      {loading ? (
        <div style={{ padding: 30, color: '#9C9C9C' }}>Loading…</div>
      ) : transfers.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#9C9C9C' }} data-testid="transfers-empty">No {tab} transfers.</div>
      ) : (
        <table className="data-table" data-testid="transfers-table">
          <thead><tr><th>Time</th><th>From</th><th>To</th><th>Item</th><th>Qty</th><th>Status</th><th>Requested by</th><th>Approved by</th><th style={{ width: 160 }}>Actions</th></tr></thead>
          <tbody>
            {transfers.map((t) => (
              <tr key={txId(t)} data-testid={`transfer-row-${txId(t)}`}>
                <td style={{ fontSize: 12, color: '#9C9C9C' }}>{t.created_at ? new Date(t.created_at).toLocaleString() : '—'}</td>
                <td>{t.from_store_name || storeName(t.from_store_id)}</td>
                <td>{t.to_store_name || storeName(t.to_store_id)}</td>
                <td><strong>{rowItem(t)}</strong></td>
                <td>{t.qty}</td>
                <td><span className={`badge ${STATUS_BADGE[t.status]}`}>{t.status}</span></td>
                <td style={{ fontSize: 13 }}>{t.requested_by === user?.id ? 'You' : (t.requested_by || '—')}</td>
                <td style={{ fontSize: 13 }}>{t.approved_by || '—'}</td>
                <td>
                  {canDecide(t) ? (
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button className="btn btn-sm btn-green" data-testid={`approve-transfer-${txId(t)}`} onClick={() => decide(t, 'approve')}>Approve</button>
                      <button className="btn btn-sm btn-danger" data-testid={`reject-transfer-${txId(t)}`} onClick={() => decide(t, 'reject')}>Reject</button>
                    </div>
                  ) : (
                    <span style={{ fontSize: 12, color: '#9C9C9C' }}>{t.requested_by === user?.id ? 'Your request' : '—'}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {showForm && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && !saving && setShowForm(false)}>
          <div className="modal" style={{ maxWidth: 480 }}>
            <h2>Request transfer</h2>
            <form onSubmit={submit}>
              <div className="form-group">
                <label>From store *</label>
                <select value={fromStore} onChange={(e) => onFromChange(e.target.value)} data-testid="transfer-from" disabled={role === 'store_manager'} required>
                  <option value="">— Select —</option>
                  {stores.map((s) => <option key={s.store_id} value={s.store_id}>{s.name}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>To store *</label>
                <select value={toStore} onChange={(e) => setToStore(e.target.value)} data-testid="transfer-to" required>
                  <option value="">— Select —</option>
                  {stores.filter((s) => s.store_id !== fromStore).map((s) => <option key={s.store_id} value={s.store_id}>{s.name}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>Item *</label>
                <select value={itemId} onChange={(e) => setItemId(e.target.value)} data-testid="transfer-item" required disabled={!fromStore}>
                  <option value="">{fromStore ? '— Select —' : 'Pick a source store first'}</option>
                  {items.map((i) => <option key={refId(i)} value={refId(i)}>{i.name ?? refId(i)}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>Quantity *</label>
                <input type="number" step="any" min="0" value={qty} onChange={(e) => setQty(e.target.value)} data-testid="transfer-qty" required />
              </div>
              {error && <div className="badge badge-red" style={{ display: 'block', padding: 10, marginBottom: 12 }} data-testid="transfer-form-error">{error}</div>}
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={saving} data-testid="submit-transfer-btn">{saving ? 'Requesting…' : 'Request transfer'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
