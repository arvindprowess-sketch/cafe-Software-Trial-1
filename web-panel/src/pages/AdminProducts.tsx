import React, { useState, useEffect } from 'react';
import { api } from '../utils/api';

export default function AdminProducts() {
  const [products, setProducts] = useState<any[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [name, setName] = useState(''); const [price, setPrice] = useState('');

  const load = async () => { try { setProducts(await api('/products/all')); } catch {} };
  useEffect(() => { load(); }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api('/products', { method: 'POST', body: { name, cost_per_100g: parseFloat(price) } });
      setShowModal(false); setName(''); setPrice(''); load();
    } catch (err: any) { alert(err.message); }
  };

  const toggleActive = async (id: string, active: boolean) => {
    try { await api(`/products/${id}`, { method: 'PUT', body: { is_active: !active } }); load(); } catch {}
  };

  const deleteProduct = async (id: string) => {
    if (!confirm('Delete this product?')) return;
    try { await api(`/products/${id}`, { method: 'DELETE' }); load(); } catch (err: any) { alert(err.message); }
  };

  return (
    <div>
      <div className="page-header">
        <div><h1>Products</h1><p>{products.length} items</p></div>
        <button className="btn btn-primary" onClick={() => setShowModal(true)} data-testid="add-product-btn">+ Add Product</button>
      </div>

      <table className="data-table">
        <thead><tr><th>Name</th><th>Category</th><th>Diet</th><th>Price/100g</th><th>Stock</th><th>Status</th><th>Actions</th></tr></thead>
        <tbody>
          {products.map(p => (
            <tr key={p.id}>
              <td style={{fontWeight:600}}>{p.name}</td>
              <td><span className="badge badge-purple">{p.category}</span></td>
              <td><span className={`badge ${p.diet_type==='non-veg'?'badge-red':'badge-green'}`}>{p.diet_type}</span></td>
              <td>₹{p.cost_per_100g}</td>
              <td>{p.available_qty_grams >= 1000 ? `${(p.available_qty_grams/1000).toFixed(1)}kg` : `${Math.round(p.available_qty_grams)}g`}</td>
              <td><span className={`badge ${p.is_active?'badge-green':'badge-gray'}`}>{p.is_active?'Active':'Inactive'}</span></td>
              <td>
                <div style={{display:'flex',gap:6}}>
                  <button className="btn btn-sm btn-secondary" onClick={() => toggleActive(p.id, p.is_active)} data-testid={`toggle-${p.id}`}>{p.is_active?'Disable':'Enable'}</button>
                  <button className="btn btn-sm btn-danger" onClick={() => deleteProduct(p.id)} data-testid={`delete-${p.id}`}>Delete</button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {showModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowModal(false)}>
          <div className="modal">
            <h2>Add Product</h2>
            <form onSubmit={handleCreate}>
              <div className="form-group"><label>Name</label><input value={name} onChange={e => setName(e.target.value)} placeholder="Chicken Breast" data-testid="product-name-input" required /></div>
              <div className="form-group"><label>Price per 100g (₹)</label><input type="number" value={price} onChange={e => setPrice(e.target.value)} placeholder="60" data-testid="product-price-input" required /></div>
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" data-testid="save-product-btn">Create</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
