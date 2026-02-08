# AI Diet Cafe App - PRD

## Original Problem Statement
Diet Cafe management: Mobile App (customers) + Web Panel (admin/kitchen/cashier) + shared FastAPI backend + MongoDB.

## Architecture
- **Backend**: FastAPI port 8001, MongoDB
- **Web Panel**: React + Vite port 3000
- **Mobile App**: Expo React Native with tunnel
- **Auth**: Email/password (admin), PIN (staff), OTP (customers)

## What's Been Implemented

### Session 1: Initial Build
- Full backend, mobile app, web panel, auth, Razorpay mock, QR tables, offers/packs

### Session 2: All Backlogs (P0/P1/P2)
- Stock management, notifications, receipts, coupons, sound alerts, shifts, loyalty, meal planning, streaks

### Session 3: Cashier POS Overhaul
- Build by grams/MRP, GST breakup, Cash/UPI/Card/Other payments, walk-in customers, ready-made support

### Session 4: 5 Critical Fixes (Feb 8, 2026)
1. **AI Budget Exact**: Post-processing scales portions to match budget precisely.
2. **Hold Bills**: Cart can be held and resumed with full cart restore.
3. **AI Cart Merging**: AI items merge into single entries. Each cart item editable.
4. **Admin-Only Categories**: POS shows only admin-created categories.
5. **Offers Visible to Cashier**: Active offers shown as banner with auto-fill coupon code.

### Session 5: Scheduled Orders (Feb 8, 2026)
1. **Customer-side (Mobile)**: Order type selector (Dine-in/Takeaway/Delivery), schedule toggle with time picker, shows kitchen alert time preview.
2. **Backend**: `is_scheduled`, `scheduled_ready_time`, `kitchen_alert_time` fields on orders. Alert time = ready_time - 10min (dine-in/takeaway) or 20min (delivery).
3. **Kitchen (Web Panel)**: Active/Upcoming tabs, blocking popup at alert time with order details + ingredient-wise grams, "Confirm & Start" to move to preparing.
4. **APIs**: `GET /api/orders/scheduled` (with alert_triggered flag), `POST /api/orders/{id}/confirm-scheduled`.
5. **Mobile orders screen**: Shows "scheduled" step in timeline, displays scheduled ready time.

## Testing Status
- All 14 iterations passing
- Backend: 100%, Frontend: 100%

## Key APIs
- `POST /api/orders` - Create order (supports is_scheduled + scheduled_ready_time)
- `GET /api/orders/scheduled` - Kitchen: get scheduled orders with alert_triggered flag
- `POST /api/orders/{id}/confirm-scheduled` - Kitchen confirms and starts scheduled order
- `POST /api/auth/pin-login` - Staff PIN login (kitchen: 1234, cashier: 5678)

## Next Tasks
1. Mobile app: loyalty rewards, streak tracker, weekly meal planning screens
2. Real Razorpay integration (currently mocked)
3. Push notifications for order updates
4. Customer feedback/ratings system
5. Notifications list UI in web panel
6. Backend refactoring: Split monolithic server.py into modules
