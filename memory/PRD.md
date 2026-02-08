# AI Diet Cafe App - PRD

## Original Problem Statement
Diet Cafe app with Expo React Native (TypeScript) frontend + FastAPI backend + MongoDB. Uses Emergent LLM Key for AI features (GPT-5.2).

## Architecture
### Platform Separation (Implemented Feb 2026)
- **Customer Mobile App** (Expo React Native, port 8081/tunnel): Menu browsing, meal customization, calorie tracking, order placement
- **Web Management Panel** (React+Vite, port 3000): Admin dashboard, kitchen display, cashier POS
- **Backend** (FastAPI, port 8001): Shared API serving both platforms
- **Database**: MongoDB (shared)

### Role System
| Role | Platform | Auth Method | Features |
|------|----------|-------------|----------|
| Customer | Mobile App | Phone OTP | Menu, AI meals, orders, calorie tracking |
| Admin | Web Panel | Email/Password | Dashboard, products, categories, staff, offers, analytics, tables, kitchen view |
| Kitchen | Web Panel | PIN (4-6 digits) | Orders with priority flags, inventory |
| Cashier | Web Panel | PIN (4-6 digits) | POS terminal, AI suggestions, cart, billing, orders, tables |

## User Personas
1. **Customer** - Health-conscious diners using mobile app for diet-friendly ordering
2. **Admin** - Cafe owner managing menu, staff, analytics via web dashboard
3. **Kitchen Staff** - Cooks viewing/prioritizing orders, monitoring inventory
4. **Cashier** - Counter staff processing walk-in orders with full POS

## Core Requirements (Static)
- Diet-focused menu with per-gram pricing & macro tracking
- AI meal builder (GPT-5.2) for goal-based suggestions
- Multi-role access control with separate platforms
- Real-time kitchen order management with priority flags
- POS terminal for offline/walk-in customers

## What's Been Implemented
### Session 1 (Feb 2026)
- Initial setup, seeded admin (admin@dietcafe.com/admin123), 16 products, 6 categories
- 3-role system: Admin (email/password), Kitchen (PIN), Cashier (PIN)
- Admin staff management (create/edit/delete kitchen & cashier staff)
- Backend: /api/staff CRUD, /api/auth/pin-login, /api/orders/{id}/priority, /api/inventory

### Session 2 (Feb 2026) - Platform Separation
- Created React+Vite web panel at /app/web-panel/ (port 3000)
- Admin: Sidebar navigation, dashboard with stats, products table, staff management, categories, kitchen view, offers, analytics, tables
- Kitchen: Orders with priority flags (urgent/high/normal), inventory with stock status
- Cashier: Full POS terminal with product grid, cart, AI meal builder, order type toggle, table management
- Login: Tab-based (Admin email/password, Staff PIN)
- Cleaned Expo mobile app: removed admin/kitchen/cashier screens, customer-only
- Startup script runs both web panel (port 3000) and Expo tunnel (port 8081)
- Testing: 100% pass rate (15/15 frontend tests, 92.9% backend tests)

### Seeded Data
- Admin: admin@dietcafe.com / admin123
- Kitchen: Raju Kitchen (PIN: 1234)
- Cashier: Priya Cashier (PIN: 5678)
- 16 products, 6 categories

## Prioritized Backlog
### P0 (Critical)
- Razorpay real key integration for payments
- Stock quantity management (add/remove stock from admin/kitchen)

### P1 (Important)
- Push notification for new orders
- Order receipt/bill generation
- Coupon code application at checkout (cashier POS)
- Sound/vibration alerts for urgent kitchen orders

### P2 (Nice to have)
- Weekly meal planning
- Loyalty/rewards program
- Google OAuth
- Shift management for staff
- Print kitchen ticket
- Daily streak tracker for customer retention

## Next Tasks
- User testing feedback on mobile app + web panel
- Razorpay integration
- Stock management UI for kitchen/admin
