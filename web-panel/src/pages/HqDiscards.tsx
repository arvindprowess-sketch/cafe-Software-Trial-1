import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { useStores } from '../context/StoreContext';

// ============================================================================
// Discards & Wastage (UI-3, Page 2).
// - Raise view (store_manager, kitchen): submit a wastage discard with photo.
// - Queue view (area_manager, super_admin): tabbed approval queue.
//   area_manager approves first; high-value (hq_required) -> pending_hq ->
//   super_admin finalizes. Raiser can never approve their own row (UI + 403).
// Value (₹) is hidden from kitchen. Reuses api()/useAuth()/useStores()+CSS.
// ============================================================================

type TargetType = 'meal' | 'raw';
type DiscardStatus = 'pending' | 'pending_hq' | 'approved' | 'rejected';

type Discard = {
  id: string;
  store_id: string;
  target_type: TargetType;
  product_id?: string | null;
  item_id?: string | null;
  qty: number;
  reason: string;
  photo_url?: string | null;
  value: number;
  status: DiscardStatus;
  hq_required: boolean;
  raised_by: string;
  raised_at: string;
  approved_by?: string | null;
  decided_at?: string | null;
  hq_approved_by?: string | null;
  hq_decided_at?: string | null;
  decision_note?: string | null;
  product_name?: string | null;
  item_name?: string | null;
};

type NamedRef = { id?: string; item_id?: string; product_id?: string; name?: string };

type Tab = { key: DiscardStatus; label: string };
const TABS: Tab[] = [
  { key: 'pending', label: 'Pending' },
  { key: 'pending_hq', label: 'Pending HQ' },
  { key: 'approved', label: 'Approved' },
  { key: 'rejected', label: 'Rejected' },
];

const REASONS = ['expired', 'spoiled', 'spillage', 'other'] as const;

const STATUS_BADGE: Record<DiscardStatus, string> = {
  pending: 'badge-orange',
  pending_hq: 'badge-blue',
  approved: 'badge-green',
  rejected: 'badge-red',
};
const STATUS_LABEL: Record<DiscardStatus, string> = {
  pending: 'Pending',
  pending_hq: 'Pending HQ',
  approved: 'Approved',
  rejected: 'Rejected',
};

const errMsg = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong');
const refId = (r: NamedRef) => r.id || r.item_id || r.product_id || '';

export default function HqDiscards({ raiseOnly = false }: { raiseOnly?: boolean }) {
  const { user } = useAuth();
  const { selectedStoreId } = useStores();
  const role = user?.role ?? '';

  // kitchen always raises in its own store; everyone else uses the HQ switcher.
  const storeId = role === 'kitchen' ? (user?.store_id ?? null) : selectedStoreId;
  const showValue = role !== 'kitchen' && role !== 'cashier';
  const isQueue = !raiseOnly && (role === 'area_manager' || role === 'super_admin' || role === 'admin');

  const [discards, setDiscards] = useState<Discard[]>([]);
  const [products, setProducts] = useState<NamedRef[]>([]);
  const [items, setItems] = useState<NamedRef[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [tab, setTab] = useState<DiscardStatus>('pending');
  const [zoom, setZoom] = useState<string | null>(null);
  const [toast, setToast] = useState('');

  // raise form
  const [showForm, setShowForm] = useState(false);
  const [targetType, setTargetType] = useState<TargetType>('meal');
  const [targetId, setTargetId] = useState('');
  const [qty, setQty] = useState('');
  const [reasonType, setReasonType] = useState<(typeof REASONS)[number]>('expired');
  const [reasonText, setReasonText] = useState('');
  const [photoUrl, setPhotoUrl] = useState('');
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  const showToast = (m: string) => { setToast(m); window.setTimeout(() => setToast(''), 3500); };

  const loadDiscards = useCallback(async () => {
    if (!storeId) { setDiscards([]); setLoading(false); return; }
    setLoading(true);
    setError('');
    try {
      const list: Discard[] = await api(`/discards/${storeId}`);
      setDiscards(list);
    } catch (e) {
      setError(errMsg(e));
      setDiscards([]);
    } finally {
      setLoading(false);
    }
  }, [storeId]);

  const loadRefs = useCallback(async () => {
    try {
      const prods: NamedRef[] = await api('/products');
      setProducts(prods);
    } catch { setProducts([]); }
    try {
      // kitchen reads its own store inventory; HQ roles read the picked store's.
      const raw: NamedRef[] = await api(role === 'kitchen' || !storeId ? '/inventory' : `/inventory/${storeId}/items`);
      setItems(raw);
    } catch { setItems([]); }
  }, [role, storeId]);

  useEffect(() => { loadDiscards(); loadRefs(); }, [loadDiscards, loadRefs]);

  const productMap = useMemo(() => {
    const m: Record<string, string> = {};
    products.forEach((p) => { const id = refId(p); if (id) m[id] = p.name ?? id; });
    return m;
  }, [products]);
  const itemMap = useMemo(() => {
    const m: Record<string, string> = {};
    items.forEach((i) => { const id = refId(i); if (id) m[id] = i.name ?? id; });
    return m;
  }, [items]);

  const rowName = (d: Discard) =>
    d.product_name || d.item_name ||
    (d.target_type === 'meal' ? productMap[d.product_id ?? ''] : itemMap[d.item_id ?? '']) ||
    (d.product_id || d.item_id || '').slice(0, 8) || '—';

  const resetForm = () => {
    setTargetType('meal'); setTargetId(''); setQty('');
    setReasonType('expired'); setReasonText(''); setPhotoUrl('');
  };

  const handlePhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = String(reader.result);
      try {
        const res: { url: string } = await api('/upload/image', { method: 'POST', body: { image: base64 } });
        setPhotoUrl(res.url);
      } catch {
        setPhotoUrl(base64); // fall back to inline preview if upload route fails
      } finally {
        setUploading(false);
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const submitRaise = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!storeId) { setError('No store selected.'); return; }
    if (!targetId) { setError('Pick a product or item.'); return; }
    const q = parseFloat(qty);
    if (isNaN(q) || q <= 0) { setError('Enter a valid quantity.'); return; }
    const reason = reasonText.trim()
      ? `${reasonType} — ${reasonText.trim()}`
      : reasonType;
    setSaving(true);
    setError('');
    try {
      await api('/discards', {
        method: 'POST',
        body: {
          store_id: storeId,
          target_type: targetType,
          ...(targetType === 'meal' ? { product_id: targetId } : { item_id: targetId }),
          qty: q,
          reason,
          ...(photoUrl ? { photo_url: photoUrl } : {}),
        },
      });
      resetForm();
      setShowForm(false);
      showToast('Discard raised — sent for approval');
      await loadDiscards();
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setSaving(false);
    }
  };

  const decide = async (d: Discard, action: 'approve' | 'reject') => {
    setError('');
    try {
      await api(`/discards/${d.id}/decide`, { method: 'PUT', body: { action } });
      if (action === 'approve') showToast('Stock deducted from raw inventory');
      else showToast('Discard rejected — no stock movement');
      await loadDiscards();
    } catch (e) {
      setError(errMsg(e)); // inline 403 (raiser ≠ approver / cluster / HQ-only)
    }
  };

  // who may act on a given row, given the current role + raiser≠approver rule.
  const canDecide = (d: Discard) => {
    if (d.raised_by === user?.id) return false; // raiser can't self-approve
    if (role === 'area_manager') return d.status === 'pending';
    if (role === 'super_admin' || role === 'admin') return d.status === 'pending' || d.status === 'pending_hq';
    return false;
  };

  const refOptions = targetType === 'meal' ? products : items;

  // -------------------------------------------------------------------------
  // RAISE VIEW (kitchen, store_manager)
  // -------------------------------------------------------------------------
  if (!isQueue) {
    const mine = discards.filter((d) => !user?.id || d.raised_by === user.id || role === 'store_manager');
    return (
      <div data-testid="discards-raise">
        <div className="page-header">
          <div><h1>Discards &amp; Wastage</h1><p>Raise a wastage discard for approval</p></div>
          <button className="btn btn-primary" data-testid="raise-discard-btn" onClick={() => { resetForm(); setShowForm(true); }}>+ Raise discard</button>
        </div>

        {error && <div className="badge badge-red" style={{ display: 'block', padding: 12, marginBottom: 14 }} data-testid="discards-error">{error}</div>}
        {toast && <div className="badge badge-green" style={{ display: 'block', padding: 12, marginBottom: 14 }} data-testid="discards-toast">{toast}</div>}

        <h2 style={{ fontSize: 18 }}>Recent discards</h2>
        {loading ? (
          <div style={{ padding: 30, color: '#9C9C9C' }}>Loading…</div>
        ) : mine.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40, color: '#9C9C9C' }} data-testid="discards-empty">No discards raised yet.</div>
        ) : (
          <table className="data-table" data-testid="discards-recent-table">
            <thead><tr><th>Item</th><th>Qty</th><th>Reason</th><th>Photo</th>{showValue && <th>Value</th>}<th>Status</th><th>Raised at</th></tr></thead>
            <tbody>
              {mine.map((d) => (
                <tr key={d.id} data-testid={`discard-row-${d.id}`}>
                  <td><strong>{rowName(d)}</strong> <span className="badge badge-gray">{d.target_type}</span></td>
                  <td>{d.qty}</td>
                  <td style={{ fontSize: 13 }}>{d.reason}</td>
                  <td>{d.photo_url ? <img src={d.photo_url} alt="" style={{ width: 40, height: 40, borderRadius: 6, objectFit: 'cover', cursor: 'pointer' }} onClick={() => setZoom(d.photo_url ?? null)} /> : '—'}</td>
                  {showValue && <td>₹{Math.round(d.value)}</td>}
                  <td><span className={`badge ${STATUS_BADGE[d.status]}`}>{STATUS_LABEL[d.status]}</span>{d.hq_required && <span className="badge" style={{ background: 'var(--lime)', color: 'var(--ink)', fontWeight: 700, marginLeft: 6 }}>HQ APPROVAL NEEDED</span>}</td>
                  <td style={{ fontSize: 12, color: '#9C9C9C' }}>{new Date(d.raised_at).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {showForm && (
          <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && !saving && setShowForm(false)}>
            <div className="modal" style={{ maxWidth: 480 }}>
              <h2>Raise discard</h2>
              <form onSubmit={submitRaise}>
                <div className="form-group">
                  <label>Type</label>
                  <div className="login-tabs">
                    <button type="button" className={`login-tab ${targetType === 'meal' ? 'active' : ''}`} data-testid="discard-type-meal" onClick={() => { setTargetType('meal'); setTargetId(''); }}>Meal</button>
                    <button type="button" className={`login-tab ${targetType === 'raw' ? 'active' : ''}`} data-testid="discard-type-raw" onClick={() => { setTargetType('raw'); setTargetId(''); }}>Raw</button>
                  </div>
                </div>
                <div className="form-group">
                  <label>{targetType === 'meal' ? 'Product' : 'Item'} *</label>
                  <select value={targetId} onChange={(e) => setTargetId(e.target.value)} data-testid="discard-target" required>
                    <option value="">— Select —</option>
                    {refOptions.map((o) => <option key={refId(o)} value={refId(o)}>{o.name ?? refId(o)}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label>Quantity *</label>
                  <input type="number" step="any" min="0" value={qty} onChange={(e) => setQty(e.target.value)} data-testid="discard-qty" required />
                </div>
                <div className="form-group">
                  <label>Reason *</label>
                  <select value={reasonType} onChange={(e) => setReasonType(e.target.value as (typeof REASONS)[number])} data-testid="discard-reason">
                    {REASONS.map((r) => <option key={r} value={r}>{r[0].toUpperCase() + r.slice(1)}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label>Notes</label>
                  <input value={reasonText} onChange={(e) => setReasonText(e.target.value)} placeholder="Optional detail" data-testid="discard-reason-text" />
                </div>
                <div className="form-group">
                  <label>Photo</label>
                  <input type="file" accept="image/*" onChange={handlePhoto} data-testid="discard-photo" />
                  {uploading && <div style={{ fontSize: 12, color: '#9C9C9C', marginTop: 6 }}>Uploading…</div>}
                  {photoUrl && <img src={photoUrl} alt="" style={{ width: 64, height: 64, borderRadius: 8, objectFit: 'cover', marginTop: 8 }} />}
                </div>
                {error && <div className="badge badge-red" style={{ display: 'block', padding: 10, marginBottom: 12 }} data-testid="discard-form-error">{error}</div>}
                <div className="modal-actions">
                  <button type="button" className="btn btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
                  <button type="submit" className="btn btn-primary" disabled={saving || uploading} data-testid="submit-discard-btn">{saving ? 'Submitting…' : 'Submit discard'}</button>
                </div>
              </form>
            </div>
          </div>
        )}

        {zoom && (
          <div className="modal-overlay" data-testid="photo-zoom" onClick={() => setZoom(null)}>
            <img src={zoom} alt="discard" style={{ maxWidth: '80vw', maxHeight: '80vh', borderRadius: 12 }} />
          </div>
        )}
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // QUEUE VIEW (area_manager, super_admin)
  // -------------------------------------------------------------------------
  const rows = discards.filter((d) => d.status === tab);
  return (
    <div data-testid="discards-queue">
      <div className="page-header">
        <div><h1>Discards &amp; Wastage</h1><p>Approval queue</p></div>
        <button className="btn btn-secondary" onClick={loadDiscards} data-testid="refresh-discards-btn">Refresh</button>
      </div>

      {error && <div className="badge badge-red" style={{ display: 'block', padding: 12, marginBottom: 14 }} data-testid="discards-error">{error}</div>}
      {toast && <div className="badge badge-green" style={{ display: 'block', padding: 12, marginBottom: 14 }} data-testid="discards-toast">{toast}</div>}

      <div className="login-tabs" style={{ maxWidth: 560 }}>
        {TABS.map((t) => (
          <button key={t.key} className={`login-tab ${tab === t.key ? 'active' : ''}`} data-testid={`discard-tab-${t.key}`} onClick={() => setTab(t.key)}>
            {t.label} ({discards.filter((d) => d.status === t.key).length})
          </button>
        ))}
      </div>

      {!storeId ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#9C9C9C' }} data-testid="discards-no-store">Select a store to view its discards.</div>
      ) : loading ? (
        <div style={{ padding: 30, color: '#9C9C9C' }}>Loading…</div>
      ) : rows.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#9C9C9C' }} data-testid="discards-empty">No discards in this tab.</div>
      ) : (
        <table className="data-table" data-testid="discards-table">
          <thead><tr><th>Item</th><th>Qty</th><th>Reason</th><th>Photo</th>{showValue && <th>Value</th>}<th>Raised by</th><th>Raised at</th><th>Status</th><th style={{ width: 160 }}>Actions</th></tr></thead>
          <tbody>
            {rows.map((d) => (
              <tr key={d.id} data-testid={`discard-row-${d.id}`}>
                <td><strong>{rowName(d)}</strong> <span className="badge badge-gray">{d.target_type}</span></td>
                <td>{d.qty}</td>
                <td style={{ fontSize: 13 }}>{d.reason}</td>
                <td>{d.photo_url ? <img src={d.photo_url} alt="" style={{ width: 40, height: 40, borderRadius: 6, objectFit: 'cover', cursor: 'pointer' }} data-testid={`discard-photo-${d.id}`} onClick={() => setZoom(d.photo_url ?? null)} /> : '—'}</td>
                {showValue && <td>₹{Math.round(d.value)}</td>}
                <td style={{ fontSize: 13 }}>{d.raised_by === user?.id ? 'You' : d.raised_by}</td>
                <td style={{ fontSize: 12, color: '#9C9C9C' }}>{new Date(d.raised_at).toLocaleString()}</td>
                <td>
                  <span className={`badge ${STATUS_BADGE[d.status]}`}>{STATUS_LABEL[d.status]}</span>
                  {d.hq_required && <span className="badge" style={{ background: 'var(--lime)', color: 'var(--ink)', fontWeight: 700, marginLeft: 6 }} data-testid={`hq-badge-${d.id}`}>HQ APPROVAL NEEDED</span>}
                </td>
                <td>
                  {canDecide(d) ? (
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button className="btn btn-sm btn-green" data-testid={`approve-discard-${d.id}`} onClick={() => decide(d, 'approve')}>{d.status === 'pending_hq' ? 'Approve (final)' : 'Approve'}</button>
                      <button className="btn btn-sm btn-danger" data-testid={`reject-discard-${d.id}`} onClick={() => decide(d, 'reject')}>Reject</button>
                    </div>
                  ) : (
                    <span style={{ fontSize: 12, color: '#9C9C9C' }}>{d.raised_by === user?.id ? 'Your request' : '—'}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {zoom && (
        <div className="modal-overlay" data-testid="photo-zoom" onClick={() => setZoom(null)}>
          <img src={zoom} alt="discard" style={{ maxWidth: '80vw', maxHeight: '80vh', borderRadius: 12 }} />
        </div>
      )}
    </div>
  );
}
