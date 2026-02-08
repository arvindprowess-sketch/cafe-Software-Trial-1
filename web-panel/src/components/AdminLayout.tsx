import React from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const NAV_ITEMS = [
  { path: '/admin', label: 'Dashboard', icon: '📊', end: true },
  { path: '/admin/products', label: 'Products', icon: '🥗' },
  { path: '/admin/categories', label: 'Categories', icon: '📂' },
  { path: '/admin/staff', label: 'Staff', icon: '👥' },
  { path: '/admin/kitchen', label: 'Kitchen', icon: '🔥' },
  { path: '/admin/offers', label: 'Offers', icon: '🏷' },
  { path: '/admin/analytics', label: 'Analytics', icon: '📈' },
  { path: '/admin/tables', label: 'Tables', icon: '🪑' },
  { path: '/admin/shifts', label: 'Shifts', icon: '🕐' },
];

export default function AdminLayout() {
  const { user, logout } = useAuth();

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="brand-icon">🍽</div>
          <span>Diet Cafe</span>
        </div>
        <nav className="sidebar-nav">
          {NAV_ITEMS.map(item => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.end}
              className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
              data-testid={`nav-${item.label.toLowerCase()}`}
            >
              <span>{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-footer">
          <div className="sidebar-user"><strong>{user?.name}</strong><br />Admin</div>
          <button className="logout-btn" data-testid="admin-logout-btn" onClick={logout}>Logout</button>
        </div>
      </aside>
      <main className="main-content">
        <Outlet />
      </main>
    </div>
  );
}
