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
- APIs: GET /api/orders/scheduled, POST /api/orders/{id}/confirm-scheduled

### Hybrid AI Meal Builder (Feb 8, 2026)
- AI picks items + budget_share_percent → System calculates exact grams (budget ±₹1, stock-aware)
- Works for both Cashier POS and Customer mobile

### Admin Panel Overhaul (Feb 8, 2026)
1. **Dashboard**: Stats grid (Products, Categories, Orders, Revenue, Pending, Low Stock), Quick Actions, Staff Accounts with inline PIN reset
2. **Manage Categories (Full CRUD)**: Add/Edit modal with icon picker, color presets, font style (default/bold/italic/mono), display order, active toggle, live preview. Inactive categories auto-hidden from customer & cashier
3. **Manage Products (Full CRUD)**: Type tabs (All/Single/Ready-Made), Single Product form (name, category*, price, stock, diet), Ready-Made Meal form (name, category*, ingredients+grams, price, serving, editable toggle). AI auto-generates description, nutrition, images. Admin cannot manually edit nutrition
4. **Product List**: Name, Type, Category, Diet, Price, Stock, Status, Edit/Disable/Delete. Products in inactive categories hidden from public
5. **Sidebar**: Dashboard, Categories, Products, Orders, Kitchen Monitor, Offers, Tables
6. **Staff simplified**: No staff management/shifts page. Just Kitchen + Cashier accounts shown with Reset PIN

## Testing Status
- iteration_14: Scheduled orders 100% pass
- iteration_15: AI meal builder 100% pass (10/10)
- iteration_16: Admin panel 100% pass (17/17 backend, full frontend)

## Key APIs
- `POST /api/orders` - Create order (supports scheduled)
- `GET /api/orders/scheduled` - Kitchen scheduled orders
- `POST /api/orders/{id}/confirm-scheduled` - Kitchen confirms scheduled
- `GET /api/admin/dashboard-stats` - Dashboard stats (admin)
- `GET /api/admin/staff-accounts` - Kitchen/Cashier accounts (admin)
- `PUT /api/admin/staff/{id}/reset-pin` - Reset staff PIN (admin)
- `POST /api/categories` - Create category with font_style
- `GET /api/categories` - Active categories (public)
- `GET /api/categories/all` - All categories (admin)
- `POST /api/products/single` - Create single product with category_id
- `POST /api/products/ready-made` - Create ready-made meal with category_id
- `POST /api/ai/quick-meal` - Hybrid AI meal builder

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
