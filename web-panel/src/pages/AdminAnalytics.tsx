import React, { useState, useEffect } from 'react';
import { api } from '../utils/api';

export default function AdminAnalytics() {
  const [data, setData] = useState<any>(null);
  useEffect(() => { (async () => { try { setData(await api('/admin/analytics')); } catch {} })(); }, []);

  if (!data) return <div className="empty-state"><p>Loading analytics...</p></div>;
  const month = data.month || {};
  return (
    <div>
      <div className="page-header"><div><h1>Analytics</h1><p>Business insights</p></div></div>
      <div className="stats-grid">
        <div className="stat-card"><div className="stat-icon" style={{background:'#15140F15'}}>📋</div><div className="stat-value">{month.orders||0}</div><div className="stat-label">Total Orders</div></div>
        <div className="stat-card"><div className="stat-icon" style={{background:'#3FA34D15'}}>💰</div><div className="stat-value">₹{Math.round(month.revenue||0)}</div><div className="stat-label">Total Revenue</div></div>
        <div className="stat-card"><div className="stat-icon" style={{background:'#15140F15'}}>📊</div><div className="stat-value">₹{Math.round(month.avg_order_value||0)}</div><div className="stat-label">Avg Order Value</div></div>
        <div className="stat-card"><div className="stat-icon" style={{background:'#D69A3515'}}>👥</div><div className="stat-value">{month.unique_customers||0}</div><div className="stat-label">Unique Customers</div></div>
      </div>
      {data.best_sellers?.length > 0 && (
        <>
          <h2 style={{fontSize:18,fontWeight:700,margin:'24px 0 14px'}}>Top Products</h2>
          <table className="data-table">
            <thead><tr><th>Product</th><th>Orders</th><th>Revenue</th></tr></thead>
            <tbody>{data.best_sellers.map((p: any, i: number) => <tr key={i}><td style={{fontWeight:600}}>{p.name}</td><td>{p.orders}</td><td>₹{Math.round(p.revenue||0)}</td></tr>)}</tbody>
          </table>
        </>
      )}
    </div>
  );
}
