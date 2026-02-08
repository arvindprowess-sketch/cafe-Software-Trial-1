# AI Diet Cafe App - PRD

## Original Problem Statement
Diet Cafe management: Mobile App (customers) + Web Panel (admin/kitchen/cashier) + shared FastAPI backend + MongoDB.

## Architecture
- **Backend**: FastAPI port 8001, MongoDB
- **Web Panel**: React + Vite port 3000
- **Mobile App**: Expo React Native with tunnel
- **Auth**: Email/password (admin), PIN (staff), OTP (customers)

## What's Been Implemented

### Core Build (Sessions 1-4)
- Full backend, mobile app, web panel, auth, stock mgmt, shifts, loyalty, sound alerts
- Cashier POS with Build-by-grams/MRP, GST, Hold Bills, AI cart merge, offers
- AI budget exact matching, admin categories, order source tracking

### Scheduled Orders (Feb 8, 2026)
- Customer schedule toggle + time picker, Kitchen alert popup (blocking), Confirm & Start flow

### Hybrid AI Meal Builder (Feb 8, 2026)
- AI picks items + budget_share_percent → System calculates exact grams (budget ±₹1, stock-aware)

### Admin Panel Overhaul v1 (Feb 8, 2026)
- Dashboard: Stats grid, Quick Actions, Staff Accounts with PIN reset
- Categories: Full CRUD with icon, color, font_style, sort_order, active toggle
- Products: Type tabs, Single/Ready-Made forms, mandatory category, AI auto-generate

### Admin Panel v2 — Shortcomings Fixed (Feb 8, 2026)
1. **Photo upload for Ready-Made Meals**: Image upload via base64 + file picker, stored in DB
2. **Edit modal: Category change**: Dropdown to reassign any product to a different category
3. **Ready-Made meal edit**: Price per plate, available plates, customizable toggle all editable
4. **Product search**: Real-time filtering by name or category
5. **Font_style propagation**: Category font_style (bold/italic/mono/default) renders in Cashier POS sidebar and Mobile app menu
6. **AI result feedback**: After creating a product, shows AI-generated image, description, nutrition breakdown before closing
7. **Low stock alerts**: Dashboard shows red-highlighted alerts for products < 500g stock
8. **Inactive category filter**: Products in inactive categories auto-hidden from customer & cashier public endpoints

## Testing Status
- iteration_14: Scheduled orders 100% pass
- iteration_15: AI meal builder 100% pass
- iteration_16: Admin panel v1 100% pass
- iteration_17: Admin panel v2 shortcomings 100% pass (15 features)

## Credentials
- Admin: admin@dietcafe.com / admin123
- Kitchen PIN: 1234
- Cashier PIN: 5678

## Next Tasks
1. Mobile app: loyalty rewards, streak tracker, weekly meal planning
2. Real Razorpay integration (currently mocked)
3. Push notifications for order updates
4. Customer feedback/ratings system
5. Backend refactoring: Split monolithic server.py into modules
