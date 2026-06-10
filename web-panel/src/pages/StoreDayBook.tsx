import React, { useCallback, useEffect, useState } from 'react';
import { api } from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { useStores } from '../context/StoreContext';

// ============================================================================
// Day Book (UI-6, Page 8). Open/close a store business day + reconciliation.
// - cashier + store_manager OPEN; store_manager CLOSE (cashier 403 on close).
// - Cashier view is STRIPPED (backend _strip_day_for_cashier): no expected_cash,
//   cash_variance or stock snapshots — we mirror that and never render them.
// - readOnly (area/HQ via /hq/daybook): view-only, store from StoreSwitcher.
// Reuses api()/useAuth()/useStores() + existing CSS.
// Endpoints: GET/POST /stores/{id}/day/{open|close} ; GET /stores/{id}/day/{date}
//            GET /stores/{id}/shifts/summary
// ============================================================================

type StockSnap = { item_id: string; qty_on_hand: number };
type DayRecord = {
  id: string;
  store_id: string;
  business_date: string;
  status: 'open' | 'closed';
  opened_by?: string | null;
  opened_at?: string | null;
  opening_cash_float: number;
  closed_by?: string | null;
  closed_at?: string | null;
  closing_cash_counted?: number | null;
  expected_cash?: number | null;
  cash_variance?: number | null;
  cash_sales?: number | null;
  payouts?: number | null;
  opening_stock_snapshot?: StockSnap[];
  closing_stock_snapshot?: StockSnap[];
  notes?: string | null;
  close_notes?: string | null;
};
type ShiftRow = { cashier_id: string; cashier_name?: string | null; order_count: number; revenue: number; by_payment_mode: Record<string, number> };
type ShiftSummary = { store_id: string; cashiers: ShiftRow[] };

const errMsg = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong');
const money = (n: number | null | undefined) => '₹' + Number(n ?? 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });
const today = () => new Date().toISOString().slice(0, 10);

export default function StoreDayBook({ readOnly = false }: { readOnly?: boolean }) {
  const { user } = useAuth();
  const { selectedStoreId, stores } = useStores();
  const role = user?.role ?? '';
  const isCashier = role === 'cashier';
  const canOpen = !readOnly && (role === 'cashier' || role === 'store_manager');
  const canClose = !readOnly && role === 'store_manager';

  // readOnly (HQ/area) uses the global StoreSwitcher; cashier/store_manager fall
  // back to their own store when no switcher selection is present.
  const storeId = selectedStoreId || (readOnly ? null : user?.store_id) || null;
  const storeName = stores.find((s) => s.store_id === storeId)?.name || null;

  const [date, setDate] = useState(today());
  const [day, setDay] = useState<DayRecord | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [shifts, setShifts] = useState<ShiftSummary | null>(null);

  // open form
  const [openFloat, setOpenFloat] = useState('');
  const [openNotes, setOpenNotes] = useState('');
  // close form
  const [closeCounted, setCloseCounted] = useState('');
  const [closePayouts, setClosePayouts] = useState('');
  const [closeNotes, setCloseNotes] = useState('');
  const [busy, setBusy] = useState('');

  const load = useCallback(async () => {
    if (!storeId) { setDay(null); setNotFound(false); setShifts(null); return; }
    setLoading(true);
    setError('');
    setNotFound(false);
    try {
      const rec: DayRecord = await api(`/stores/${storeId}/day/${date}`);
      setDay(rec);
    } catch (e) {
      const msg = errMsg(e);
      if (/no business day/i.test(msg)) { setDay(null); setNotFound(true); }
      else { setError(msg); setDay(null); } // inline 403 etc.
    } finally {
      setLoading(false);
    }
    try {
      const s: ShiftSummary = await api(`/stores/${storeId}/shifts/summary?from=${date}&to=${date}`);
      setShifts(s);
    } catch { setShifts(null); }
  }, [storeId, date]);

  useEffect(() => { load(); }, [load]);

  const openDay = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!storeId) return;
    setBusy('open');
    setError('');
    try {
      await api(`/stores/${storeId}/day/open`, {
        method: 'POST',
        body: { opening_cash_float: parseFloat(openFloat) || 0, business_date: date, notes: openNotes || undefined },
      });
      setOpenFloat(''); setOpenNotes('');
      await load();
    } catch (e) { setError(errMsg(e)); } // 409 already open surfaced inline
    finally { setBusy(''); }
  };

  const closeDay = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!storeId || closeCounted === '') return;
    setBusy('close');
    setError('');
    try {
      await api(`/stores/${storeId}/day/close`, {
        method: 'POST',
        body: { closing_cash_counted: parseFloat(closeCounted) || 0, payouts: parseFloat(closePayouts) || 0, notes: closeNotes || undefined },
      });
      setCloseCounted(''); setClosePayouts(''); setCloseNotes('');
      await load();
    } catch (e) { setError(errMsg(e)); }
    finally { setBusy(''); }
  };

  const field = (label: string, value: React.ReactNode, testid: string) => (
    <div className="stat-card" data-testid={testid}>
      <div className="stat-value" style={{ fontSize: 20 }}>{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  );

  return (
    <div data-testid="daybook-page">
      <div className="page-header">
        <div><h1>Day Book{readOnly ? ' (read-only)' : ''}</h1><p>Open / close business day &amp; cash reconciliation</p></div>
        <div className="form-group" style={{ margin: 0 }}>
          <label>Date</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} data-testid="daybook-date" />
        </div>
      </div>

      {readOnly && (
        <div style={{ marginBottom: 12, fontSize: 13, color: '#696969' }} data-testid="daybook-store-context">
          Store: <strong>{storeName || '— select a store —'}</strong>
        </div>
      )}

      {error && <div className="badge badge-red" style={{ display: 'block', padding: 12, marginBottom: 14 }} data-testid="daybook-error">{error}</div>}

      {!storeId ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#9C9C9C' }} data-testid="daybook-no-store">Select a store to view its day book.</div>
      ) : loading ? (
        <div style={{ padding: 30, color: '#9C9C9C' }} data-testid="daybook-loading">Loading…</div>
      ) : day ? (
        <div data-testid="daybook-record">
          <div style={{ marginBottom: 14 }}>
            <span className={`badge ${day.status === 'open' ? 'badge-orange' : 'badge-green'}`} data-testid="daybook-status">{day.status === 'open' ? 'OPEN' : 'CLOSED'}</span>
            <span style={{ marginLeft: 10, fontSize: 13, color: '#9C9C9C' }}>{day.business_date}</span>
          </div>

          <div className="stats-grid" style={{ marginBottom: 20 }}>
            {field('Opening float', money(day.opening_cash_float), 'db-opening-float')}
            {/* Cashier still sees cash drawer flow (sales + payouts) ... */}
            {day.cash_sales != null && field('Cash sales', money(day.cash_sales), 'db-cash-sales')}
            {day.payouts != null && field('Payouts', money(day.payouts), 'db-payouts')}
            {day.closing_cash_counted != null && field('Cash counted', money(day.closing_cash_counted), 'db-closing-counted')}
            {/* ... but reconciliation (expected/variance) is stripped for cashier (mirrors backend) */}
            {!isCashier && day.expected_cash != null && field('Expected cash', money(day.expected_cash), 'db-expected-cash')}
            {!isCashier && day.cash_variance != null && field(
              'Cash variance',
              <span style={{ color: day.cash_variance === 0 ? 'var(--success)' : 'var(--error)' }}>{money(day.cash_variance)}</span>,
              'db-cash-variance',
            )}
          </div>

          {!isCashier && (day.opening_stock_snapshot || day.closing_stock_snapshot) && (
            <div style={{ fontSize: 13, color: '#696969', marginBottom: 16 }} data-testid="db-snapshots">
              Stock snapshot — opening: {day.opening_stock_snapshot?.length ?? 0} item(s)
              {day.closing_stock_snapshot ? `, closing: ${day.closing_stock_snapshot.length} item(s)` : ''}
            </div>
          )}

          {/* Close form (store_manager only, while open) */}
          {canClose && day.status === 'open' && (
            <form onSubmit={closeDay} style={{ maxWidth: 420, marginTop: 8 }} data-testid="daybook-close-form">
              <h2 style={{ fontSize: 16 }}>Close day</h2>
              <div className="form-group"><label>Closing cash counted *</label>
                <input type="number" step="any" min="0" value={closeCounted} onChange={(e) => setCloseCounted(e.target.value)} data-testid="close-counted" required />
              </div>
              <div className="form-group"><label>Payouts</label>
                <input type="number" step="any" min="0" value={closePayouts} onChange={(e) => setClosePayouts(e.target.value)} data-testid="close-payouts" />
              </div>
              <div className="form-group"><label>Notes</label>
                <input value={closeNotes} onChange={(e) => setCloseNotes(e.target.value)} data-testid="close-notes" />
              </div>
              <button type="submit" className="btn btn-primary" disabled={busy !== '' || closeCounted === ''} data-testid="close-day-btn">{busy === 'close' ? 'Closing…' : 'Close day'}</button>
            </form>
          )}
          {isCashier && day.status === 'open' && (
            <div style={{ fontSize: 13, color: '#9C9C9C' }} data-testid="cashier-close-note">The store manager closes the day.</div>
          )}
        </div>
      ) : notFound ? (
        <div data-testid="daybook-none">
          <div style={{ color: '#9C9C9C', marginBottom: 16 }}>No business day for {date}.</div>
          {canOpen ? (
            <form onSubmit={openDay} style={{ maxWidth: 420 }} data-testid="daybook-open-form">
              <h2 style={{ fontSize: 16 }}>Open day</h2>
              <div className="form-group"><label>Opening cash float</label>
                <input type="number" step="any" min="0" value={openFloat} onChange={(e) => setOpenFloat(e.target.value)} data-testid="open-float" placeholder="0" />
              </div>
              <div className="form-group"><label>Notes</label>
                <input value={openNotes} onChange={(e) => setOpenNotes(e.target.value)} data-testid="open-notes" />
              </div>
              <button type="submit" className="btn btn-primary" disabled={busy !== ''} data-testid="open-day-btn">{busy === 'open' ? 'Opening…' : 'Open day'}</button>
            </form>
          ) : (
            <div style={{ color: '#9C9C9C', fontSize: 13 }}>No day record for this date.</div>
          )}
        </div>
      ) : null}

      {/* Per-cashier shift sales (cashier sees own; managers/HQ see all) */}
      {storeId && shifts && shifts.cashiers.length > 0 && (
        <div style={{ marginTop: 28 }}>
          <h2 style={{ fontSize: 16 }}>Cashier shift sales</h2>
          <table className="data-table" data-testid="shift-summary-table">
            <thead><tr><th>Cashier</th><th>Orders</th><th>Revenue</th><th>By payment</th></tr></thead>
            <tbody>
              {shifts.cashiers.map((c) => (
                <tr key={c.cashier_id} data-testid={`shift-row-${c.cashier_id}`}>
                  <td><strong>{c.cashier_name || c.cashier_id?.slice(0, 8) || '—'}</strong></td>
                  <td>{c.order_count}</td>
                  <td>{money(c.revenue)}</td>
                  <td style={{ fontSize: 13 }}>{Object.entries(c.by_payment_mode).map(([k, v]) => `${k}: ${money(v)}`).join(' · ') || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
