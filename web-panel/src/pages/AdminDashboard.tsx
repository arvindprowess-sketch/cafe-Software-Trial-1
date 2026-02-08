import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../utils/api';

export default function AdminDashboard() {
  const [stats, setStats] = useState({ products: 0, pendingOrders: 0, todayOrders: 0, revenue: 0, staff: 0 });

  useEffect(() => {
    (async () => {
      try {
        const [products, orders, staff] = await Promise.all([
          api('/products/all'), api('/orders/all'), api('/staff')
        ]);
        const today = new Date().toISOString().split('T')[0];
        const todayOrders = orders.filter((o: any) => o.created_at?.startsWith(today));
        setStats({
          products: products.length,
          pendingOrders: orders.filter((o: any) => ['pending','preparing'].includes(o.status)).length,
          todayOrders: todayOrders.length,
          revenue: todayOrders.reduce((s: number, o: any) => s + (o.total_price || 0), 0),
          staff: staff.length,
        });
      } catch {}
    })();
  }, []);

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Dashboard</h1>
          <p>Diet Cafe Admin Overview</p>
        </div>
      </div>

      <div className="stats-grid">
        {[
          { label: 'Products', value: stats.products, icon: '🥗', color: '#267E3E' },
          { label: 'Pending Orders', value: stats.pendingOrders, icon: '⏳', color: '#FF9F0A' },
          { label: "Today's Orders", value: stats.todayOrders, icon: '📋', color: '#5B5FE0' },
          { label: 'Revenue', value: `₹${Math.round(stats.revenue)}`, icon: '💰', color: '#E23744' },
          { label: 'Staff', value: stats.staff, icon: '👥', color: '#9C27B0' },
        ].map(s => (
          <div className="stat-card" key={s.label} data-testid={`stat-${s.label.toLowerCase().replace(/[^a-z]/g,'-')}`}>
            <div className="stat-icon" style={{ background: `${s.color}15` }}>{s.icon}</div>
            <div className="stat-value">{s.value}</div>
            <div className="stat-label">{s.label}</div>
          </div>
        ))}
      </div>

      <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 14 }}>Quick Actions</h2>
      <div className="quick-actions">
        {[
          { to: '/admin/products', title: 'Manage Products', desc: 'Add, edit menu items', icon: '🥗', color: '#267E3E' },
          { to: '/admin/staff', title: 'Staff Management', desc: 'Kitchen & cashier staff', icon: '👥', color: '#5B5FE0' },
          { to: '/admin/kitchen', title: 'Kitchen View', desc: 'Active orders', icon: '🔥', color: '#FF9F0A' },
          { to: '/admin/categories', title: 'Categories', desc: 'Menu categories', icon: '📂', color: '#9C27B0' },
          { to: '/admin/offers', title: 'Offers', desc: 'Discounts & coupons', icon: '🏷', color: '#FF6B6B' },
          { to: '/admin/analytics', title: 'Analytics', desc: 'Revenue & insights', icon: '📈', color: '#5B5FE0' },
          { to: '/admin/tables', title: 'Tables', desc: 'Cafe table management', icon: '🪑', color: '#E23744' },
        ].map(a => (
          <Link to={a.to} className="action-card" key={a.to} data-testid={`goto-${a.title.toLowerCase().replace(/ /g,'-')}`}>
            <div className="action-icon" style={{ background: `${a.color}15` }}>{a.icon}</div>
            <div>
              <div className="action-title">{a.title}</div>
              <div className="action-desc">{a.desc}</div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
