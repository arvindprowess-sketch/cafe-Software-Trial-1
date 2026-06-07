# Phase 2B — Offer/Coupon manager UI (manual QA)

Frontend-only (`web-panel/`). Consumes the **Phase 2A** offers backend (PR #6).
Server is the real gate; UI gating is UX only.

> Requires Phase 2A merged/deployed: `GET /offers/all` (role-scoped) and the
> scope fields on `POST/PUT /offers`. Against a pre-2A backend the area/store
> manager flows will 403 (surfaced as a friendly error) and scope fields are
> ignored.

## Screen
`/hq/offers` (in the HQ portal). Nav entry visible to super_admin / area_manager /
store_manager; cashier/kitchen never reach `/hq` (route-guarded).

## Endpoints used (all existing — none invented)
`GET /offers/all`, `POST /offers`, `PUT /offers/{id}`, `DELETE /offers/{id}`,
`GET /categories`, `GET /products`, `GET /stores` (via StoreContext), `GET /staff`
(super_admin, to pick a cluster's area manager). No redemption-count route is
called (none exists in 2A) so redeemed counts are not shown — only the configured
usage limits.

## Manual QA
1. **Role visibility / route guard**
   - super_admin: all offers, scope column shows All / Cluster / N stores.
   - area_manager: only own-cluster offers.
   - store_manager: only own-store offers.
   - cashier / kitchen: `/hq/offers` not in nav and not reachable by URL (redirects out).
2. **Scope picker per role** (#1 UX-leak point)
   - super_admin: All stores / My cluster (pick area manager) / Specific stores (full store list).
   - area_manager: My cluster / Specific stores — store picker lists **only own-cluster** stores; cannot pick "All".
   - store_manager: **locked** to own store (no picker; store name shown).
3. **Create** a %/flat/BOGO offer → appears in the list. (Combo & bank types are
   intentionally **absent** — not in the 2A model, so no unknown fields are sent.)
4. **Edit** an offer (price/scope/dates/limits) and **toggle active** → reflects in list.
5. **Delete** an offer.
6. **Friendly 403** — e.g. an area_manager editing another cluster's offer (or any
   backend scope rejection) shows an inline error, no crash.
7. **Validity & limits** visible on each row (start→end, total/per-user limits, "1st" flag).

## Build
`npm run build` (vite) passes — 87 modules. New file `HqOffers.tsx` typechecks clean
(the lone pre-existing `tsc` note in `KitchenOrders.tsx` is unrelated and not part of the build).
