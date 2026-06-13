import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { useStores } from '../context/StoreContext';
import { useRealtime, RealtimeMessage } from '../utils/realtime';

// ============================================================================
// Store Dashboard (Phase 5) — single-store command center for store managers,
// and the drill-down target for the HQ stores table / area comparison rows.
// READ-ONLY. store_manager is locked to their own store; area_manager/super_admin
// open any in-scope store via ?store=<id>. Mobile-first (single column < 920px).
// Reuses api()/useAuth()/useStores()/useRealtime() + the FUEL design-system CSS.
// ============================================================================

type Today = { revenue: number; orders: number; avg_ticket: number; vs_same_weekday_pct: number | null };
type Live = { kitchen_queue_len: number; prep_time_avg_today: number };
type LowStock = { item: string; item_id: string; qty: number; reorder_level: number; unit: string };
type Stock = { low_stock: LowStock[]; tracked_items: number };
type DiscardsToday = { items: number; wastage_value: number; total_wastage_pct: number | null };
type StaffRef = { staff_id: string; name: string; role: string };
type Staff = { scheduled: number; in: number; absent: number; in_list: StaffRef[]; absent_list: StaffRef[] };
type Day = { status: 'open' | 'closed' | 'none'; opened_at: string | null; closed_at: string | null;
  cash_position: number | null; cash_variance: number | null; business_date: string | null };
type Seller = { product_id: string; name: string; qty: number };
type MyVariance = { last_count_at: string | null;
  last_count_result: { items_counted: number; flagged_items: number; net_variance: number } | null;
  within_tolerance: boolean };

type Dashboard = {
  store_id: string; store_name: string; empty: boolean;
  today: Today; live: Live; stock: Stock; discards_today: DiscardsToday;
  staff: Staff; day: Day; top5: Seller[]; bottom5: Seller[]; my_variance: MyVariance;
};

const errMsg = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong');
const inr = (n: number | null | undefined) => `₹${Math.round(Number(n ?? 0)).toLocaleString('en-IN')}`;
const timeOf = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—');

export default function StoreDashboard() {
  const { user } = useAuth();
  const { stores, selectedStoreId } = useStores();
  const [params] = useSearchParams();
  const role = user?.role ?? '';
  const isManager = role === 'store_manager';

  // store_manager is LOCKED to their own store; area/HQ read ?store= (then the
  // active switcher) so the HQ table / area-compare drill-down lands correctly.
  const storeId = isManager
    ? (user?.store_id ?? null)
    : (params.get('store') || selectedStoreId || null);

  const [data, setData] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const rooms = useMemo(() => {
    if (!storeId) return [] as string[];
    if (role === 'super_admin' || role === 'admin') return ['hq'];
    return [`kitchen:${storeId}`, `cashier:${storeId}`, `manager:${storeId}`];
  }, [role, storeId]);

  const load = useCallback(async (silent = false) => {
    if (!storeId) { setLoading(false); setData(null); return; }
    if (!silent) setLoading(true);
    setError('');
    try {
      const res: Dashboard = await api(`/store/${storeId}/dashboard`);
      setData(res);
    } catch (e) {
      setError(errMsg(e));
      if (!silent) setData(null);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [storeId]);

  useEffect(() => { load(); }, [load]);

  const onRealtime = useCallback((msg: RealtimeMessage) => {
    if (['new_order', 'order_status', 'menu_update'].includes(msg.type)) load(true);
  }, [load]);
  const { connected } = useRealtime(rooms, onRealtime);

  const storeName = data?.store_name
    || stores.find((s) => s.store_id === storeId)?.name
    || storeId || '';

  // ---- guards -------------------------------------------------------------
  if (!storeId) {
    return (
      <div data-testid="store-dashboard">
        <div className="page-header"><div><h1>My Store</h1></div></div>
        <div className="area-card" style={{ textAlign: 'center', color: 'var(--muted)' }} data-testid="store-no-store">
          Pick a store from the switcher above to view its dashboard.
        </div>
      </div>
    );
  }
  if (loading) {
    return (
      <div data-testid="store-dashboard">
        <div className="page-header"><div><h1>My Store</h1><p>Loading…</p></div></div>
        <div style={{ padding: 30, color: 'var(--muted)' }}>Loading…</div>
      </div>
    );
  }
  if (error && !data) {
    return (
      <div data-testid="store-dashboard">
        <div className="page-header"><div><h1>My Store</h1></div></div>
        <div className="badge badge-red" style={{ display: 'block', padding: 14 }} data-testid="store-error">{error}</div>
        <button className="btn btn-secondary" style={{ marginTop: 14 }} onClick={() => load()}>Retry</button>
      </div>
    );
  }
  if (!data) return null;

  const { today, live, stock, discards_today, staff, day, top5, bottom5, my_variance } = data;

  return (
    <div data-testid="store-dashboard">
      <div className="page-header">
        <div>
          <h1>{isManager ? 'My Store' : storeName}</h1>
          <p>{storeName}{' · '}{connected ? 'Live' : 'Offline'}</p>
        </div>
        <button className="btn btn-secondary" onClick={() => load()} data-testid="store-refresh">Refresh</button>
      </div>

      {data.empty ? (
        <div className="area-card" style={{ textAlign: 'center', padding: 40, color: 'var(--muted)' }} data-testid="store-empty">
          <div style={{ fontSize: 22, marginBottom: 6 }}>🆕 No data yet</div>
          This store has no orders, stock, shifts or open day recorded. Numbers will appear here once it starts trading.
        </div>
      ) : (
        <>
          {/* ===================== TODAY PULSE ===================== */}
          <section className="area-section" data-testid="today-pulse">
            <h2>Today</h2>
            <div className="stats-grid">
              <div className="stat-card"><div className="stat-value" data-testid="today-revenue">{inr(today.revenue)}</div><div className="stat-label">Revenue</div></div>
              <div className="stat-card"><div className="stat-value" data-testid="today-orders">{today.orders}</div><div className="stat-label">Orders</div></div>
              <div className="stat-card"><div className="stat-value" data-testid="today-avg">{inr(today.avg_ticket)}</div><div className="stat-label">Avg ticket</div></div>
              <div className="stat-card">
                <div className="stat-value" data-testid="today-vs" style={{ color: today.vs_same_weekday_pct == null ? 'var(--muted)' : today.vs_same_weekday_pct < 0 ? 'var(--error)' : 'var(--success)' }}>
                  {today.vs_same_weekday_pct == null ? '—' : `${today.vs_same_weekday_pct > 0 ? '+' : ''}${today.vs_same_weekday_pct}%`}
                </div>
                <div className="stat-label">vs same weekday</div>
              </div>
            </div>
          </section>

          {/* ===================== LIVE OPS + DAY ===================== */}
          <div className="area-grid">
            <section className="area-section" style={{ marginBottom: 0 }} data-testid="live-ops">
              <h2>Live Ops</h2>
              <div className="area-card">
                <ul className="area-list">
                  <li><span>Kitchen queue</span><strong data-testid="kitchen-queue">{live.kitchen_queue_len} order(s)</strong></li>
                  <li><span>Avg prep time (today)</span><strong data-testid="prep-avg">{live.prep_time_avg_today} min</strong></li>
                </ul>
              </div>
            </section>

            <section className="area-section" style={{ marginBottom: 0 }} data-testid="day-block">
              <h2>Business Day</h2>
              <div className="area-card">
                <ul className="area-list">
                  <li><span>Status</span>
                    <span className={`badge ${day.status === 'open' ? 'badge-green' : day.status === 'closed' ? 'badge-gray' : 'badge-orange'}`} data-testid="day-status">
                      {day.status === 'none' ? 'Not opened' : day.status}
                    </span>
                  </li>
                  <li><span>Opened</span><strong>{timeOf(day.opened_at)}</strong></li>
                  <li><span>Closed</span><strong>{timeOf(day.closed_at)}</strong></li>
                  <li><span>Cash position</span><strong data-testid="cash-position">{day.cash_position == null ? '—' : inr(day.cash_position)}</strong></li>
                  <li><span>Cash variance</span>
                    {day.cash_variance == null
                      ? <span style={{ color: 'var(--muted)' }}>—</span>
                      : <span className={`badge ${day.cash_variance < 0 ? 'badge-red' : day.cash_variance > 0 ? 'badge-orange' : 'badge-green'}`} data-testid="cash-variance">{inr(day.cash_variance)}</span>}
                  </li>
                </ul>
              </div>
            </section>
          </div>

          {/* ===================== LOW STOCK + DISCARDS ===================== */}
          <div className="area-grid">
            <section className="area-section" style={{ marginBottom: 0 }} data-testid="low-stock">
              <h2>Low Stock</h2>
              <div className="area-sub">{stock.tracked_items} tracked item(s).</div>
              <div className="area-card">
                {stock.low_stock.length === 0 ? (
                  <div style={{ color: 'var(--success)', textAlign: 'center' }} data-testid="low-stock-empty">All items above reorder level.</div>
                ) : (
                  <ul className="area-list">
                    {stock.low_stock.map((s) => (
                      <li key={s.item_id} data-testid={`low-stock-${s.item_id}`}>
                        <span>{s.item}</span>
                        <span><strong className="badge badge-red">{s.qty}{s.unit}</strong>
                          <span style={{ color: 'var(--muted)', marginLeft: 8 }}>reorder ≤ {s.reorder_level}{s.unit}</span></span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </section>

            <section className="area-section" style={{ marginBottom: 0 }} data-testid="discards-today">
              <h2>Discards Today</h2>
              <div className="area-card">
                <ul className="area-list">
                  <li><span>Items discarded</span><strong>{discards_today.items}</strong></li>
                  <li><span>Wastage value</span><strong>{inr(discards_today.wastage_value)}</strong></li>
                  <li><span>Wastage % of revenue</span>
                    <strong data-testid="wastage-pct">{discards_today.total_wastage_pct == null ? '—' : `${discards_today.total_wastage_pct}%`}</strong>
                  </li>
                </ul>
              </div>
            </section>
          </div>

          {/* ===================== STAFF ===================== */}
          <section className="area-section" data-testid="staff-block">
            <h2>Staff</h2>
            <div className="area-sub">Scheduled today vs activity.</div>
            <div className="area-card">
              <div className="stats-grid" style={{ marginBottom: staff.scheduled ? 14 : 0 }}>
                <div className="stat-card"><div className="stat-value" data-testid="staff-scheduled">{staff.scheduled}</div><div className="stat-label">Scheduled</div></div>
                <div className="stat-card"><div className="stat-value" style={{ color: 'var(--success)' }} data-testid="staff-in">{staff.in}</div><div className="stat-label">In</div></div>
                <div className="stat-card"><div className="stat-value" style={{ color: 'var(--error)' }} data-testid="staff-absent">{staff.absent}</div><div className="stat-label">Absent</div></div>
              </div>
              {staff.scheduled === 0
                ? <div style={{ color: 'var(--muted)', textAlign: 'center' }}>No shifts scheduled today.</div>
                : (
                  <ul className="area-list">
                    {[...staff.in_list.map((s) => ({ ...s, on: true })), ...staff.absent_list.map((s) => ({ ...s, on: false }))].map((s) => (
                      <li key={s.staff_id}>
                        <span>{s.name} <span className="badge badge-gray">{s.role}</span></span>
                        <span className={`badge ${s.on ? 'badge-green' : 'badge-red'}`}>{s.on ? 'In' : 'Absent'}</span>
                      </li>
                    ))}
                  </ul>
                )}
            </div>
          </section>

          {/* ===================== TOP / BOTTOM 5 ===================== */}
          <div className="area-grid">
            <section className="area-section" style={{ marginBottom: 0 }} data-testid="top5">
              <h2>Top 5 (this week)</h2>
              <div className="area-card">
                {top5.length === 0 ? <div style={{ color: 'var(--muted)', textAlign: 'center' }}>No sales this week.</div> : (
                  <ul className="area-list">
                    {top5.map((s, i) => (
                      <li key={s.product_id}><span>{i + 1}. {s.name}</span><strong>{s.qty} sold</strong></li>
                    ))}
                  </ul>
                )}
              </div>
            </section>

            <section className="area-section" style={{ marginBottom: 0 }} data-testid="bottom5">
              <h2>Bottom 5 (this week)</h2>
              <div className="area-card">
                {bottom5.length === 0 ? <div style={{ color: 'var(--muted)', textAlign: 'center' }}>No sales this week.</div> : (
                  <ul className="area-list">
                    {bottom5.map((s) => (
                      <li key={s.product_id}><span>{s.name}</span><strong>{s.qty} sold</strong></li>
                    ))}
                  </ul>
                )}
              </div>
            </section>
          </div>

          {/* ===================== MY VARIANCE ===================== */}
          <section className="area-section" data-testid="my-variance">
            <h2>My Last Stock Count</h2>
            <div className="area-card">
              {my_variance.last_count_result == null ? (
                <div style={{ color: 'var(--muted)', textAlign: 'center' }} data-testid="variance-empty">No physical count recorded yet.</div>
              ) : (
                <ul className="area-list">
                  <li><span>Counted on</span><strong>{my_variance.last_count_at ? new Date(my_variance.last_count_at).toLocaleString() : '—'}</strong></li>
                  <li><span>Items counted</span><strong>{my_variance.last_count_result.items_counted}</strong></li>
                  <li><span>Net variance</span><strong>{my_variance.last_count_result.net_variance}</strong></li>
                  <li><span>Result</span>
                    <span className={`badge ${my_variance.within_tolerance ? 'badge-green' : 'badge-red'}`} data-testid="variance-tolerance">
                      {my_variance.within_tolerance ? 'Within tolerance' : `${my_variance.last_count_result.flagged_items} flagged`}
                    </span>
                  </li>
                </ul>
              )}
            </div>
          </section>
        </>
      )}

      {!isManager && (
        <div style={{ marginTop: 18 }}>
          <Link to="/hq/stores" className="btn btn-secondary" data-testid="back-to-stores">← All stores</Link>
        </div>
      )}
    </div>
  );
}
