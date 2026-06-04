import React, { useState, useEffect } from 'react';
import { api } from '../utils/api';

const emptyForm = {
  title: '', subtitle: '', discount_type: 'percentage', discount_value: '10',
  applicable_to: 'all', applicable_category: '', coupon_code: '', min_order_value: '0', max_discount: '', banner_color: '#C7F24E',
};

export default function AdminOffers() {
  const [offers, setOffers] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<any>(emptyForm);
  const [saving, setSaving] = useState(false);

  const load = async () => { try { setOffers(await api('/offers/all')); } catch {} };
  useEffect(() => { load(); }, []);

  const toggleOffer = async (id: string, active: boolean) => {
    try { await api(`/offers/${id}`, { method: 'PUT', body: { is_active: !active } }); load(); } catch {}
  };

  const deleteOffer = async (id: string) => {
    if (!confirm('Delete this offer?')) return;
    try { await api(`/offers/${id}`, { method: 'DELETE' }); load(); } catch (e: any) { alert(e.message); }
  };

  const createOffer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title || !form.subtitle) { alert('Title and subtitle are required'); return; }
    setSaving(true);
    try {
      await api('/offers', { method: 'POST', body: {
        title: form.title,
        subtitle: form.subtitle,
        discount_type: form.discount_type,
        discount_value: form.discount_type === 'bogo' ? 0 : parseFloat(form.discount_value) || 0,
        applicable_to: form.applicable_to,
        applicable_category: form.applicable_to === 'category' ? form.applicable_category : null,
        coupon_code: form.coupon_code || null,
        min_order_value: parseFloat(form.min_order_value) || 0,
        max_discount: form.max_discount ? parseFloat(form.max_discount) : null,
        banner_color: form.banner_color,
      }});
      setShowForm(false); setForm(emptyForm); load();
    } catch (e: any) { alert(e.message); } finally { setSaving(false); }
  };

  const fmtDiscount = (o: any) => {
    if (o.discount_type === 'bogo') return 'Buy 1 Get 1';
    if (o.discount_type === 'percentage') return `${o.discount_value}%`;
    return `₹${o.discount_value}`;
  };

  return (
    <div>
      <div className="page-header">
        <div><h1>Offers</h1><p>{offers.length} offers</p></div>
        <button className="btn btn-primary" onClick={() => { setForm(emptyForm); setShowForm(true); }} data-testid="add-offer-btn">+ New Offer</button>
      </div>
      <table className="data-table">
        <thead><tr><th>Title</th><th>Type</th><th>Discount</th><th>Code</th><th>Status</th><th>Actions</th></tr></thead>
        <tbody>
          {offers.map(o => (
            <tr key={o.id} data-testid={`offer-row-${o.id}`}>
              <td style={{fontWeight:600}}>{o.title}</td>
              <td><span className={`badge ${o.discount_type === 'bogo' ? 'badge-blue' : 'badge-purple'}`}>{o.discount_type}</span></td>
              <td>{fmtDiscount(o)}</td>
              <td style={{fontFamily:'monospace'}}>{o.coupon_code||'-'}</td>
              <td><span className={`badge ${o.is_active?'badge-green':'badge-gray'}`}>{o.is_active?'Active':'Inactive'}</span></td>
              <td style={{ display: 'flex', gap: 6 }}>
                <button className="btn btn-sm btn-secondary" onClick={() => toggleOffer(o.id, o.is_active)} data-testid={`toggle-offer-${o.id}`}>{o.is_active?'Disable':'Enable'}</button>
                <button className="btn btn-sm btn-danger" onClick={() => deleteOffer(o.id)} data-testid={`delete-offer-${o.id}`}>Delete</button>
              </td>
            </tr>
          ))}
          {offers.length === 0 && <tr><td colSpan={6} style={{textAlign:'center',padding:40,color:'#9C9C9C'}}>No offers yet</td></tr>}
        </tbody>
      </table>

      {showForm && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && !saving && setShowForm(false)}>
          <div className="modal" style={{ maxWidth: 520 }}>
            <h2>New Offer</h2>
            <form onSubmit={createOffer}>
              <div className="form-group"><label>Title *</label><input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="Flat 20% OFF" required data-testid="offer-title" /></div>
              <div className="form-group"><label>Subtitle *</label><input value={form.subtitle} onChange={e => setForm({ ...form, subtitle: e.target.value })} placeholder="On all protein items" required data-testid="offer-subtitle" /></div>
              <div className="form-group"><label>Discount Type *</label>
                <select value={form.discount_type} onChange={e => setForm({ ...form, discount_type: e.target.value })} data-testid="offer-type">
                  <option value="percentage">Percentage (%)</option>
                  <option value="flat">Flat (₹)</option>
                  <option value="bogo">BOGO — Buy One Get One</option>
                </select>
              </div>
              {form.discount_type !== 'bogo' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div className="form-group"><label>Discount Value *</label><input type="number" value={form.discount_value} onChange={e => setForm({ ...form, discount_value: e.target.value })} data-testid="offer-value" /></div>
                  <div className="form-group"><label>Max Discount (₹)</label><input type="number" value={form.max_discount} onChange={e => setForm({ ...form, max_discount: e.target.value })} placeholder="optional" data-testid="offer-max" /></div>
                </div>
              )}
              {form.discount_type === 'bogo' && (
                <div style={{ background: '#F0F7E0', borderRadius: 8, padding: 10, marginBottom: 12, fontSize: 13, color: '#5b6b2e' }} data-testid="bogo-hint">
                  BOGO automatically makes the cheapest item free when the cart has 2+ items.
                </div>
              )}
              <div className="form-group"><label>Applies To</label>
                <select value={form.applicable_to} onChange={e => setForm({ ...form, applicable_to: e.target.value })} data-testid="offer-applies">
                  <option value="all">All items</option>
                  <option value="category">Specific category</option>
                </select>
              </div>
              {form.applicable_to === 'category' && (
                <div className="form-group"><label>Category</label><input value={form.applicable_category} onChange={e => setForm({ ...form, applicable_category: e.target.value })} placeholder="e.g. Protein" data-testid="offer-category" /></div>
              )}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group"><label>Coupon Code</label><input value={form.coupon_code} onChange={e => setForm({ ...form, coupon_code: e.target.value.toUpperCase() })} placeholder="SAVE20" data-testid="offer-code" /></div>
                <div className="form-group"><label>Min Order (₹)</label><input type="number" value={form.min_order_value} onChange={e => setForm({ ...form, min_order_value: e.target.value })} data-testid="offer-min" /></div>
              </div>
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={saving} data-testid="save-offer-btn">{saving ? 'Saving...' : 'Create Offer'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
