import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { useStores } from '../context/StoreContext';

// Per-store catalog editor: master products with this store's resolved
// price/availability; edit selling_price + available -> PUT override.
// Scope is enforced by the store switcher (own cluster / own store) AND the
// server. Master product create/edit lives in the existing Products screen
// (super_admin only).

function basePrice(p: any): number {
  if (p.product_type === 'ready_made') return p.fixed_price ?? p.cost_per_100g ?? 0;
  if (p.base_price != null) return p.base_price;
  return p.cost_per_100g ?? 0;
}
const priceLabel = (p: any) => p.product_type === 'ready_made' ? '' : '/100g';

export default function HqCatalog() {
  const { user } = useAuth();
  const { selectedStoreId, selectedStore } = useStores();
  const isHQ = user?.role === 'super_admin' || user?.role === 'admin';

  const [products, setProducts] = useState<any[]>([]);
  const [overrides, setOverrides] = useState<Record<string, any>>({});
  const [search, setSearch] = useState('');
  const [savingId, setSavingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({}); // pid -> price input
  // PR-1: recipe-coverage (ghost-stock) report for this store
  const [coverage, setCoverage] = useState<any[] | null>(null);
  const [coverageLoading, setCoverageLoading] = useState(false);

  const loadProducts = async () => {
    try { setProducts(await api('/products')); } catch {}
  };
  const loadOverrides = async (sid: string) => {
    try {
      const ovs = await api(`/stores/${sid}/overrides`);
      const map: Record<string, any> = {};
      (ovs || []).forEach((o: any) => { map[o.product_id] = o; });
      setOverrides(map);
    } catch { setOverrides({}); }
  };

  useEffect(() => { loadProducts(); }, []);
  useEffect(() => { if (selectedStoreId) loadOverrides(selectedStoreId); else setOverrides({}); }, [selectedStoreId]);

  if (!selectedStoreId) {
    return (
      <div>
        <div className="page-header"><div><h1>Store Catalog</h1><p>Per-store price &amp; availability</p></div></div>
        <div style={{ padding: 40, color: '#9C9C9C', textAlign: 'center' }} data-testid="catalog-pick-store">
          Pick a specific store from the switcher above to edit its catalog.
        </div>
      </div>
    );
  }

  const saveOverride = async (pid: string, patch: { selling_price?: number | null; available?: boolean }) => {
    setSavingId(pid);
    try {
      await api(`/stores/${selectedStoreId}/products/${pid}/override`, { method: 'PUT', body: patch });
      await loadOverrides(selectedStoreId);
    } catch (e: any) { alert(e.message); } finally { setSavingId(null); }
  };

  const loadCoverage = async () => {
    if (!selectedStoreId) return;
    setCoverageLoading(true);
    try { setCoverage(await api(`/catalog/recipe-coverage?store_id=${selectedStoreId}`)); }
    catch (e: any) { alert(e.message); setCoverage([]); }
    finally { setCoverageLoading(false); }
  };
  // reset the report when the store changes
  useEffect(() => { setCoverage(null); }, [selectedStoreId]);

  const filtered = products.filter((p) => !search.trim() || p.name?.toLowerCase().includes(search.toLowerCase()));

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Store Catalog — {selectedStore?.name}</h1>
          <p>Override selling price &amp; availability for this store. No override = master base price.</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-secondary" onClick={loadCoverage} disabled={coverageLoading} data-testid="recipe-coverage-btn">
            {coverageLoading ? 'Checking…' : '⚠ Recipe coverage'}
          </button>
          {isHQ && <Link className="btn btn-secondary" to="/admin/products" data-testid="manage-master-link">Manage master catalog →</Link>}
        </div>
      </div>

      {coverage !== null && (
        <div className="card" data-testid="recipe-coverage-panel" style={{ marginBottom: 14, padding: 14, background: coverage.length ? '#FFF8E6' : '#EAF7EC', border: `1px solid ${coverage.length ? '#F2D98C' : '#BFE3C6'}` }}>
          {coverage.length === 0 ? (
            <div style={{ fontSize: 13, fontWeight: 600, color: '#2C7A3D' }}>✓ Every sellable product deducts stock in {selectedStore?.name}. No ghost-stock items.</div>
          ) : (
            <>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#7A5A00', marginBottom: 8 }}>⚠ {coverage.length} product(s) would sell WITHOUT deducting stock:</div>
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: '#7A5A00' }}>
                {coverage.map((c: any) => (
                  <li key={c.product_id} data-testid={`coverage-${c.product_id}`}><strong>{c.name}</strong> <span style={{ opacity: 0.7 }}>({c.product_type})</span> — {c.reason}</li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}

      <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search products…" data-testid="catalog-search"
        style={{ width: '100%', maxWidth: 320, padding: '10px 14px', borderRadius: 10, border: '2px solid #E8E8E8', fontSize: 14, marginBottom: 14 }} />

      <table className="data-table" data-testid="catalog-table">
        <thead><tr><th>Product</th><th>Base Price</th><th>Store Price</th><th>Available</th><th style={{ width: 120 }}>Actions</th></tr></thead>
        <tbody>
          {filtered.map((p) => {
            const ov = overrides[p.id];
            const base = basePrice(p);
            const available = ov ? ov.available !== false : true;
            const effPrice = ov && ov.selling_price != null ? ov.selling_price : base;
            const draftVal = draft[p.id] ?? String(effPrice);
            return (
              <tr key={p.id} data-testid={`catalog-row-${p.id}`}>
                <td>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{p.name}</div>
                  <div style={{ fontSize: 11, color: '#9C9C9C' }}>{p.category || '—'}{p.subcategory ? ` · ${p.subcategory}` : ''} · {p.product_type === 'ready_made' ? 'Meal' : 'Single'}{ov ? ' · overridden' : ''}</div>
                </td>
                <td style={{ fontSize: 13, color: '#696969' }}>₹{base}{priceLabel(p)}</td>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ color: '#9C9C9C' }}>₹</span>
                    <input type="number" step="0.01" value={draftVal}
                      onChange={(e) => setDraft({ ...draft, [p.id]: e.target.value })}
                      data-testid={`catalog-price-${p.id}`}
                      style={{ width: 90, padding: '6px 8px', borderRadius: 8, border: '2px solid #E8E8E8', fontSize: 13 }} />
                  </div>
                </td>
                <td>
                  <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                    <input type="checkbox" checked={available} data-testid={`catalog-available-${p.id}`}
                      onChange={(e) => saveOverride(p.id, { available: e.target.checked })} />
                    <span className={`badge ${available ? 'badge-green' : 'badge-gray'}`}>{available ? 'Available' : 'Hidden'}</span>
                  </label>
                </td>
                <td>
                  <button className="btn btn-sm btn-primary" disabled={savingId === p.id}
                    data-testid={`catalog-save-${p.id}`}
                    onClick={() => saveOverride(p.id, { selling_price: draftVal === '' ? null : parseFloat(draftVal) })}>
                    {savingId === p.id ? '…' : 'Save price'}
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {filtered.length === 0 && <div style={{ textAlign: 'center', padding: 40, color: '#9C9C9C' }}>No products.</div>}
    </div>
  );
}
