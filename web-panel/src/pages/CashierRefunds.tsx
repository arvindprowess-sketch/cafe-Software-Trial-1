import React, { useCallback, useEffect, useState } from 'react';
import { api } from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { useStores } from '../context/StoreContext';

// ============================================================================
// Refunds & Voids (UI-6, Page 9).
// - Reason REQUIRED (submit blocked when empty; backend also 400s).
// - cashier raises a PENDING record; store_manager/HQ finalize. High-value
//   (amount >= 2000) is flagged=true -> "Flagged · awaiting HQ" tab, finalized
//   by super_admin only.
// - Void is idempotent: a 2nd void on the same order surfaces backend 400.
// - Cashier/kitchen never see cost; the refund amount is selling value only.
// Refunds list from GET /api/refunds?store_id=&status=&flagged= (UI-0, merged).
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
type OrderLite = { id: string; total_price?: number; status?: string };

type TabKey = 'all' | 'pending' | 'completed' | 'flagged';

const errMsg = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong');
const money = (n: number | null | undefined) => '₹' + Number(n ?? 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });

export default function CashierRefunds() {
  const { user } = useAuth();
  const { selectedStoreId } = useStores();
  const role = user?.role ?? '';
  const isSuper = role === 'super_admin' || role === 'admin';
  const isStoreMgr = role === 'store_manager';
  const isArea = role === 'area_manager';
  const canRaise = role === 'cashier' || isStoreMgr || isSuper;

  const storeId = selectedStoreId || user?.store_id || null;

  const tabs: { key: TabKey; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'pending', label: 'Pending' },
    { key: 'completed', label: 'Completed' },
    ...(isSuper ? [{ key: 'flagged' as TabKey, label: 'Flagged · awaiting HQ' }] : []),
  ];
  const [tab, setTab] = useState<TabKey>('all');

  const [list, setList] = useState<Refund[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [orders, setOrders] = useState<OrderLite[]>([]);

  // raise form
  const [orderId, setOrderId] = useState('');
  const [kind, setKind] = useState<RefundKind>('refund');
  const [reason, setReason] = useState('');
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState('');

  const showToast = (m: string) => { setToast(m); window.setTimeout(() => setToast(''), 3500); };

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const p = new URLSearchParams();
      if (storeId && !isSuper) p.set('store_id', storeId);
      if (tab === 'pending' || tab === 'flagged') p.set('status', 'pending');
      else if (tab === 'completed') p.set('status', 'completed');
      if (tab === 'flagged') p.set('flagged', 'true');
      const rows: Refund[] = await api(`/refunds?${p.toString()}`);
      setList(rows);
    } catch (e) {
      setError(errMsg(e)); // inline 403
      setList([]);
    } finally {
      setLoading(false);
    }
  }, [storeId, isSuper, tab]);

  useEffect(() => { load(); }, [load]);

  // Optional convenience: recent refundable orders for the order-id datalist.
  useEffect(() => {
    if (!canRaise) return;
    (async () => {
      try {
        const data: OrderLite[] = await api('/orders');
        setOrders((data || []).filter((o) => o.status !== 'refunded' && o.status !== 'voided'));
      } catch { setOrders([]); }
    })();
  }, [canRaise]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    if (!orderId.trim()) { setFormError('Order ID is required.'); return; }
    if (!reason.trim()) { setFormError('Reason is required.'); return; } // hard block per spec
    setBusy(true);
    try {
      const path = kind === 'refund' ? `/orders/${orderId.trim()}/refund` : `/orders/${orderId.trim()}/void`;
      const body: { reason: string; amount?: number } = { reason: reason.trim() };
      if (kind === 'refund' && amount.trim() !== '') body.amount = parseFloat(amount);
      await api(path, { method: 'POST', body });
      setOrderId(''); setReason(''); setAmount('');
      showToast(kind === 'refund' ? 'Refund submitted' : 'Void submitted');
      await load();
    } catch (e) {
      setFormError(errMsg(e)); // already refunded/voided, 2nd void -> backend 400
    } finally {
      setBusy(false);
    }
  };

  const finalize = async (r: Refund) => {
    setError('');
    try {
      await api(`/refunds/${r.id}/finalize`, { method: 'POST' });
      showToast('Finalized — stock reversed');
      await load();
    } catch (e) {
      setError(errMsg(e)); // cashier 403 / already finalized 400
    }
  };

  // store_manager finalizes non-flagged pending; flagged pending is HQ-only.
  const canFinalize = (r: Refund) =>
    r.status === 'pending' && (isSuper || (isStoreMgr && !r.flagged));

  const amountForOrder = orders.find((o) => o.id === orderId.trim());

  return (
    <div data-testid="refunds-page">
      <div className="page-header">
        <div><h1>Refunds &amp; Voids</h1><p>Reason required · high-value ({money(FLAG_THRESHOLD)}+) escalates to HQ</p></div>
      </div>

      {error && <div className="badge badge-red" style={{ display: 'block', padding: 12, marginBottom: 14 }} data-testid="refunds-error">{error}</div>}
      {toast && <div className="badge badge-green" style={{ display: 'block', padding: 12, marginBottom: 14 }} data-testid="refunds-toast">{toast}</div>}

      {/* Raise refund / void */}
      {canRaise && (
        <form onSubmit={submit} style={{ background: '#FAFAFA', border: '1px solid #EFEFEF', borderRadius: 12, padding: 16, marginBottom: 20 }} data-testid="refund-form">
          <h2 style={{ fontSize: 16, marginTop: 0 }}>New refund / void</h2>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div className="form-group" style={{ margin: 0, minWidth: 240 }}>
              <label>Order ID *</label>
              <input list="refund-order-list" value={orderId} onChange={(e) => setOrderId(e.target.value)} data-testid="refund-order-id" placeholder="order id" />
              <datalist id="refund-order-list">
                {orders.map((o) => <option key={o.id} value={o.id}>{money(o.total_price)} · {o.status}</option>)}
              </datalist>
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label>Type</label>
              <div className="login-tabs" style={{ width: 180 }}>
                <button type="button" className={`login-tab ${kind === 'refund' ? 'active' : ''}`} data-testid="kind-refund" onClick={() => setKind('refund')}>Refund</button>
                <button type="button" className={`login-tab ${kind === 'void' ? 'active' : ''}`} data-testid="kind-void" onClick={() => setKind('void')}>Void</button>
              </div>
            </div>
            {kind === 'refund' && (
              <div className="form-group" style={{ margin: 0, width: 160 }}>
                <label>Amount (blank = full)</label>
                <input type="number" step="any" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} data-testid="refund-amount" placeholder={amountForOrder ? String(amountForOrder.total_price ?? '') : 'full'} />
              </div>
            )}
          </div>
          <div className="form-group" style={{ marginTop: 12 }}>
            <label>Reason *</label>
            <input value={reason} onChange={(e) => setReason(e.target.value)} data-testid="refund-reason" placeholder="Required" />
          </div>
          {Number(amount) >= FLAG_THRESHOLD && kind === 'refund' && (
            <div className="badge" style={{ background: 'var(--lime)', color: 'var(--ink)', fontWeight: 700, marginBottom: 10 }} data-testid="flag-preview">High value — will flag for HQ</div>
          )}
          {formError && <div className="badge badge-red" style={{ display: 'block', padding: 10, marginBottom: 10 }} data-testid="refund-form-error">{formError}</div>}
          <button type="submit" className="btn btn-primary" disabled={busy || !orderId.trim() || !reason.trim()} data-testid="submit-refund-btn">
            {busy ? 'Submitting…' : kind === 'refund' ? 'Submit refund' : 'Submit void'}
          </button>
        </form>
      )}
      {isArea && <div style={{ fontSize: 13, color: '#9C9C9C', marginBottom: 12 }} data-testid="area-readonly-note">Read-only — area managers review refunds but don't raise or finalize.</div>}

      {/* Tabs */}
      <div className="login-tabs" style={{ maxWidth: 560 }}>
        {tabs.map((t) => (
          <button key={t.key} className={`login-tab ${tab === t.key ? 'active' : ''}`} data-testid={`refund-tab-${t.key}`} onClick={() => setTab(t.key)}>{t.label}</button>
        ))}
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
                <td>{r.flagged ? <span className="badge" style={{ background: 'var(--lime)', color: 'var(--ink)', fontWeight: 700 }} data-testid={`flag-${r.id}`}>HQ</span> : '—'}</td>
                <td>
                  {canFinalize(r) ? (
                    <button className="btn btn-sm btn-green" data-testid={`finalize-${r.id}`} onClick={() => finalize(r)}>Finalize</button>
                  ) : (
                    <span style={{ fontSize: 12, color: '#9C9C9C' }}>{r.status === 'completed' ? '✓' : (r.flagged ? 'HQ only' : '—')}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
