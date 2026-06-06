# Multi-Store Foundation — Phase 0 (Tenancy)

Turns the single-store FUEL app into a company-owned chain (up to ~100 stores).
This phase builds **only** the tenancy foundation and proves store isolation.
HQ/Area portals, per-store catalog/pricing, inventory and reports are later phases.

## Roles (exactly one per user)
`super_admin` (HQ) · `area_manager` (cluster of stores) · `store_manager` ·
`cashier` · `kitchen` (each bound to ONE store) · `customer` (not store-bound).

User fields: `role`, `store_id` (store-bound staff), `cluster_store_ids` (area_manager).
The legacy `admin` role is treated as `super_admin` everywhere (`normalize_role`).

## Stores
`stores` collection + HQ-only CRUD at `/api/stores` (+ public `/api/stores/public`
for customer store selection). Fields: `store_id`, name, code, address, geo
(lat/lng), phone, gst_no, fssai_license, open_hours, tax_settings,
`area_manager_id`, status (active/inactive).

## Store-scoped collections (carry `store_id`)
`orders`, `payments`, `held_bills`, `tables`, `shifts`, `stock_logs`,
`delivery_tracking`, and staff-facing `notifications`.

**Global / shared (unchanged):** products, categories, offers, packs, users
(customers), otp_codes, loyalty, streaks, meal_history, meal_plans, uploads.

## Scoping model (`server.py`)
- `staff_store_scope(user)` → `None` (all, HQ) | `[ids]` (cluster) | `[store_id]` | `[]`.
- `store_filter(user)` → Mongo fragment merged into every store-scoped query.
- `assert_store_allowed(user, store_id)` → 403 on out-of-scope writes/reads by id.
- `resolve_order_store_id(user, requested)` → POS/staff orders use the staff
  member's store; customers must pass an active `store_id` (falls back to the
  default store for backward compatibility).

Every endpoint touching a store-scoped collection applies these. Customers only
ever see/act on their own orders. Self-registration (`/auth/register`) always
creates a `customer` (no role self-escalation).

## Real-time (Socket.IO) — per store
A store's order events go only to `kitchen:{store_id}`, `cashier:{store_id}`,
`manager:{store_id}` and the global `hq` room (HQ sees all). Area managers join
their cluster's per-store rooms. Customer tracking stays on `user:{id}`.
`broadcast_event(..., store_id=...)` builds the per-store room set.

## Migration / backward compatibility
On startup (and via `POST /api/admin/migrate-multistore`, HQ-only),
`run_store_migration()` is idempotent and:
1. creates the **default store** (`STORE-DEFAULT`),
2. maps legacy `admin` → `super_admin`,
3. backfills `store_id = STORE-DEFAULT` on all existing store-scoped docs and
   store-bound staff,
4. ensures a **default store_manager** (PIN auto-assigned, logged at startup).

Existing email/PIN logins and customer accounts keep working.

## Customer app (store selection)
`frontend/utils/StoreContext.tsx` loads active stores, remembers the selected
store, and the cart stamps `store_id` on each order (selector shown in `cart.tsx`).

## Staff panel (per-store rooms)
`web-panel/src/utils/rooms.ts#roomsForUser` derives the socket rooms from the
logged-in user's role/store; Kitchen/Cashier pages join store-scoped rooms, HQ
joins `hq`.

## Tests
`backend/tests/test_multistore_isolation.py` runs fully in-process against the
app with an in-memory Mongo (mongomock-motor) — no live server needed:

```
pytest backend/tests/test_multistore_isolation.py
```

Proves: store managers/cashiers/kitchen of Store A get zero access to Store B's
orders/stock/tables/payments/reports/notifications; area manager of one cluster
can't see another cluster's stores; a customer can't read another customer's
orders; and an order placed at Store A never reaches Store B's real-time rooms.
