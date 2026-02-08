import React, { useState, useEffect } from 'react';
import { api } from '../utils/api';

type ProductTab = 'all' | 'single' | 'ready_made';
type FormType = 'single' | 'ready_made';

interface Ingredient { name: string; grams_per_serving: number; }

export default function AdminProducts() {
  const [products, setProducts] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [tab, setTab] = useState<ProductTab>('all');
  const [showForm, setShowForm] = useState(false);
  const [formType, setFormType] = useState<FormType>('single');
  const [creating, setCreating] = useState(false);
  const [editModal, setEditModal] = useState<any>(null);
  const [editForm, setEditForm] = useState<any>({});
  const [editSaving, setEditSaving] = useState(false);

  // Single product form
  const [sName, setSName] = useState('');
  const [sPrice, setSPrice] = useState('');
  const [sGrams, setSGrams] = useState('');
  const [sCatId, setSCatId] = useState('');
  const [sDiet, setSDiet] = useState('');

  // Ready-made form
  const [rName, setRName] = useState('');
  const [rPrice, setRPrice] = useState('');
  const [rServingGrams, setRServingGrams] = useState('300');
  const [rCatId, setRCatId] = useState('');
  const [rEditable, setREditable] = useState(false);
  const [rIngredients, setRIngredients] = useState<Ingredient[]>([{ name: '', grams_per_serving: 0 }]);

  const load = async () => {
    try {
      const [p, c] = await Promise.all([api('/products/all'), api('/categories/all')]);
      setProducts(p);
      setCategories(c.filter((cat: any) => cat.is_active !== false));
    } catch {}
  };
  useEffect(() => { load(); }, []);

  const filtered = tab === 'all' ? products : products.filter(p => p.product_type === tab);

  const resetForms = () => {
    setSName(''); setSPrice(''); setSGrams(''); setSCatId(''); setSDiet('');
    setRName(''); setRPrice(''); setRServingGrams('300'); setRCatId(''); setREditable(false);
    setRIngredients([{ name: '', grams_per_serving: 0 }]);
  };

  const openCreate = (type: FormType) => {
    resetForms();
    setFormType(type);
    setShowForm(true);
  };

  const handleCreateSingle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sName || !sPrice || !sGrams) return;
    if (!sCatId) { alert('Please select a category'); return; }
    setCreating(true);
    try {
      await api('/products/single', { method: 'POST', body: { name: sName, price: parseFloat(sPrice), grams: parseFloat(sGrams), category_id: sCatId, diet_type: sDiet || undefined } });
      setShowForm(false);
      resetForms();
      load();
    } catch (e: any) { alert(e.message); } finally { setCreating(false); }
  };

  const handleCreateReadyMade = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rName || !rPrice) return;
    if (!rCatId) { alert('Please select a category'); return; }
    const validIngredients = rIngredients.filter(i => i.name.trim() && i.grams_per_serving > 0);
    if (validIngredients.length === 0) { alert('Add at least one ingredient with grams'); return; }
    setCreating(true);
    try {
      await api('/products/ready-made', { method: 'POST', body: { name: rName, price: parseFloat(rPrice), serving_grams: parseFloat(rServingGrams) || 300, ingredients: validIngredients, is_editable: rEditable, category_id: rCatId } });
      setShowForm(false);
      resetForms();
      load();
    } catch (e: any) { alert(e.message); } finally { setCreating(false); }
  };

  const addIngredient = () => setRIngredients([...rIngredients, { name: '', grams_per_serving: 0 }]);
  const removeIngredient = (idx: number) => setRIngredients(rIngredients.filter((_, i) => i !== idx));
  const updateIngredient = (idx: number, field: string, val: any) => {
    const updated = [...rIngredients];
    (updated[idx] as any)[field] = field === 'grams_per_serving' ? parseFloat(val) || 0 : val;
    setRIngredients(updated);
  };

  const openEdit = (p: any) => {
    setEditModal(p);
    setEditForm({ cost_per_100g: p.cost_per_100g, fixed_price: p.fixed_price, available_qty_grams: p.available_qty_grams, category: p.category, is_active: p.is_active });
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editModal) return;
    setEditSaving(true);
    try {
      const body: any = {};
      if (editForm.cost_per_100g !== editModal.cost_per_100g) body.cost_per_100g = parseFloat(editForm.cost_per_100g);
      if (editForm.available_qty_grams !== editModal.available_qty_grams) body.available_qty_grams = parseFloat(editForm.available_qty_grams);
      if (editForm.is_active !== editModal.is_active) body.is_active = editForm.is_active;
      if (Object.keys(body).length > 0) {
        await api(`/products/${editModal.id}`, { method: 'PUT', body });
      }
      setEditModal(null);
      load();
    } catch (e: any) { alert(e.message); } finally { setEditSaving(false); }
  };

  const toggleActive = async (id: string, active: boolean) => {
    try { await api(`/products/${id}`, { method: 'PUT', body: { is_active: !active } }); load(); } catch {}
  };

  const deleteProduct = async (id: string) => {
    if (!confirm('Delete this product permanently?')) return;
    try { await api(`/products/${id}`, { method: 'DELETE' }); load(); } catch (e: any) { alert(e.message); }
  };

  return (
    <div>
      <div className="page-header">
        <div><h1>Manage Products</h1><p>{products.length} total &middot; {products.filter(p => p.product_type === 'ready_made').length} meals, {products.filter(p => p.product_type !== 'ready_made').length} singles</p></div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-primary" onClick={() => openCreate('single')} data-testid="add-single-btn">+ Single Product</button>
          <button className="btn btn-green" onClick={() => openCreate('ready_made')} data-testid="add-meal-btn">+ Ready-Made Meal</button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 16, background: '#F0F0F0', borderRadius: 10, padding: 3 }} data-testid="product-tabs">
        {([['all', 'All'], ['single', 'Single Products'], ['ready_made', 'Ready-Made Meals']] as [ProductTab, string][]).map(([key, label]) => (
          <button key={key}
            className={`btn btn-sm`}
            style={{ flex: 1, borderRadius: 8, fontWeight: tab === key ? 700 : 500, background: tab === key ? '#1C1C2E' : 'transparent', color: tab === key ? '#FFF' : '#696969' }}
            onClick={() => setTab(key)}
            data-testid={`tab-${key}`}
          >{label} ({key === 'all' ? products.length : products.filter(p => p.product_type === key).length})</button>
        ))}
      </div>

      {/* Product Table */}
      <table className="data-table" data-testid="products-table">
        <thead>
          <tr>
            <th>Name</th><th>Type</th><th>Category</th><th>Diet</th><th>Price</th><th>Stock</th><th>Status</th><th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map(p => (
            <tr key={p.id} data-testid={`product-row-${p.id}`}>
              <td>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  {p.image_url && <img src={p.image_url} alt="" style={{ width: 36, height: 36, borderRadius: 8, objectFit: 'cover' }} />}
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{p.name}</div>
                    {p.description && <div style={{ fontSize: 11, color: '#9C9C9C', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.description}</div>}
                  </div>
                </div>
              </td>
              <td><span className={`badge ${p.product_type === 'ready_made' ? 'badge-green' : 'badge-purple'}`}>{p.product_type === 'ready_made' ? 'Meal' : 'Single'}</span></td>
              <td><span className="badge badge-purple">{p.category}</span></td>
              <td><span className={`badge ${p.diet_type === 'non-veg' ? 'badge-red' : 'badge-green'}`}>{p.diet_type}</span></td>
              <td style={{ fontWeight: 600 }}>
                {p.product_type === 'ready_made' ? `₹${p.fixed_price}/plate` : `₹${p.cost_per_100g}/100g`}
              </td>
              <td>
                {p.product_type === 'ready_made'
                  ? `${p.available_servings || 0} plates`
                  : p.available_qty_grams >= 1000 ? `${(p.available_qty_grams / 1000).toFixed(1)}kg` : `${Math.round(p.available_qty_grams || 0)}g`
                }
              </td>
              <td><span className={`badge ${p.is_active ? 'badge-green' : 'badge-gray'}`}>{p.is_active ? 'Active' : 'Inactive'}</span></td>
              <td>
                <div style={{ display: 'flex', gap: 4 }}>
                  <button className="btn btn-sm btn-secondary" onClick={() => openEdit(p)} data-testid={`edit-${p.id}`}>Edit</button>
                  <button className="btn btn-sm btn-secondary" onClick={() => toggleActive(p.id, p.is_active)} data-testid={`toggle-${p.id}`}>{p.is_active ? 'Disable' : 'Enable'}</button>
                  <button className="btn btn-sm btn-danger" onClick={() => deleteProduct(p.id)} data-testid={`delete-${p.id}`}>Del</button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Create Form Modal */}
      {showForm && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowForm(false)}>
          <div className="modal" style={{ maxWidth: 520 }}>
            {/* Type Switcher */}
            <div style={{ display: 'flex', gap: 4, marginBottom: 16, background: '#F0F0F0', borderRadius: 8, padding: 3 }}>
              <button type="button" style={{ flex: 1, padding: '8px 12px', borderRadius: 6, border: 'none', fontWeight: formType === 'single' ? 700 : 500, background: formType === 'single' ? '#5B5FE0' : 'transparent', color: formType === 'single' ? '#FFF' : '#696969', cursor: 'pointer' }} onClick={() => setFormType('single')}>Single Product</button>
              <button type="button" style={{ flex: 1, padding: '8px 12px', borderRadius: 6, border: 'none', fontWeight: formType === 'ready_made' ? 700 : 500, background: formType === 'ready_made' ? '#267E3E' : 'transparent', color: formType === 'ready_made' ? '#FFF' : '#696969', cursor: 'pointer' }} onClick={() => setFormType('ready_made')}>Ready-Made Meal</button>
            </div>

            {formType === 'single' ? (
              <form onSubmit={handleCreateSingle}>
                <h2>Add Single Product</h2>
                <p style={{ fontSize: 12, color: '#9C9C9C', margin: '-4px 0 14px' }}>AI auto-calculates nutrition, generates image & description</p>
                <div className="form-group">
                  <label>Product Name *</label>
                  <input value={sName} onChange={e => setSName(e.target.value)} placeholder="e.g. Chicken Breast" required data-testid="single-name" />
                </div>
                <div className="form-group">
                  <label>Category *</label>
                  <select value={sCatId} onChange={e => setSCatId(e.target.value)} required data-testid="single-category">
                    <option value="">Select category</option>
                    {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div className="form-group">
                    <label>Price (₹) *</label>
                    <input type="number" value={sPrice} onChange={e => setSPrice(e.target.value)} placeholder="450" required data-testid="single-price" />
                  </div>
                  <div className="form-group">
                    <label>Stock (grams) *</label>
                    <input type="number" value={sGrams} onChange={e => setSGrams(e.target.value)} placeholder="5000" required data-testid="single-grams" />
                  </div>
                </div>
                <div className="form-group">
                  <label>Diet Type</label>
                  <select value={sDiet} onChange={e => setSDiet(e.target.value)} data-testid="single-diet">
                    <option value="">Auto-detect</option>
                    <option value="veg">Veg</option>
                    <option value="non-veg">Non-Veg</option>
                  </select>
                </div>
                <div className="modal-actions">
                  <button type="button" className="btn btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
                  <button type="submit" className="btn btn-primary" disabled={creating} data-testid="save-single-btn">{creating ? 'Creating (AI working)...' : 'Create Product'}</button>
                </div>
              </form>
            ) : (
              <form onSubmit={handleCreateReadyMade}>
                <h2>Add Ready-Made Meal</h2>
                <p style={{ fontSize: 12, color: '#9C9C9C', margin: '-4px 0 14px' }}>AI auto-generates description & nutrition from ingredients</p>
                <div className="form-group">
                  <label>Dish Name *</label>
                  <input value={rName} onChange={e => setRName(e.target.value)} placeholder="e.g. Grilled Chicken Bowl" required data-testid="meal-name" />
                </div>
                <div className="form-group">
                  <label>Category *</label>
                  <select value={rCatId} onChange={e => setRCatId(e.target.value)} required data-testid="meal-category">
                    <option value="">Select category</option>
                    {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label>Ingredients (per plate) *</label>
                  {rIngredients.map((ing, idx) => (
                    <div key={idx} style={{ display: 'flex', gap: 8, marginBottom: 6, alignItems: 'center' }}>
                      <input value={ing.name} onChange={e => updateIngredient(idx, 'name', e.target.value)} placeholder="Ingredient name" style={{ flex: 2 }} data-testid={`ing-name-${idx}`} />
                      <input type="number" value={ing.grams_per_serving || ''} onChange={e => updateIngredient(idx, 'grams_per_serving', e.target.value)} placeholder="grams" style={{ flex: 1 }} data-testid={`ing-grams-${idx}`} />
                      <span style={{ fontSize: 12, color: '#9C9C9C' }}>g</span>
                      {rIngredients.length > 1 && (
                        <button type="button" onClick={() => removeIngredient(idx)} style={{ width: 28, height: 28, borderRadius: 6, border: '1px solid #E0E0E0', background: '#FFF', cursor: 'pointer', color: '#E23744', fontWeight: 700 }}>×</button>
                      )}
                    </div>
                  ))}
                  <button type="button" className="btn btn-sm btn-secondary" onClick={addIngredient} data-testid="add-ingredient-btn">+ Add Ingredient</button>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div className="form-group">
                    <label>Price per plate (₹) *</label>
                    <input type="number" value={rPrice} onChange={e => setRPrice(e.target.value)} placeholder="200" required data-testid="meal-price" />
                  </div>
                  <div className="form-group">
                    <label>Serving grams</label>
                    <input type="number" value={rServingGrams} onChange={e => setRServingGrams(e.target.value)} placeholder="300" data-testid="meal-serving" />
                  </div>
                </div>
                <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input type="checkbox" checked={rEditable} onChange={e => setREditable(e.target.checked)} id="editable-toggle" data-testid="meal-editable" />
                  <label htmlFor="editable-toggle" style={{ margin: 0, fontSize: 13 }}>Allow customer to customize ingredients</label>
                </div>
                <div className="modal-actions">
                  <button type="button" className="btn btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
                  <button type="submit" className="btn btn-green" disabled={creating} data-testid="save-meal-btn">{creating ? 'Creating (AI working)...' : 'Create Meal'}</button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {editModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setEditModal(null)}>
          <div className="modal" style={{ maxWidth: 420 }}>
            <h2>Edit: {editModal.name}</h2>
            <p style={{ fontSize: 12, color: '#9C9C9C', margin: '-4px 0 14px' }}>
              <span className={`badge ${editModal.product_type === 'ready_made' ? 'badge-green' : 'badge-purple'}`}>{editModal.product_type === 'ready_made' ? 'Meal' : 'Single'}</span>
              &nbsp; Nutrition is auto-calculated — no manual edit needed
            </p>
            <form onSubmit={handleEdit}>
              {editModal.product_type !== 'ready_made' && (
                <>
                  <div className="form-group">
                    <label>Price per 100g (₹)</label>
                    <input type="number" step="0.01" value={editForm.cost_per_100g} onChange={e => setEditForm({ ...editForm, cost_per_100g: parseFloat(e.target.value) })} data-testid="edit-price" />
                  </div>
                  <div className="form-group">
                    <label>Stock (grams)</label>
                    <input type="number" value={editForm.available_qty_grams} onChange={e => setEditForm({ ...editForm, available_qty_grams: parseFloat(e.target.value) })} data-testid="edit-stock" />
                  </div>
                </>
              )}
              <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input type="checkbox" checked={editForm.is_active} onChange={e => setEditForm({ ...editForm, is_active: e.target.checked })} id="edit-active" data-testid="edit-active" />
                <label htmlFor="edit-active" style={{ margin: 0 }}>Active</label>
              </div>
              {/* Nutrition display (read-only) */}
              <div style={{ background: '#FAFAFA', borderRadius: 8, padding: 12, marginBottom: 14, border: '1px solid #EFEFEF' }}>
                <div style={{ fontSize: 11, color: '#9C9C9C', fontWeight: 600, marginBottom: 6 }}>NUTRITION (auto-calculated)</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 8, fontSize: 13 }}>
                  <div><strong>{editModal.calories_per_100g}</strong><br /><span style={{ fontSize: 10, color: '#9C9C9C' }}>cal/100g</span></div>
                  <div><strong>{editModal.protein_per_100g}g</strong><br /><span style={{ fontSize: 10, color: '#9C9C9C' }}>protein</span></div>
                  <div><strong>{editModal.carbs_per_100g}g</strong><br /><span style={{ fontSize: 10, color: '#9C9C9C' }}>carbs</span></div>
                  <div><strong>{editModal.fat_per_100g}g</strong><br /><span style={{ fontSize: 10, color: '#9C9C9C' }}>fat</span></div>
                </div>
              </div>
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setEditModal(null)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={editSaving} data-testid="save-edit-btn">{editSaving ? 'Saving...' : 'Update Product'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
