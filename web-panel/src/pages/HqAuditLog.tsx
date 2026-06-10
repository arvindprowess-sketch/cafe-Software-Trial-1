import React, { useCallback, useEffect, useState } from 'react';
import { api } from '../utils/api';
import { useStores } from '../context/StoreContext';
import { AuditTable, type AuditResp } from './HqReports';

// PR-3: Audit Log promoted from a Reports sub-tab to its own /hq/audit-log page.
// Reuses the AuditTable component as-is. Single-store (store_id from the global
// StoreSwitcher); auto-picks the first store instead of an empty state.
// Backend endpoint /reports/audit-log is unchanged.

const errMsg = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong');

export default function HqAuditLog() {
  const { stores, selectedStoreId, loading: storesLoading, setSelectedStoreId } = useStores();

  // Store-required page — auto-pick the first store.
  useEffect(() => {
    if (!storesLoading && !selectedStoreId && stores.length) setSelectedStoreId(stores[0].store_id);
  }, [storesLoading, selectedStoreId, stores, setSelectedStoreId]);

  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [audit, setAudit] = useState<AuditResp | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const storeName = stores.find((s) => s.store_id === selectedStoreId)?.name || null;

  const load = useCallback(async () => {
    if (!selectedStoreId) return;
    setLoading(true);
    setError('');
    const p = new URLSearchParams();
    if (from) p.set('from', from);
    if (to) p.set('to', to);
    p.set('store_id', selectedStoreId);
    try {
      setAudit(await api(`/reports/audit-log?${p.toString()}`));
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setLoading(false);
    }
  }, [from, to, selectedStoreId]);

  useEffect(() => { load(); }, [load]);

  return (
    <div data-testid="audit-log-page">
      <div className="page-header">
        <div><h1>Audit Log</h1><p>Append-only stock, discard, transfer &amp; refund trail per store.</p></div>
      </div>

      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 16 }}>
        <div className="form-group" style={{ margin: 0 }}>
          <label>From</label>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} data-testid="audit-from" />
        </div>
        <div className="form-group" style={{ margin: 0 }}>
          <label>To</label>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} data-testid="audit-to" />
        </div>
        {(from || to) && <button className="btn btn-sm btn-secondary" data-testid="audit-clear-dates" onClick={() => { setFrom(''); setTo(''); }}>Clear dates</button>}
      </div>

      <div style={{ marginBottom: 12, fontSize: 13, color: '#696969' }} data-testid="audit-store-context">
        Store: <strong>{storeName || '— none selected —'}</strong>
      </div>

      {error && <div className="badge badge-red" style={{ display: 'block', padding: 12, marginBottom: 14 }} data-testid="audit-error">{error}</div>}

      {!selectedStoreId ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#9C9C9C' }} data-testid="audit-no-store">Select a store in the switcher above to view its audit log.</div>
      ) : loading ? (
        <div style={{ padding: 30, color: '#9C9C9C' }} data-testid="audit-loading">Loading…</div>
      ) : (
        <AuditTable data={audit} />
      )}
    </div>
  );
}
