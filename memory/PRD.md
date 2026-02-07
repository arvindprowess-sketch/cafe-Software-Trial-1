# AI Diet Cafe App - PRD

## Original Problem Statement
User has an existing Diet Cafe Expo React Native app (from GitHub repo). Wants UI/UX improvements and redesign. Currently previewing the app to provide specific feedback.

## Tech Stack
- **Frontend**: Expo (React Native) with expo-router, TypeScript, running on web mode (port 3000)
- **Backend**: FastAPI (Python) with MongoDB (port 8001)
- **AI**: OpenAI GPT-5.2 via Emergent LLM Key for meal suggestions, descriptions, image generation

## Architecture
- Expo web mode serves on port 3000 (changed from tunnel mode)
- Backend API endpoints prefixed with `/api`
- MongoDB for data storage
- OTP-based auth for customers, email/password for admin

## User Personas
- **Customer**: Orders food, tracks nutrition, uses AI suggestions
- **Admin/Cafe Owner**: Manages products, categories, kitchen orders, analytics

## Core Requirements
- Phone OTP login for customers
- Menu browsing with categories
- Cart + Customize meal (grams/rupees toggle)
- Order placement (dine-in/takeaway/delivery)
- AI meal suggestions & chat
- Admin dashboard with products, kitchen, analytics

## What's Been Implemented (as of Feb 2026)
- [x] Fixed Expo web mode (tunnel → --web --port 3000)
- [x] Fixed AsyncStorage SSR crash (window is not defined)
- [x] Seeded 16 products + 6 categories + admin user
- [x] All screens verified working: Auth, Home, Menu, Budget, Orders, Profile, AI Chat, Admin

## Screens (21 files)
### Customer
- index.tsx (OTP Login)
- (tabs)/home.tsx
- (tabs)/menu.tsx
- (tabs)/budget-meal.tsx
- (tabs)/orders.tsx
- (tabs)/profile.tsx
- customize.tsx (Cart/Meal customization)
- ai-chat.tsx
- scan-table.tsx
- delivery-tracking.tsx

### Admin
- admin-login.tsx
- (admin)/dashboard.tsx
- (admin)/products.tsx
- (admin)/kitchen.tsx
- (admin)/categories.tsx
- (admin)/analytics.tsx
- (admin)/tables.tsx

## Prioritized Backlog
### P0 - Awaiting User Feedback
- UI/UX redesign (specific screens TBD based on user testing)

### P1
- Payment integration (Razorpay/Stripe)
- Push notifications
- Order analytics improvements

### P2
- Google OAuth
- Weekly meal planning
- Loyalty/rewards system

## Next Tasks
- Wait for user's screen-specific UI/UX feedback
- Apply targeted redesign based on feedback
