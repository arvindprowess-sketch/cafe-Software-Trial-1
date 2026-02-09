import React, { useState, useEffect, useRef } from 'react';
import { api } from '../utils/api';

const COLOR_PRESETS = ['#E23744', '#FF9F0A', '#267E3E', '#5B5FE0', '#9C27B0', '#00BCD4', '#FF6B6B', '#4CAF50', '#1C1C2E', '#795548'];

type FormMode = 'create' | 'edit';

export default function AdminCategories() {
  const [categories, setCategories] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [formMode, setFormMode] = useState<FormMode>('create');
  const [editId, setEditId] = useState('');
  const [form, setForm] = useState({ name: '', icon: 'grid', color: '#E23744', sort_order: 0, font_style: 'default', description: '', is_active: true, image_url: '' });
  const [saving, setSaving] = useState(false);
  const [imagePreview, setImagePreview] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = async () => { try { setCategories(await api('/categories/all')); } catch {} };
  useEffect(() => { load(); }, []);

  const openCreate = () => {
    setFormMode('create');
    setEditId('');
    setForm({ name: '', icon: 'grid', color: '#E23744', sort_order: categories.length + 1, font_style: 'default', description: '', is_active: true, image_url: '' });
    setImagePreview('');
    setShowForm(true);
  };

  const openEdit = (cat: any) => {
    setFormMode('edit');
    setEditId(cat.id);
    setForm({
      name: cat.name, icon: cat.icon || 'grid', color: cat.color || '#E23744',
      sort_order: cat.sort_order || 0, font_style: cat.font_style || 'default',
      description: cat.description || '', is_active: cat.is_active !== false,
      image_url: cat.image_url || ''
    });
    setImagePreview(cat.image_url || '');
    setShowForm(true);
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = reader.result as string;
      setImagePreview(base64);
      try {
        const res = await api('/upload/image', { method: 'POST', body: { image: base64 } });
        setForm(f => ({ ...f, image_url: res.url }));
      } catch {
        setForm(f => ({ ...f, image_url: base64 }));
      }
    };
    reader.readAsDataURL(file);
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

  return (
    <div>
      <style>{`
        .cat-tiles-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
          gap: 32px;
          padding: 8px;
        }
        .cat-tile {
          position: relative;
          cursor: pointer;
          transition: transform 0.2s ease;
          display: flex;
          flex-direction: column;
          align-items: center;
        }
        .cat-tile:hover {
          transform: scale(1.03);
        }
        .cat-tile-img-wrap {
          width: 100%;
          aspect-ratio: 1;
          overflow: hidden;
          position: relative;
          display: flex;
          align-items: center;
          justify-content: center;
          background: transparent;
        }
        .cat-tile-img-wrap img {
          max-width: 85%;
          max-height: 85%;
          object-fit: contain;
          display: block;
          transition: transform 0.3s ease;
          filter: drop-shadow(0 8px 16px rgba(0,0,0,0.15));
        }
        .cat-tile:hover .cat-tile-img-wrap img {
          transform: scale(1.08);
        }
        .cat-tile-no-img {
          width: 120px;
          height: 120px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 48px;
          font-weight: 800;
          opacity: 0.3;
          background: #F0F0F0;
        }
        .cat-tile-badge {
          position: absolute;
          top: 8px;
          right: 8px;
          padding: 4px 10px;
          border-radius: 20px;
          font-size: 9px;
          font-weight: 700;
          letter-spacing: 0.5px;
          text-transform: uppercase;
          z-index: 2;
          font-family: var(--font-brand);
        }
        .cat-tile-badge.active { background: #267E3E; color: #FFF; }
        .cat-tile-badge.inactive { background: #666; color: #FFF; }
        .cat-tile-footer {
          padding: 8px 4px 0;
          text-align: center;
          width: 100%;
        }
        .cat-tile-name {
          font-family: var(--font-brand);
          font-weight: 600;
          font-size: 15px;
          line-height: 1.3;
          color: #1C1C2E;
          text-transform: uppercase;
          letter-spacing: -0.02em;
        }
        .cat-tile-order {
          font-size: 11px;
          color: #999;
          font-weight: 500;
          margin-top: 2px;
        }
        .cat-tile-actions {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 40px;
          background: rgba(0,0,0,0.6);
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 10px;
          opacity: 0;
          transition: opacity 0.2s ease;
          z-index: 3;
          border-radius: 16px;
        }
        .cat-tile:hover .cat-tile-actions { opacity: 1; }
        .cat-tile-actions button {
          padding: 10px 28px;
          border-radius: 24px;
          border: none;
          font-family: var(--font-brand);
          font-weight: 600;
          font-size: 13px;
          cursor: pointer;
          transition: transform 0.15s ease, background 0.15s ease;
          min-width: 130px;
          text-transform: uppercase;
          letter-spacing: 0.02em;
        }
        .cat-tile-actions button:hover { transform: scale(1.05); }
        .cat-tile-actions .btn-edit { background: #FFF; color: #1C1C2E; }
        .cat-tile-actions .btn-edit:hover { background: #F0F0F0; }
        .cat-tile-actions .btn-toggle { background: transparent; color: #FFF; border: 2px solid rgba(255,255,255,0.7); }
        .cat-tile-actions .btn-toggle:hover { background: rgba(255,255,255,0.1); }
        .cat-tile-inactive { opacity: 0.4; filter: grayscale(0.7); }

        .cat-form-img-upload {
          width: 100%;
          aspect-ratio: 1;
          border-radius: 16px;
          border: 2.5px dashed #D0D0D0;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          overflow: hidden;
          transition: border-color 0.2s;
          background: #FAFAFA;
          position: relative;
        }
        .cat-form-img-upload:hover { border-color: #E23744; }
        .cat-form-img-upload img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }
        .cat-form-img-upload .upload-placeholder {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 6px;
          color: #ACACAC;
        }
        .cat-form-img-upload .upload-placeholder svg { opacity: 0.4; }
        .cat-form-img-upload .upload-placeholder span { font-size: 13px; font-weight: 600; }
        .cat-form-preview {
          background: #1C1C2E;
          border-radius: 16px;
          padding: 20px;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 10px;
        }
        .cat-form-preview-label {
          font-size: 10px;
          color: rgba(255,255,255,0.4);
          font-weight: 700;
          letter-spacing: 1px;
          text-transform: uppercase;
          align-self: flex-start;
          font-family: var(--font-brand);
        }
        .cat-form-preview-tile {
          width: 140px;
          border-radius: 16px;
          overflow: hidden;
          background: #FFF;
          box-shadow: 0 4px 16px rgba(0,0,0,0.3);
        }
        .cat-form-preview-tile .pimg {
          width: 140px;
          height: 120px;
          object-fit: cover;
          display: block;
          background: #F0F0F0;
        }
        .cat-form-preview-tile .pname {
          padding: 10px 8px;
          text-align: center;
          font-family: var(--font-brand);
          font-weight: 600;
          font-size: 13px;
          color: #1C1C2E;
          text-transform: uppercase;
          letter-spacing: -0.01em;
        }
      `}</style>

      <div className="page-header">
        <div>
          <h1 style={{ fontFamily: "var(--font-brand)", fontWeight: 600, textTransform: 'uppercase', letterSpacing: '-0.01em' }}>Manage Categories</h1>
          <p>{categories.length} categories &middot; Image-first branding for Customer App</p>
        </div>
        <button className="btn btn-primary" onClick={openCreate} data-testid="add-category-btn"
          style={{ borderRadius: 24, fontFamily: "var(--font-brand)", fontWeight: 600, padding: '10px 24px', textTransform: 'uppercase', letterSpacing: '0.02em' }}>
          + Add Category
        </button>
      </div>

      <div className="cat-tiles-grid" data-testid="categories-grid">
        {categories.map(c => (
          <div key={c.id}
            className={`cat-tile ${c.is_active === false ? 'cat-tile-inactive' : ''}`}
            data-testid={`cat-card-${c.id}`}
          >
            <div className="cat-tile-img-wrap">
              {c.image_url ? (
                <img src={c.image_url} alt={c.name} loading="lazy" />
              ) : (
                <div className="cat-tile-no-img" style={{ color: c.color }}>{c.name?.[0]}</div>
              )}
            </div>
            <span className={`cat-tile-badge ${c.is_active !== false ? 'active' : 'inactive'}`}>
              {c.is_active !== false ? 'Live' : 'Off'}
            </span>
            <div className="cat-tile-footer" style={{ borderTop: `3px solid ${c.color}` }}>
              <div className="cat-tile-name">{c.name}</div>
              <div className="cat-tile-order">#{c.sort_order}</div>
            </div>
            <div className="cat-tile-actions">
              <button className="btn-edit" onClick={() => openEdit(c)} data-testid={`edit-cat-${c.id}`}>Edit</button>
              <button className="btn-toggle" onClick={() => toggleActive(c.id, c.is_active !== false)} data-testid={`toggle-cat-${c.id}`}>
                {c.is_active !== false ? 'Deactivate' : 'Activate'}
              </button>
            </div>
          </div>
        ))}
      </div>

      {categories.length === 0 && (
        <div className="empty-state" style={{ marginTop: 40 }}>
          <div style={{ fontSize: 56, marginBottom: 12, opacity: 0.2 }}>
            <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="#5B5FE0" strokeWidth="2"><path d="M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z"/></svg>
          </div>
          <h3 style={{ fontFamily: "var(--font-brand)", fontWeight: 600, textTransform: 'uppercase' }}>No Categories Yet</h3>
          <p>Create your first category with a branded image</p>
          <button className="btn btn-primary" onClick={openCreate} style={{ borderRadius: 24, fontFamily: "var(--font-brand)", fontWeight: 600, textTransform: 'uppercase' }}>
            + Add Category
          </button>
        </div>
      )}

      {showForm && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowForm(false)}>
          <div className="modal" style={{ maxWidth: 540, borderRadius: 20 }}>
            <h2 style={{ fontFamily: "var(--font-brand)", fontWeight: 600, fontSize: 22, textTransform: 'uppercase', letterSpacing: '-0.01em' }}>
              {formMode === 'create' ? 'New Category' : 'Edit Category'}
            </h2>
            <form onSubmit={handleSave}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 16 }}>
                {/* Image Upload */}
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: '#888', marginBottom: 6, display: 'block', fontFamily: "var(--font-brand)", letterSpacing: '0.05em' }}>CATEGORY IMAGE</label>
                  <div className="cat-form-img-upload" onClick={() => fileInputRef.current?.click()} data-testid="cat-image-upload">
                    {imagePreview ? (
                      <img src={imagePreview} alt="Preview" />
                    ) : (
                      <div className="upload-placeholder">
                        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg>
                        <span>Upload Image</span>
                        <span style={{ fontSize: 11, color: '#CCC' }}>1:1 ratio recommended</span>
                      </div>
                    )}
                  </div>
                  <input ref={fileInputRef} type="file" accept="image/*" onChange={handleImageUpload} style={{ display: 'none' }} data-testid="cat-image-file-input" />
                  {imagePreview && (
                    <button type="button" onClick={() => { setImagePreview(''); setForm(f => ({ ...f, image_url: '' })); }}
                      style={{ marginTop: 6, fontSize: 11, color: '#E23744', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700 }}
                      data-testid="cat-image-remove">
                      Remove image
                    </button>
                  )}
                </div>

                {/* Live Preview */}
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: '#888', marginBottom: 6, display: 'block', fontFamily: "var(--font-brand)", letterSpacing: '0.05em' }}>LIVE PREVIEW</label>
                  <div className="cat-form-preview">
                    <div className="cat-form-preview-label">How it looks</div>
                    <div className="cat-form-preview-tile">
                      {imagePreview ? (
                        <img className="pimg" src={imagePreview} alt="Preview" />
                      ) : (
                        <div className="pimg" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 36, fontWeight: 800, color: form.color, opacity: 0.2 }}>
                          {form.name?.[0] || '?'}
                        </div>
                      )}
                      <div className="pname" style={{ color: form.color }}>
                        {form.name || 'Category'}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="form-group">
                <label>Category Name *</label>
                <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. High Protein" required
                  style={{ fontFamily: "var(--font-brand)", fontWeight: 500, fontSize: 15, borderRadius: 12, textTransform: 'uppercase' }}
                  data-testid="cat-name-input" />
              </div>

              <div className="form-group">
                <label>Brand Color</label>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {COLOR_PRESETS.map(clr => (
                    <button key={clr} type="button"
                      onClick={() => setForm({ ...form, color: clr })}
                      style={{
                        width: 34, height: 34, borderRadius: 10, background: clr,
                        border: form.color === clr ? '3px solid #1C1C2E' : '2px solid transparent',
                        cursor: 'pointer', transition: 'transform 0.15s',
                        transform: form.color === clr ? 'scale(1.15)' : 'scale(1)',
                        boxShadow: form.color === clr ? '0 2px 8px rgba(0,0,0,0.2)' : 'none'
                      }}
                      data-testid={`color-${clr}`}
                    />
                  ))}
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group">
                  <label>Display Order</label>
                  <input type="number" value={form.sort_order} onChange={e => setForm({ ...form, sort_order: parseInt(e.target.value) || 0 })} min={0}
                    style={{ borderRadius: 12 }} data-testid="cat-order-input" />
                </div>
                <div className="form-group">
                  <label>Description</label>
                  <input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Brief description"
                    style={{ borderRadius: 12 }} data-testid="cat-desc-input" />
                </div>
              </div>

              {formMode === 'edit' && (
                <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input type="checkbox" checked={form.is_active} onChange={e => setForm({ ...form, is_active: e.target.checked })} id="active-toggle" data-testid="cat-active-toggle" />
                  <label htmlFor="active-toggle" style={{ margin: 0 }}>Active (visible to customers)</label>
                </div>
              )}

              <div className="modal-actions" style={{ marginTop: 16 }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowForm(false)}
                  style={{ borderRadius: 24, fontFamily: "var(--font-brand)", fontWeight: 600, textTransform: 'uppercase' }}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={saving}
                  style={{ borderRadius: 24, fontFamily: "var(--font-brand)", fontWeight: 600, padding: '10px 28px', textTransform: 'uppercase' }}
                  data-testid="save-category-btn">
                  {saving ? 'Saving...' : formMode === 'create' ? 'Create' : 'Update'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
