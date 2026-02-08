import React, { useState, useEffect } from 'react';
import { api } from '../utils/api';

const ICON_OPTIONS = ['grid', 'barbell', 'leaf', 'water', 'fast-food', 'nutrition', 'flame', 'pizza', 'fish', 'cafe', 'beer', 'ice-cream', 'egg', 'restaurant'];
const FONT_OPTIONS = [
  { value: 'default', label: 'Default' },
  { value: 'bold', label: 'Bold' },
  { value: 'italic', label: 'Italic' },
  { value: 'mono', label: 'Monospace' },
];
const COLOR_PRESETS = ['#E23744', '#FF9F0A', '#267E3E', '#5B5FE0', '#9C27B0', '#00BCD4', '#FF6B6B', '#4CAF50', '#1C1C2E', '#795548'];

type FormMode = 'create' | 'edit';

export default function AdminCategories() {
  const [categories, setCategories] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [formMode, setFormMode] = useState<FormMode>('create');
  const [editId, setEditId] = useState('');
  const [form, setForm] = useState({ name: '', icon: 'grid', color: '#E23744', sort_order: 0, font_style: 'default', description: '', is_active: true });
  const [saving, setSaving] = useState(false);

  const load = async () => { try { setCategories(await api('/categories/all')); } catch {} };
  useEffect(() => { load(); }, []);

  const openCreate = () => {
    setFormMode('create');
    setEditId('');
    setForm({ name: '', icon: 'grid', color: '#E23744', sort_order: categories.length + 1, font_style: 'default', description: '', is_active: true });
    setShowForm(true);
  };

  const openEdit = (cat: any) => {
    setFormMode('edit');
    setEditId(cat.id);
    setForm({ name: cat.name, icon: cat.icon || 'grid', color: cat.color || '#E23744', sort_order: cat.sort_order || 0, font_style: cat.font_style || 'default', description: cat.description || '', is_active: cat.is_active !== false });
    setShowForm(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      if (formMode === 'create') {
        await api('/categories', { method: 'POST', body: { ...form, key: form.name.replace(/\s+/g, '_').toUpperCase(), label: form.name } });
      } else {
        await api(`/categories/${editId}`, { method: 'PUT', body: form });
      }
      setShowForm(false);
      load();
    } catch (err: any) { alert(err.message); } finally { setSaving(false); }
  };

  const toggleActive = async (id: string, active: boolean) => {
    try { await api(`/categories/${id}`, { method: 'PUT', body: { is_active: !active } }); load(); } catch {}
  };

  const deleteCategory = async (id: string) => {
    if (!confirm('Deactivate this category? Products in this category will be hidden from customers & cashier.')) return;
    try { await api(`/categories/${id}`, { method: 'DELETE' }); load(); } catch (e: any) { alert(e.message); }
  };

  const fontStyleCSS = (fs: string) => {
    switch (fs) {
      case 'bold': return { fontWeight: 800 };
      case 'italic': return { fontStyle: 'italic' as const };
      case 'mono': return { fontFamily: 'monospace' };
      default: return {};
    }
  };

  return (
    <div>
      <div className="page-header">
        <div><h1>Manage Categories</h1><p>{categories.length} categories &middot; Single source of truth for Customer App & Cashier Panel</p></div>
        <button className="btn btn-primary" onClick={openCreate} data-testid="add-category-btn">+ Add Category</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }} data-testid="categories-grid">
        {categories.map(c => (
          <div key={c.id} className="order-card" style={{ borderLeft: `4px solid ${c.color}`, opacity: c.is_active === false ? 0.5 : 1 }} data-testid={`cat-card-${c.id}`}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <div style={{ width: 40, height: 40, borderRadius: 10, background: `${c.color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 700, color: c.color }}>
                  {c.icon === 'grid' ? '☰' : c.icon === 'barbell' ? '💪' : c.icon === 'leaf' ? '🌿' : c.icon === 'water' ? '💧' : c.icon === 'fast-food' ? '🍽' : c.icon === 'nutrition' ? '🥬' : c.icon === 'flame' ? '🔥' : c.icon === 'pizza' ? '🍕' : c.icon === 'fish' ? '🐟' : c.icon === 'cafe' ? '☕' : c.icon === 'egg' ? '🥚' : c.icon === 'restaurant' ? '🍴' : '📂'}
                </div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 15, ...fontStyleCSS(c.font_style || 'default') }}>{c.name}</div>
                  <div style={{ fontSize: 11, color: '#9C9C9C' }}>Order: {c.sort_order} &middot; Font: {c.font_style || 'default'}</div>
                </div>
              </div>
              <span className={`badge ${c.is_active !== false ? 'badge-green' : 'badge-gray'}`}>{c.is_active !== false ? 'Active' : 'Inactive'}</span>
            </div>
            {c.description && <p style={{ fontSize: 12, color: '#696969', margin: '4px 0 10px' }}>{c.description}</p>}
            <div style={{ display: 'flex', gap: 6 }}>
              <button className="btn btn-sm btn-secondary" onClick={() => openEdit(c)} data-testid={`edit-cat-${c.id}`}>Edit</button>
              <button className="btn btn-sm btn-secondary" onClick={() => toggleActive(c.id, c.is_active !== false)} data-testid={`toggle-cat-${c.id}`}>
                {c.is_active !== false ? 'Deactivate' : 'Activate'}
              </button>
            </div>
          </div>
        ))}
      </div>

      {categories.length === 0 && (
        <div className="empty-state" style={{ marginTop: 40 }}>
          <div className="empty-icon"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#5B5FE0" strokeWidth="2"><path d="M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z"/></svg></div>
          <h3>No Categories Yet</h3>
          <p>Create your first category to organize your menu</p>
          <button className="btn btn-primary" onClick={openCreate}>+ Add Category</button>
        </div>
      )}

      {/* Add / Edit Modal */}
      {showForm && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowForm(false)}>
          <div className="modal" style={{ maxWidth: 480 }}>
            <h2>{formMode === 'create' ? 'Add Category' : 'Edit Category'}</h2>
            <form onSubmit={handleSave}>
              <div className="form-group">
                <label>Category Name *</label>
                <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. High Protein" required data-testid="cat-name-input" />
              </div>

              <div className="form-group">
                <label>Icon</label>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {ICON_OPTIONS.map(ic => (
                    <button key={ic} type="button"
                      onClick={() => setForm({ ...form, icon: ic })}
                      style={{ width: 40, height: 40, borderRadius: 8, border: form.icon === ic ? `2px solid ${form.color}` : '1px solid #E0E0E0', background: form.icon === ic ? `${form.color}12` : '#FFF', cursor: 'pointer', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                      data-testid={`icon-${ic}`}
                    >
                      {ic === 'grid' ? '☰' : ic === 'barbell' ? '💪' : ic === 'leaf' ? '🌿' : ic === 'water' ? '💧' : ic === 'fast-food' ? '🍽' : ic === 'nutrition' ? '🥬' : ic === 'flame' ? '🔥' : ic === 'pizza' ? '🍕' : ic === 'fish' ? '🐟' : ic === 'cafe' ? '☕' : ic === 'egg' ? '🥚' : ic === 'restaurant' ? '🍴' : ic === 'beer' ? '🍺' : '🍦'}
                    </button>
                  ))}
                </div>
              </div>

              <div className="form-group">
                <label>Color</label>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {COLOR_PRESETS.map(clr => (
                    <button key={clr} type="button"
                      onClick={() => setForm({ ...form, color: clr })}
                      style={{ width: 32, height: 32, borderRadius: 8, background: clr, border: form.color === clr ? '3px solid #1C1C2E' : '2px solid transparent', cursor: 'pointer' }}
                      data-testid={`color-${clr}`}
                    />
                  ))}
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group">
                  <label>Font Style</label>
                  <select value={form.font_style} onChange={e => setForm({ ...form, font_style: e.target.value })} data-testid="cat-font-select">
                    {FONT_OPTIONS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label>Display Order</label>
                  <input type="number" value={form.sort_order} onChange={e => setForm({ ...form, sort_order: parseInt(e.target.value) || 0 })} min={0} data-testid="cat-order-input" />
                </div>
              </div>

              <div className="form-group">
                <label>Description (optional)</label>
                <input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Brief description" data-testid="cat-desc-input" />
              </div>

              {formMode === 'edit' && (
                <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input type="checkbox" checked={form.is_active} onChange={e => setForm({ ...form, is_active: e.target.checked })} id="active-toggle" data-testid="cat-active-toggle" />
                  <label htmlFor="active-toggle" style={{ margin: 0 }}>Active (visible to customers & cashier)</label>
                </div>
              )}

              {/* Preview */}
              <div style={{ background: '#FAFAFA', borderRadius: 10, padding: 14, marginBottom: 14, border: '1px solid #EFEFEF' }}>
                <div style={{ fontSize: 11, color: '#9C9C9C', marginBottom: 6, fontWeight: 600 }}>PREVIEW</div>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <div style={{ width: 44, height: 44, borderRadius: 10, background: `${form.color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>
                    {form.icon === 'grid' ? '☰' : form.icon === 'barbell' ? '💪' : form.icon === 'leaf' ? '🌿' : form.icon === 'water' ? '💧' : form.icon === 'fast-food' ? '🍽' : form.icon === 'nutrition' ? '🥬' : form.icon === 'flame' ? '🔥' : form.icon === 'pizza' ? '🍕' : form.icon === 'fish' ? '🐟' : form.icon === 'cafe' ? '☕' : form.icon === 'egg' ? '🥚' : form.icon === 'restaurant' ? '🍴' : form.icon === 'beer' ? '🍺' : '🍦'}
                  </div>
                  <div style={{ fontWeight: 700, fontSize: 16, color: form.color, ...fontStyleCSS(form.font_style) }}>
                    {form.name || 'Category Name'}
                  </div>
                </div>
              </div>

              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={saving} data-testid="save-category-btn">
                  {saving ? 'Saving...' : formMode === 'create' ? 'Create Category' : 'Update Category'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
