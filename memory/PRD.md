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
- P1: real MSG91 keys (currently DEV-mode OTP logging); optional Razorpay if needed later.
- P2 (tech debt): split 3.8k-line server.py by domain; optimize stock loop in create_order;
  consolidate AdminKitchen vs KitchenOrders into one shared component.
- P2 (mobile polish): apply Anton/Hanken to every remaining Text across all mobile screens
  (Phase 2 applied fonts on key brand/heading/price surfaces; deeper screens use system font
  until fonts load); verify on a real device via Expo tunnel.

## Phase 2 — "FUEL" design system (DONE — 2026-06-04)
Skin-only rebrand from the Burger-King clone to FUEL. No routes / data-testids / API logic changed.
- Tokens: --sand #F4F1E9 (canvas), --ink #15140F (structure), --lime #C7F24E (signature accent),
  --lime-deep #A6D62E; macros protein #E2603F / carbs #D69A35 / fat #5E97B8; veg #3FA34D /
  non-veg #C0392B. Rule enforced: never pure black, never red/orange as the PRIMARY brand color.
- Fonts: Anton (display/headings/prices/CTAs, uppercase) + Hanken Grotesk (body). Web via Google
  Fonts in index.html; mobile via @expo-google-fonts/anton + /hanken-grotesk in app/_layout.tsx.
- Web panel: web-panel/src/App.css fully rewritten to FUEL tokens (all class names preserved);
  ink sidebar/top-nav with lime active item; pill buttons (lime fill + ink text); white cards;
  ink data-table headers. Brand renamed "Diet Cafe" -> "FUEL" (login ⚡ mark, sidebar, POS).
  Inline page hexes migrated via scripts/fuel_palette_migrate.py.
- Mobile (frontend): new utils/theme.ts (FUEL palette + FONT names + GOALS). Ink bottom nav with
  raised circular lime "⚡ BUILD" center button (app/(tabs)/_layout.tsx). Home goal selector
  (Fat Loss / Muscle Gain / Maintenance / Beginner) feeding the AI meal builder. Macro chips
  (P/C/F) + Ready-made vs BUILD tag on every menu card. Lime cart bar, lime login CTA, Anton
  headings/prices. customize.tsx already had the live sticky kcal/P/C/F/price summary.
- DB: scripts/fuel_db_recolor.py recolored existing offers to ink; categories seeded with FUEL
  macro/diet colors; backend OfferCreate/category/banner defaults updated to FUEL tokens.
- design_guidelines.json rewritten to the FUEL spec.
- Verification: web-panel login screenshot (Anton+lime+ink confirmed); testing agent iteration_23
  -> backend 19/19 green, all admin/kitchen/cashier flows pass, FUEL theme confirmed on rendered
  surfaces, no leftover BK colors, no console errors. ESLint clean on both codebases.

## Next tasks
1. (Optional) Deeper mobile font coverage + on-device Expo verification.
2. Add real MSG91 keys to enable live SMS OTP.

## Test artifacts
- /app/backend/tests/test_fuel_phase1.py (canonical Phase 1 regression)
- /app/backend/tests/ws_smoke.py (Socket.IO smoke)
- /app/test_reports/iteration_22.json, /app/test_reports/iteration_23.json (Phase 2 regression)

## 2026-06-04 — Dual preview enablement (resume session)
Goal: give the user ONE preview URL to test BOTH the customer mobile app and the staff web portal.
- Recreated missing `backend/.env` (MONGO_URL, DB_NAME, JWT_SECRET, EMERGENT_LLM_KEY, MSG91 blank=DEV)
  and `frontend/.env` (EXPO_PUBLIC_BACKEND_URL = preview URL).
- Re-seeded DB: 16 products + admin(admin@dietcafe.com/admin123), 6 categories, 3 offers/3 packs,
  kitchen PIN 4321, cashier PIN 5678.
- Single-port (3000) dual serving:
  * Web portal (Vite dev) served at `/`.
  * Mobile app = Expo static web export with `expo.experiments.baseUrl="/mobile"`,
    output copied to `web-panel/public/mobile`, served at `/mobile`.
  * Added a Vite middleware (`vite.config.ts` serveMobile plugin) so extension-less `/mobile/*`
    routes return the Expo index.html (instead of the web-panel SPA fallback).
  * `scripts/start-both.sh` now runs the web-panel; `scripts/build-mobile.sh` rebuilds the mobile bundle.
- Verified: web portal admin login → dashboard OK; mobile phone+OTP (DEV log) → token+user OK.
- NOTE: react-native-maps is in package.json but unused; only expo-camera is used (web-compatible),
  so the Expo web export succeeds cleanly.
- Mobile app is a STATIC build → re-run `bash /app/scripts/build-mobile.sh` after editing `frontend/`.
- OTP is DEV-mode (no MSG91 keys) → OTP not sent to phone; appears in backend log.

## 2026-06-04 — DEV-ONLY dev_otp convenience
- `/auth/otp/send` returns `dev_otp` (plaintext) ONLY when no SMS provider is configured
  (helper `sms_is_configured()` = MSG91_AUTH_KEY + MSG91_TEMPLATE_ID both set). Logs a clear
  warning. When MSG91 is configured, `dev_otp` is never included (production-safe).
- Mobile `app/index.tsx` reads `result.dev_otp` (was `demo_otp`) -> shows "Demo OTP" box on
  the verify screen. Rebuilt mobile bundle via scripts/build-mobile.sh. Verified e2e.

## 2026-06-04 — Customer App Fixes Round 2 (5 fixes, all verified 5/5)
- FIX 1 Delivery location: home.tsx delivery bar -> address modal using expo-location
  (permission -> getCurrentPosition -> reverseGeocode; Nominatim web fallback; coords fallback)
  + manual-entry fallback; persisted to AsyncStorage 'delivery_address'; carried into customize.tsx
  and stored on the order (OrderCreate.delivery_address + order doc; backend).
- FIX 2 Six canonical goals from ONE source (utils/theme.ts GOALS: fat_loss, muscle_gain,
  maintenance, beginner, recomposition, lean_bulk). Used on Home selector, SideDrawer (3-dots),
  AI Picks inline builder, Budget Builder goal row, and combo-builder. Backend GOAL_GUIDELINES +
  prompt lines added for recomposition (maintenance cal, very high protein) and lean_bulk
  (~+10-15% surplus, high protein, controlled fat).
- FIX 3 Removed duplicate goal+budget: customize.tsx hides the Fitness Goal + Budget section when
  goal is carried via params (cameFromAI). home orderAiMeal, combo orderCombo, budget-meal
  proceedToCheckout, and smart-fill all pass goal+budget.
- FIX 4 Popular Items: moved vegBadge onto the product image (top:124) so it no longer overlaps
  the 'Add +' button.
- FIX 5 Smart Fill -> new dedicated screen app/smart-fill.tsx (dishes list, toggle each, Back,
  Review Order -> customize -> Place Order -> Orders tab). Removed the old frozen inline AI
  suggestions panel from budget-meal.tsx; added a Goal selector row there.
- Also normalized data-testid -> testID in SideDrawer.tsx & menu.tsx (RN-Web only maps testID).
- Mobile is a static web export: after Expo edits run `bash /app/scripts/build-mobile.sh`.

## 2026-06-04 — Round 3: Unified Cart + Checkout + AI Add
- NEW shared cart (utils/CartContext.tsx, AsyncStorage-persisted) used by Menu, Home (popular + AI builder),
  AI Diet Assistant, Build/Budget, Combo, Smart Fill, Reorder. One cart app-wide.
- NEW app/cart.tsx unified checkout: macros hero (kcal+P/C/F), order-type toggle (dine-in table /
  takeaway / delivery address+tip), coupons & offers, savings tiers bar, full bill breakdown,
  schedule, GST invoice, "add more" photo carousel, empty state, payment mode, Place Order.
- NEW components/CartPill.tsx floating pill on browsing screens.
- Add-to-cart steppers everywhere (menu add-<id>/plus/minus, home popular, cart inc/dec).
- AI chat: explicit "Add to cart" per suggestion (ai-add-meal-<id>) -> shared cart with exact grams.
- All old direct-order paths now route to /cart (no checkout that skips the cart). /customize retired as checkout.
- Reorder (order-detail) -> POST /orders/{id}/reorder -> replaceCart -> /cart with unavailable guard.
- BACKEND: POST /api/cart/quote = authoritative bill (recomputes prices from current products = anti-tamper,
  validates live stock -> out_of_stock, applies coupon/offer percentage/flat/bogo, delivery fee w/ free-over-300,
  GST 5% incl, tip, savings tiers, max prep time). create_order stores delivery_fee/tip/gstin/business_name/delivery_time
  + server total. /ai/chat now reliably emits actions.add (prompt + first-brace JSON parse + deterministic
  name+grams fallback parser; import re added).
- Tested 11/12 then AI-add fixed. Mobile is static export: rebuild via scripts/build-mobile.sh.

## 2026-06 — Round 3 closeout: AI chat JSON leak fixed (P0 DONE)
- BUG: AI Diet Assistant chat bubble leaked raw `{"add":[...]}` / ```` ```json ```` fences.
  Root cause: old logic only stripped the JSON from `message` when `json.loads` succeeded;
  when the LLM wrapped it in markdown fences or added trailing text, the fence/prefix stayed.
- FIX (backend-only, server.py): new module-level helper `strip_action_json(response)` —
  regex-extracts the action block (greedy to last `}` so nested arrays parse), ALWAYS removes
  it from the user-facing text (even if parse fails), strips leftover ```` ``` ````/```json fences,
  and falls back to a friendly line if only JSON was returned. `ai_chat` now calls this helper.
  Deterministic name+grams fallback retained for when no JSON is emitted.
- Regression test: /app/backend/tests/test_ai_chat_strip.py (6 cases: fenced/bare/checkout/
  json-only/malformed/plain — all green). Verified e2e via external ingress URL: CLEAN + actions intact.
- NOTE: pure backend fix → no mobile rebuild needed (ai-chat.tsx just renders result.message).

## 2026-06 — BUGFIX: BUILD tab opened a blank/crashing page
- Symptom (user): "build pe click karne per page open nahi ho raha hai".
- Root cause: app/(tabs)/budget-meal.tsx called `useCart()` (line 26, added in Round 3) but
  never imported it → ReferenceError on render → blank screen when tapping the ⚡ BUILD tab.
- FIX: added `import { useCart } from '../../utils/CartContext';`. Rebuilt mobile bundle
  (bash scripts/build-mobile.sh). Verified via screenshot: Budget Meal Builder renders fully.

