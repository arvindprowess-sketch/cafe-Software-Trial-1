# FUEL (formerly "Diet Cafe") — PRD

## Problem Statement
Upgrade an existing cafe ordering platform (FastAPI + MongoDB backend, Expo/React Native
customer app `frontend/`, React+Vite staff web panel `web-panel/` with Admin/Kitchen/Cashier).
All four surfaces share ONE backend + ONE MongoDB. Two-phase plan agreed with user:
Phase 1 = Security + Real-time + backend/feature changes; Phase 2 = "FUEL" design system.

## Architecture
- Backend: FastAPI on :8001. REST under `/api/*` + Socket.IO at `/api/socket.io`
  (FastAPI wrapped by `socketio.ASGIApp` at end of `server.py`).
- Web panel: Vite on :3000 (Admin / Kitchen / Cashier). Proxies `/api` -> :8001 (ws enabled).
- Mobile: Expo customer app (`frontend/`), uses `EXPO_PUBLIC_BACKEND_URL`.
- DB: MongoDB (DB_NAME=dietcafe).

## User Personas
- Customer (mobile, phone+OTP login), Admin, Cashier/POS, Kitchen (web panel).

## Env vars (backend/.env)
MONGO_URL, DB_NAME, EMERGENT_LLM_KEY, JWT_SECRET, ALLOWED_ORIGINS (empty=>"*" dev),
MSG91_AUTH_KEY/MSG91_TEMPLATE_ID/MSG91_SENDER_ID (empty => DEV OTP logging),
RAZORPAY_KEY_ID/RAZORPAY_KEY_SECRET (empty; not used — user declined online payments).

## What's been implemented
### Phase 1 — DONE (2026-06-04), backend 18/19 automated tests pass (+ socket smoke)
- A1: `/auth/otp/send` no longer returns OTP. A2: MSG91 SMS w/ DEV log fallback.
- A3: JWT_SECRET from env. A4: CORS from ALLOWED_ORIGINS. A5: OTP in MongoDB `otp_codes`
  w/ TTL index; A6: env vars wired.
- B1: per-product nutrition fields (admin overrides NUTRITION_DB) + admin forms (add+edit).
- B2: new `accepted` order status across backend + all panels + customer screens.
- B3: duplicate-order guard (409 + confirm_duplicate bypass; handled in customer checkout).
- B4: AI medical-advice guardrails; AI menu window increased 20->60.
- B5: per-product `preparation_time_minutes`; scheduled kitchen alert uses longest item prep;
  prep shown on kitchen ticket.
- B6: BOGO offer type (backend apply-coupon computes cheapest-free + Admin Offers create form).
- C1/C2/C5: Socket.IO real-time. new_order/order_status/menu_update broadcasts to rooms
  (kitchen/cashier/admin/customers/user:<id>). Web panels + customer app subscribe via
  useRealtime hooks; kitchen sound+visual alert retained; LIVE/OFFLINE badges on kitchen views.
- C3: out-of-stock auto-hide in customer menu + live menu_update refresh.
- C4: role-based access enforced (customer 403 on admin endpoints).

## Prioritized backlog
- P0 (Phase 2): "FUEL" design system across mobile + web panel (sand/ink/lime tokens,
  Anton + Hanken Grotesk fonts, macro chips, goal-first ordering, build-your-own meal screen,
  pill buttons, ink bottom nav w/ raised lime center button).
- P1: real MSG91 keys (currently DEV-mode OTP logging); optional Razorpay if needed later.
- P2 (tech debt): split 3.8k-line server.py by domain; optimize stock loop in create_order;
  consolidate AdminKitchen vs KitchenOrders into one shared component.

## Next tasks
1. Implement Phase 2 FUEL design (mobile + web panel).
2. After Phase 2, full regression on both surfaces.

## Test artifacts
- /app/backend/tests/test_fuel_phase1.py (canonical Phase 1 regression)
- /app/backend/tests/ws_smoke.py (Socket.IO smoke)
- /app/test_reports/iteration_22.json
