# AI Diet Cafe App - PRD

## Original Problem Statement
User has an existing Diet Cafe Expo React Native app (from GitHub repo). Wants:
1. Frontend start script set to `expo start --tunnel`
2. Database seeded with admin user + 16 products + 6 categories
3. Full project context maintained from PRD

## Tech Stack
- **Frontend**: Expo (React Native) with expo-router, TypeScript, tunnel mode
- **Backend**: FastAPI (Python) with MongoDB (port 8001)
- **AI**: OpenAI GPT-5.2 via Emergent LLM Key for meal suggestions, descriptions, image generation

## Architecture
- Expo tunnel mode for mobile app preview
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
- [x] Fixed backend .env (removed junk characters, proper format)
- [x] Frontend start script: `expo start --tunnel` (verified running)
- [x] Seeded 16 products + 6 categories + admin user (admin@dietcafe.com / admin123)
- [x] All backend APIs verified: auth, products, categories, orders, AI endpoints
- [x] All screens present: Auth, Home, Menu, Budget, Orders, Profile, AI Chat, Admin

## Seeded Data
### Admin User
- Email: admin@dietcafe.com
- Password: admin123

### 16 Products
Chicken Breast, Paneer Tikka, Egg White, Brown Rice, Dal, Oats, Kabab, Grilled Fish, Sweet Potato, Greek Yogurt, Salad, Sprouts, Quinoa, Soya Chunks, Almonds, Banana

### 6 Categories
Protein, Carb, Fat, Meal, Veg, Non-Veg

## Screens (21 files)
### Customer
- index.tsx (OTP Login)
- (tabs)/home.tsx, menu.tsx, budget-meal.tsx, orders.tsx, profile.tsx
- customize.tsx, ai-chat.tsx, scan-table.tsx, delivery-tracking.tsx

### Admin
- admin-login.tsx
- (admin)/dashboard.tsx, products.tsx, kitchen.tsx, categories.tsx, analytics.tsx, tables.tsx

## Prioritized Backlog
### P0 - Awaiting User Feedback
- UI/UX redesign (specific screens TBD)

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
