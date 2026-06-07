import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import { StoreProvider } from './context/StoreContext';
import Login from './pages/Login';
import AdminLayout from './components/AdminLayout';
import KitchenLayout from './components/KitchenLayout';
import CashierLayout from './components/CashierLayout';
import HqLayout, { HqIndex } from './components/HqLayout';
import HqStores from './pages/HqStores';
import HqCatalog from './pages/HqCatalog';
import HqPush from './pages/HqPush';
import HqOffers from './pages/HqOffers';
import AdminDashboard from './pages/AdminDashboard';
import AdminProducts from './pages/AdminProducts';
import AdminKitchen from './pages/AdminKitchen';
import AdminCategories from './pages/AdminCategories';
import AdminAnalytics from './pages/AdminAnalytics';
import AdminTables from './pages/AdminTables';
import AdminOffers from './pages/AdminOffers';
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
    if (user.role === 'admin' || user.role === 'super_admin') return '/admin';
    if (user.role === 'kitchen') return '/kitchen';
    // area_manager / store_manager land in the HQ portal (multi-store).
    if (['store_manager', 'area_manager'].includes(user.role)) return '/hq';
    if (user.role === 'cashier') return '/cashier';
    return '/login';
  };

  return (
    <StoreProvider>
    <Routes>
      <Route path="/login" element={user ? <Navigate to={getDefaultRoute()} /> : <Login />} />

      <Route path="/hq" element={<ProtectedRoute roles={['admin', 'super_admin', 'area_manager', 'store_manager']}><HqLayout /></ProtectedRoute>}>
        <Route index element={<HqIndex />} />
        <Route path="stores" element={<HqStores />} />
        <Route path="catalog" element={<HqCatalog />} />
        <Route path="push" element={<HqPush />} />
        <Route path="offers" element={<HqOffers />} />
      </Route>

      <Route path="/admin" element={<ProtectedRoute roles={['admin', 'super_admin']}><AdminLayout /></ProtectedRoute>}>
        <Route index element={<AdminDashboard />} />
        <Route path="products" element={<AdminProducts />} />
        <Route path="kitchen" element={<AdminKitchen />} />
        <Route path="categories" element={<AdminCategories />} />
        <Route path="orders" element={<AdminAnalytics />} />
        <Route path="tables" element={<AdminTables />} />
        <Route path="offers" element={<AdminOffers />} />
      </Route>

      <Route path="/kitchen" element={<ProtectedRoute roles={['kitchen']}><KitchenLayout /></ProtectedRoute>}>
        <Route index element={<KitchenOrders />} />
        <Route path="inventory" element={<KitchenInventory />} />
      </Route>

      <Route path="/cashier" element={<ProtectedRoute roles={['cashier', 'store_manager', 'area_manager']}><CashierLayout /></ProtectedRoute>}>
        <Route index element={<CashierPOS />} />
        <Route path="orders" element={<CashierOrders />} />
        <Route path="tables" element={<CashierTables />} />
      </Route>

      <Route path="*" element={<Navigate to={getDefaultRoute()} />} />
    </Routes>
    </StoreProvider>
  );
}
