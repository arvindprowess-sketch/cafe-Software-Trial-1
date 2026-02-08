# AI Diet Cafe App - PRD

## Original Problem Statement
Diet Cafe app built with Expo React Native (TypeScript) frontend + FastAPI Python backend + MongoDB. Uses Emergent LLM Key for AI features (GPT-5.2).

## Tech Stack
- **Frontend**: Expo (React Native), TypeScript, expo-router, tunnel mode
- **Backend**: FastAPI (Python), MongoDB (port 8001)
- **AI**: OpenAI GPT-5.2 via Emergent LLM Key
- **Payment**: Razorpay (MOCK MODE — no keys configured)

## What's Been Implemented (Feb 2026)

### Phase 1 — Setup & Seeding
- [x] expo start --tunnel, 16 products, 6 categories, admin user

### Phase 2 — Calorie Goal Awareness
- [x] Warning modal (never blocks), exceeded state on home, goal context in budget-meal

### Phase 3 — High Impact Features
- [x] **Offers & Banners System**: Admin CRUD, dynamic banners, filtered discounted products, coupon codes
- [x] **Goal Packs System**: Admin CRUD, pack detail with nutrition/savings, one-tap order
- [x] **Smart Portion Adjuster**: AI GPT-5.2 suggests gram reductions, one-tap apply
- [x] **Razorpay Payment**: Mock mode backend (create-order, verify)
- [x] **Push Notifications**: Auto-notify on order status changes

### Phase 4 — AI Combo Builder
- [x] **Dedicated combo-builder.tsx screen** with 3-step flow:
  - Step 1: Set budget (₹100-500)
  - Step 2: Choose goal (Muscle Gain / Fat Loss / Maintenance)
  - Step 3: Diet preference (Veg / Non-Veg / Both)
  - AI generates optimal combo → shows items, nutrition, price vs budget
  - One-tap "Order Combo" sends to customize screen
  - Retry button for regeneration
  - Animated transitions, loading states, step dots

## Screens Added This Session
- combo-builder.tsx — AI Combo Builder (3-step → result → order)
- offer-detail.tsx — Filtered products with discounts
- pack-detail.tsx — Pack items, nutrition, savings
- (admin)/offers.tsx — Admin offer management
- (admin)/packs.tsx — Admin pack management

## API Endpoints
- POST /api/ai/quick-meal — AI combo generation (GPT-5.2)
- POST /api/ai/adjust-portions — Smart portion adjuster
- CRUD /api/offers, /api/packs
- GET /api/banners (dynamic from offers + packs)
- POST /api/payments/create-order, /api/payments/verify
- POST /api/orders/apply-coupon

## Test Results
- All backend tests: 100% (11/11 passed)
- AI Quick Meal tested with muscle_gain/fat_loss/maintenance, veg/non-veg/both, budgets ₹50-200

## Seeded Data
- Admin: admin@dietcafe.com / admin123
- 16 Products, 6 Categories, 6 Offers, 6 Packs

## Backlog
### P0: Razorpay real keys, Frontend payment WebView
### P1: Order receipt UI, Push notification deep-linking
### P2: Weekly meal planning, Loyalty/rewards, Google OAuth
