// Role → navigation / route permissions.
// Single source of truth — AdminLayout and App.tsx both read from here.

/** Default landing route per role after login or after a disallowed-URL redirect. */
export const ROLE_DEFAULT_ROUTE: Record<string, string> = {
  super_admin:   '/admin',
  admin:         '/admin',
  area_manager:  '/admin',
  store_manager: '/admin',
  cashier:       '/cashier',
  kitchen:       '/kitchen',
};

/**
 * Nav keys visible in AdminLayout per role.
 * Keys map 1-to-1 with the `key` field on each NAV_ITEM in AdminLayout.tsx.
 * Roles not listed here (cashier, kitchen) use their own dedicated layouts and
 * never enter AdminLayout.
 */
export const ADMIN_NAV_KEYS: Record<string, string[]> = {
  super_admin: [
    'dashboard', 'categories', 'products', 'orders',
    'kitchen', 'offers', 'tables',
    'hq-stores', 'hq-catalog', 'hq-push', 'hq-offers',
  ],
  admin: [
    'dashboard', 'categories', 'products', 'orders',
    'kitchen', 'offers', 'tables',
    'hq-stores', 'hq-catalog', 'hq-push', 'hq-offers',
  ],
  area_manager: [
    // Dashboard, order & ops views — yes. Master catalog edit — no.
    'dashboard', 'orders', 'kitchen', 'offers', 'tables',
    // HQ: own cluster stores + catalog read + offers. Push — no.
    'hq-stores', 'hq-catalog', 'hq-offers',
  ],
  store_manager: [
    // Dashboard, order & ops views — yes. Master catalog edit — no.
    'dashboard', 'orders', 'kitchen', 'offers', 'tables',
    // HQ: own store catalog overrides + offers. Stores & Clusters / Push — no.
    'hq-catalog', 'hq-offers',
  ],
};

/**
 * Roles allowed into each /hq sub-route (for direct-URL route guards).
 * Roles allowed into the /hq parent but blocked from a specific child are
 * redirected to their ROLE_DEFAULT_ROUTE.
 */
export const HQ_SUB_ROUTE_ROLES: Record<string, string[]> = {
  '/hq/stores':  ['admin', 'super_admin', 'area_manager'],
  '/hq/catalog': ['admin', 'super_admin', 'area_manager', 'store_manager'],
  '/hq/push':    ['admin', 'super_admin'],
  '/hq/offers':  ['admin', 'super_admin', 'area_manager', 'store_manager'],
};

/** Roles that are allowed into /admin/* at all. */
export const ADMIN_PORTAL_ROLES = ['admin', 'super_admin', 'area_manager', 'store_manager'];

/**
 * Paths (exact) inside /admin that require full super_admin/admin access.
 * area_manager and store_manager are redirected away from these.
 */
export const ADMIN_RESTRICTED_PATHS: Record<string, string[]> = {
  '/admin/categories': ['admin', 'super_admin'],
  '/admin/products':   ['admin', 'super_admin'],
};
