import React, { useState, useEffect, useRef } from 'react';
import { api } from '../utils/api';

type ProductTab = 'all' | 'single' | 'ready_made';
type FormType = 'single' | 'ready_made';
interface Ingredient { name: string; grams_per_serving: number; }

export default function AdminProducts() {
  const [products, setProducts] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [tab, setTab] = useState<ProductTab>('all');
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [formType, setFormType] = useState<FormType>('single');
  const [creating, setCreating] = useState(false);
  const [createdProduct, setCreatedProduct] = useState<any>(null);

  // Edit
  const [editModal, setEditModal] = useState<any>(null);
  const [editForm, setEditForm] = useState<any>({});
  const [editSaving, setEditSaving] = useState(false);

  // Single form
  const [sName, setSName] = useState('');
  const [sPrice, setSPrice] = useState('');
  const [sGrams, setSGrams] = useState('');
  const [sCatId, setSCatId] = useState('');
  const [sDiet, setSDiet] = useState('');
  const [sCal, setSCal] = useState('');
  const [sPro, setSPro] = useState('');
  const [sCarb, setSCarb] = useState('');
  const [sFat, setSFat] = useState('');
  const [sPrep, setSPrep] = useState('');

  // Ready-made form
  const [rName, setRName] = useState('');
  const [rPrice, setRPrice] = useState('');
  const [rServingGrams, setRServingGrams] = useState('300');
  const [rCatId, setRCatId] = useState('');
  const [rEditable, setREditable] = useState(false);
  const [rPrep, setRPrep] = useState('');
  const [rIngredients, setRIngredients] = useState<Ingredient[]>([{ name: '', grams_per_serving: 0 }]);
  const [rImages, setRImages] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    try {
      const [p, c] = await Promise.all([api('/products/all'), api('/categories/all')]);
      setProducts(p);
      setCategories(c.filter((cat: any) => cat.is_active !== false));
    } catch {}
  };
  useEffect(() => { load(); }, []);

  const filtered = (() => {
    let list = tab === 'all' ? products : products.filter(p => p.product_type === tab);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(p => p.name?.toLowerCase().includes(q) || p.category?.toLowerCase().includes(q));
    }
    return list;
  })();

  const resetForms = () => {
    setSName(''); setSPrice(''); setSGrams(''); setSCatId(''); setSDiet('');
    setSCal(''); setSPro(''); setSCarb(''); setSFat(''); setSPrep('');
    setRName(''); setRPrice(''); setRServingGrams('300'); setRCatId(''); setREditable(false); setRPrep('');
    setRIngredients([{ name: '', grams_per_serving: 0 }]); setRImages([]);
  };

  const openCreate = (type: FormType) => { resetForms(); setFormType(type); setCreatedProduct(null); setShowForm(true); };

  // Image upload
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    for (let i = 0; i < files.length; i++) {
      const reader = new FileReader();
      reader.onload = async (ev) => {
        const base64 = ev.target?.result as string;
        try {
          const res = await api('/upload/image', { method: 'POST', body: { image: base64 } });
          setRImages(prev => [...prev, res.url]);
        } catch {}
      };
      reader.readAsDataURL(files[i]);
    }
    e.target.value = '';
  };

  const handleCreateSingle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sName || !sPrice || !sGrams || !sCatId) { alert('Fill all required fields including category'); return; }
    setCreating(true);
    try {
      const result = await api('/products/single', { method: 'POST', body: {
        name: sName, price: parseFloat(sPrice), grams: parseFloat(sGrams), category_id: sCatId, diet_type: sDiet || undefined,
        calories_per_100g: sCal ? parseFloat(sCal) : undefined,
        protein_per_100g: sPro ? parseFloat(sPro) : undefined,
        carbs_per_100g: sCarb ? parseFloat(sCarb) : undefined,
        fat_per_100g: sFat ? parseFloat(sFat) : undefined,
        preparation_time_minutes: sPrep ? parseInt(sPrep) : undefined,
      } });
      setCreatedProduct(result);
      load();
    } catch (e: any) { alert(e.message); } finally { setCreating(false); }
  };

  const handleCreateReadyMade = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rName || !rPrice || !rCatId) { alert('Fill all required fields including category'); return; }
    const validIng = rIngredients.filter(i => i.name.trim() && i.grams_per_serving > 0);
    if (validIng.length === 0) { alert('Add at least one ingredient'); return; }
    setCreating(true);
    try {
      const result = await api('/products/ready-made', { method: 'POST', body: { name: rName, price: parseFloat(rPrice), serving_grams: parseFloat(rServingGrams) || 300, ingredients: validIng, is_editable: rEditable, category_id: rCatId, images: rImages, preparation_time_minutes: rPrep ? parseInt(rPrep) : undefined } });
      setCreatedProduct(result);
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
    setEditForm({
      cost_per_100g: p.cost_per_100g || '',
      fixed_price: p.fixed_price || '',
      available_qty_grams: p.available_qty_grams || '',
      available_servings: p.available_servings || 20,
      category_id: categories.find(c => c.name === p.category)?.id || '',
      is_active: p.is_active !== false,
      is_editable: p.is_editable || false,
      calories_per_100g: p.calories_per_100g ?? '',
      protein_per_100g: p.protein_per_100g ?? '',
      carbs_per_100g: p.carbs_per_100g ?? '',
      fat_per_100g: p.fat_per_100g ?? '',
      preparation_time_minutes: p.preparation_time_minutes ?? '',
    });
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editModal) return;
    setEditSaving(true);
    try {
      const body: any = {};
      const isRM = editModal.product_type === 'ready_made';
      if (!isRM && editForm.cost_per_100g && parseFloat(editForm.cost_per_100g) !== editModal.cost_per_100g) body.cost_per_100g = parseFloat(editForm.cost_per_100g);
      if (!isRM && editForm.available_qty_grams && parseFloat(editForm.available_qty_grams) !== editModal.available_qty_grams) body.available_qty_grams = parseFloat(editForm.available_qty_grams);
      if (isRM && editForm.fixed_price && parseFloat(editForm.fixed_price) !== editModal.fixed_price) body.fixed_price = parseFloat(editForm.fixed_price);
      if (isRM && editForm.available_servings && parseInt(editForm.available_servings) !== editModal.available_servings) body.available_servings = parseInt(editForm.available_servings);
      if (isRM && editForm.is_editable !== editModal.is_editable) body.is_editable = editForm.is_editable;
      if (editForm.category_id) {
        const origCatId = categories.find(c => c.name === editModal.category)?.id;
        if (editForm.category_id !== origCatId) body.category_id = editForm.category_id;
      }
      if (editForm.is_active !== (editModal.is_active !== false)) body.is_active = editForm.is_active;
      // B1 + B5: editable nutrition & prep time
      ['calories_per_100g', 'protein_per_100g', 'carbs_per_100g', 'fat_per_100g'].forEach((f) => {
        if (editForm[f] !== '' && parseFloat(editForm[f]) !== editModal[f]) body[f] = parseFloat(editForm[f]);
      });
      if (editForm.preparation_time_minutes !== '' && parseInt(editForm.preparation_time_minutes) !== editModal.preparation_time_minutes) {
        body.preparation_time_minutes = parseInt(editForm.preparation_time_minutes);
      }
      if (Object.keys(body).length > 0) await api(`/products/${editModal.id}`, { method: 'PUT', body });
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

      {/* Search + Tabs */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 14, alignItems: 'center' }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search products..." data-testid="product-search"
          style={{ flex: 1, maxWidth: 300, padding: '10px 14px', borderRadius: 10, border: '2px solid #E8E8E8', fontSize: 14, outline: 'none' }} />
        <div style={{ display: 'flex', gap: 4, background: '#F0F0F0', borderRadius: 10, padding: 3, flex: 1 }} data-testid="product-tabs">
          {([['all', 'All'], ['single', 'Single'], ['ready_made', 'Meals']] as [ProductTab, string][]).map(([key, label]) => (
            <button key={key} style={{ flex: 1, padding: '8px 12px', borderRadius: 8, border: 'none', fontWeight: tab === key ? 700 : 500, background: tab === key ? '#1C1C2E' : 'transparent', color: tab === key ? '#FFF' : '#696969', cursor: 'pointer', fontSize: 13 }}
              onClick={() => setTab(key)} data-testid={`tab-${key}`}>{label} ({key === 'all' ? products.length : products.filter(p => p.product_type === key).length})</button>
          ))}
        </div>
      </div>

      {/* Products Table */}
      <table className="data-table" data-testid="products-table">
        <thead><tr><th>Product</th><th>Type</th><th>Category</th><th>Diet</th><th>Price</th><th>Stock</th><th>Status</th><th style={{ width: 180 }}>Actions</th></tr></thead>
        <tbody>
          {filtered.map(p => (
            <tr key={p.id} data-testid={`product-row-${p.id}`}>
              <td>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  {p.image_url ? <img src={p.image_url} alt="" style={{ width: 40, height: 40, borderRadius: 8, objectFit: 'cover' }} /> :
                    <div style={{ width: 40, height: 40, borderRadius: 8, background: '#F5F5F5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#CCC" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>
                    </div>
                  }
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{p.name}</div>
                    {p.description && <div style={{ fontSize: 11, color: '#9C9C9C', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.description}</div>}
                  </div>
                </div>
              </td>
              <td><span className={`badge ${p.product_type === 'ready_made' ? 'badge-green' : 'badge-purple'}`}>{p.product_type === 'ready_made' ? 'Meal' : 'Single'}</span></td>
              <td><span className="badge badge-purple">{p.category || '—'}</span></td>
              <td><span className={`badge ${p.diet_type === 'non-veg' ? 'badge-red' : 'badge-green'}`} style={{ fontSize: 11 }}>{p.diet_type}</span></td>
              <td style={{ fontWeight: 700, fontSize: 14 }}>{p.product_type === 'ready_made' ? `₹${p.fixed_price}` : `₹${p.cost_per_100g}/100g`}</td>
              <td style={{ fontSize: 13 }}>
                {p.product_type === 'ready_made'
                  ? <span>{p.available_servings ?? 20} plates</span>
                  : <span style={{ color: (p.available_qty_grams || 0) < 500 ? '#E23744' : '#267E3E', fontWeight: 600 }}>
                      {p.available_qty_grams >= 1000 ? `${(p.available_qty_grams / 1000).toFixed(1)}kg` : `${Math.round(p.available_qty_grams || 0)}g`}
                    </span>
                }
              </td>
              <td><span className={`badge ${p.is_active !== false ? 'badge-green' : 'badge-gray'}`}>{p.is_active !== false ? 'Live' : 'Hidden'}</span></td>
              <td>
                <div style={{ display: 'flex', gap: 4 }}>
                  <button className="btn btn-sm btn-secondary" onClick={() => openEdit(p)} data-testid={`edit-${p.id}`}>Edit</button>
                  <button className="btn btn-sm btn-secondary" onClick={() => toggleActive(p.id, p.is_active !== false)} data-testid={`toggle-${p.id}`}>{p.is_active !== false ? 'Hide' : 'Show'}</button>
                  <button className="btn btn-sm btn-danger" onClick={() => deleteProduct(p.id)} style={{ padding: '4px 8px' }} data-testid={`delete-${p.id}`}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {filtered.length === 0 && <div style={{ textAlign: 'center', padding: 40, color: '#9C9C9C' }}>No products found{search ? ` for "${search}"` : ''}</div>}

      {/* ===== CREATE FORM MODAL ===== */}
      {showForm && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && !creating && setShowForm(false)}>
          <div className="modal" style={{ maxWidth: 560 }}>
            {createdProduct ? (
              /* ===== AI Result Preview ===== */
              <div data-testid="ai-result">
                <div style={{ textAlign: 'center', marginBottom: 16 }}>
                  <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#E8F5E9', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 10px' }}>
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#267E3E" strokeWidth="2.5"><path d="M20 6L9 17l-5-5"/></svg>
                  </div>
                  <h2 style={{ margin: 0 }}>Product Created!</h2>
                  <p style={{ color: '#9C9C9C', fontSize: 13 }}>AI auto-generated the following</p>
                </div>
                <div style={{ display: 'flex', gap: 14, marginBottom: 16 }}>
                  {createdProduct.image_url && <img src={createdProduct.image_url} style={{ width: 80, height: 80, borderRadius: 12, objectFit: 'cover' }} />}
                  <div>
                    <div style={{ fontWeight: 800, fontSize: 18 }}>{createdProduct.name}</div>
                    <div style={{ fontSize: 13, color: '#696969', marginTop: 2 }}>{createdProduct.description}</div>
                    <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                      <span className="badge badge-purple">{createdProduct.category}</span>
                      <span className={`badge ${createdProduct.diet_type === 'non-veg' ? 'badge-red' : 'badge-green'}`}>{createdProduct.diet_type}</span>
                    </div>
                  </div>
                </div>
                <div style={{ background: '#FAFAFA', borderRadius: 10, padding: 14, border: '1px solid #EFEFEF' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#9C9C9C', marginBottom: 8 }}>AI-CALCULATED NUTRITION (per 100g)</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, textAlign: 'center' }}>
                    <div><div style={{ fontSize: 22, fontWeight: 800, color: '#FF9F0A' }}>{createdProduct.calories_per_100g}</div><div style={{ fontSize: 10, color: '#9C9C9C' }}>Calories</div></div>
                    <div><div style={{ fontSize: 22, fontWeight: 800, color: '#E23744' }}>{createdProduct.protein_per_100g}g</div><div style={{ fontSize: 10, color: '#9C9C9C' }}>Protein</div></div>
                    <div><div style={{ fontSize: 22, fontWeight: 800, color: '#267E3E' }}>{createdProduct.carbs_per_100g}g</div><div style={{ fontSize: 10, color: '#9C9C9C' }}>Carbs</div></div>
                    <div><div style={{ fontSize: 22, fontWeight: 800, color: '#5B5FE0' }}>{createdProduct.fat_per_100g}g</div><div style={{ fontSize: 10, color: '#9C9C9C' }}>Fat</div></div>
                  </div>
                </div>
                <div className="modal-actions" style={{ marginTop: 16 }}>
                  <button className="btn btn-primary" onClick={() => { setShowForm(false); setCreatedProduct(null); }} data-testid="done-btn" style={{ width: '100%' }}>Done — Product is LIVE</button>
                </div>
              </div>
            ) : (
              <>
                <div style={{ display: 'flex', gap: 4, marginBottom: 16, background: '#F0F0F0', borderRadius: 8, padding: 3 }}>
                  <button type="button" style={{ flex: 1, padding: '10px 12px', borderRadius: 6, border: 'none', fontWeight: formType === 'single' ? 700 : 500, background: formType === 'single' ? '#5B5FE0' : 'transparent', color: formType === 'single' ? '#FFF' : '#696969', cursor: 'pointer' }} onClick={() => setFormType('single')}>Single Product</button>
                  <button type="button" style={{ flex: 1, padding: '10px 12px', borderRadius: 6, border: 'none', fontWeight: formType === 'ready_made' ? 700 : 500, background: formType === 'ready_made' ? '#267E3E' : 'transparent', color: formType === 'ready_made' ? '#FFF' : '#696969', cursor: 'pointer' }} onClick={() => setFormType('ready_made')}>Ready-Made Meal</button>
                </div>

                {formType === 'single' ? (
                  <form onSubmit={handleCreateSingle}>
                    <h2>Add Single Product</h2>
                    <p style={{ fontSize: 12, color: '#9C9C9C', margin: '-4px 0 14px' }}>AI auto-calculates nutrition, generates image & description</p>
                    <div className="form-group"><label>Product Name *</label><input value={sName} onChange={e => setSName(e.target.value)} placeholder="e.g. Chicken Breast" required data-testid="single-name" /></div>
                    <div className="form-group"><label>Category *</label>
                      <select value={sCatId} onChange={e => setSCatId(e.target.value)} required data-testid="single-category"><option value="">Select category</option>{categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                      <div className="form-group"><label>Price (₹) *</label><input type="number" value={sPrice} onChange={e => setSPrice(e.target.value)} placeholder="450" required data-testid="single-price" /></div>
                      <div className="form-group"><label>Stock (grams) *</label><input type="number" value={sGrams} onChange={e => setSGrams(e.target.value)} placeholder="5000" required data-testid="single-grams" /></div>
                    </div>
                    <div className="form-group"><label>Diet Type</label>
                      <select value={sDiet} onChange={e => setSDiet(e.target.value)} data-testid="single-diet"><option value="">Auto-detect</option><option value="veg">Veg</option><option value="non-veg">Non-Veg</option></select>
                    </div>
                    <div style={{ background: '#FAFAFA', borderRadius: 10, padding: 12, marginBottom: 12, border: '1px solid #EFEFEF' }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: '#9C9C9C', marginBottom: 8 }}>NUTRITION per 100g (optional — leave blank for auto)</div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
                        <div className="form-group" style={{ margin: 0 }}><label>Cal</label><input type="number" value={sCal} onChange={e => setSCal(e.target.value)} placeholder="auto" data-testid="single-cal" /></div>
                        <div className="form-group" style={{ margin: 0 }}><label>Protein</label><input type="number" value={sPro} onChange={e => setSPro(e.target.value)} placeholder="auto" data-testid="single-protein" /></div>
                        <div className="form-group" style={{ margin: 0 }}><label>Carbs</label><input type="number" value={sCarb} onChange={e => setSCarb(e.target.value)} placeholder="auto" data-testid="single-carbs" /></div>
                        <div className="form-group" style={{ margin: 0 }}><label>Fat</label><input type="number" value={sFat} onChange={e => setSFat(e.target.value)} placeholder="auto" data-testid="single-fat" /></div>
                      </div>
                    </div>
                    <div className="form-group"><label>Preparation time (minutes)</label><input type="number" value={sPrep} onChange={e => setSPrep(e.target.value)} placeholder="8" data-testid="single-prep" /></div>
                    <div className="modal-actions">
                      <button type="button" className="btn btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
                      <button type="submit" className="btn btn-primary" disabled={creating} data-testid="save-single-btn">{creating ? 'Creating... AI is working' : 'Create Product'}</button>
                    </div>
                    {creating && <div style={{ textAlign: 'center', padding: 12, color: '#5B5FE0', fontSize: 13 }}><div className="spinner" /> Generating nutrition, description & image...</div>}
                  </form>
                ) : (
                  <form onSubmit={handleCreateReadyMade}>
                    <h2>Add Ready-Made Meal</h2>
                    <p style={{ fontSize: 12, color: '#9C9C9C', margin: '-4px 0 14px' }}>AI auto-generates description & nutrition from ingredients</p>
                    <div className="form-group"><label>Dish Name *</label><input value={rName} onChange={e => setRName(e.target.value)} placeholder="e.g. Grilled Chicken Bowl" required data-testid="meal-name" /></div>
                    <div className="form-group"><label>Category *</label>
                      <select value={rCatId} onChange={e => setRCatId(e.target.value)} required data-testid="meal-category"><option value="">Select category</option>{categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
                    </div>
                    {/* Ingredients */}
                    <div className="form-group">
                      <label>Ingredients per plate *</label>
                      {rIngredients.map((ing, idx) => (
                        <div key={idx} style={{ display: 'flex', gap: 8, marginBottom: 6, alignItems: 'center' }}>
                          <input value={ing.name} onChange={e => updateIngredient(idx, 'name', e.target.value)} placeholder="Ingredient" style={{ flex: 2 }} data-testid={`ing-name-${idx}`} />
                          <input type="number" value={ing.grams_per_serving || ''} onChange={e => updateIngredient(idx, 'grams_per_serving', e.target.value)} placeholder="g" style={{ flex: 1 }} data-testid={`ing-grams-${idx}`} />
                          <span style={{ fontSize: 12, color: '#9C9C9C', width: 12 }}>g</span>
                          {rIngredients.length > 1 && <button type="button" onClick={() => removeIngredient(idx)} style={{ width: 28, height: 28, borderRadius: 6, border: '1px solid #E0E0E0', background: '#FFF', cursor: 'pointer', color: '#E23744', fontWeight: 700, lineHeight: '26px', textAlign: 'center' }}>×</button>}
                        </div>
                      ))}
                      <button type="button" className="btn btn-sm btn-secondary" onClick={addIngredient} data-testid="add-ingredient-btn">+ Add Ingredient</button>
                    </div>
                    {/* Photos */}
                    <div className="form-group">
                      <label>Photos</label>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                        {rImages.map((img, idx) => (
                          <div key={idx} style={{ position: 'relative' }}>
                            <img src={img} style={{ width: 64, height: 64, borderRadius: 8, objectFit: 'cover' }} />
                            <button type="button" onClick={() => setRImages(rImages.filter((_, i) => i !== idx))} style={{ position: 'absolute', top: -6, right: -6, width: 20, height: 20, borderRadius: '50%', background: '#E23744', color: '#FFF', border: 'none', cursor: 'pointer', fontSize: 12, lineHeight: '18px' }}>×</button>
                          </div>
                        ))}
                        <button type="button" onClick={() => fileInputRef.current?.click()} style={{ width: 64, height: 64, borderRadius: 8, border: '2px dashed #D0D0D0', background: '#FAFAFA', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9C9C9C' }} data-testid="upload-photos-btn">
                          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                        </button>
                        <input ref={fileInputRef} type="file" accept="image/*" multiple onChange={handleImageUpload} style={{ display: 'none' }} />
                      </div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                      <div className="form-group"><label>Price per plate (₹) *</label><input type="number" value={rPrice} onChange={e => setRPrice(e.target.value)} placeholder="200" required data-testid="meal-price" /></div>
                      <div className="form-group"><label>Serving (grams)</label><input type="number" value={rServingGrams} onChange={e => setRServingGrams(e.target.value)} placeholder="300" data-testid="meal-serving" /></div>
                    </div>
                    <div className="form-group"><label>Preparation time (minutes)</label><input type="number" value={rPrep} onChange={e => setRPrep(e.target.value)} placeholder="15" data-testid="meal-prep" /></div>
                    <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <input type="checkbox" checked={rEditable} onChange={e => setREditable(e.target.checked)} id="editable-toggle" data-testid="meal-editable" />
                      <label htmlFor="editable-toggle" style={{ margin: 0, fontSize: 13 }}>Allow customers to customize ingredients</label>
                    </div>
                    <div className="modal-actions">
                      <button type="button" className="btn btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
                      <button type="submit" className="btn btn-green" disabled={creating} data-testid="save-meal-btn">{creating ? 'Creating... AI is working' : 'Create Meal'}</button>
                    </div>
                    {creating && <div style={{ textAlign: 'center', padding: 12, color: '#267E3E', fontSize: 13 }}>Generating nutrition, description & metadata...</div>}
                  </form>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* ===== EDIT MODAL ===== */}
      {editModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setEditModal(null)}>
          <div className="modal" style={{ maxWidth: 480 }}>
            <div style={{ display: 'flex', gap: 12, marginBottom: 14, alignItems: 'center' }}>
              {editModal.image_url && <img src={editModal.image_url} style={{ width: 56, height: 56, borderRadius: 10, objectFit: 'cover' }} />}
              <div>
                <h2 style={{ margin: 0 }}>{editModal.name}</h2>
                <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                  <span className={`badge ${editModal.product_type === 'ready_made' ? 'badge-green' : 'badge-purple'}`}>{editModal.product_type === 'ready_made' ? 'Meal' : 'Single'}</span>
                  <span className={`badge ${editModal.diet_type === 'non-veg' ? 'badge-red' : 'badge-green'}`}>{editModal.diet_type}</span>
                </div>
              </div>
            </div>
            <form onSubmit={handleEdit}>
              {/* Category Change */}
              <div className="form-group">
                <label>Category</label>
                <select value={editForm.category_id} onChange={e => setEditForm({ ...editForm, category_id: e.target.value })} data-testid="edit-category">
                  <option value="">— Keep current ({editModal.category}) —</option>
                  {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>

              {editModal.product_type === 'ready_made' ? (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div className="form-group"><label>Price per plate (₹)</label><input type="number" step="0.01" value={editForm.fixed_price} onChange={e => setEditForm({ ...editForm, fixed_price: e.target.value })} data-testid="edit-fixed-price" /></div>
                    <div className="form-group"><label>Available plates</label><input type="number" value={editForm.available_servings} onChange={e => setEditForm({ ...editForm, available_servings: e.target.value })} data-testid="edit-servings" /></div>
                  </div>
                  <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input type="checkbox" checked={editForm.is_editable} onChange={e => setEditForm({ ...editForm, is_editable: e.target.checked })} id="edit-editable" data-testid="edit-editable" />
                    <label htmlFor="edit-editable" style={{ margin: 0, fontSize: 13 }}>Customizable by customer</label>
                  </div>
                  {editModal.ingredients && (
                    <div style={{ background: '#FAFAFA', borderRadius: 8, padding: 12, marginBottom: 14, border: '1px solid #EFEFEF' }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: '#9C9C9C', marginBottom: 6 }}>INGREDIENTS PER PLATE</div>
                      {editModal.ingredients.map((ing: any, i: number) => (
                        <div key={i} style={{ fontSize: 13, padding: '3px 0' }}>{ing.name}: <strong>{ing.grams_per_serving}g</strong></div>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div className="form-group"><label>Price per 100g (₹)</label><input type="number" step="0.01" value={editForm.cost_per_100g} onChange={e => setEditForm({ ...editForm, cost_per_100g: e.target.value })} data-testid="edit-price" /></div>
                  <div className="form-group"><label>Stock (grams)</label><input type="number" value={editForm.available_qty_grams} onChange={e => setEditForm({ ...editForm, available_qty_grams: e.target.value })} data-testid="edit-stock" /></div>
                </div>
              )}

              <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input type="checkbox" checked={editForm.is_active} onChange={e => setEditForm({ ...editForm, is_active: e.target.checked })} id="edit-active" data-testid="edit-active" />
                <label htmlFor="edit-active" style={{ margin: 0 }}>Active (visible to customers & cashier)</label>
              </div>

              {/* Nutrition (editable — B1) */}
              <div style={{ background: '#FAFAFA', borderRadius: 10, padding: 12, marginBottom: 14, border: '1px solid #EFEFEF' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#9C9C9C', marginBottom: 8 }}>NUTRITION per 100g (editable — leave as-is to keep)</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
                  <div className="form-group" style={{ margin: 0 }}><label style={{ color: '#FF9F0A' }}>Cal</label><input type="number" value={editForm.calories_per_100g} onChange={e => setEditForm({ ...editForm, calories_per_100g: e.target.value })} data-testid="edit-cal" /></div>
                  <div className="form-group" style={{ margin: 0 }}><label style={{ color: '#E23744' }}>Protein</label><input type="number" value={editForm.protein_per_100g} onChange={e => setEditForm({ ...editForm, protein_per_100g: e.target.value })} data-testid="edit-protein" /></div>
                  <div className="form-group" style={{ margin: 0 }}><label style={{ color: '#267E3E' }}>Carbs</label><input type="number" value={editForm.carbs_per_100g} onChange={e => setEditForm({ ...editForm, carbs_per_100g: e.target.value })} data-testid="edit-carbs" /></div>
                  <div className="form-group" style={{ margin: 0 }}><label style={{ color: '#5B5FE0' }}>Fat</label><input type="number" value={editForm.fat_per_100g} onChange={e => setEditForm({ ...editForm, fat_per_100g: e.target.value })} data-testid="edit-fat" /></div>
                </div>
                <div className="form-group" style={{ marginTop: 10, marginBottom: 0 }}><label>Preparation time (minutes)</label><input type="number" value={editForm.preparation_time_minutes} onChange={e => setEditForm({ ...editForm, preparation_time_minutes: e.target.value })} data-testid="edit-prep" /></div>
              </div>

              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setEditModal(null)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={editSaving} data-testid="save-edit-btn">{editSaving ? 'Saving...' : 'Update Product'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <style>{`
        .spinner { width: 20px; height: 20px; border: 3px solid #E0E0E0; border-top-color: #5B5FE0; border-radius: 50%; display: inline-block; animation: spin 0.8s linear infinite; vertical-align: middle; margin-right: 8px; }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
