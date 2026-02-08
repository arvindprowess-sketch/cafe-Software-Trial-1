# AI Diet Cafe App - PRD

## Original Problem Statement
Diet Cafe management: Mobile App (customers) + Web Panel (admin/kitchen/cashier) + shared FastAPI backend + MongoDB.

## Architecture
- **Backend**: FastAPI port 8001, MongoDB
- **Web Panel**: React + Vite port 3000
- **Mobile App**: Expo React Native with tunnel
- **Auth**: Email/password (admin), PIN (staff), OTP (customers)

## What's Been Implemented

### Session 1-4: Core + Backlogs + Cashier POS Overhaul
- Full backend, mobile app, web panel, auth, stock mgmt, shifts, loyalty, sound alerts
- Cashier POS with Build-by-grams/MRP, GST, Hold Bills, AI cart merge, offers
- AI budget exact matching, admin categories, order source tracking

### Session 5: Scheduled Orders (Feb 8, 2026)
1. Customer-side (Mobile): Order type selector, schedule toggle with time picker
2. Backend: `is_scheduled`, `scheduled_ready_time`, `kitchen_alert_time` fields
3. Kitchen (Web Panel): Active/Upcoming tabs, blocking popup at alert time
4. APIs: `GET /api/orders/scheduled`, `POST /api/orders/{id}/confirm-scheduled`

### Session 5b: Hybrid AI Meal Builder (Feb 8, 2026)
1. **AI picks WHAT items** — based on fitness goal, diet preference, nutrition balance
2. **System calculates HOW MUCH** — exact grams per item using deterministic math:
   - Hits budget within ₹1 (tested: ₹0-0.60 variance)
   - Respects real stock limits (never exceeds available_qty_grams)
   - 5g rounding for clean portions
   - Multi-round iterative adjustment to close budget gap
3. AI now outputs `budget_share_percent` per item (not grams)
4. Works for both Cashier POS and Customer mobile app (same endpoint)

## Testing Status
- iteration_14: Scheduled orders 100% pass
- iteration_15: AI meal builder 100% pass (10/10 tests)

## Key APIs
- `POST /api/ai/quick-meal` - Hybrid AI meal builder (AI picks + system portions)
- `POST /api/orders` - Create order (supports scheduled)
- `GET /api/orders/scheduled` - Kitchen scheduled orders
- `POST /api/orders/{id}/confirm-scheduled` - Kitchen confirms scheduled
- `POST /api/auth/pin-login` - Staff PIN login (kitchen: 1234, cashier: 5678)

## Next Tasks
1. Mobile app: loyalty rewards, streak tracker, weekly meal planning screens
2. Real Razorpay integration (currently mocked)
3. Push notifications for order updates
4. Customer feedback/ratings system
5. Notifications list UI in web panel
6. Backend refactoring: Split monolithic server.py into modules
