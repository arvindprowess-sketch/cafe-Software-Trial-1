# AI Diet Cafe App - PRD (Updated)

## Original Problem Statement
User has an existing Diet Cafe app (FastAPI + React web panel + Expo mobile app) from GitHub. Requested complete Burger King-style redesign across all panels while maintaining all existing features.

## Architecture
- **Backend**: FastAPI (Python) on port 8001, MongoDB
- **Web Panel**: Vite + React + TypeScript on port 3000 (Admin/Kitchen/Cashier)
- **Mobile App**: Expo React Native (Customer app) on port 8081 with ngrok tunnel

## Core Requirements (Static)
1. Full café management: Admin, Kitchen, Cashier, Customer roles
2. Product & Category management with images
3. Order flow: Customer → Kitchen → Cashier
4. AI Meal Builder, Budget Meals, Nutrition Tracking
5. Loyalty system, Streaks, Offers/Coupons
6. POS for walk-in customers
7. Table management & QR scanning

## What's Been Implemented

### 2025-02-09: Burger King Style Redesign
- **Web Panel (App.css)**: Complete CSS rewrite with BK design system
  - Colors: Brown #502314, Red #D62300, Orange #FF8732, Cream #F5EBDC, Green #509E2F
  - Font: Barlow Condensed (headings) + DM Sans (body) from Google Fonts
  - Pill-shaped buttons, uppercase labels, dark brown sidebar, cream backgrounds
  - Login: Dark brown background, white card, red CTA
  - Dashboard: Stat cards, quick actions, staff table with brown header
  - Categories: Image-first grid tiles with live badges
  - Cashier POS: Brown top nav, orange active tabs, red cart button
  - Kitchen Monitor: BK-styled order cards with priority badges
- **Mobile App**: All screens updated with BK color system
  - Dark brown header & bottom tab bar with orange active icons
  - Cream backgrounds, brown text, red CTAs
  - Updated: home, menu, orders, profile, budget-meal, ai-chat, combo-builder, customize, delivery-tracking, side drawer
  - Category cards, product cards, nutrition cards all BK-styled

### Test Results: Backend 92.9%, Frontend 100%

## User Personas
- **Admin/Owner**: Manages categories, products, staff, offers, analytics
- **Kitchen Staff**: Views live orders, marks preparing/ready
- **Cashier**: Walk-in POS, billing, order management
- **Customer**: Mobile app ordering, AI suggestions, nutrition tracking

## Prioritized Backlog
- P0: All core features implemented ✅
- P1: Add sample products/menu items for demo
- P1: Mobile Expo tunnel sometimes has ngrok conflicts - monitor
- P2: Analytics dashboard enhancement
- P2: Push notifications for order status
- P2: Theme customization system (admin can change primary colors)

## Next Tasks
1. User testing on mobile device via Expo Go
2. Seed sample products for demo
3. Any design tweaks user requests after testing
