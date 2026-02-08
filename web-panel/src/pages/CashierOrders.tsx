import React, { useState, useEffect } from 'react';
import { api } from '../utils/api';

const STATUS_COLORS: Record<string,string> = { pending:'badge-orange', preparing:'badge-purple', ready:'badge-green', completed:'badge-gray', cancelled:'badge-red' };

export default function CashierOrders() {
  const [orders, setOrders] = useState<any[]>([]);
  useEffect(() => { (async () => { try { setOrders(await api('/orders')); } catch {} })(); }, []);

  return (
    <div>
      <div className="page-header"><div><h1>Recent Orders</h1><p>{orders.length} orders</p></div></div>
      {orders.length === 0 && <div className="empty-state"><div className="empty-icon">📋</div><h3>No orders yet</h3><p>Orders placed from POS will appear here</p></div>}
      <table className="data-table">
        <thead><tr><th>Order #</th><th>Type</th><th>Items</th><th>Total</th><th>Calories</th><th>Status</th><th>Time</th></tr></thead>
        <tbody>
          {orders.map(o => (
            <tr key={o.id}>
              <td style={{fontWeight:800}}>#{o.id}</td>
              <td><span className="badge badge-purple">{o.order_type}</span></td>
              <td>{o.items?.map((i: any) => i.product_name).join(', ')}</td>
              <td style={{fontWeight:700}}>₹{Math.round(o.total_price)}</td>
              <td>{Math.round(o.total_calories)} cal</td>
              <td><span className={`badge ${STATUS_COLORS[o.status]||'badge-gray'}`}>{o.status}</span></td>
              <td style={{fontSize:12,color:'#9C9C9C'}}>{new Date(o.created_at).toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
