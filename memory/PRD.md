# AI Diet Cafe App - PRD

## Original Problem Statement
Diet Cafe app built with Expo React Native (TypeScript) frontend + FastAPI Python backend + MongoDB. Uses Emergent LLM Key for AI features (GPT-5.2).

## Tech Stack
- **Frontend**: Expo (React Native) with expo-router, TypeScript, tunnel mode
- **Backend**: FastAPI (Python) with MongoDB (port 8001)
- **AI**: OpenAI GPT-5.2 via Emergent LLM Key
- **Payment**: Razorpay (mock mode — no keys configured yet)

## User Personas
- **Customer**: Orders food, tracks nutrition, uses AI suggestions
- **Admin/Cafe Owner**: Manages products, categories, offers, packs, kitchen orders, analytics

## What's Been Implemented (as of Feb 2026)

### Phase 1 — Setup & Seeding
- [x] Frontend start script: `expo start --tunnel`
- [x] Seeded 16 products + 6 categories + admin user (admin@dietcafe.com / admin123)

### Phase 2 — Calorie Goal Awareness
- [x] customize.tsx: Warning modal when meal exceeds daily calorie goal (never blocks orders)
- [x] home.tsx: Nutrition card shows exceeded state with red indicator
- [x] budget-meal.tsx: Cart summary shows calorie goal context

### Phase 3 — High Impact Features (Current)
- [x] **Offers & Banners System** (Admin-managed)
  - Admin CRUD: Create/Edit/Delete offers with discount type, value, categories, coupon codes
  - Dynamic banners from active offers + packs
  - Customer: Click banner → see filtered products with discounted prices
  - Coupon code application at checkout
  - 3 default offers seeded: "Flat 20% OFF" (PROTEIN20), "₹30 OFF on Carbs" (CARB30), "Free Delivery" (FREEDEL)
- [x] **Goal Packs System** (Admin-managed)
  - Admin CRUD: Create meal packs with specific products, quantities, goal type, pricing
  - Customer: Click pack banner → see pack detail with items, nutrition, savings
  - 3 default packs seeded: Muscle Gain Pack (₹199), Fat Loss Pack (₹179), Veg Power Pack (₹249)
- [x] **Smart Portion Adjuster**
  - AI-powered (GPT-5.2) portion suggestions in calorie warning modal
  - Shows adjusted grams per item with calories saved
  - One-tap "Apply AI Adjustment" to update cart
- [x] **Razorpay Payment Integration** (MOCK MODE — no real keys)
  - Backend: Create order, verify payment endpoints
  - Mock payment flow works end-to-end
- [x] **Enhanced Push Notifications**
  - Auto-notify on order status changes (preparing, ready, completed, cancelled)
  - Uses Expo Push Notification service

## Seeded Data
### Admin: admin@dietcafe.com / admin123
### 16 Products, 6 Categories, 3 Offers, 3 Goal Packs

## New Screens Added
- offer-detail.tsx — Shows filtered products with discounts when clicking offer banner
- pack-detail.tsx — Shows pack items, nutrition, savings when clicking pack banner
- (admin)/offers.tsx — Admin offer management (CRUD)
- (admin)/packs.tsx — Admin pack management with product picker (CRUD)

## API Endpoints Added
- GET/POST /api/offers, PUT/DELETE /api/offers/{id}
- GET /api/offers/{id}/products (filtered + discounted)
- GET/POST /api/packs, PUT/DELETE /api/packs/{id}
- GET /api/packs/{id} (enriched detail)
- POST /api/payments/create-order, POST /api/payments/verify
- POST /api/orders/apply-coupon
- POST /api/ai/adjust-portions
- POST /api/seed-offers-packs
- GET /api/banners (now dynamic from offers + packs)

## Test Results
- Backend: 100% (16/16 tests passed)
- All CRUD operations verified for offers and packs
- Razorpay mock payment flow verified
- AI portion adjuster verified
- Coupon validation verified

## Prioritized Backlog
### P0
- Razorpay real key configuration (user needs to provide keys)
- Frontend Razorpay WebView checkout integration

### P1
- Payment flow UI in customize.tsx
- Order receipt with payment status
- Push notification deep-linking

### P2
- Weekly meal planning
- Loyalty/rewards system
- Google OAuth

## Next Tasks
- User to provide Razorpay test keys for live payment flow
- UI/UX redesign based on user testing feedback
