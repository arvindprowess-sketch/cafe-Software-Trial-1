# Phase 1B — HQ Portal UI (manual QA)

Frontend-only (`web-panel/`). Consumes the Phase 1A backend endpoints. Server is
the real authority; UI gating is UX only.

## Screens added
- **Store switcher** (`StoreSwitcher` + `StoreContext`) — header of the HQ portal.
- **Stores & Clusters** (`/hq/stores`) — super_admin CRUD; area_manager read-only cluster.
- **Store Catalog** (`/hq/catalog`) — per-store price/availability override editor.
- **Catalog Push** (`/hq/push`) — super_admin push (all/selected) + read-only push log.
- HQ links added to the Admin sidebar (super_admin); area_manager/store_manager land in `/hq` by default.

## Manual QA steps
Log in as each role and confirm screen visibility:

| Role | Store switcher | Stores & Clusters | Store Catalog | Catalog Push |
|------|----------------|-------------------|---------------|--------------|
| super_admin | all stores + "All stores" | full CRUD | any store | yes (all/selected) |
| area_manager | own cluster only | read-only (own cluster) | own-cluster stores | hidden / "HQ only" |
| store_manager | locked to own store (no dropdown) | hidden | own store only | hidden / "HQ only" |
| cashier / kitchen | none (no HQ portal) | none | none | none |

Functional checks:
1. **Switcher scope** — area_manager dropdown lists ONLY own-cluster stores; store_manager shows a locked store name (no dropdown). *(#1 UX-leak point.)*
2. **Stores CRUD** — super_admin creates/edits a store (name, code, address, GST, FSSAI, hours, area manager, status) and can deactivate; area_manager sees the same list read-only.
3. **Override save** — in Store Catalog, set a selling price + toggle availability for the selected store → row shows "overridden"; fetching the store menu (`GET /stores/{id}/menu`) reflects the new price and hides unavailable items.
4. **Push all vs selected** — push price/availability to "All stores" and to a selected subset; both succeed and a new **read-only** entry appears in the Push Log. Confirm there is **no edit/delete control** on the log.
5. **Master catalog** — the "Manage master catalog →" link (super_admin) opens the existing Products screen (super_admin-only create/edit). No master create/edit form is exposed to non-super_admin.
6. **No regressions** — existing Admin / Cashier / Kitchen panels still work.
7. **No cost/margin fields** anywhere in 1B (those are Phase 3/4).

## Endpoints used (all from Phase 1A / Phase 0 — none invented)
- `GET /stores`, `POST /stores`, `PUT /stores/{id}`, `DELETE /stores/{id}`, `GET /staff`
- `GET /products`, `GET /stores/{id}/overrides`, `PUT /stores/{id}/products/{pid}/override`
- `POST /catalog/push`, `GET /catalog/push-log` (read-only)
- `GET /stores/{id}/menu` (resolved menu verification)
