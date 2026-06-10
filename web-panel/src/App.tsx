import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import { StoreProvider } from './context/StoreContext';
import {
  ROLE_DEFAULT_ROUTE,
  ADMIN_PORTAL_ROLES,
  ADMIN_RESTRICTED_PATHS,
  HQ_SUB_ROUTE_ROLES,
} from './auth/permissions';
import Login from './pages/Login';
import AdminLayout from './components/AdminLayout';
import KitchenLayout from './components/KitchenLayout';
import CashierLayout from './components/CashierLayout';
import HqLayout, { HqIndex } from './components/HqLayout';
import HqStores from './pages/HqStores';
import HqCatalog from './pages/HqCatalog';
import HqPush from './pages/HqPush';
import HqOffers from './pages/HqOffers';
import HqDiscards from './pages/HqDiscards';
import HqTransfers from './pages/HqTransfers';
import HqItemMaster from './pages/HqItemMaster';
import HqMovementLog from './pages/HqMovementLog';
import HqInventoryDashboard from './pages/HqInventoryDashboard';
import HqReports from './pages/HqReports';
import HqAuditLog from './pages/HqAuditLog';
import HqOnboarding from './pages/HqOnboarding';
import StoreDayBook from './pages/StoreDayBook';
import CashierRefunds from './pages/CashierRefunds';
import AdminDashboard from './pages/AdminDashboard';
import AdminProducts from './pages/AdminProducts';
import AdminKitchen from './pages/AdminKitchen';
import AdminCategories from './pages/AdminCategories';
import AdminAnalytics from './pages/AdminAnalytics';
import AdminTables from './pages/AdminTables';
import AdminStaff from './pages/AdminStaff';
import AdminShifts from './pages/AdminShifts';
import KitchenOrders from './pages/KitchenOrders';
import KitchenInventory from './pages/KitchenInventory';
import CashierPOS from './pages/CashierPOS';
import CashierOrders from './pages/CashierOrders';
import CashierTables from './pages/CashierTables';

/** Default landing route for the logged-in role (also used as the redirect
 *  target when a user types a URL they are not allowed to view). */
export function defaultRouteFor(role?: string): string {
  if (!role) return '/login';
  return ROLE_DEFAULT_ROUTE[role] ?? '/login';
}

/** Portal-level guard: must be logged in and in `roles`, else bounced to that
 *  user's own default landing (or /login if not authenticated). */
function ProtectedRoute({ children, roles }: { children: React.ReactNode; roles: string[] }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="loading-screen">Loading...</div>;
  if (!user) return <Navigate to="/login" />;
  if (!roles.includes(user.role)) return <Navigate to={defaultRouteFor(user.role)} replace />;
  return <>{children}</>;
}

/** Per-route guard for individual pages inside an allowed portal. A user who can
 *  enter the portal but not this specific page is redirected to their default
 *  landing instead of rendering the page. Backend still 403s as defense-in-depth. */
function RoleRoute({ children, allowed }: { children: React.ReactNode; allowed: string[] }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" />;
  if (!allowed.includes(user.role)) return <Navigate to={defaultRouteFor(user.role)} replace />;
  return <>{children}</>;
}

export default function App() {
  const { user, loading } = useAuth();

  if (loading) return <div className="loading-screen">Loading...</div>;

  const getDefaultRoute = () => defaultRouteFor(user?.role);

  return (
    <StoreProvider>
    <Routes>
      <Route path="/login" element={user ? <Navigate to={getDefaultRoute()} /> : <Login />} />

      <Route path="/hq" element={<ProtectedRoute roles={ADMIN_PORTAL_ROLES}><HqLayout /></ProtectedRoute>}>
        <Route index element={<HqIndex />} />
        <Route path="stores" element={<RoleRoute allowed={HQ_SUB_ROUTE_ROLES['/hq/stores']}><HqStores /></RoleRoute>} />
        <Route path="catalog" element={<RoleRoute allowed={HQ_SUB_ROUTE_ROLES['/hq/catalog']}><HqCatalog /></RoleRoute>} />
        <Route path="push" element={<RoleRoute allowed={HQ_SUB_ROUTE_ROLES['/hq/push']}><HqPush /></RoleRoute>} />
        <Route path="offers" element={<RoleRoute allowed={HQ_SUB_ROUTE_ROLES['/hq/offers']}><HqOffers /></RoleRoute>} />
        <Route path="discards" element={<RoleRoute allowed={HQ_SUB_ROUTE_ROLES['/hq/discards']}><HqDiscards /></RoleRoute>} />
        <Route path="transfers" element={<RoleRoute allowed={HQ_SUB_ROUTE_ROLES['/hq/transfers']}><HqTransfers /></RoleRoute>} />
        <Route path="inventory/items" element={<RoleRoute allowed={HQ_SUB_ROUTE_ROLES['/hq/inventory/items']}><HqItemMaster /></RoleRoute>} />
        <Route path="inventory/health" element={<RoleRoute allowed={HQ_SUB_ROUTE_ROLES['/hq/inventory/health']}><HqInventoryDashboard /></RoleRoute>} />
        <Route path="inventory/movements" element={<RoleRoute allowed={HQ_SUB_ROUTE_ROLES['/hq/inventory/movements']}><HqMovementLog /></RoleRoute>} />
        <Route path="reports" element={<RoleRoute allowed={HQ_SUB_ROUTE_ROLES['/hq/reports']}><HqReports /></RoleRoute>} />
        <Route path="audit-log" element={<RoleRoute allowed={HQ_SUB_ROUTE_ROLES['/hq/audit-log']}><HqAuditLog /></RoleRoute>} />
        <Route path="onboarding" element={<RoleRoute allowed={HQ_SUB_ROUTE_ROLES['/hq/onboarding']}><HqOnboarding /></RoleRoute>} />
        <Route path="daybook" element={<RoleRoute allowed={HQ_SUB_ROUTE_ROLES['/hq/daybook']}><StoreDayBook readOnly /></RoleRoute>} />
      </Route>

      <Route path="/admin" element={<ProtectedRoute roles={ADMIN_PORTAL_ROLES}><AdminLayout /></ProtectedRoute>}>
        <Route index element={<RoleRoute allowed={ADMIN_RESTRICTED_PATHS['/admin']}><AdminDashboard /></RoleRoute>} />
        <Route path="products" element={<RoleRoute allowed={ADMIN_RESTRICTED_PATHS['/admin/products']}><AdminProducts /></RoleRoute>} />
        <Route path="kitchen" element={<AdminKitchen />} />
        <Route path="categories" element={<RoleRoute allowed={ADMIN_RESTRICTED_PATHS['/admin/categories']}><AdminCategories /></RoleRoute>} />
        <Route path="orders" element={<RoleRoute allowed={ADMIN_RESTRICTED_PATHS['/admin/orders']}><AdminAnalytics /></RoleRoute>} />
        <Route path="tables" element={<AdminTables />} />
        <Route path="staff" element={<RoleRoute allowed={ADMIN_RESTRICTED_PATHS['/admin/staff']}><AdminStaff /></RoleRoute>} />
        <Route path="shifts" element={<RoleRoute allowed={ADMIN_RESTRICTED_PATHS['/admin/shifts']}><AdminShifts /></RoleRoute>} />
      </Route>

      <Route path="/kitchen" element={<ProtectedRoute roles={['kitchen']}><KitchenLayout /></ProtectedRoute>}>
        <Route index element={<KitchenOrders />} />
        <Route path="inventory" element={<KitchenInventory />} />
        <Route path="discards" element={<HqDiscards raiseOnly />} />
      </Route>

      <Route path="/cashier" element={<ProtectedRoute roles={['cashier', 'store_manager', 'area_manager']}><CashierLayout /></ProtectedRoute>}>
        <Route index element={<CashierPOS />} />
        <Route path="orders" element={<CashierOrders />} />
        <Route path="tables" element={<CashierTables />} />
        <Route path="daybook" element={<StoreDayBook />} />
        <Route path="refunds" element={<CashierRefunds />} />
      </Route>

      <Route path="*" element={<Navigate to={getDefaultRoute()} />} />
    </Routes>
    </StoreProvider>
  );
}
