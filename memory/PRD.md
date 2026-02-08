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
3. **Cashier**: POS system, order placement, coupon application, receipt generation
4. **Customer** (Mobile): Browse menu, AI meal suggestions, place orders, track calories, loyalty rewards

## Core Requirements (Static)
- Role-based access control
- Real-time order flow (customer → kitchen → ready → completed)
- Nutrition tracking (calories, protein, carbs, fat per item)
- AI-powered meal suggestions (GPT-5.2 via Emergent LLM key)

## What's Been Implemented

### Session 1 (Initial Build)
- Full backend with products, categories, orders, users, payments
- Mobile app: Menu, AI meals, orders, calorie tracking
- Web panel: Admin dashboard, Kitchen display, Cashier POS
- OTP auth for customers, email/PIN for staff
- Razorpay mock payment integration
- QR table scanning, offers/packs

### Session 2 (Feb 8, 2026) - All Backlogs Implemented
**P0 - Critical:**
- Stock quantity management (add/remove stock with reason tracking)
- Stock change logs with history

**P1 - Important:**
- Notification system (create on new orders, list, mark read)
- Order receipt/bill generation with nutrition summary
- Coupon code application at checkout (PROTEIN20, CARB30, FREEDEL)
- Sound/vibration alerts for kitchen (Web Audio API, toggle ON/OFF)
- Kitchen ticket printing (print-friendly format)
- Active orders API for kitchen/cashier

**P2 - Nice to Have:**
- Shift management (CRUD, status: scheduled → active → completed)
- Loyalty/rewards system (earn 1 pt per ₹10, redeem 10 pts = ₹1)
- Weekly meal planning (manual + AI-generated via GPT-5.2)
- Daily streak tracker (auto-updates on order placement)
- All auto-integrated: orders auto-earn loyalty + update streaks + notify kitchen

## Testing Status
- All backend APIs: 100% passing
- All frontend flows: 100% passing (Admin, Kitchen, Cashier)
- PIN login fixed and working for staff
- Stock management, coupon codes, receipt generation all tested

## Prioritized Backlog
### P0 - None remaining

### P1 - Future
- Push notifications (device-level for mobile customers)
- Real Razorpay key integration (currently mock)
- Google OAuth for admin login

### P2 - Future
- Weekly meal planning UI in mobile app
- Loyalty/rewards display in mobile app
- Daily streak visualization in mobile app
- Print kitchen ticket (physical printer integration)
- SMS/WhatsApp order notifications for customers
- Customer feedback/ratings system
- Multi-branch support
- Ingredient cost tracking & profit analytics

## Next Tasks
1. Mobile app: Add loyalty rewards, streak tracker, weekly meal planning screens
2. Push notifications setup for order status updates
3. Razorpay real key integration when keys are available
4. Customer feedback system after order completion
