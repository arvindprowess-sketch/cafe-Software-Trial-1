import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { useStores } from '../context/StoreContext';

// ============================================================================
// Reports hub (UI-4, Page 6). Read-only analytics with PDF/XLSX exports.
// Sub-tabs are role-scoped (hidden, not just disabled):
//   - P&L:          super_admin/admin (all), area_manager (cluster),
//                   store_manager (own store).
//   - Consolidated: super_admin/admin only.
//   - Ranking:      super_admin/admin + area_manager (store_manager 403 -> hidden).
//   - Item Sales:   all report roles.
//   - Inventory / Audit Log: all report roles, single store_id from StoreSwitcher.
// Exports hit /reports/{report}/export.{xlsx,pdf} with the SAME query params as
// the on-screen table. Reuses api()/useStores()/StoreSwitcher (global, in
// HqLayout — read selectedStoreId, don't re-render it) + existing CSS.
// ============================================================================

type TabKey = 'pnl' | 'consolidated' | 'ranking' | 'items' | 'inventory' | 'audit-log';

type PnlRow = {
  store_id: string;
  store_name: string;
  revenue: number;
  discounts: number;
  cogs: number;
  gross_profit: number;
  margin_pct: number;
  order_count: number;
  avg_order_value: number;
  wastage: number;
  net_contribution: number;
};
type Company = {
  revenue: number;
  discounts: number;
  cogs: number;
  wastage: number;
  order_count: number;
  gross_profit: number;
  margin_pct: number;
  net_contribution: number;
};
type ConsolidatedResp = { company: Company; stores: PnlRow[] };
type RankingResp = {
  by_gross_profit: PnlRow[];
  by_revenue: PnlRow[];
  top_by_profit: PnlRow | null;
  bottom_by_profit: PnlRow | null;
};
type ItemRow = { product_id: string; name: string; qty: number; revenue: number; cogs: number; profit: number; category?: string | null };
type ItemsResp = { items: ItemRow[]; top_by_category: Record<string, { product_id: string; name: string; qty: number; revenue: number }[]> };
type PurchaseRow = { item_id: string; product_id?: string | null; qty: number; value: number };
type InventoryResp = { store_id: string; valuation: number; wastage: number; consumption: number; purchases: { total: number; by_item: PurchaseRow[] } };
type AuditEntry = { source: string; at?: string | null; type?: string; user_id?: string | null; ref_id?: string | null; item_id?: string | null; qty_delta?: number | null; reason?: string | null; status?: string | null; value?: number | null };
type AuditResp = { store_id: string; entries: AuditEntry[] };

type TabDef = { key: TabKey; label: string; roles: string[]; needsStore?: boolean };
const TABS: TabDef[] = [
  { key: 'pnl', label: 'P&L', roles: ['super_admin', 'admin', 'area_manager', 'store_manager'] },
  { key: 'consolidated', label: 'Consolidated', roles: ['super_admin', 'admin'] },
  { key: 'ranking', label: 'Ranking', roles: ['super_admin', 'admin', 'area_manager'] },
  { key: 'items', label: 'Item Sales', roles: ['super_admin', 'admin', 'area_manager', 'store_manager'] },
  { key: 'inventory', label: 'Inventory', roles: ['super_admin', 'admin', 'area_manager', 'store_manager'], needsStore: true },
  { key: 'audit-log', label: 'Audit Log', roles: ['super_admin', 'admin', 'area_manager', 'store_manager'], needsStore: true },
];

const errMsg = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong');
const money = (n: number | null | undefined) => '₹' + Number(n ?? 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });
const num = (n: number | null | undefined) => Number(n ?? 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });

// --- The brief's blob downloader: Bearer token + trigger browser download. ---
async function downloadReport(path: string, filename: string) {
  const token = localStorage.getItem('token');
  const res = await fetch(`/api${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try { const j = await res.json(); detail = j.detail || detail; } catch { /* non-JSON body */ }
    throw new Error(detail);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export default function HqReports() {
  const { user } = useAuth();
  const { stores, selectedStoreId } = useStores();
  const role = user?.role ?? '';

  const tabs = useMemo(() => TABS.filter((t) => t.roles.includes(role)), [role]);
  const [tab, setTab] = useState<TabKey>('pnl');
  useEffect(() => {
    if (tabs.length && !tabs.some((t) => t.key === tab)) setTab(tabs[0].key);
  }, [tabs, tab]);

  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const [pnl, setPnl] = useState<PnlRow[]>([]);
  const [consolidated, setConsolidated] = useState<ConsolidatedResp | null>(null);
  const [ranking, setRanking] = useState<RankingResp | null>(null);
  const [items, setItems] = useState<ItemsResp | null>(null);
  const [inventory, setInventory] = useState<InventoryResp | null>(null);
  const [audit, setAudit] = useState<AuditResp | null>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [exporting, setExporting] = useState('');

  const def = tabs.find((t) => t.key === tab) ?? TABS[0];
  const needsStore = !!def.needsStore;
  const storeName = stores.find((s) => s.store_id === selectedStoreId)?.name || null;
  const blockedNoStore = needsStore && !selectedStoreId;

  // Query string for the on-screen table. Multi-store reports rely on backend
  // role scoping (no store_ids => own store / cluster / all). Single-store
  // reports require store_id from the StoreSwitcher.
  const tableQS = useCallback(() => {
    const p = new URLSearchParams();
    if (from) p.set('from', from);
    if (to) p.set('to', to);
    if (needsStore && selectedStoreId) p.set('store_id', selectedStoreId);
    return p.toString();
  }, [from, to, needsStore, selectedStoreId]);

  // Export uses the SAME filters; the export route takes store_ids (single id).
  const exportQS = useCallback(() => {
    const p = new URLSearchParams();
    if (from) p.set('from', from);
    if (to) p.set('to', to);
    if (needsStore && selectedStoreId) p.set('store_ids', selectedStoreId);
    return p.toString();
  }, [from, to, needsStore, selectedStoreId]);

  const load = useCallback(async () => {
    if (needsStore && !selectedStoreId) return;
    setLoading(true);
    setError('');
    const qs = tableQS();
    try {
      if (tab === 'pnl') setPnl(await api(`/reports/pnl?${qs}`));
      else if (tab === 'consolidated') setConsolidated(await api(`/reports/pnl/consolidated?${qs}`));
      else if (tab === 'ranking') setRanking(await api(`/reports/ranking?${qs}`));
      else if (tab === 'items') setItems(await api(`/reports/items?${qs}`));
      else if (tab === 'inventory') setInventory(await api(`/reports/inventory?${qs}`));
      else if (tab === 'audit-log') setAudit(await api(`/reports/audit-log?${qs}`));
    } catch (e) {
      setError(errMsg(e)); // inline 403 (out-of-scope / cost-restricted role)
    } finally {
      setLoading(false);
    }
  }, [tab, tableQS, needsStore, selectedStoreId]);

  useEffect(() => { load(); }, [load]);

  const doExport = async (ext: 'xlsx' | 'pdf') => {
    setError('');
    setExporting(`${tab}:${ext}`);
    try {
      await downloadReport(`/reports/${tab}/export.${ext}?${exportQS()}`, `${tab}.${ext}`);
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setExporting('');
    }
  };

  return (
    <div data-testid="reports-page">
      <div className="page-header">
        <div><h1>Reports</h1><p>P&amp;L, rankings, inventory &amp; audit — with PDF / Excel export</p></div>
      </div>

      {/* Shared filters */}
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 16 }}>
        <div className="form-group" style={{ margin: 0 }}>
          <label>From</label>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} data-testid="report-from" />
        </div>
        <div className="form-group" style={{ margin: 0 }}>
          <label>To</label>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} data-testid="report-to" />
        </div>
        {(from || to) && <button className="btn btn-sm btn-secondary" data-testid="report-clear-dates" onClick={() => { setFrom(''); setTo(''); }}>Clear dates</button>}
        <div style={{ flex: 1 }} />
        <button className="btn btn-secondary" data-testid="export-pdf-btn" disabled={blockedNoStore || !!exporting} onClick={() => doExport('pdf')}>{exporting === `${tab}:pdf` ? 'Exporting…' : '⬇ PDF'}</button>
        <button className="btn btn-secondary" data-testid="export-xlsx-btn" disabled={blockedNoStore || !!exporting} onClick={() => doExport('xlsx')}>{exporting === `${tab}:xlsx` ? 'Exporting…' : '⬇ Excel'}</button>
      </div>

      {/* Sub-tabs (role-filtered) */}
      <div className="login-tabs" style={{ maxWidth: 720, marginBottom: 16 }}>
        {tabs.map((t) => (
          <button key={t.key} className={`login-tab ${tab === t.key ? 'active' : ''}`} data-testid={`report-tab-${t.key}`} onClick={() => setTab(t.key)}>{t.label}</button>
        ))}
      </div>

      {needsStore && (
        <div style={{ marginBottom: 12, fontSize: 13, color: '#696969' }} data-testid="report-store-context">
          Store: <strong>{storeName || '— none selected —'}</strong>
        </div>
      )}

      {error && <div className="badge badge-red" style={{ display: 'block', padding: 12, marginBottom: 14 }} data-testid="reports-error">{error}</div>}

      {blockedNoStore ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#9C9C9C' }} data-testid="reports-no-store">Select a single store in the switcher above to view this report.</div>
      ) : loading ? (
        <div style={{ padding: 30, color: '#9C9C9C' }} data-testid="reports-loading">Loading…</div>
      ) : (
        <>
          {tab === 'pnl' && <PnlTable rows={pnl} />}
          {tab === 'consolidated' && <ConsolidatedView data={consolidated} />}
          {tab === 'ranking' && <RankingView data={ranking} />}
          {tab === 'items' && <ItemsTable data={items} />}
          {tab === 'inventory' && <InventoryView data={inventory} />}
          {tab === 'audit-log' && <AuditTable data={audit} />}
        </>
      )}
    </div>
  );
}

function Empty({ id }: { id: string }) {
  return <div style={{ textAlign: 'center', padding: 40, color: '#9C9C9C' }} data-testid={id}>No data for this range.</div>;
}

function PnlTable({ rows }: { rows: PnlRow[] }) {
  if (!rows.length) return <Empty id="pnl-empty" />;
  return (
    <table className="data-table" data-testid="pnl-table">
      <thead><tr><th>Store</th><th>Revenue</th><th>Discounts</th><th>COGS</th><th>Gross Profit</th><th>Margin %</th><th>Wastage</th><th>Net Contribution</th><th>Orders</th><th>AOV</th></tr></thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.store_id} data-testid={`pnl-row-${r.store_id}`}>
            <td><strong>{r.store_name}</strong></td>
            <td>{money(r.revenue)}</td>
            <td>{money(r.discounts)}</td>
            <td>{money(r.cogs)}</td>
            <td>{money(r.gross_profit)}</td>
            <td>{num(r.margin_pct)}%</td>
            <td>{money(r.wastage)}</td>
            <td><strong>{money(r.net_contribution)}</strong></td>
            <td>{r.order_count}</td>
            <td>{money(r.avg_order_value)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function ConsolidatedView({ data }: { data: ConsolidatedResp | null }) {
  if (!data) return <Empty id="consolidated-empty" />;
  const c = data.company;
  return (
    <div data-testid="consolidated-view">
      <div className="stats-grid" style={{ marginBottom: 20 }}>
        {[
          { l: 'Revenue', v: money(c.revenue) },
          { l: 'COGS', v: money(c.cogs) },
          { l: 'Gross Profit', v: money(c.gross_profit) },
          { l: 'Margin %', v: `${num(c.margin_pct)}%` },
          { l: 'Wastage', v: money(c.wastage) },
          { l: 'Net Contribution', v: money(c.net_contribution) },
        ].map((s) => (
          <div className="stat-card" key={s.l}>
            <div className="stat-value">{s.v}</div>
            <div className="stat-label">{s.l}</div>
          </div>
        ))}
      </div>
      <h2 style={{ fontSize: 18 }}>Per store</h2>
      <PnlTable rows={data.stores} />
    </div>
  );
}

function RankingView({ data }: { data: RankingResp | null }) {
  if (!data || (!data.by_gross_profit.length && !data.by_revenue.length)) return <Empty id="ranking-empty" />;
  const rankTable = (rows: PnlRow[], metric: 'gross_profit' | 'revenue', testid: string) => (
    <table className="data-table" data-testid={testid}>
      <thead><tr><th>#</th><th>Store</th><th>{metric === 'gross_profit' ? 'Gross Profit' : 'Revenue'}</th><th>Margin %</th></tr></thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={r.store_id}>
            <td>{i + 1}</td>
            <td><strong>{r.store_name}</strong></td>
            <td>{money(r[metric])}</td>
            <td>{num(r.margin_pct)}%</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
  return (
    <div data-testid="ranking-view">
      {data.top_by_profit && (
        <div style={{ marginBottom: 16, fontSize: 14 }}>
          <span className="badge badge-green">Top: {data.top_by_profit.store_name} · {money(data.top_by_profit.gross_profit)}</span>{' '}
          {data.bottom_by_profit && <span className="badge badge-orange">Bottom: {data.bottom_by_profit.store_name} · {money(data.bottom_by_profit.gross_profit)}</span>}
        </div>
      )}
      <h2 style={{ fontSize: 18 }}>By gross profit</h2>
      {rankTable(data.by_gross_profit, 'gross_profit', 'ranking-profit-table')}
      <h2 style={{ fontSize: 18, marginTop: 20 }}>By revenue</h2>
      {rankTable(data.by_revenue, 'revenue', 'ranking-revenue-table')}
    </div>
  );
}

function ItemsTable({ data }: { data: ItemsResp | null }) {
  if (!data || !data.items.length) return <Empty id="items-empty" />;
  return (
    <table className="data-table" data-testid="items-table">
      <thead><tr><th>Item</th><th>Category</th><th>Qty</th><th>Revenue</th><th>COGS</th><th>Profit</th></tr></thead>
      <tbody>
        {data.items.map((r) => (
          <tr key={r.product_id} data-testid={`item-row-${r.product_id}`}>
            <td><strong>{r.name}</strong></td>
            <td style={{ fontSize: 13, color: '#696969' }}>{r.category || 'Uncategorized'}</td>
            <td>{num(r.qty)}</td>
            <td>{money(r.revenue)}</td>
            <td>{money(r.cogs)}</td>
            <td><strong>{money(r.profit)}</strong></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function InventoryView({ data }: { data: InventoryResp | null }) {
  if (!data) return <Empty id="inventory-empty" />;
  return (
    <div data-testid="inventory-view">
      <div className="stats-grid" style={{ marginBottom: 20 }}>
        {[
          { l: 'Valuation', v: money(data.valuation) },
          { l: 'Wastage', v: money(data.wastage) },
          { l: 'Consumption', v: money(data.consumption) },
          { l: 'Purchases', v: money(data.purchases.total) },
        ].map((s) => (
          <div className="stat-card" key={s.l}>
            <div className="stat-value">{s.v}</div>
            <div className="stat-label">{s.l}</div>
          </div>
        ))}
      </div>
      <h2 style={{ fontSize: 18 }}>Purchases by item</h2>
      {data.purchases.by_item.length === 0 ? (
        <Empty id="inventory-purchases-empty" />
      ) : (
        <table className="data-table" data-testid="inventory-purchases-table">
          <thead><tr><th>Item</th><th>Qty</th><th>Value</th></tr></thead>
          <tbody>
            {data.purchases.by_item.map((r) => (
              <tr key={r.item_id}>
                <td>{r.item_id?.slice(0, 8) || r.product_id?.slice(0, 8) || '—'}</td>
                <td>{num(r.qty)}</td>
                <td>{money(r.value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function AuditTable({ data }: { data: AuditResp | null }) {
  if (!data || !data.entries.length) return <Empty id="audit-empty" />;
  return (
    <table className="data-table" data-testid="audit-table">
      <thead><tr><th>When</th><th>Source</th><th>Type</th><th>Ref</th><th>Qty Δ</th><th>Status</th><th>Reason</th></tr></thead>
      <tbody>
        {data.entries.map((e, i) => (
          <tr key={`${e.ref_id ?? 'x'}-${i}`}>
            <td style={{ fontSize: 12, color: '#9C9C9C' }}>{e.at ? new Date(e.at).toLocaleString() : '—'}</td>
            <td><span className="badge badge-gray">{e.source}</span></td>
            <td>{e.type || '—'}</td>
            <td style={{ fontSize: 12 }}>{(e.ref_id || '').slice(0, 8) || '—'}</td>
            <td>{e.qty_delta == null ? '—' : num(e.qty_delta)}</td>
            <td>{e.status || '—'}</td>
            <td style={{ fontSize: 13 }}>{e.reason || '—'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
