import React, { useEffect, useState } from 'react';
import { api } from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { useStores } from '../context/StoreContext';

// Phase 2B — scope-aware offer/coupon manager (HQ portal).
// Consumes the Phase 2A offers backend (GET/POST/PUT/DELETE /offers, GET
// /offers/all) — no new backend calls. Role gating mirrors the server, which
// remains the real authority. NOTE: combo/bank offer types are NOT in the 2A
// model, so they are intentionally omitted (no unknown fields sent).

const DISCOUNT_TYPES = [
  { key: 'percentage', label: '% off' },
  { key: 'flat', label: 'Flat ₹ off' },
  { key: 'bogo', label: 'Buy 1 Get 1' },
];
const APPLICABLE = [
  { key: 'all', label: 'Whole cart' },
  { key: 'category', label: 'Category' },
  { key: 'products', label: 'Specific products' },
];
// FIX 3 — where the offer is usable.
const CHANNELS = [
  { key: 'all', label: 'All' },
  { key: 'app_only', label: 'App only' },
  { key: 'pos_only', label: 'Counter only' },
];
const channelLabel = (c?: string) => (CHANNELS.find(x => x.key === (c || 'all'))?.label || 'All');

const todayDate = (iso?: string | null) => (iso ? String(iso).slice(0, 10) : '');

const blankForm = () => ({
  id: null as string | null,
  title: '', subtitle: '',
  discount_type: 'percentage', discount_value: '10',
  applicable_to: 'all', applicable_category: '', applicable_product_ids: [] as string[],
  coupon_code: '', min_order_value: '0', max_discount: '',
  start_date: '', end_date: '',
  usage_limit_total: '', usage_limit_per_user: '', first_order_only: false, is_active: true,
  scope: 'all', store_ids: [] as string[], cluster_owner_id: '',
  channel: 'all',
});

export default function HqOffers() {
  const { user } = useAuth();
  const { stores } = useStores();
  const role = user?.role;
  const isHQ = role === 'super_admin' || role === 'admin';
  const isArea = role === 'area_manager';
  const isStoreMgr = role === 'store_manager';

  const [offers, setOffers] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [areaManagers, setAreaManagers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState<any>(blankForm());
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Scope choices the role may pick (UI mirror of backend gating)
  const scopeChoices = isHQ ? ['all', 'cluster', 'stores'] : isArea ? ['cluster', 'stores'] : ['stores'];
  const storeName = (id: string) => stores.find((s) => s.store_id === id)?.name || id.slice(0, 8);

  const load = async () => {
    setLoading(true); setError(null);
    try {
      setOffers(await api('/offers/all'));
    } catch (e: any) {
      setError(e.message || 'Failed to load offers');
      setOffers([]);
    } finally { setLoading(false); }
  };

  useEffect(() => {
    load();
    api('/categories').then(setCategories).catch(() => {});
    api('/products').then(setProducts).catch(() => {});
    if (isHQ) api('/staff').then((s) => setAreaManagers((s || []).filter((x: any) => x.role === 'area_manager'))).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!isHQ && !isArea && !isStoreMgr) {
    return <div style={{ padding: 40, color: '#9C9C9C' }}>Offers are not available for your role.</div>;
  }

  const openCreate = () => {
    const f = blankForm();
    f.scope = scopeChoices[0];
    if (isStoreMgr && user?.store_id) f.store_ids = [user.store_id];
    setForm(f); setFormError(null); setShowForm(true);
  };
  const openEdit = (o: any) => {
    setForm({
      id: o.id, title: o.title || '', subtitle: o.subtitle || '',
      discount_type: o.discount_type || 'percentage', discount_value: String(o.discount_value ?? ''),
      applicable_to: o.applicable_to || 'all', applicable_category: o.applicable_category || '',
      applicable_product_ids: o.applicable_product_ids || [],
      coupon_code: o.coupon_code || '', min_order_value: String(o.min_order_value ?? 0),
      max_discount: o.max_discount == null ? '' : String(o.max_discount),
      start_date: todayDate(o.start_date), end_date: todayDate(o.end_date),
      usage_limit_total: o.usage_limit_total == null ? '' : String(o.usage_limit_total),
      usage_limit_per_user: o.usage_limit_per_user == null ? '' : String(o.usage_limit_per_user),
      first_order_only: !!o.first_order_only, is_active: o.is_active !== false,
      scope: o.scope || 'all', store_ids: o.store_ids || [], cluster_owner_id: o.cluster_owner_id || '',
      channel: o.channel || 'all',
    });
    setFormError(null); setShowForm(true);
  };

  const effectiveStoreIds = (f: any) => {
    if (isStoreMgr) return user?.store_id ? [user.store_id] : [];
    return f.scope === 'stores' ? f.store_ids : [];
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    const f = { ...form };
    if (isStoreMgr) f.scope = 'stores';
    const sids = effectiveStoreIds(f);
    if (f.scope === 'stores' && sids.length === 0) { setFormError('Pick at least one store for this scope.'); return; }
    if (f.scope === 'cluster' && isHQ && !f.cluster_owner_id) { setFormError('Select the area manager whose cluster this offer covers.'); return; }

    // Build ONLY fields the 2A model knows about.
    const body: any = {
      title: f.title, subtitle: f.subtitle,
      discount_type: f.discount_type, discount_value: Number(f.discount_value) || 0,
      applicable_to: f.applicable_to,
      applicable_category: f.applicable_to === 'category' ? (f.applicable_category || null) : null,
      applicable_product_ids: f.applicable_to === 'products' ? f.applicable_product_ids : [],
      coupon_code: f.coupon_code || null,
      min_order_value: Number(f.min_order_value) || 0,
      max_discount: f.max_discount === '' ? null : Number(f.max_discount),
      start_date: f.start_date ? `${f.start_date}T00:00:00+00:00` : null,
      end_date: f.end_date ? `${f.end_date}T23:59:59+00:00` : null,
      is_active: f.is_active,
      scope: f.scope,
      store_ids: sids,
      usage_limit_total: f.usage_limit_total === '' ? null : Number(f.usage_limit_total),
      usage_limit_per_user: f.usage_limit_per_user === '' ? null : Number(f.usage_limit_per_user),
      first_order_only: f.first_order_only,
      channel: f.channel || 'all',
    };
    if (f.scope === 'cluster' && isHQ) body.cluster_owner_id = f.cluster_owner_id;

    setSaving(true);
    try {
      if (f.id) await api(`/offers/${f.id}`, { method: 'PUT', body });
      else await api('/offers', { method: 'POST', body });
      setShowForm(false);
      await load();
    } catch (e: any) {
      setFormError(e.message || 'Save failed');
    } finally { setSaving(false); }
  };

  const toggleActive = async (o: any) => {
    try { await api(`/offers/${o.id}`, { method: 'PUT', body: { is_active: !(o.is_active !== false) } }); load(); }
    catch (e: any) { setError(e.message); }
  };
  const remove = async (o: any) => {
    if (!confirm(`Delete offer "${o.title}"?`)) return;
    try { await api(`/offers/${o.id}`, { method: 'DELETE' }); load(); }
    catch (e: any) { setError(e.message); }
  };

  const scopeSummary = (o: any) => {
    const s = o.scope || 'all';
    if (s === 'all') return 'All stores';
    if (s === 'cluster') return 'Cluster';
    return `${(o.store_ids || []).length} store(s)`;
  };

  const toggleProduct = (id: string) =>
    setForm((f: any) => ({ ...f, applicable_product_ids: f.applicable_product_ids.includes(id)
      ? f.applicable_product_ids.filter((x: string) => x !== id) : [...f.applicable_product_ids, id] }));
  const toggleStore = (id: string) =>
    setForm((f: any) => ({ ...f, store_ids: f.store_ids.includes(id)
      ? f.store_ids.filter((x: string) => x !== id) : [...f.store_ids, id] }));

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Offers &amp; Coupons</h1>
          <p>{isHQ ? 'All offers (any scope)' : isArea ? 'Your cluster offers' : 'Your store offers'}</p>
        </div>
        <button className="btn btn-primary" onClick={openCreate} data-testid="add-offer-btn">+ New Offer</button>
      </div>

      {error && <div style={{ background: '#FDE8E8', color: '#B42318', borderRadius: 8, padding: 12, marginBottom: 12, fontSize: 13 }} data-testid="offers-error">{error}</div>}
      {loading ? <div style={{ padding: 40, color: '#9C9C9C' }}>Loading offers…</div> : (
        <table className="data-table" data-testid="offers-table">
          <thead><tr><th>Title</th><th>Type</th><th>Coupon</th><th>Scope</th><th>Validity</th><th>Limits</th><th>Status</th><th style={{ width: 150 }}>Actions</th></tr></thead>
          <tbody>
            {offers.map((o) => (
              <tr key={o.id} data-testid={`offer-row-${o.id}`}>
                <td><strong>{o.title}</strong>{o.subtitle ? <div style={{ fontSize: 11, color: '#9C9C9C' }}>{o.subtitle}</div> : null}</td>
                <td><span className="badge badge-purple">{o.discount_type}</span> {o.discount_type !== 'bogo' ? <span style={{ fontSize: 12 }}>{o.discount_type === 'percentage' ? `${o.discount_value}%` : `₹${o.discount_value}`}</span> : null}</td>
                <td style={{ fontSize: 12 }}>{o.coupon_code || '—'}</td>
                <td>
                  <span className="badge badge-green" data-testid={`offer-scope-${o.id}`}>{scopeSummary(o)}</span>
                  {(o.channel && o.channel !== 'all') && <span className="badge badge-gray" style={{ marginLeft: 4 }} data-testid={`offer-channel-${o.id}`}>{channelLabel(o.channel)}</span>}
                </td>
                <td style={{ fontSize: 11, color: '#696969' }}>{todayDate(o.start_date) || '—'} → {todayDate(o.end_date) || '∞'}</td>
                <td style={{ fontSize: 11, color: '#696969' }}>
                  {o.usage_limit_total != null ? `tot ${o.usage_limit_total}` : 'tot ∞'} · {o.usage_limit_per_user != null ? `user ${o.usage_limit_per_user}` : 'user ∞'}{o.first_order_only ? ' · 1st' : ''}
                </td>
                <td><span className={`badge ${o.is_active !== false ? 'badge-green' : 'badge-gray'}`}>{o.is_active !== false ? 'Active' : 'Off'}</span></td>
                <td>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button className="btn btn-sm btn-secondary" onClick={() => openEdit(o)} data-testid={`edit-offer-${o.id}`}>Edit</button>
                    <button className="btn btn-sm btn-secondary" onClick={() => toggleActive(o)}>{o.is_active !== false ? 'Off' : 'On'}</button>
                    <button className="btn btn-sm btn-danger" onClick={() => remove(o)} data-testid={`delete-offer-${o.id}`}>Del</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {!loading && offers.length === 0 && !error && <div style={{ textAlign: 'center', padding: 40, color: '#9C9C9C' }}>No offers yet.</div>}

      {showForm && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && !saving && setShowForm(false)}>
          <div className="modal" style={{ maxWidth: 560 }}>
            <h2>{form.id ? 'Edit Offer' : 'New Offer'}</h2>
            <form onSubmit={save}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group"><label>Title *</label><input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required data-testid="offer-title" /></div>
                <div className="form-group"><label>Coupon code</label><input value={form.coupon_code} onChange={(e) => setForm({ ...form, coupon_code: e.target.value.toUpperCase() })} data-testid="offer-coupon" /></div>
              </div>
              <div className="form-group"><label>Subtitle</label><input value={form.subtitle} onChange={(e) => setForm({ ...form, subtitle: e.target.value })} /></div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group"><label>Type</label>
                  <select value={form.discount_type} onChange={(e) => setForm({ ...form, discount_type: e.target.value })} data-testid="offer-type">
                    {DISCOUNT_TYPES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
                  </select>
                </div>
                {form.discount_type !== 'bogo' && (
                  <div className="form-group"><label>Value {form.discount_type === 'percentage' ? '(%)' : '(₹)'}</label>
                    <input type="number" step="0.01" value={form.discount_value} onChange={(e) => setForm({ ...form, discount_value: e.target.value })} data-testid="offer-value" /></div>
                )}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group"><label>Applies to</label>
                  <select value={form.applicable_to} onChange={(e) => setForm({ ...form, applicable_to: e.target.value })} data-testid="offer-applicable">
                    {APPLICABLE.map((a) => <option key={a.key} value={a.key}>{a.label}</option>)}
                  </select>
                </div>
                <div className="form-group"><label>Channel</label>
                  <select value={form.channel} onChange={(e) => setForm({ ...form, channel: e.target.value })} data-testid="offer-channel">
                    {CHANNELS.map((ch) => <option key={ch.key} value={ch.key}>{ch.label}</option>)}
                  </select>
                </div>
              </div>
              {form.applicable_to === 'category' && (
                <div className="form-group"><label>Category</label>
                  <select value={form.applicable_category} onChange={(e) => setForm({ ...form, applicable_category: e.target.value })}>
                    <option value="">Select…</option>
                    {categories.map((c) => <option key={c.id || c.name} value={c.name}>{c.name}</option>)}
                  </select>
                </div>
              )}
              {form.applicable_to === 'products' && (
                <div className="form-group"><label>Products</label>
                  <div style={{ maxHeight: 120, overflowY: 'auto', display: 'grid', gap: 2, border: '1px solid #EEE', borderRadius: 8, padding: 8 }}>
                    {products.map((p) => (
                      <label key={p.id} style={{ display: 'flex', gap: 8, fontSize: 13 }}>
                        <input type="checkbox" checked={form.applicable_product_ids.includes(p.id)} onChange={() => toggleProduct(p.id)} /> {p.name}
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {/* SCOPE */}
              <div className="form-group"><label>Scope</label>
                {isStoreMgr ? (
                  <div data-testid="offer-scope-locked" style={{ fontSize: 13, padding: '8px 0' }}>
                    Locked to your store: <strong>{user?.store_id ? storeName(user.store_id) : '—'}</strong>
                  </div>
                ) : (
                  <select value={form.scope} onChange={(e) => setForm({ ...form, scope: e.target.value })} data-testid="offer-scope">
                    {scopeChoices.map((s) => <option key={s} value={s}>{s === 'all' ? 'All stores' : s === 'cluster' ? 'My cluster' : 'Specific stores'}</option>)}
                  </select>
                )}
              </div>
              {!isStoreMgr && form.scope === 'cluster' && isHQ && (
                <div className="form-group"><label>Cluster (area manager)</label>
                  <select value={form.cluster_owner_id} onChange={(e) => setForm({ ...form, cluster_owner_id: e.target.value })} data-testid="offer-cluster-owner">
                    <option value="">Select area manager…</option>
                    {areaManagers.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                </div>
              )}
              {!isStoreMgr && form.scope === 'stores' && (
                <div className="form-group"><label>Stores</label>
                  <div style={{ maxHeight: 120, overflowY: 'auto', display: 'grid', gap: 2, border: '1px solid #EEE', borderRadius: 8, padding: 8 }} data-testid="offer-store-picker">
                    {stores.map((s) => (
                      <label key={s.store_id} style={{ display: 'flex', gap: 8, fontSize: 13 }}>
                        <input type="checkbox" checked={form.store_ids.includes(s.store_id)} onChange={() => toggleStore(s.store_id)} data-testid={`offer-store-${s.store_id}`} /> {s.name}
                      </label>
                    ))}
                  </div>
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group"><label>Min order (₹)</label><input type="number" value={form.min_order_value} onChange={(e) => setForm({ ...form, min_order_value: e.target.value })} /></div>
                <div className="form-group"><label>Max discount (₹)</label><input type="number" value={form.max_discount} onChange={(e) => setForm({ ...form, max_discount: e.target.value })} placeholder="none" /></div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group"><label>Start date</label><input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} /></div>
                <div className="form-group"><label>End date</label><input type="date" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} /></div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group"><label>Usage limit (total)</label><input type="number" value={form.usage_limit_total} onChange={(e) => setForm({ ...form, usage_limit_total: e.target.value })} placeholder="∞" data-testid="offer-limit-total" /></div>
                <div className="form-group"><label>Usage limit (per user)</label><input type="number" value={form.usage_limit_per_user} onChange={(e) => setForm({ ...form, usage_limit_per_user: e.target.value })} placeholder="∞" data-testid="offer-limit-user" /></div>
              </div>
              <div style={{ display: 'flex', gap: 18, margin: '4px 0 12px' }}>
                <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}><input type="checkbox" checked={form.first_order_only} onChange={(e) => setForm({ ...form, first_order_only: e.target.checked })} data-testid="offer-first-order" /> First order only</label>
                <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}><input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} data-testid="offer-active" /> Active</label>
              </div>

              {formError && <div style={{ background: '#FDE8E8', color: '#B42318', borderRadius: 8, padding: 10, marginBottom: 10, fontSize: 13 }} data-testid="offer-form-error">{formError}</div>}
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={saving} data-testid="save-offer-btn">{saving ? 'Saving…' : (form.id ? 'Update Offer' : 'Create Offer')}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
