import React, { useState, useEffect } from 'react';
import { api } from '../utils/api';

export default function KitchenInventory() {
  const [inventory, setInventory] = useState<any[]>([]);
  const load = async () => {
    try {
      const data = await api('/inventory');
      const order: Record<string, number> = { out_of_stock: 0, low: 1, in_stock: 2 };
      data.sort((a: any, b: any) => (order[a.status]??2) - (order[b.status]??2));
      setInventory(data);
    } catch {}
  };
  useEffect(() => { load(); }, []);

  const counts = { total: inventory.length, inStock: inventory.filter(i=>i.status==='in_stock').length, low: inventory.filter(i=>i.status==='low').length, out: inventory.filter(i=>i.status==='out_of_stock').length };
  const colors: Record<string,string> = { in_stock: '#267E3E', low: '#FF9F0A', out_of_stock: '#E23744' };
  const labels: Record<string,string> = { in_stock: 'In Stock', low: 'Low', out_of_stock: 'Out' };

  return (
    <div>
      <div className="page-header"><div><h1>Inventory</h1><p>{counts.total} items</p></div>
        <button className="btn btn-secondary" onClick={load}>Refresh</button>
      </div>
      <div className="stats-grid" style={{marginBottom:20}}>
        <div className="stat-card"><div className="stat-icon" style={{background:'#267E3E15'}}>✅</div><div className="stat-value" style={{color:'#267E3E'}}>{counts.inStock}</div><div className="stat-label">In Stock</div></div>
        <div className="stat-card"><div className="stat-icon" style={{background:'#FF9F0A15'}}>⚠️</div><div className="stat-value" style={{color:'#FF9F0A'}}>{counts.low}</div><div className="stat-label">Low Stock</div></div>
        <div className="stat-card"><div className="stat-icon" style={{background:'#E2374415'}}>❌</div><div className="stat-value" style={{color:'#E23744'}}>{counts.out}</div><div className="stat-label">Out of Stock</div></div>
      </div>
      <div className="inventory-grid">
        {inventory.map(item => (
          <div className="inv-card" key={item.id}>
            <div className="inv-dot" style={{background:colors[item.status]||'#9C9C9C'}} />
            <div className="inv-info">
              <div className="inv-name">{item.name}</div>
              <div className="inv-meta">{item.category} · {item.diet_type==='non-veg'?'Non-Veg':'Veg'}</div>
            </div>
            <div className="inv-stock">
              <div className="inv-qty" style={{color:colors[item.status]}}>{item.available_qty_grams>=1000?`${(item.available_qty_grams/1000).toFixed(1)}kg`:`${Math.round(item.available_qty_grams)}g`}</div>
              <span className={`badge ${item.status==='in_stock'?'badge-green':item.status==='low'?'badge-orange':'badge-red'}`}>{labels[item.status]}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
