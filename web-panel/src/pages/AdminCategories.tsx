import React, { useState, useEffect } from 'react';
import { api } from '../utils/api';

export default function AdminCategories() {
  const [categories, setCategories] = useState<any[]>([]);
  const load = async () => { try { setCategories(await api('/categories/all')); } catch {} };
  useEffect(() => { load(); }, []);

  const seedDefaults = async () => {
    try { const r = await api('/categories/seed-defaults', { method: 'POST' }); alert(r.message); load(); } catch (e: any) { alert(e.message); }
  };

  return (
    <div>
      <div className="page-header"><div><h1>Categories</h1><p>{categories.length} categories</p></div>
        <button className="btn btn-secondary" onClick={seedDefaults} data-testid="seed-categories-btn">Seed Defaults</button>
      </div>
      <table className="data-table">
        <thead><tr><th>Name</th><th>Key</th><th>Label</th><th>Icon</th><th>Color</th><th>Order</th><th>Status</th></tr></thead>
        <tbody>
          {categories.map(c => (
            <tr key={c.id}>
              <td style={{fontWeight:600}}>{c.name}</td><td>{c.key}</td><td>{c.label}</td>
              <td>{c.icon}</td><td><span style={{display:'inline-block',width:16,height:16,borderRadius:4,background:c.color,verticalAlign:'middle'}} /> {c.color}</td>
              <td>{c.sort_order}</td><td><span className={`badge ${c.is_active!==false?'badge-green':'badge-gray'}`}>{c.is_active!==false?'Active':'Inactive'}</span></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
