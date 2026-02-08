import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import Login from './pages/Login';
import AdminLayout from './components/AdminLayout';
import KitchenLayout from './components/KitchenLayout';
import CashierLayout from './components/CashierLayout';
import AdminDashboard from './pages/AdminDashboard';
import AdminProducts from './pages/AdminProducts';
import AdminStaff from './pages/AdminStaff';
import AdminKitchen from './pages/AdminKitchen';
import AdminCategories from './pages/AdminCategories';
import AdminAnalytics from './pages/AdminAnalytics';
import AdminTables from './pages/AdminTables';
import AdminOffers from './pages/AdminOffers';
import AdminShifts from './pages/AdminShifts';
import KitchenOrders from './pages/KitchenOrders';
import KitchenInventory from './pages/KitchenInventory';
import CashierPOS from './pages/CashierPOS';
import CashierOrders from './pages/CashierOrders';
import CashierTables from './pages/CashierTables';

function ProtectedRoute({ children, roles }: { children: React.ReactNode; roles: string[] }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="loading-screen">Loading...</div>;
  if (!user) return <Navigate to="/login" />;
  if (!roles.includes(user.role)) return <Navigate to="/login" />;
  return <>{children}</>;
}

export default function App() {
  const { user, loading } = useAuth();

  if (loading) return <div className="loading-screen">Loading...</div>;

  const getDefaultRoute = () => {
    if (!user) return '/login';
    if (user.role === 'admin') return '/admin';
    if (user.role === 'kitchen') return '/kitchen';
    if (user.role === 'cashier') return '/cashier';
    return '/login';
  };

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to={getDefaultRoute()} /> : <Login />} />

      <Route path="/admin" element={<ProtectedRoute roles={['admin']}><AdminLayout /></ProtectedRoute>}>
        <Route index element={<AdminDashboard />} />
        <Route path="products" element={<AdminProducts />} />
        <Route path="staff" element={<AdminStaff />} />
        <Route path="kitchen" element={<AdminKitchen />} />
        <Route path="categories" element={<AdminCategories />} />
        <Route path="analytics" element={<AdminAnalytics />} />
        <Route path="tables" element={<AdminTables />} />
        <Route path="offers" element={<AdminOffers />} />
      </Route>

      <Route path="/kitchen" element={<ProtectedRoute roles={['kitchen']}><KitchenLayout /></ProtectedRoute>}>
        <Route index element={<KitchenOrders />} />
        <Route path="inventory" element={<KitchenInventory />} />
      </Route>

      <Route path="/cashier" element={<ProtectedRoute roles={['cashier']}><CashierLayout /></ProtectedRoute>}>
        <Route index element={<CashierPOS />} />
        <Route path="orders" element={<CashierOrders />} />
        <Route path="tables" element={<CashierTables />} />
      </Route>

      <Route path="*" element={<Navigate to={getDefaultRoute()} />} />
    </Routes>
  );
}
