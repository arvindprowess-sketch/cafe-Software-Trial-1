import React, { useEffect, useState } from 'react';
import { api } from '../utils/api';
import { useAuth } from '../context/AuthContext';

// HQ-only catalog push: pick products + fields (price/availability) + target
// (all OR selected stores) -> POST /catalog/push. Plus a read-only push-log
// viewer (no edit/delete controls — the log is append-only on the backend).

export default function HqPush() {
  const { user } = useAuth();
  const isHQ = user?.role === 'super_admin' || user?.role === 'admin';

  const [products, setProducts] = useState<any[]>([]);
  const [stores, setStores] = useState<any[]>([]);
  const [log, setLog] = useState<any[]>([]);

  const [selProducts, setSelProducts] = useState<Record<string, boolean>>({});
  const [pushPrice, setPushPrice] = useState(true);
  const [pushAvail, setPushAvail] = useState(false);
  const [priceVal, setPriceVal] = useState('');
  const [availVal, setAvailVal] = useState(true);
  const [targetAll, setTargetAll] = useState(true);
  const [selStores, setSelStores] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const loadLog = async () => { try { setLog(await api('/catalog/push-log')); } catch {} };
  useEffect(() => {
    if (!isHQ) return;
    (async () => {
      try { setProducts(await api('/products')); } catch {}
      try { setStores(await api('/stores')); } catch {}
      loadLog();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isHQ]);

  if (!isHQ) return <div style={{ padding: 40, color: '#9C9C9C' }}>Catalog push is available to HQ (super_admin) only.</div>;

  const productIds = Object.keys(selProducts).filter((k) => selProducts[k]);
  const storeIds = Object.keys(selStores).filter((k) => selStores[k]);

  const doPush = async () => {
    if (productIds.length === 0) { alert('Select at least one product'); return; }
    const fields: string[] = [];
    if (pushPrice) fields.push('price');
    if (pushAvail) fields.push('availability');
    if (fields.length === 0) { alert('Pick at least one field (price/availability)'); return; }
    if (!targetAll && storeIds.length === 0) { alert('Select target stores or choose "All stores"'); return; }
    setBusy(true); setResult(null);
    try {
      const body: any = { product_ids: productIds, fields, target: targetAll ? 'all' : storeIds };
      if (pushPrice && priceVal !== '') body.selling_price = parseFloat(priceVal);
      if (pushAvail) body.available = availVal;
      const res = await api('/catalog/push', { method: 'POST', body });
      setResult(res.summary || 'Push complete');
      setSelProducts({});
      loadLog();
    } catch (e: any) { alert(e.message); } finally { setBusy(false); }
  };

  return (
    <div>
      <div className="page-header"><div><h1>Catalog Push</h1><p>Push price &amp; availability to all stores or a selected set.</p></div></div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {/* Products */}
        <div style={{ background: '#FAFAFA', border: '1px solid #EFEFEF', borderRadius: 10, padding: 14 }}>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>Products ({productIds.length} selected)</div>
          <div style={{ maxHeight: 260, overflowY: 'auto', display: 'grid', gap: 4 }} data-testid="push-products">
            {products.map((p) => (
              <label key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, padding: '4px 0' }}>
                <input type="checkbox" checked={!!selProducts[p.id]} data-testid={`push-product-${p.id}`}
                  onChange={(e) => setSelProducts({ ...selProducts, [p.id]: e.target.checked })} />
                {p.name}
              </label>
            ))}
          </div>
        </div>

        {/* Fields + target */}
        <div style={{ background: '#FAFAFA', border: '1px solid #EFEFEF', borderRadius: 10, padding: 14 }}>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>Fields to push</div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
            <input type="checkbox" checked={pushPrice} onChange={(e) => setPushPrice(e.target.checked)} data-testid="push-field-price" /> Price
          </label>
          {pushPrice && (
            <div className="form-group" style={{ margin: '6px 0 10px 26px' }}>
              <label>Price value (₹) — blank = each product's base</label>
              <input type="number" step="0.01" value={priceVal} onChange={(e) => setPriceVal(e.target.value)} placeholder="base" data-testid="push-price-value" />
            </div>
          )}
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
            <input type="checkbox" checked={pushAvail} onChange={(e) => setPushAvail(e.target.checked)} data-testid="push-field-availability" /> Availability
          </label>
          {pushAvail && (
            <div className="form-group" style={{ margin: '6px 0 10px 26px' }}>
              <label>Set availability</label>
              <select value={availVal ? '1' : '0'} onChange={(e) => setAvailVal(e.target.value === '1')} data-testid="push-avail-value">
                <option value="1">Available</option>
                <option value="0">Hidden</option>
              </select>
            </div>
          )}

          <div style={{ fontWeight: 700, margin: '12px 0 8px' }}>Target</div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
            <input type="radio" checked={targetAll} onChange={() => setTargetAll(true)} data-testid="push-target-all" /> All stores
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
            <input type="radio" checked={!targetAll} onChange={() => setTargetAll(false)} data-testid="push-target-selected" /> Selected stores
          </label>
          {!targetAll && (
            <div style={{ margin: '8px 0 0 26px', display: 'grid', gap: 4, maxHeight: 140, overflowY: 'auto' }} data-testid="push-store-list">
              {stores.map((s) => (
                <label key={s.store_id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                  <input type="checkbox" checked={!!selStores[s.store_id]} data-testid={`push-store-${s.store_id}`}
                    onChange={(e) => setSelStores({ ...selStores, [s.store_id]: e.target.checked })} />
                  {s.name}
                </label>
              ))}
            </div>
          )}

          <button className="btn btn-primary" style={{ marginTop: 14, width: '100%' }} onClick={doPush} disabled={busy} data-testid="push-submit">
            {busy ? 'Pushing…' : 'Push to stores'}
          </button>
          {result && <div style={{ marginTop: 10, padding: 10, background: '#EAF2DD', borderRadius: 8, color: '#2C7A3D', fontSize: 13 }} data-testid="push-result">{result}</div>}
        </div>
      </div>

      {/* Append-only push log (read-only — no edit/delete controls) */}
      <div style={{ marginTop: 28 }}>
        <h2 style={{ fontSize: 18 }}>Push Log</h2>
        <p style={{ color: '#9C9C9C', fontSize: 13, marginTop: -4 }}>Immutable history of catalog pushes.</p>
        <table className="data-table" data-testid="push-log-table">
          <thead><tr><th>When</th><th>By</th><th>Products</th><th>Fields</th><th>Target</th><th>Summary</th></tr></thead>
          <tbody>
            {log.map((e) => (
              <tr key={e.id} data-testid={`push-log-row-${e.id}`}>
                <td style={{ fontSize: 12 }}>{(e.pushed_at || '').replace('T', ' ').slice(0, 16)}</td>
                <td style={{ fontSize: 12 }}>{(e.pushed_by || '').slice(0, 8)}</td>
                <td style={{ fontSize: 12 }}>{(e.product_ids || []).length}</td>
                <td style={{ fontSize: 12 }}>{(e.fields || []).join(', ')}</td>
                <td style={{ fontSize: 12 }}>{e.target === 'all' ? 'All' : `${(e.store_ids || e.target || []).length} store(s)`}</td>
                <td style={{ fontSize: 12, color: '#696969' }}>{e.summary}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {log.length === 0 && <div style={{ textAlign: 'center', padding: 24, color: '#9C9C9C' }}>No pushes yet.</div>}
      </div>
    </div>
  );
}
