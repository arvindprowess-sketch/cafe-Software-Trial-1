import React from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ADMIN_NAV_KEYS } from '../auth/permissions';

const NAV_ITEMS = [
  { key: 'dashboard', path: '/admin', label: 'Dashboard', icon: 'M4 6h16M4 12h16M4 18h16', end: true },
  { key: 'categories', path: '/admin/categories', label: 'Categories', icon: 'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z' },
  { key: 'products', path: '/admin/products', label: 'Products', icon: 'M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4' },
  { key: 'kitchen', path: '/admin/kitchen', label: 'Kitchen Monitor', icon: 'M17.657 18.657A8 8 0 016.343 7.343S7 9 9 10c0-2 .5-5 2.986-7C14 5 16.09 5.777 17.656 7.343A7.975 7.975 0 0120 13a7.975 7.975 0 01-2.343 5.657z' },
  { key: 'tables', path: '/admin/tables', label: 'Tables', icon: 'M4 6h16M4 10h16M4 14h16M4 18h16' },
  { key: 'staff', path: '/admin/staff', label: 'Staff', icon: 'M17 20h5v-2a4 4 0 00-3-3.87M9 20H4v-2a4 4 0 013-3.87m13-4a4 4 0 11-8 0 4 4 0 018 0zm-9 4a3 3 0 11-6 0 3 3 0 016 0z' },
  { key: 'shifts', path: '/admin/shifts', label: 'Shifts', icon: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z' },
  // Multi-store HQ portal (Phase 1B)
  { key: 'hq-stores', path: '/hq/stores', label: 'Stores & Clusters', icon: 'M3 21h18M5 21V7l8-4v18M19 21V11l-6-4M9 9v.01M9 12v.01M9 15v.01' },
  { key: 'hq-catalog', path: '/hq/catalog', label: 'Store Catalog', icon: 'M4 6h16M4 12h16M4 18h7' },
  { key: 'hq-push', path: '/hq/push', label: 'Catalog Push', icon: 'M5 12h14M12 5l7 7-7 7' },
  { key: 'hq-offers', path: '/hq/offers', label: 'Offers & Coupons', icon: 'M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A2 2 0 013 12V7a4 4 0 014-4z' },
];

export default function AdminLayout() {
  const { user, logout } = useAuth();
  const allowed = ADMIN_NAV_KEYS[user?.role ?? ''] ?? [];
  const items = NAV_ITEMS.filter(item => allowed.includes(item.key));
  const roleLabel = user?.role === 'area_manager' ? 'Area Manager'
    : user?.role === 'store_manager' ? 'Store Manager' : 'Admin';

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <img src="/boraroc-logo.png?v=2" alt="BORAROC" style={{ width: 36, height: 36, borderRadius: 10, objectFit: 'cover' }} />
          <span>BORAROC</span>
        </div>
        <nav className="sidebar-nav">
          {items.map(item => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.end}
              className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
              data-testid={`nav-${item.label.toLowerCase().replace(/ /g, '-')}`}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={item.icon}/></svg>
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-footer">
          <div className="sidebar-user"><strong>{user?.name}</strong><br />{roleLabel}</div>
          <button className="logout-btn" data-testid="admin-logout-btn" onClick={logout}>Logout</button>
        </div>
      </aside>
      <main className="main-content">
        <Outlet />
      </main>
    </div>
  );
}
