import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../utils/api';

export default function AdminDashboard() {
  const [stats, setStats] = useState<any>({ products: 0, categories: 0, today_orders: 0, pending_orders: 0, revenue: 0, low_stock_alerts: [] });
  const [staff, setStaff] = useState<any[]>([]);
  const [resetPinId, setResetPinId] = useState('');
  const [newPin, setNewPin] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const [s, st] = await Promise.all([api('/admin/dashboard-stats'), api('/admin/staff-accounts')]);
        setStats(s);
        setStaff(st);
      } catch {}
    })();
  }, []);

  const resetPin = async () => {
    if (!resetPinId || !newPin) return;
    try {
      await api(`/admin/staff/${resetPinId}/reset-pin`, { method: 'PUT', body: { pin: newPin } });
      alert('PIN updated successfully');
      setResetPinId('');
      setNewPin('');
    } catch (e: any) { alert(e.message); }
  };

  return (
    <div>
      <div className="page-header">
        <div><h1>Dashboard</h1><p>Diet Cafe Control Center</p></div>
      </div>

      <div className="stats-grid" data-testid="stats-grid">
        {[
          { label: 'Products', value: stats.products, color: '#3FA34D', icon: 'M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4' },
          { label: 'Categories', value: stats.categories, color: '#15140F', icon: 'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z' },
          { label: "Today's Orders", value: stats.today_orders, color: '#D69A35', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2' },
          { label: 'Revenue', value: `₹${Math.round(stats.revenue)}`, color: '#15140F', icon: 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z' },
          { label: 'Pending', value: stats.pending_orders, color: '#15140F', icon: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z' },
          { label: 'Low Stock', value: stats.low_stock_alerts?.length || 0, color: stats.low_stock_alerts?.length > 0 ? '#15140F' : '#3FA34D', icon: 'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z' },
        ].map(s => (
          <div className="stat-card" key={s.label} data-testid={`stat-${s.label.toLowerCase().replace(/[^a-z]/g, '-')}`}>
            <div className="stat-icon" style={{ background: `${s.color}12` }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={s.color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={s.icon}/></svg>
            </div>
            <div className="stat-value">{s.value}</div>
            <div className="stat-label">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Low Stock Alerts */}
      {stats.low_stock_alerts?.length > 0 && (
        <div style={{ marginBottom: 24 }} data-testid="low-stock-section">
          <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 10, color: '#15140F' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#15140F" strokeWidth="2" style={{ verticalAlign: 'middle', marginRight: 6 }}><path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
            Low Stock Alerts
          </h2>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {stats.low_stock_alerts.map((item: any) => (
              <div key={item.id} style={{ background: '#F1E7E1', borderRadius: 8, padding: '8px 14px', fontSize: 13 }}>
                <strong>{item.name}</strong>: {Math.round(item.available_qty_grams)}g left
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Quick Actions */}
      <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>Quick Actions</h2>
      <div className="quick-actions" data-testid="quick-actions">
        {[
          { to: '/admin/categories', title: 'Manage Categories', desc: 'Icons, fonts, ordering', color: '#15140F', icon: 'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z' },
          { to: '/admin/products', title: 'Manage Products', desc: 'Meals & single items', color: '#3FA34D', icon: 'M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4' },
          { to: '/admin/orders', title: 'Orders', desc: 'All orders & history', color: '#D69A35', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2' },
          { to: '/admin/kitchen', title: 'Kitchen Monitor', desc: 'Live kitchen view', color: '#15140F', icon: 'M17.657 18.657A8 8 0 016.343 7.343S7 9 9 10c0-2 .5-5 2.986-7C14 5 16.09 5.777 17.656 7.343A7.975 7.975 0 0120 13a7.975 7.975 0 01-2.343 5.657z' },
        ].map(a => (
          <Link to={a.to} className="action-card" key={a.to} data-testid={`goto-${a.title.toLowerCase().replace(/ /g, '-')}`}>
            <div className="action-icon" style={{ background: `${a.color}12` }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={a.color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={a.icon}/></svg>
            </div>
            <div>
              <div className="action-title">{a.title}</div>
              <div className="action-desc">{a.desc}</div>
            </div>
          </Link>
        ))}
      </div>

      {/* Staff Accounts (Kitchen & Cashier only) */}
      <h2 style={{ fontSize: 16, fontWeight: 700, margin: '24px 0 12px' }}>Staff Accounts</h2>
      <table className="data-table" data-testid="staff-table">
        <thead><tr><th>Name</th><th>Role</th><th>PIN</th><th>Action</th></tr></thead>
        <tbody>
          {staff.map(s => (
            <tr key={s.id}>
              <td style={{ fontWeight: 600 }}>{s.name}</td>
              <td><span className={`badge ${s.role === 'kitchen' ? 'badge-green' : 'badge-purple'}`}>{s.role}</span></td>
              <td style={{ fontFamily: 'monospace', letterSpacing: 2 }}>{s.pin || '****'}</td>
              <td>
                {resetPinId === s.id ? (
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <input
                      value={newPin}
                      onChange={e => setNewPin(e.target.value.replace(/\D/g, ''))}
                      placeholder="New PIN"
                      maxLength={6}
                      style={{ width: 80, padding: '4px 8px', borderRadius: 6, border: '1px solid #E0E0E0', fontSize: 13 }}
                      data-testid={`pin-input-${s.id}`}
                    />
                    <button className="btn btn-sm btn-green" onClick={resetPin} data-testid={`save-pin-${s.id}`}>Save</button>
                    <button className="btn btn-sm btn-secondary" onClick={() => { setResetPinId(''); setNewPin(''); }}>Cancel</button>
                  </div>
                ) : (
                  <button className="btn btn-sm btn-secondary" onClick={() => setResetPinId(s.id)} data-testid={`reset-pin-${s.id}`}>Reset PIN</button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
