import React, { useEffect, useState } from 'react';
import { api } from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { useStores } from '../context/StoreContext';

// Page 5 — Inventory health: valuation, low-stock, reorder, physical count.
// Roles: super_admin, area_manager, store_manager. Valuation (₹) is hidden for
// cashier/kitchen (defense-in-depth; they cannot reach this page).

interface ValuationRow { item_id: string; name: string; qty_on_hand: number; avg_cost: number; value: number; }
interface Valuation { store_id: string; items: ValuationRow[]; total_valuation: number; }
interface LowStockRow { id: string; name: string; qty_on_hand: number; reorder_level: number; unit?: string; }
interface ReorderRow { item_id: string; name: string; unit: string; qty_on_hand: number; reorder_level: number; suggested_qty: number; avg_cost?: number; }
interface CountResult { item_id: string; variance: number; variance_value: number; flagged_for_review: boolean; status?: string; }

type Tab = 'valuation' | 'low' | 'reorder' | 'count';

export default function HqInventoryDashboard() {
  const { user } = useAuth();
  const { selectedStoreId, loading: storesLoading, stores, setSelectedStoreId } = useStores();
  // PR-3: store-required page — auto-pick the first store instead of an empty state.
  useEffect(() => {
    if (!storesLoading && !selectedStoreId && stores.length) setSelectedStoreId(stores[0].store_id);
  }, [storesLoading, selectedStoreId, stores, setSelectedStoreId]);
  const canSeeCost = user?.role !== 'cashier' && user?.role !== 'kitchen';

  const [tab, setTab] = useState<Tab>('valuation');
  const [valuation, setValuation] = useState<Valuation | null>(null);
  const [lowStock, setLowStock] = useState<LowStockRow[]>([]);
  const [reorder, setReorder] = useState<ReorderRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // physical count
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [countResults, setCountResults] = useState<CountResult[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const load = async (storeId: string) => {
    setLoading(true);
    setError('');
    setCountResults([]);
    setCounts({});
    try {
      const [val, low, re] = await Promise.all([
        api(`/inventory/${storeId}/valuation`) as Promise<Valuation>,
        api(`/inventory/${storeId}/low-stock`) as Promise<LowStockRow[]>,
        api(`/inventory/${storeId}/reorder`) as Promise<{ store_id: string; items: ReorderRow[] }>,
      ]);
      setValuation(val);
      setLowStock(low);
      setReorder(re.items || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load inventory health');
      setValuation(null); setLowStock([]); setReorder([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (selectedStoreId) load(selectedStoreId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedStoreId]);

  const valRows = valuation?.items ?? [];
  const itemCount = valRows.length;
  const outOfStock = valRows.filter((r) => r.qty_on_hand <= 0).length;
  const sortedVal = [...valRows].sort((a, b) => b.value - a.value);

  const submitCount = async () => {
    if (!selectedStoreId) return;
    const lines = valRows
      .filter((r) => counts[r.item_id] !== undefined && counts[r.item_id] !== '')
      .map((r) => ({ item_id: r.item_id, counted_qty: Number(counts[r.item_id]) }));
    if (lines.length === 0) { setError('Enter at least one counted qty'); return; }
    setSubmitting(true);
    setError('');
    try {
      const res: { store_id: string; results: CountResult[] } = await api(`/inventory/${selectedStoreId}/count`, { method: 'POST', body: { counts: lines } });
      setCountResults(res.results || []);
      await load(selectedStoreId);
      setTab('count');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Physical count failed');
    } finally {
      setSubmitting(false);
    }
  };

  const generatePO = (r: ReorderRow) => {
    const csv = `item,unit,on_hand,reorder_level,suggested_order_qty\n${r.name},${r.unit},${r.qty_on_hand},${r.reorder_level},${r.suggested_qty}\n`;
    if (navigator.clipboard) navigator.clipboard.writeText(csv).catch(() => { /* clipboard optional */ });
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `PO_${r.name.replace(/\s+/g, '_')}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const flaggedCount = countResults.filter((r) => r.flagged_for_review).length;

  if (storesLoading) return <div className="empty-state" data-testid="ih-loading">Loading…</div>;
  if (!selectedStoreId) {
    return <div className="empty-state" data-testid="ih-no-store">Select a specific store from the switcher above to view its inventory health.</div>;
  }

  return (
    <div data-testid="inventory-health-page">
      <div className="page-header"><div><h1>Inventory Health</h1><p>Valuation, low-stock, reorder & physical count</p></div></div>

      {error && <div className="badge badge-red" data-testid="ih-error" style={{ display: 'block', padding: 10, marginBottom: 12 }}>{error}</div>}

      {/* KPI tiles */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 18 }} data-testid="kpi-tiles">
        {canSeeCost && (
          <div className="card" style={{ padding: 16 }} data-testid="kpi-valuation">
            <div style={{ fontSize: 12, color: '#9C9C9C' }}>Total Valuation</div>
            <div style={{ fontSize: 24, fontWeight: 800 }}>₹{(valuation?.total_valuation ?? 0).toLocaleString()}</div>
          </div>
        )}
        <div className="card" style={{ padding: 16 }} data-testid="kpi-items"><div style={{ fontSize: 12, color: '#9C9C9C' }}># Items</div><div style={{ fontSize: 24, fontWeight: 800 }}>{itemCount}</div></div>
        <div className="card" style={{ padding: 16 }} data-testid="kpi-low"><div style={{ fontSize: 12, color: '#9C9C9C' }}># Low-stock</div><div style={{ fontSize: 24, fontWeight: 800, color: lowStock.length ? '#E5851A' : undefined }}>{lowStock.length}</div></div>
        <div className="card" style={{ padding: 16 }} data-testid="kpi-out"><div style={{ fontSize: 12, color: '#9C9C9C' }}># Out-of-stock</div><div style={{ fontSize: 24, fontWeight: 800, color: outOfStock ? '#E5484D' : undefined }}>{outOfStock}</div></div>
      </div>

      {/* Tabs */}
      <div className="tabs" style={{ display: 'flex', gap: 6, marginBottom: 14 }} data-testid="health-tabs">
        {canSeeCost && <button className={`btn btn-sm ${tab === 'valuation' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setTab('valuation')} data-testid="tab-valuation">Valuation</button>}
        <button className={`btn btn-sm ${tab === 'low' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setTab('low')} data-testid="tab-low">Low Stock</button>
        <button className={`btn btn-sm ${tab === 'reorder' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setTab('reorder')} data-testid="tab-reorder">Reorder Suggestion</button>
        <button className={`btn btn-sm ${tab === 'count' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setTab('count')} data-testid="tab-count">Physical Count</button>
      </div>

      {loading ? <div className="empty-state">Loading…</div> : (
        <>
          {/* Valuation */}
          {tab === 'valuation' && canSeeCost && (
            sortedVal.length === 0 ? <div className="empty-state" data-testid="val-empty">No items to value.</div> : (
              <table className="data-table" data-testid="valuation-table">
                <thead><tr><th>Item</th><th>Qty</th><th>Avg cost</th><th>Value</th></tr></thead>
                <tbody>
                  {sortedVal.map((r) => (
                    <tr key={r.item_id} data-testid={`val-row-${r.item_id}`}>
                      <td><strong>{r.name}</strong></td><td>{r.qty_on_hand}</td><td>₹{r.avg_cost}</td><td><strong>₹{r.value.toLocaleString()}</strong></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )
          )}

          {/* Low stock */}
          {tab === 'low' && (
            lowStock.length === 0 ? <div className="empty-state" data-testid="low-empty">Nothing at or below reorder level. 🎉</div> : (
              <table className="data-table" data-testid="low-table">
                <thead><tr><th>Item</th><th>On hand</th><th>Reorder level</th><th></th></tr></thead>
                <tbody>
                  {lowStock.map((r) => (
                    <tr key={r.id} data-testid={`low-row-${r.id}`}>
                      <td><strong>{r.name}</strong></td>
                      <td style={{ color: '#E5484D', fontWeight: 700 }}>{r.qty_on_hand}</td>
                      <td>{r.reorder_level}</td>
                      <td><a className="btn btn-sm btn-secondary" href="/hq/inventory/items" data-testid={`low-inward-${r.id}`}>Record Inward</a></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )
          )}

          {/* Reorder */}
          {tab === 'reorder' && (
            reorder.length === 0 ? <div className="empty-state" data-testid="reorder-empty">No reorder suggestions.</div> : (
              <table className="data-table" data-testid="reorder-table">
                <thead><tr><th>Item</th><th>On hand</th><th>Reorder level</th><th>Suggested qty</th><th></th></tr></thead>
                <tbody>
                  {reorder.map((r) => (
                    <tr key={r.item_id} data-testid={`reorder-row-${r.item_id}`}>
                      <td><strong>{r.name}</strong></td><td>{r.qty_on_hand}</td><td>{r.reorder_level}</td>
                      <td><strong>{r.suggested_qty} {r.unit}</strong></td>
                      <td><button className="btn btn-sm btn-secondary" onClick={() => generatePO(r)} data-testid={`gen-po-${r.item_id}`}>Generate PO</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )
          )}

          {/* Physical count */}
          {tab === 'count' && (
            <div data-testid="count-tab">
              {flaggedCount > 0 && (
                <div className="card" data-testid="count-flag-banner" style={{ background: '#FDECEC', border: '1px solid #F5B5B5', padding: '10px 14px', marginBottom: 14, fontWeight: 600, color: '#A12222' }}>
                  ⚠️ {flaggedCount} variance(s) flagged for area/HQ review (≥ ₹2000).
                </div>
              )}
              {valRows.length === 0 ? <div className="empty-state" data-testid="count-empty">No items to count.</div> : (
                <table className="data-table" data-testid="count-table">
                  <thead><tr><th>Item</th><th>System qty</th><th>Counted qty</th>{countResults.length > 0 && <th>Variance</th>}</tr></thead>
                  <tbody>
                    {valRows.map((r) => {
                      const res = countResults.find((c) => c.item_id === r.item_id);
                      return (
                        <tr key={r.item_id} data-testid={`count-row-${r.item_id}`}>
                          <td><strong>{r.name}</strong></td>
                          <td>{r.qty_on_hand}</td>
                          <td><input type="number" step="any" style={{ width: 110 }} value={counts[r.item_id] ?? ''} onChange={(e) => setCounts({ ...counts, [r.item_id]: e.target.value })} data-testid={`count-input-${r.item_id}`} /></td>
                          {countResults.length > 0 && (
                            <td style={{ color: res && res.flagged_for_review ? '#E5484D' : '#696969', fontWeight: res?.flagged_for_review ? 700 : 400 }} data-testid={`count-variance-${r.item_id}`}>
                              {res ? `${res.variance > 0 ? '+' : ''}${res.variance}${res.flagged_for_review ? ' ⚠️' : ''}` : '—'}
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
              <div style={{ marginTop: 14 }}>
                <button className="btn btn-primary" onClick={submitCount} disabled={submitting} data-testid="count-submit">{submitting ? 'Submitting…' : 'Submit physical count'}</button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
