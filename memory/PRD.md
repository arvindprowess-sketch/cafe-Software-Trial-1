# AI Diet Cafe App - PRD

## Original Problem Statement
Build a Diet Cafe management system with:
- Customer-facing MOBILE APP (Expo React Native)
- Admin/Kitchen/Cashier WEB PANEL (React + Vite)
- Shared FastAPI backend + MongoDB

## Architecture
- **Backend**: FastAPI on port 8001, MongoDB
- **Web Panel**: React + Vite on port 3000 (Admin, Kitchen, Cashier)
- **Mobile App**: Expo React Native with tunnel
- **Auth**: Email/password for admin, PIN for staff, OTP for customers

## User Personas
1. **Admin**: Full system management (products, staff, categories, offers, tables, shifts, analytics)
2. **Kitchen Staff**: Order management, inventory, stock control, ticket printing
3. **Cashier**: POS system, order placement, coupon application, payment handling, receipt generation
4. **Customer** (Mobile): Browse menu, AI meal suggestions, place orders, track calories, loyalty rewards

## What's Been Implemented

### Session 1 (Initial Build)
- Full backend with products, categories, orders, users, payments
- Mobile app: Menu, AI meals, orders, calorie tracking
- Web panel: Admin dashboard, Kitchen display, Cashier POS
- OTP auth for customers, email/PIN for staff
- Razorpay mock payment integration
- QR table scanning, offers/packs

### Session 2 (Feb 8, 2026) - All Backlogs
- **P0**: Stock management, stock logs
- **P1**: Notifications, receipt generation, coupons, sound alerts, kitchen tickets
- **P2**: Shift management, loyalty/rewards, weekly meal planning, daily streak

### Session 3 (Feb 8, 2026) - Cashier POS Overhaul
**Cashier CAN do:**
- Create orders for walk-in customers (customer name field)
- Build-your-own meals by **grams** or **MRP (₹)** with live preview
- Ready-made meal ordering by plate count
- AI-guided meal suggestions for customer assistance
- Edit cart before payment (inline gram edit buttons)
- View **GST + price breakup** (Base Amount, CGST 2.5%, SGST 2.5%)
- Handle payments: **Cash, UPI, Card, Other** offline modes
- Apply coupon codes at checkout
- After payment → auto-sends to kitchen with payment_status: paid
- Print receipt with full breakup

**Cashier CANNOT do:**
- Change recipes or ingredients of non-editable ready-made meals
- Access inventory management (removed from nav)
- Change prices or admin settings

## Testing Status
- Backend APIs: 100% passing (all iterations)
- Frontend flows: 100% passing (all 15 Cashier POS features verified)
- Kitchen PIN (1234), Cashier PIN (5678) both working

## Prioritized Backlog
### P0 - None

### P1 - Future
- Real Razorpay key integration
- Push notifications for mobile customers
- Google OAuth for admin

### P2 - Future
- Mobile app: loyalty rewards UI, streak tracker, weekly meal planning screens
- Physical printer integration for kitchen tickets
- Customer feedback/ratings system
- Multi-branch support
- Ingredient cost tracking & profit analytics

## Next Tasks
1. Mobile app screens for loyalty, streak, meal planning
2. Push notifications for order updates
3. Real payment gateway integration
