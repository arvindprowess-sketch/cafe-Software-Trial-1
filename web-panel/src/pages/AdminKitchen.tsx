import React, { useState, useEffect } from 'react';
import { api } from '../utils/api';

export default function AdminKitchen() {
  const [orders, setOrders] = useState<any[]>([]);
  const load = async () => { try { setOrders(await api('/orders/kitchen')); } catch {} };
  useEffect(() => { load(); const iv = setInterval(load, 10000); return () => clearInterval(iv); }, []);

  const updateStatus = async (id: string, status: string) => {
    try { await api(`/orders/${id}/status?status=${status}`, { method: 'PUT' }); load(); } catch (e: any) { alert(e.message); }
  };

  return (
    <div>
      <div className="page-header"><div><h1>Kitchen View</h1><p>{orders.length} active orders</p></div>
        <button className="btn btn-secondary" onClick={load}>Refresh</button>
      </div>
      {orders.length === 0 && <div className="empty-state"><div className="empty-icon">✅</div><h3>All caught up!</h3><p>No pending orders</p></div>}
      {orders.map(o => (
        <div className={`order-card ${o.priority === 'urgent' ? 'urgent' : o.priority === 'high' ? 'high' : ''}`} key={o.id}>
          <div className="order-header">
            <span className="order-id">#{o.id}</span>
            <span className={`badge ${o.status==='pending'?'badge-orange':o.status==='preparing'?'badge-purple':'badge-green'}`}>{o.status.toUpperCase()}</span>
          </div>
          <div className="order-meta"><span>{o.user_name}</span><span>{o.order_type}</span><span>₹{Math.round(o.total_price)}</span></div>
          <ul className="order-items">{o.items?.map((item: any, i: number) => <li key={i}><span>{item.product_name}</span><span>{item.grams}g</span></li>)}</ul>
          <div className="order-actions">
            {o.status === 'pending' && <button className="btn btn-sm btn-purple" onClick={() => updateStatus(o.id, 'preparing')}>Start Preparing</button>}
            {o.status === 'preparing' && <button className="btn btn-sm btn-green" onClick={() => updateStatus(o.id, 'ready')}>Mark Ready</button>}
            <button className="btn btn-sm btn-secondary" onClick={() => updateStatus(o.id, 'completed')}>Complete</button>
          </div>
        </div>
      ))}
    </div>
  );
}
