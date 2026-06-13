// Role → navigation / route permissions.
// Single source of truth — AdminLayout and App.tsx both read from here.

/** Default landing route per role after login or after a disallowed-URL redirect. */
export const ROLE_DEFAULT_ROUTE: Record<string, string> = {
  super_admin:   '/admin',
  admin:         '/admin',
  // /hq HqIndex redirects area_manager -> /hq/stores, store_manager -> /hq/catalog.
  // (/admin Dashboard/Analytics/Staff are super_admin-only & global -> 403 for these roles.)
  area_manager:  '/hq',
  store_manager: '/hq',
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
    'dashboard', 'categories', 'products',
    'staff', 'shifts',
    'hq-stores', 'hq-catalog', 'hq-push', 'hq-offers',
  ],
  admin: [
    'dashboard', 'categories', 'products',
    'staff', 'shifts',
    'hq-stores', 'hq-catalog', 'hq-push', 'hq-offers',
  ],
  area_manager: [
    // Dashboard/Orders(Analytics) are super_admin-only & global -> excluded.
    // Kitchen/Tables are single-store ops -> excluded for cluster role.
    // Area never enters /admin; lives in /hq (hq-offers = "Offers & Coupons").
    'hq-stores', 'hq-catalog', 'hq-offers',
  ],
  store_manager: [
    // Dashboard/Orders(Analytics) are super_admin-only & global -> excluded.
    'kitchen', 'tables', 'shifts',
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
  '/hq/area-dashboard': ['area_manager', 'super_admin'],
  '/hq/store-dashboard': ['store_manager', 'area_manager', 'super_admin'],
  '/hq/stores':  ['admin', 'super_admin', 'area_manager'],
  '/hq/catalog': ['admin', 'super_admin', 'area_manager', 'store_manager'],
  '/hq/push':    ['admin', 'super_admin'],
  '/hq/offers':  ['admin', 'super_admin', 'area_manager', 'store_manager'],
  '/hq/discards':  ['admin', 'super_admin', 'area_manager', 'store_manager'],
  '/hq/transfers': ['admin', 'super_admin', 'area_manager', 'store_manager'],
  '/hq/inventory/items':     ['admin', 'super_admin', 'area_manager', 'store_manager'],
  '/hq/inventory/health':    ['admin', 'super_admin', 'area_manager', 'store_manager'],
  '/hq/inventory/movements': ['admin', 'super_admin', 'area_manager', 'store_manager'],
  '/hq/reports': ['admin', 'super_admin', 'area_manager', 'store_manager'],
  '/hq/audit-log': ['admin', 'super_admin', 'area_manager', 'store_manager'],
  '/hq/onboarding': ['admin', 'super_admin'],
  '/hq/settings': ['admin', 'super_admin'],
  '/hq/daybook': ['admin', 'super_admin', 'area_manager'],
};

/** Roles that are allowed into /admin/* at all. */
export const ADMIN_PORTAL_ROLES = ['admin', 'super_admin', 'area_manager', 'store_manager'];

/**
 * The first /admin page each role may actually open (used for the HqLayout
 * "Admin Panel" cross-link target). Roles omitted here have no operational
 * /admin page and the cross-link is hidden for them.
 */
export const ADMIN_HOME_ROUTE: Record<string, string> = {
  super_admin:   '/admin',          // Dashboard
  admin:         '/admin',
  store_manager: '/admin/kitchen',  // first operational page they're allowed
  // area_manager: omitted — no /admin operational page; they live in /hq.
};

/**
 * Paths (exact) inside /admin that require full super_admin/admin access.
 * area_manager and store_manager are redirected away from these.
 * Dashboard (index) + Orders(Analytics) are HQ-only & global -> guarded too.
 */
export const ADMIN_RESTRICTED_PATHS: Record<string, string[]> = {
  '/admin':            ['admin', 'super_admin'],  // Dashboard (index)
  '/admin/orders':     ['admin', 'super_admin'],  // Analytics
  '/admin/categories': ['admin', 'super_admin'],
  '/admin/products':   ['admin', 'super_admin'],
  '/admin/staff':      ['admin', 'super_admin'],
  '/admin/shifts':     ['admin', 'super_admin', 'store_manager'],
};
