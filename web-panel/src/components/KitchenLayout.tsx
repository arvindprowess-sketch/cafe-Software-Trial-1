import React from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function KitchenLayout() {
  const { user, logout } = useAuth();
  return (
    <div>
      <div className="top-nav">
        <div className="top-nav-brand">
          <img src="/boraroc-logo.png" alt="BORAROC" style={{ width: 24, height: 24, borderRadius: 6, objectFit: 'cover' }} />
          <h2>Kitchen Display</h2>
        </div>
        <div className="top-nav-links">
          <NavLink to="/kitchen" end className={({ isActive }) => `top-nav-link ${isActive ? 'active' : ''}`} data-testid="nav-orders">Orders</NavLink>
          <NavLink to="/kitchen/inventory" className={({ isActive }) => `top-nav-link ${isActive ? 'active' : ''}`} data-testid="nav-inventory">Inventory</NavLink>
          <NavLink to="/kitchen/discards" className={({ isActive }) => `top-nav-link ${isActive ? 'active' : ''}`} data-testid="nav-discards">Discards</NavLink>
        </div>
        <div className="top-nav-actions">
          <span className="top-nav-user"><strong>{user?.name}</strong></span>
          <button className="btn btn-sm btn-secondary" data-testid="kitchen-logout-btn" onClick={logout}>Logout</button>
        </div>
      </div>
      <div className="page-content">
        <Outlet />
      </div>
    </div>
  );
}
