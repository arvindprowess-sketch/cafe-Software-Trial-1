import React, { useState, useEffect } from 'react';
import { api } from '../utils/api';

export default function KitchenOrders() {
  const [orders, setOrders] = useState<any[]>([]);
  const load = async () => {
    try {
      const data = await api('/orders/kitchen');
      const pOrder: Record<string, number> = { urgent: 0, high: 1, normal: 2 };
      data.sort((a: any, b: any) => (pOrder[a.priority||'normal']??2) - (pOrder[b.priority||'normal']??2));
      setOrders(data);
    } catch {}
  };
  useEffect(() => { load(); const iv = setInterval(load, 10000); return () => clearInterval(iv); }, []);

  const updateStatus = async (id: string, status: string) => {
    try { await api(`/orders/${id}/status?status=${status}`, { method: 'PUT' }); load(); } catch (e: any) { alert(e.message); }
  };

  const setPriority = async (id: string, priority: string) => {
    try { await api(`/orders/${id}/priority`, { method: 'PUT', body: { priority } }); load(); } catch (e: any) { alert(e.message); }
  };

  const timeSince = (d: string) => { const m = Math.floor((Date.now()-new Date(d).getTime())/60000); return m<1?'Just now':m<60?`${m}m ago`:`${Math.floor(m/60)}h ${m%60}m`; };

  return (
    <div>
      <div className="page-header" style={{marginBottom:16}}>
        <div><h1>Orders</h1><p>{orders.length} active</p></div>
        <button className="btn btn-secondary" onClick={load}>Refresh</button>
      </div>
      {orders.length === 0 && <div className="empty-state"><div className="empty-icon">✅</div><h3>All caught up!</h3><p>No pending orders right now</p></div>}
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(380px,1fr))',gap:14}}>
        {orders.map(o => {
          const p = o.priority || 'normal';
          return (
            <div className={`order-card ${p==='urgent'?'urgent':p==='high'?'high':''}`} key={o.id}>
              <div className="order-header">
                <span className="order-id">#{o.id}</span>
                <span className={`badge ${o.status==='pending'?'badge-orange':o.status==='preparing'?'badge-purple':'badge-green'}`}>{o.status.toUpperCase()}</span>
              </div>
              <div className="order-meta"><span>{o.user_name}</span><span>{timeSince(o.created_at)}</span><span className="badge badge-purple">{o.order_type}</span></div>
              <div className="priority-btns">
                {['normal','high','urgent'].map(pr => (
                  <button key={pr} className={`priority-btn ${p===pr?`active-${pr}`:''}`} onClick={() => setPriority(o.id, pr)} data-testid={`priority-${pr}-${o.id}`}>
                    {pr === 'urgent' ? '🔴' : pr === 'high' ? '🟠' : '⚪'} {pr}
                  </button>
                ))}
              </div>
              <ul className="order-items">{o.items?.map((item: any, i: number) => (
                <li key={i}><span style={{fontWeight:600}}>{item.product_name}</span><span>{item.product_type==='ready_made'?`x${item.quantity||1}`:`${item.grams}g`}</span></li>
              ))}</ul>
              <div className="order-actions">
                {o.status === 'pending' && <button className="btn btn-sm btn-purple" onClick={() => updateStatus(o.id, 'preparing')} data-testid={`start-${o.id}`}>Start Preparing</button>}
                {o.status === 'preparing' && <button className="btn btn-sm btn-green" onClick={() => updateStatus(o.id, 'ready')} data-testid={`ready-${o.id}`}>Mark Ready</button>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
