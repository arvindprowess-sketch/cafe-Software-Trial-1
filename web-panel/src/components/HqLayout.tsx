import React from 'react';
import { NavLink, Outlet, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import StoreSwitcher from './StoreSwitcher';

// Role-gated HQ portal navigation (Phase 1B).
// - super_admin: Stores & Clusters, Store Catalog, Push.
// - area_manager: Stores (read-only), Store Catalog (own cluster).
// - store_manager: Store Catalog (own store).
// cashier/kitchen never reach here (route + default-route gating).
function navForRole(role?: string) {
  const stores = { path: '/hq/stores', label: 'Stores & Clusters' };
  const catalog = { path: '/hq/catalog', label: 'Store Catalog' };
  const push = { path: '/hq/push', label: 'Catalog Push' };
  const offers = { path: '/hq/offers', label: 'Offers & Coupons' };
  if (role === 'super_admin' || role === 'admin') return [stores, catalog, push, offers];
  if (role === 'area_manager') return [stores, catalog, offers];
  if (role === 'store_manager') return [catalog, offers];
  return [];
}

export function hqHomeFor(role?: string) {
  if (role === 'store_manager') return '/hq/catalog';
  return '/hq/stores';
}

export default function HqLayout() {
  const { user, logout } = useAuth();
  const items = navForRole(user?.role);
  const roleLabel = user?.role === 'super_admin' || user?.role === 'admin' ? 'HQ' :
    user?.role === 'area_manager' ? 'Area Manager' : 'Store Manager';

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <img src="/boraroc-logo.png" alt="BORAROC" style={{width:36,height:36,borderRadius:10,objectFit:'cover'}} />
          <span>FUEL · HQ</span>
        </div>
        <nav className="sidebar-nav">
          {items.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
              data-testid={`hqnav-${item.label.toLowerCase().replace(/[^a-z]+/g, '-')}`}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 6h16M4 12h16M4 18h16"/></svg>
              {item.label}
            </NavLink>
          ))}
          {(user?.role === 'super_admin' || user?.role === 'admin') && (
            <NavLink to="/admin" className="sidebar-link" data-testid="hqnav-admin">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h12a1 1 0 001-1V10"/></svg>
              ← Admin Panel
            </NavLink>
          )}
        </nav>
        <div className="sidebar-footer">
          <div className="sidebar-user"><strong>{user?.name}</strong><br />{roleLabel}</div>
          <button className="logout-btn" data-testid="hq-logout-btn" onClick={logout}>Logout</button>
        </div>
      </aside>
      <main className="main-content">
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
          <StoreSwitcher />
        </div>
        <Outlet />
      </main>
    </div>
  );
}

/** Index redirect for /hq based on role. */
export function HqIndex() {
  const { user } = useAuth();
  const loc = useLocation();
  if (loc.pathname === '/hq' || loc.pathname === '/hq/') {
    return <Navigate to={hqHomeFor(user?.role)} replace />;
  }
  return null;
}
