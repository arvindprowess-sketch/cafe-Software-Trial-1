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

## 2026-06 — PHASE 1: Budget Builder cleanup + Smart Fill alternatives
- 1A (budget-meal.tsx): rewrote as a pure SETUP screen. Removed leftover inline dish/product
  list, "Your Meal"/"Fits in budget"/"All Items" sections, the cart-total row and the broken
  "Review Order" bottom bar. Kept ONLY: budget input + presets (Rs100-400), spent/left bar,
  Veg/Non-Veg filter, Goal selector, and a prominent lime "Smart Fill My Meal" CTA (+ header btn).
- 1B (smart-fill.tsx): client-side alternatives under each SELECTED suggested dish. Fetches the
  existing /products catalog once (no new endpoint); per dish shows up to 3 "Similar options ·
  tap to swap" chips filtered by same diet_type, ranked by closeness in calories+carbs (per 100g)
  with a same-category bonus. swap() replaces the dish keeping same grams and recomputes
  price/macros; toggle keeps/removes. Totals + bottom bar recompute live. Verified swap
  Chicken Breast->Grilled Fish recomputed 2726->2685 cal, Rs250->Rs278.


## 2026-06-05 — Resume + Phase 2 (Home) & Phase 3 (Cart)
- Restored missing backend/.env + frontend/.env (gitignored), installed web-panel deps, re-seeded DB
  (16 products, 6 categories, 3 offers/packs, admin + kitchen 4321 + cashier 5678). Rebuilt mobile bundle.
- Current preview: https://meal-fit-goals.preview.emergentagent.com  (/ = web portal, /mobile/ = customer app).
- 2A (home.tsx): Home floating CartPill lowered from bottom=80 -> bottom=6 to sit just above the bottom
  nav, matching the Menu screen cart bar. Floating AI button raised position adjusted 150 -> 76 when cart>0.
- 2B (home.tsx): Popular Items capped at 6 (slice(0,6)); compact cards (popularCard 220->156, img 150->104,
  badges/info/price/add-button scaled down). Horizontal scroll + page vertical scroll unchanged.
- 3A (backend/server.py + cart.tsx): new GET /api/products/top-selling-by-category (auth) returns top 5
  highest-selling products per ACTIVE category (units summed from all orders; rating fallback). cart.tsx
  'Forgot something? Add more' now fetches this endpoint (fallback /products). Photo + Add per card kept.
- Verified: testing agent iteration_26 — backend 5/5 pytest green, all 3 mobile changes confirmed on /mobile.
  Regression test: /app/backend/tests/test_top_selling_by_category.py.

## 2026-06-05 — BUGFIX: mobile icons/thumbnails not showing (P0)
- Symptom (user, Hindi): "home menu build orders... chote chote images nahi aa rahe" — small
  icons + thumbnails blank across the customer mobile app.
- ROOT CAUSE: the web-panel Vite dev server serves the Expo static export at /mobile. Vite
  intercepts ANY URL containing "/node_modules/" and returned its SPA index.html
  (Content-Type: text/html) for the Expo bundled assets at
  /mobile/assets/node_modules/@expo/vector-icons/...Ionicons.<hash>.ttf (and the Google-font
  ttf + bundled PNGs). So every bundled .ttf font (Ionicons + Anton + Hanken Grotesk) and PNG
  decoded as HTML -> all icons + bundled images rendered as tofu/empty boxes. (Remote Unsplash
  images were always fine.)
- FIX (web-panel/vite.config.ts, serveMobile middleware rewrite): now intercepts EVERY /mobile/*
  request before Vite's internal handlers. Extension-less paths -> Expo index.html (client routing);
  any path WITH an extension -> read the real file from public/mobile and respond with the correct
  MIME type (font/ttf, image/png, text/javascript, text/css, image/svg+xml, ...) + long Cache-Control.
  Restarted frontend (no mobile rebuild needed — only serving changed).
- VERIFIED: curl shows Ionicons.ttf -> font/ttf with valid SFNT magic 00 01 00 00 (was text/html);
  bundled PNG -> image/png; JS -> text/javascript. Tab-bar icons render. Testing agent iteration_27:
  zero /mobile/*.{ttf,png,js} returned text/html; document.fonts.ready = Ionicons+Anton loaded; cart
  screen 8/8 <img> naturalWidth>0 + 13 icon glyphs. retest_needed=false.

## 2026-06-05 — Popular Items: 30 best-sellers in 5-row horizontal grid
- User wanted Home "Popular Items" to show up to 30 best-sellers as 5 rows stacked vertically that
  scroll sideways together (Swiggy/Zomato style = 6 cols x 5 rows). Source = highest selling (sales history).
- Backend: new PUBLIC GET /api/products/best-sellers?limit=30 — sums item qty across all orders ->
  sales_count, returns active products sorted by (-sales_count, -rating)[:limit]. Public so the grid
  always loads (no 403).
- Frontend home.tsx: loadData now fetches /products/best-sellers; popularProducts=slice(0,30);
  popularColumns chunks into columns of POPULAR_ROWS(=5); section renders columns (vertical stacks of 5)
  inside a horizontal ScrollView (popularGridScroll). Card made more compact (img 90, no desc). First 3
  get POPULAR badge.
- ALSO FIXED (real root-cause of a stuck-loading bug): Expo static export prerenders ONE html PER ROUTE
  (home.html, menu.html, cart.html...). The serveMobile middleware (web-panel/vite.config.ts) was serving
  the generic index.html for every /mobile/* route -> client hydrated 'home' against the login markup ->
  React #418 hydration mismatch -> screen stuck on spinner. Middleware now serves the route-matching
  prerendered html (verified: md5 of served /mobile/home == home.html on disk). #418 gone.
- NOTE: only 16 active products exist, so the grid currently shows 16 (fills toward 30 as products/sales grow).
- VERIFIED: testing agent iteration_28 — 100% frontend pass: 5 rows x multi-column grid, 16 cards + 16 Add
  buttons, 15-16 photos load, 53 Ionicons glyphs render, Add+ -> cart pill, best-seller order correct. retest_needed=false.

## 2026-06-05 — PHASES 2 & 3: Goal personalization + Meal split (customer app only)
Resume note: recreated gitignored backend/.env + frontend/.env (preview URL now
802e80a7-...preview.emergentagent.com), installed web-panel deps, re-seeded DB
(16 products, 6 categories, 3 offers/packs, admin + kitchen 4321 + cashier 5678).
Phase 1 (multi-tag diet types EVERYWHERE) was already DONE in the repo — verified, untouched.

### PHASE 2 — Body stats → daily target (DONE, verified)
- backend/server.py (~L406-561): compute_daily_targets() Mifflin-St Jeor BMR→TDEE(×activity)
  →goal factor; split_targets_into_meals(); goal_fit_for_product(); fetch_active_products().
  Activity x: sed1.2/light1.375/mod1.55/active1.725/vactive1.9. Cal factor: fat_loss0.82,
  muscle_gain1.15, lean_bulk1.10, recomp/maint/beginner1.0. Protein g/kg: fat_loss2.0,
  mg/lb1.8, recomp2.2, maint1.6, beginner1.4. Guardrails: CALORIE_FLOOR=1200, fat_loss never
  below BMR, "not medical advice" disclaimer + encouraging notes. fat capped 25%, carbs remainder.
- Endpoints: POST/GET /api/user/daily-target (compute+persist / fetch+recompute), get_me
  extended with body stats + has_body_stats.
- Mobile: app/goal-setup.tsx (height/weight/age/gender/activity/target-weight + consent line +
  result view with kcal/protein/macros/BMR/TDEE + disclaimer). home.tsx handleGoalTap → goal-setup
  when no stats, else builder; personalized target banner + "Plan meals". profile.tsx personalized
  target card + Edit + Plan my meals (manual override kept). Profile goals aligned to canonical
  6 GOALS from theme.ts (removed stale 'recovery' value that silently fell back to maintenance).

### PHASE 3 — Meal split + goal-fit dishes (DONE, verified)
- backend: POST /api/nutrition/meal-plan (splits daily target across 3-6 meals w/ profile weights,
  attaches goal-fit dish suggestions per meal + remaining_suggestions); GET /api/products/goal-fit
  (annotated + sorted). utils/goalFit.ts mirrors goal-fit client-side.
- Mobile: app/meal-plan.tsx (remaining-macros tracker from nutrition-summary vs target, meal-count
  selector 3/4/5/6, per-meal kcal/P/C/F + goal-fit dish cards with "Fits your goal" pills + add-to-cart,
  fill-the-gap remainder list). menu.tsx: "Fits your goal" badge + sort goal-fit dishes first.

### SCOPE RULE honored
POS (CashierPOS.tsx) + Kitchen (KitchenOrders.tsx) carry ONLY shared product diet tags (Phase 1) —
NO body stats / targets / meal plans. OrderCreate model + POST /orders response verified to contain
NO personal-goal fields (testing agent static check). App and POS orders remain identical in structure.

### Verification
- Testing agent iteration_29: backend 24/24 pytest green (test_goal_personalization_phase23.py),
  full mobile flow (login→goal-setup→result→meal-plan→profile→menu→home banner) all testids present.
- Manual screenshots: goal-setup compute (muscle_gain 3462 kcal/135g), meal-plan 3 meals + goal-fit
  suggestions, profile target card, menu goal-fit badges, profile 6-goal taxonomy.
- BUILD CACHE FIX: scripts/build-mobile.sh now clears .metro-cache + node_modules/.cache + uses
  --clear (a stale EXPO_PUBLIC_BACKEND_URL had been baked from metro cache → POST 404 'Not Found').
  ALWAYS rebuild the mobile bundle after editing frontend/: bash /app/scripts/build-mobile.sh.

### Known non-blocking
- /meal-plan emits React #418 (hydration text mismatch) when switching meal-count — cosmetic console
  warning only, functionality works; consistent with the static Expo-export hydration across screens.

### PHASE 4 (deferred, optional): weight log + progress graph + full day-plan generator + coach nudge.

## 2026-06-05 — PHASE 4: full day plan + progress + coach nudge (customer app only)
All customer-app only; POS/Kitchen untouched (scope rule verified by testing agent — no Phase 4
fields in /auth/me or OrderCreate).

### Backend (backend/server.py, ~L2547-2705)
- POST /api/nutrition/day-plan {meals_count 3-6, diet_types?} — auto-builds a full day from
  in-stock SCALABLE single dishes to hit the daily target: protein-anchor per meal sized to the
  per-meal protein slice + calorie-dense low-protein filler to top up calories; returns meals[]
  with cart-ready items[] (product_id,name,grams,calories,protein,price), totals, disclaimer.
  Respects diet_types (AND); impossible diet -> friendly 400. _resolve_daily_target/_plan_item helpers.
- POST/GET /api/user/weight-log — upsert by date in `weight_logs`; returns logs[], current_streak
  (consecutive days ending at latest log), points (=logs*10), start/latest/change. POST also writes
  latest weight back to user (target shifts with weight). Validates 25-400kg.
- GET /api/user/coach-nudge — non-shaming nudge (type plan|protein|calories|over|ontrack) from
  today's meal_history vs target; no medical advice; uses shared target (floor applied).

### Mobile
- app/meal-plan.tsx: coach-nudge banner, "Auto-build my whole day" (diet chips + Generate full day
  plan) -> day-plan Modal (per-meal items + totals vs target + disclaimer) -> "Add full day to cart"
  (cart.addMeal) -> /cart. "Track my progress" link.
- app/progress.tsx (NEW): weight log input + Log, dependency-free bar graph, streak/points/change
  cards, start/latest/target summary, empty-state testid progress-graph-empty.
- app/(tabs)/home.tsx: compact home-coach-nudge banner (gated on has_body_stats).
- app/(tabs)/profile.tsx: profile-progress-link -> /progress.

### Verification
- testing agent iteration_30: backend 28/28 pytest green (test_phase4_dayplan_progress_nudge.py).
  Scope/auth/diet-400/weight-validation/streak/nudge-wording all asserted. Frontend testids present;
  conditional banners verified via main-agent screenshots (muscle_gain day-plan 3520 vs 3462 target;
  progress log streak 2->3 / points 20->30 / 3-bar graph).
- Note: meal-plan/day-plan/coach-nudge UI are gated on has_body_stats (intentional — empty state
  offers "Set up my target" CTA). Day-plan hits calories closely; protein runs generous on the small
  protein-heavy seed menu (safe for the goals). Disclaimer "not medical advice" everywhere.

### Known non-blocking
- React #418 hydration console warning on dynamic mobile screens — pre-existing artifact of the
  static Expo-export + hydrate architecture; functionality unaffected. Left as-is per request.

### ALL PHASES 1-4 COMPLETE.
