import React from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function CashierLayout() {
  const { user, logout } = useAuth();
  return (
    <div>
      <div className="top-nav">
        <div className="top-nav-brand">
          <img src="/boraroc-logo.png?v=2" alt="BORAROC" style={{ width: 24, height: 24, borderRadius: 6, objectFit: 'cover' }} />
          <h2>Cashier POS</h2>
        </div>
        <div className="top-nav-links">
          <NavLink to="/cashier" end className={({ isActive }) => `top-nav-link ${isActive ? 'active' : ''}`} data-testid="nav-pos">POS</NavLink>
          <NavLink to="/cashier/orders" className={({ isActive }) => `top-nav-link ${isActive ? 'active' : ''}`} data-testid="nav-orders">Orders</NavLink>
          <NavLink to="/cashier/tables" className={({ isActive }) => `top-nav-link ${isActive ? 'active' : ''}`} data-testid="nav-tables">Tables</NavLink>
          <NavLink to="/cashier/daybook" className={({ isActive }) => `top-nav-link ${isActive ? 'active' : ''}`} data-testid="nav-daybook">Day Book</NavLink>
          <NavLink to="/cashier/refunds" className={({ isActive }) => `top-nav-link ${isActive ? 'active' : ''}`} data-testid="nav-refunds">Refunds</NavLink>
        </div>
        <div className="top-nav-actions">
          <span className="top-nav-user"><strong>{user?.name}</strong></span>
          <button className="btn btn-sm btn-secondary" data-testid="cashier-logout-btn" onClick={logout}>Logout</button>
        </div>
      </div>
      <div className="page-content">
        <Outlet />
      </div>
    </div>
  );
}
