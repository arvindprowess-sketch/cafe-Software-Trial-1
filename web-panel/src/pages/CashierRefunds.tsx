import React, { useCallback, useEffect, useState } from 'react';
import { api } from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { useStores } from '../context/StoreContext';

// ============================================================================
// Refunds & Voids (UI-6, Page 9).
// - Reason REQUIRED (submit blocked when empty; backend also 400s).
// - cashier RAISES a pending record; store_manager / super_admin FINALIZE
//   (cashier sees the row but no Finalize button). High-value (amount >= 2000)
//   shows an informational "HQ VALUE ≥ ₹2000" lime badge — it is NOT a gate;
//   store_manager can still finalize.
// - Void is idempotent: a 2nd void on the same order surfaces backend 400.
// - Cashier/kitchen NEVER see cost; order lines + amounts are selling+tax only.
// List from GET /api/refunds?store_id=&status=&flagged= (UI-0, merged).
// ============================================================================

const FLAG_THRESHOLD = 2000;

type RefundKind = 'refund' | 'void';
type RefundStatus = 'pending' | 'completed';
type Refund = {
  id: string;
  order_id: string;
  store_id: string;
  kind: RefundKind;
  amount: number;
  reason: string;
  status: RefundStatus;
  flagged: boolean;
  raised_by?: string | null;
  raised_at?: string | null;
  finalized_by?: string | null;
  finalized_at?: string | null;
  stock_reversed?: boolean;
};
type OrderItem = { product_id?: string; product_name?: string; name?: string; product_type?: string; grams?: number; quantity?: number; price?: number };
type Order = { id: string; total_price?: number; status?: string; items?: OrderItem[]; created_at?: string };

type TabKey = 'all' | 'pending' | 'completed';

const errMsg = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong');
const money = (n: number | null | undefined) => '₹' + Number(n ?? 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });
const itemName = (it: OrderItem) => it.product_name || it.name || (it.product_id || '').slice(0, 8) || 'item';
const itemQtyLabel = (it: OrderItem) => (it.product_type === 'ready_made' ? `x${it.quantity ?? 1}` : `${it.grams ?? 0}g`);

const TABS: { key: TabKey; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'pending', label: 'Pending finalize' },
  { key: 'completed', label: 'Completed' },
];

export default function CashierRefunds() {
  const { user } = useAuth();
  const { selectedStoreId } = useStores();
  const role = user?.role ?? '';
  const isSuper = role === 'super_admin' || role === 'admin';
  const isStoreMgr = role === 'store_manager';
  const isArea = role === 'area_manager';
  const canRaise = role === 'cashier' || isStoreMgr || isSuper;
  const canFinalizeRole = isStoreMgr || isSuper;

  const storeId = selectedStoreId || user?.store_id || null;

  const [tab, setTab] = useState<TabKey>('all');
  const [flaggedOnly, setFlaggedOnly] = useState(false);
  const [list, setList] = useState<Refund[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');

  const [orders, setOrders] = useState<Order[]>([]);
  const [orderId, setOrderId] = useState('');

  const [modal, setModal] = useState<RefundKind | null>(null);
  const [mode, setMode] = useState<'full' | 'partial'>('full');
  const [reason, setReason] = useState('');
  const [amount, setAmount] = useState('');
  const [lineSel, setLineSel] = useState<Record<number, boolean>>({});
  const [lineQty, setLineQty] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState(false);
  const [modalError, setModalError] = useState('');

  const showToast = (m: string) => { setToast(m); window.setTimeout(() => setToast(''), 3500); };

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const p = new URLSearchParams();
      if (storeId && !isSuper) p.set('store_id', storeId);
      if (tab === 'pending') p.set('status', 'pending');
      else if (tab === 'completed') p.set('status', 'completed');
      if (flaggedOnly) p.set('flagged', 'true');
      const rows: Refund[] = await api(`/refunds?${p.toString()}`);
      setList(rows);
    } catch (e) {
      setError(errMsg(e)); // inline 403 (kitchen etc.)
      setList([]);
    } finally {
      setLoading(false);
    }
  }, [storeId, isSuper, tab, flaggedOnly]);

  useEffect(() => { load(); }, [load]);

  // Recent refundable orders for the lookup datalist + line preview.
  useEffect(() => {
    if (!canRaise) return;
    (async () => {
      try {
        const data: Order[] = await api('/orders');
        setOrders((data || []).filter((o) => o.status !== 'refunded' && o.status !== 'voided'));
      } catch { setOrders([]); }
    })();
  }, [canRaise]);

  const lookedUp = orders.find((o) => o.id === orderId.trim()) || null;

  const openModal = (kind: RefundKind) => {
    setModal(kind);
    setMode('full');
    setReason('');
    setAmount('');
    setModalError('');
    const sel: Record<number, boolean> = {};
    const qty: Record<number, string> = {};
    (lookedUp?.items || []).forEach((it, i) => {
      sel[i] = false;
      qty[i] = String(it.product_type === 'ready_made' ? (it.quantity ?? 1) : (it.grams ?? 0));
    });
    setLineSel(sel);
    setLineQty(qty);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setModalError('');
    if (!orderId.trim()) { setModalError('Order ID is required.'); return; }
    if (!reason.trim()) { setModalError('Reason is required.'); return; } // hard block per spec
    setBusy(true);
    try {
      const path = modal === 'refund' ? `/orders/${orderId.trim()}/refund` : `/orders/${orderId.trim()}/void`;
      const body: { reason: string; amount?: number; lines?: { product_id?: string; units?: number; grams?: number }[] } = { reason: reason.trim() };
      if (modal === 'refund') {
        if (amount.trim() !== '') body.amount = parseFloat(amount);
        if (mode === 'partial') {
          const items = lookedUp?.items || [];
          const lines = items
            .map((it, i) => ({ it, i }))
            .filter(({ i }) => lineSel[i])
            .map(({ it, i }) => it.product_type === 'ready_made'
              ? { product_id: it.product_id, units: parseInt(lineQty[i] || '0', 10) }
              : { product_id: it.product_id, grams: parseFloat(lineQty[i] || '0') });
          if (lines.length === 0) { setModalError('Select at least one line for a partial refund.'); setBusy(false); return; }
          body.lines = lines;
        }
      }
      await api(path, { method: 'POST', body });
      // cashier raises a pending record; manager/HQ execute immediately.
      showToast(role === 'cashier' ? 'Sent for finalize' : 'Stock re-added to inventory');
      setModal(null);
      setOrderId('');
      await load();
    } catch (e) {
      setModalError(errMsg(e)); // missing reason / already refunded-voided (2nd void) -> 400
    } finally {
      setBusy(false);
    }
  };

  const finalize = async (r: Refund) => {
    setError('');
    try {
      await api(`/refunds/${r.id}/finalize`, { method: 'POST' });
      showToast('Stock re-added to inventory');
      await load();
    } catch (e) {
      setError(errMsg(e)); // cashier 403 / already finalized 400
    }
  };

  const canFinalize = (r: Refund) => r.status === 'pending' && canFinalizeRole;

  return (
    <div data-testid="refunds-page">
      <div className="page-header">
        <div><h1>Refunds &amp; Voids</h1><p>Reason required · high-value ({money(FLAG_THRESHOLD)}+) flagged for HQ visibility</p></div>
      </div>

      {error && <div className="badge badge-red" style={{ display: 'block', padding: 12, marginBottom: 14 }} data-testid="refunds-error">{error}</div>}
      {toast && <div className="badge badge-green" style={{ display: 'block', padding: 12, marginBottom: 14 }} data-testid="refunds-toast">{toast}</div>}

      {/* Order lookup + actions */}
      {canRaise && (
        <div style={{ background: '#FAFAFA', border: '1px solid #EFEFEF', borderRadius: 12, padding: 16, marginBottom: 20 }} data-testid="refund-lookup">
          <h2 style={{ fontSize: 16, marginTop: 0 }}>Look up an order</h2>
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div className="form-group" style={{ margin: 0, minWidth: 260 }}>
              <label>Order ID</label>
              <input list="refund-order-list" value={orderId} onChange={(e) => setOrderId(e.target.value)} data-testid="refund-lookup-input" placeholder="enter / select order id" />
              <datalist id="refund-order-list">
                {orders.map((o) => <option key={o.id} value={o.id}>{money(o.total_price)} · {o.status}</option>)}
              </datalist>
            </div>
            <button type="button" className="btn btn-primary" disabled={!lookedUp} data-testid="refund-btn" onClick={() => openModal('refund')}>Refund</button>
            <button type="button" className="btn btn-secondary" disabled={!orderId.trim()} data-testid="void-btn" onClick={() => openModal('void')}>Void</button>
          </div>

          {orderId.trim() && !lookedUp && (
            <div style={{ fontSize: 13, color: '#9C9C9C', marginTop: 10 }} data-testid="lookup-not-found">
              Order not in recent list — you can still Void by ID.
            </div>
          )}
          {lookedUp && (
            <table className="data-table" style={{ marginTop: 12 }} data-testid="order-lines">
              <thead><tr><th>Item</th><th>Qty</th><th>Amount</th></tr></thead>
              <tbody>
                {(lookedUp.items || []).map((it, i) => (
                  <tr key={i}>
                    <td>{itemName(it)}</td>
                    <td>{itemQtyLabel(it)}</td>
                    <td>{money(it.price)}</td>
                  </tr>
                ))}
                <tr><td colSpan={2} style={{ textAlign: 'right', fontWeight: 700 }}>Total (incl. tax)</td><td style={{ fontWeight: 700 }}>{money(lookedUp.total_price)}</td></tr>
              </tbody>
            </table>
          )}
        </div>
      )}
      {isArea && <div style={{ fontSize: 13, color: '#9C9C9C', marginBottom: 12 }} data-testid="area-readonly-note">Read-only — area managers review refunds but don't raise or finalize.</div>}

      {/* Tabs + filters */}
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
        <div className="login-tabs" style={{ maxWidth: 520, margin: 0 }}>
          {TABS.map((t) => (
            <button key={t.key} className={`login-tab ${tab === t.key ? 'active' : ''}`} data-testid={`refund-tab-${t.key}`} onClick={() => setTab(t.key)}>{t.label}</button>
          ))}
        </div>
        <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13 }}>
          <input type="checkbox" checked={flaggedOnly} onChange={(e) => setFlaggedOnly(e.target.checked)} data-testid="flagged-filter" />
          Flagged only (≥ {money(FLAG_THRESHOLD)})
        </label>
      </div>

      {loading ? (
        <div style={{ padding: 30, color: '#9C9C9C' }} data-testid="refunds-loading">Loading…</div>
      ) : list.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#9C9C9C' }} data-testid="refunds-empty">No records in this tab.</div>
      ) : (
        <table className="data-table" data-testid="refunds-table">
          <thead><tr><th>Time</th><th>Order</th><th>Type</th><th>Amount</th><th>Reason</th><th>Status</th><th>Flag</th><th style={{ width: 120 }}>Action</th></tr></thead>
          <tbody>
            {list.map((r) => (
              <tr key={r.id} data-testid={`refund-row-${r.id}`}>
                <td style={{ fontSize: 12, color: '#9C9C9C' }}>{r.raised_at ? new Date(r.raised_at).toLocaleString() : '—'}</td>
                <td style={{ fontSize: 12 }}>{r.order_id?.slice(0, 8)}</td>
                <td><span className="badge badge-gray">{r.kind}</span></td>
                <td>{money(r.amount)}</td>
                <td style={{ fontSize: 13 }}>{r.reason}</td>
                <td><span className={`badge ${r.status === 'completed' ? 'badge-green' : 'badge-orange'}`}>{r.status}</span></td>
                <td>{r.flagged ? <span className="badge" style={{ background: 'var(--lime)', color: 'var(--ink)', fontWeight: 700 }} data-testid={`flag-${r.id}`}>HQ VALUE ≥ ₹2000</span> : '—'}</td>
                <td>
                  {canFinalize(r) ? (
                    <button className="btn btn-sm btn-green" data-testid={`finalize-${r.id}`} onClick={() => finalize(r)}>Finalize</button>
                  ) : (
                    <span style={{ fontSize: 12, color: '#9C9C9C' }}>{r.status === 'completed' ? '✓' : '—'}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* Refund / Void modal */}
      {modal && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && !busy && setModal(null)}>
          <div className="modal" style={{ maxWidth: 520 }} data-testid={`${modal}-modal`}>
            <h2>{modal === 'refund' ? 'Refund' : 'Void'} order {orderId.trim().slice(0, 8)}</h2>

            {modal === 'refund' && (lookedUp?.items?.length ?? 0) > 0 && (
              <>
                <div className="login-tabs" style={{ maxWidth: 260, marginBottom: 12 }}>
                  <button type="button" className={`login-tab ${mode === 'full' ? 'active' : ''}`} data-testid="refund-mode-full" onClick={() => setMode('full')}>Full</button>
                  <button type="button" className={`login-tab ${mode === 'partial' ? 'active' : ''}`} data-testid="refund-mode-partial" onClick={() => setMode('partial')}>Partial</button>
                </div>
                {mode === 'partial' && (
                  <div style={{ marginBottom: 12 }} data-testid="partial-lines">
                    {(lookedUp?.items || []).map((it, i) => (
                      <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '6px 0', borderBottom: '1px solid #EFEFEF' }}>
                        <input type="checkbox" checked={!!lineSel[i]} onChange={(e) => setLineSel({ ...lineSel, [i]: e.target.checked })} data-testid={`line-sel-${i}`} />
                        <span style={{ flex: 1, fontSize: 14 }}>{itemName(it)}</span>
                        <input type="number" step="any" min="0" value={lineQty[i] ?? ''} onChange={(e) => setLineQty({ ...lineQty, [i]: e.target.value })} disabled={!lineSel[i]} style={{ width: 90 }} data-testid={`line-qty-${i}`} />
                        <span style={{ fontSize: 12, color: '#9C9C9C', width: 30 }}>{it.product_type === 'ready_made' ? 'units' : 'g'}</span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}

            <form onSubmit={submit}>
              {modal === 'refund' && (
                <div className="form-group">
                  <label>Amount {mode === 'full' ? '(blank = full total)' : '(optional)'}</label>
                  <input type="number" step="any" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} data-testid="refund-amount" placeholder={lookedUp ? String(lookedUp.total_price ?? '') : 'full'} />
                </div>
              )}
              <div className="form-group">
                <label>Reason *</label>
                <input value={reason} onChange={(e) => setReason(e.target.value)} data-testid="refund-reason" placeholder="Required" />
              </div>
              {modalError && <div className="badge badge-red" style={{ display: 'block', padding: 10, marginBottom: 12 }} data-testid="refund-modal-error">{modalError}</div>}
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setModal(null)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={busy || !reason.trim()} data-testid="submit-refund-btn">
                  {busy ? 'Submitting…' : modal === 'refund' ? 'Submit refund' : 'Submit void'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
