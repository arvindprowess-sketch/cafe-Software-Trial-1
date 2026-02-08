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
1. **AI Budget Exact**: ₹300 budget → meal totals hit 96-100% (was 58-85%). Post-processing scales portions to match budget precisely.
2. **Hold Bills**: Cart can be held → appears as complete pending bill in Orders > Hold tab. Resumable with full cart restore.
3. **AI Cart Merging**: AI items merge into single entries (not duplicates). Each cart item editable with inline grams + price editor.
4. **Admin-Only Categories**: POS shows only admin-created categories (Protein, Carb, Fat, Meal) — no hardcoded Veg/Non-Veg.
5. **Offers Visible to Cashier**: Active offers shown as banner, clicking auto-fills coupon code. Same offers customers see.

## Testing Status
- All 13 iterations passing
- Backend: 100%, Frontend: 95-100%

## Next Tasks
1. Mobile app: loyalty rewards, streak tracker, weekly meal planning screens
2. Real Razorpay integration
3. Push notifications for order updates
4. Customer feedback/ratings system
