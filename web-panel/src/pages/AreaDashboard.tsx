import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { useRealtime, RealtimeMessage } from '../utils/realtime';

// ============================================================================
// Area Dashboard (Phase 5) — cluster-scoped command center for area managers.
// Approval inbox lives at the TOP and acts on the EXISTING discard/transfer
// approve+reject endpoints (optimistic remove on success, refetch on fail).
// Everything below is read-only cluster intelligence. Strictly cluster-scoped:
// the backend only ever returns the caller's cluster_store_ids (super_admin =
// all stores, for QA). Mobile-first — single column under 920px.
// Reuses api()/useAuth()/useRealtime() + the FUEL design-system CSS.
// ============================================================================

type InboxItem = {
  id: string;
  kind: 'discard' | 'transfer';
  store_id: string;
  store_name: string;
  title: string;
  subtitle: string;
  value: number | null;
  high_value: boolean;
  status: string;
  at?: string | null;
  endpoint: string;     // EXISTING decide endpoint, e.g. /discards/{id}/decide
  deeplink: string;     // existing approval UI, e.g. /hq/discards
  can_decide: boolean;
};

type WorstStore = { store_id: string; store: string; revenue: number };
type ClusterPulse = {
  revenue: number; orders: number; aov: number; stores: number;
  worst_store: WorstStore | null; window: { from: string; to: string };
};
type CompareRow = {
  store_id: string; store: string; revenue: number; orders: number;
  aov: number; wastage: number; wastage_pct: number | null; variance: number | null;
};
type DiscardPatternRow = { store_id: string; store: string; wastage: number; wastage_pct: number | null };
type CashReconRow = { store_id: string; store: string; cash_variance: number | null; status: string; business_date: string | null };
type ComplianceRow = { store_id: string; store: string; type: 'gst' | 'fssai'; expiry: string | null; days_left: number };

type Dashboard = {
  scope: { store_ids: string[]; is_super_admin: boolean };
  approval_inbox: InboxItem[];
  cluster_pulse: ClusterPulse;
  store_comparison: CompareRow[];
  discard_pattern: DiscardPatternRow[];
  cash_recon: CashReconRow[];
  compliance: ComplianceRow[];
};

const errMsg = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong');
const inr = (n: number | null | undefined) => `₹${Math.round(Number(n ?? 0)).toLocaleString('en-IN')}`;

type SortKey = keyof Pick<CompareRow, 'store' | 'revenue' | 'orders' | 'wastage_pct' | 'variance'>;

const VARIANCE_BADGE: Record<string, string> = {
  balanced: 'badge-green', short: 'badge-red', over: 'badge-orange', no_data: 'badge-gray',
};
const VARIANCE_LABEL: Record<string, string> = {
  balanced: 'Balanced', short: 'Short', over: 'Over', no_data: 'No close',
};

export default function AreaDashboard() {
  const { user } = useAuth();
  const [data, setData] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [sortKey, setSortKey] = useState<SortKey>('revenue');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const showToast = (m: string) => { setToast(m); window.setTimeout(() => setToast(''), 3500); };

  // Realtime: an area manager joins every per-store room in their cluster, so
  // they receive their stores' order/approval events without cross-store leak.
  const rooms = useMemo(() => {
    if (!user) return [] as string[];
    if (user.role === 'super_admin' || user.role === 'admin') return ['hq'];
    const ids = user.cluster_store_ids || [];
    return ids.flatMap((id) => [`manager:${id}`, `cashier:${id}`, `kitchen:${id}`]);
  }, [user]);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError('');
    try {
      const res: Dashboard = await api('/area/dashboard');
      setData(res);
    } catch (e) {
      setError(errMsg(e));
      if (!silent) setData(null);
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Refetch (silently) on cluster order/approval activity.
  const onRealtime = useCallback((msg: RealtimeMessage) => {
    if (['new_order', 'order_status', 'menu_update'].includes(msg.type)) load(true);
  }, [load]);
  const { connected } = useRealtime(rooms, onRealtime);

  // Approve / reject -> hit the EXISTING decide endpoint. Optimistic remove on
  // success; refetch (reconcile) on failure so the row reappears with state.
  const decide = async (item: InboxItem, action: 'approve' | 'reject') => {
    if (busy[item.id]) return;
    setBusy((b) => ({ ...b, [item.id]: true }));
    setError('');
    // optimistic remove
    setData((d) => (d ? { ...d, approval_inbox: d.approval_inbox.filter((i) => i.id !== item.id) } : d));
    try {
      await api(item.endpoint, { method: 'PUT', body: { action } });
      showToast(action === 'approve' ? `Approved — ${item.title}` : `Rejected — ${item.title}`);
      await load(true); // reconcile aggregates + any escalation (e.g. -> pending_hq)
    } catch (e) {
      setError(errMsg(e));
      await load(true); // restore the row from source of truth
    } finally {
      setBusy((b) => { const n = { ...b }; delete n[item.id]; return n; });
    }
  };

  const setSort = (k: SortKey) => {
    if (k === sortKey) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(k); setSortDir(k === 'store' ? 'asc' : 'desc'); }
  };

  const sortedComparison = useMemo(() => {
    const rows = [...(data?.store_comparison ?? [])];
    rows.sort((a, b) => {
      const av = a[sortKey]; const bv = b[sortKey];
      // nulls always sort last
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      let cmp: number;
      if (typeof av === 'string' || typeof bv === 'string') cmp = String(av).localeCompare(String(bv));
      else cmp = (av as number) - (bv as number);
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return rows;
  }, [data, sortKey, sortDir]);

  const caret = (k: SortKey) => (sortKey === k ? <span className="sort-caret">{sortDir === 'asc' ? '▲' : '▼'}</span> : <span className="sort-caret">↕</span>);

  // -------------------------------------------------------------------------
  if (loading) {
    return (
      <div data-testid="area-dashboard">
        <div className="page-header"><div><h1>My Cluster</h1><p>Loading cluster intelligence…</p></div></div>
        <div style={{ padding: 30, color: 'var(--muted)' }}>Loading…</div>
      </div>
    );
  }
  if (error && !data) {
    return (
      <div data-testid="area-dashboard">
        <div className="page-header"><div><h1>My Cluster</h1></div></div>
        <div className="badge badge-red" style={{ display: 'block', padding: 14 }} data-testid="area-error">{error}</div>
        <button className="btn btn-secondary" style={{ marginTop: 14 }} onClick={() => load()}>Retry</button>
      </div>
    );
  }
  if (!data) return null;

  const pulse = data.cluster_pulse;
  const inbox = data.approval_inbox;

  return (
    <div data-testid="area-dashboard">
      <div className="page-header">
        <div>
          <h1>My Cluster</h1>
          <p>
            {data.scope.is_super_admin ? 'All stores (HQ view)' : `${data.scope.store_ids.length} store(s) in your cluster`}
            {' · '}{connected ? 'Live' : 'Offline'}
          </p>
        </div>
        <button className="btn btn-secondary" onClick={() => load()} data-testid="area-refresh">Refresh</button>
      </div>

      {error && <div className="badge badge-red" style={{ display: 'block', padding: 12, marginBottom: 14 }} data-testid="area-inline-error">{error}</div>}
      {toast && <div className="badge badge-green" style={{ display: 'block', padding: 12, marginBottom: 14 }} data-testid="area-toast">{toast}</div>}

      {/* ===================== APPROVAL INBOX (TOP) ===================== */}
      <section className="area-section" data-testid="approval-inbox">
        <h2>Approval Inbox</h2>
        <div className="area-sub">Pending discards &amp; transfers across your cluster — high-value escalations first.</div>
        {inbox.length === 0 ? (
          <div className="area-card" style={{ textAlign: 'center', color: 'var(--muted)' }} data-testid="inbox-empty">
            🎉 Nothing waiting on you. Inbox zero.
          </div>
        ) : (
          <div className="area-inbox">
            {inbox.map((item) => (
              <div key={`${item.kind}-${item.id}`} className={`appr-card ${item.high_value ? 'high-value' : ''}`} data-testid={`appr-${item.id}`}>
                <div className="appr-head">
                  <div>
                    <div className="appr-title">{item.title}</div>
                    <div className="appr-meta">{item.store_name}{item.subtitle ? ` · ${item.subtitle}` : ''}</div>
                    <div className="appr-meta">
                      {item.value != null && <strong>{inr(item.value)} </strong>}
                      {item.at ? new Date(item.at).toLocaleString() : ''}
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-end' }}>
                    {item.high_value && <span className="badge badge-purple" data-testid={`appr-flag-${item.id}`}>{item.kind === 'transfer' ? 'Cross-cluster' : 'High value'}</span>}
                    <span className="badge badge-gray">{item.kind}</span>
                  </div>
                </div>
                {item.can_decide ? (
                  <div className="appr-actions">
                    <button className="btn btn-green" disabled={!!busy[item.id]} data-testid={`appr-approve-${item.id}`} onClick={() => decide(item, 'approve')}>Approve</button>
                    <button className="btn btn-danger" disabled={!!busy[item.id]} data-testid={`appr-reject-${item.id}`} onClick={() => decide(item, 'reject')}>Reject</button>
                  </div>
                ) : (
                  <div className="appr-meta" data-testid={`appr-locked-${item.id}`}>
                    {item.status === 'pending_hq' ? 'Awaiting HQ approval' : 'Requires HQ'} ·{' '}
                    <Link to={item.deeplink}>open in {item.kind === 'discard' ? 'Discards' : 'Transfers'}</Link>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ===================== CLUSTER PULSE ===================== */}
      <section className="area-section" data-testid="cluster-pulse">
        <h2>Cluster Pulse</h2>
        <div className="area-sub">Today ({pulse.window.from === pulse.window.to ? pulse.window.from : `${pulse.window.from} → ${pulse.window.to}`})</div>
        <div className="stats-grid">
          <div className="stat-card"><div className="stat-value" data-testid="pulse-revenue">{inr(pulse.revenue)}</div><div className="stat-label">Revenue</div></div>
          <div className="stat-card"><div className="stat-value" data-testid="pulse-orders">{pulse.orders}</div><div className="stat-label">Orders</div></div>
          <div className="stat-card"><div className="stat-value" data-testid="pulse-aov">{inr(pulse.aov)}</div><div className="stat-label">Avg order value</div></div>
          <div className="stat-card">
            <div className="stat-value" style={{ fontSize: 22 }} data-testid="pulse-worst">{pulse.worst_store ? pulse.worst_store.store : '—'}</div>
            <div className="stat-label">Worst store{pulse.worst_store ? ` · ${inr(pulse.worst_store.revenue)}` : ''}</div>
          </div>
        </div>
      </section>

      {/* ===================== STORE COMPARISON ===================== */}
      <section className="area-section">
        <h2>Store Comparison</h2>
        <div className="area-sub">Tap a column header to sort.</div>
        <table className="data-table" data-testid="store-compare">
          <thead>
            <tr>
              <th className="sortable" onClick={() => setSort('store')}>Store{caret('store')}</th>
              <th className="sortable" onClick={() => setSort('revenue')}>Revenue{caret('revenue')}</th>
              <th className="sortable" onClick={() => setSort('orders')}>Orders{caret('orders')}</th>
              <th className="sortable" onClick={() => setSort('wastage_pct')}>Wastage %{caret('wastage_pct')}</th>
              <th className="sortable" onClick={() => setSort('variance')}>Cash variance{caret('variance')}</th>
            </tr>
          </thead>
          <tbody>
            {sortedComparison.length === 0 ? (
              <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--muted)', padding: 30 }}>No stores in scope.</td></tr>
            ) : sortedComparison.map((r) => (
              <tr key={r.store_id} data-testid={`compare-row-${r.store_id}`}>
                <td><strong>{r.store}</strong></td>
                <td>{inr(r.revenue)}</td>
                <td>{r.orders}</td>
                <td>{r.wastage_pct == null ? '—' : `${r.wastage_pct}%`}</td>
                <td>{r.variance == null ? <span style={{ color: 'var(--muted)' }}>—</span> : <span className={r.variance < 0 ? 'badge badge-red' : r.variance > 0 ? 'badge badge-orange' : 'badge badge-green'}>{inr(r.variance)}</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* ===================== DISCARD PATTERN + CASH RECON ===================== */}
      <div className="area-grid">
        <section className="area-section" style={{ marginBottom: 0 }}>
          <h2>Discard Pattern</h2>
          <div className="area-sub">Wastage % ranking — worst first.</div>
          <div className="area-card">
            {data.discard_pattern.length === 0 ? (
              <div style={{ color: 'var(--muted)', textAlign: 'center' }} data-testid="discard-pattern-empty">No wastage recorded.</div>
            ) : (
              <ul className="area-list" data-testid="discard-pattern">
                {data.discard_pattern.map((r) => (
                  <li key={r.store_id}>
                    <span>{r.store}</span>
                    <span>
                      <strong>{r.wastage_pct == null ? '—' : `${r.wastage_pct}%`}</strong>
                      <span style={{ color: 'var(--muted)', marginLeft: 8 }}>{inr(r.wastage)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <section className="area-section" style={{ marginBottom: 0 }}>
          <h2>Cash Reconciliation</h2>
          <div className="area-sub">Latest closed day per store.</div>
          <div className="area-card">
            <ul className="area-list" data-testid="cash-recon">
              {data.cash_recon.map((r) => (
                <li key={r.store_id}>
                  <span>{r.store}{r.business_date ? <span style={{ color: 'var(--muted)', marginLeft: 6, fontSize: 12 }}>{r.business_date}</span> : ''}</span>
                  <span>
                    {r.cash_variance != null && <strong style={{ marginRight: 8 }}>{inr(r.cash_variance)}</strong>}
                    <span className={`badge ${VARIANCE_BADGE[r.status] ?? 'badge-gray'}`}>{VARIANCE_LABEL[r.status] ?? r.status}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </section>
      </div>

      {/* ===================== COMPLIANCE ===================== */}
      <section className="area-section">
        <h2>Compliance</h2>
        <div className="area-sub">GST &amp; FSSAI expiries across the cluster — soonest first.</div>
        <div className="area-card">
          {data.compliance.length === 0 ? (
            <div style={{ color: 'var(--muted)', textAlign: 'center' }} data-testid="compliance-empty">No expiry dates on file.</div>
          ) : (
            <ul className="area-list" data-testid="compliance">
              {data.compliance.map((r) => (
                <li key={`${r.store_id}-${r.type}`}>
                  <span><strong>{r.store}</strong> <span className="badge badge-gray">{r.type.toUpperCase()}</span></span>
                  <span>
                    <span style={{ color: 'var(--muted)', marginRight: 8 }}>{r.expiry ? new Date(r.expiry).toLocaleDateString() : '—'}</span>
                    <span className={`badge ${r.days_left < 0 ? 'badge-red' : r.days_left <= 30 ? 'badge-orange' : 'badge-green'}`}>
                      {r.days_left < 0 ? `Expired ${Math.abs(r.days_left)}d ago` : `${r.days_left}d left`}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}
