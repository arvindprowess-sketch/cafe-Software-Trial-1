# AI Diet Café App - PRD

## Overview
Cure.fit-inspired AI Diet Café app redesigned with Zomato-style UI. White/red theme (#E23744), food cards with images, horizontal category scroll, cart bar, order timeline tracking.

## Tech Stack
- **Frontend**: Expo (React Native) with expo-router
- **Backend**: FastAPI (Python) with MongoDB
- **AI**: OpenAI GPT-5.2 via Emergent LLM Key

## Features (V1 MVP - Zomato Redesign)

### Authentication
- Zomato-style login/register with role selection (customer/admin)
- Demo admin: admin@dietcafe.com / admin123

### Customer Flow
- **Home**: Location bar, search, banner carousel (4 promotional), category filter pills, popular items grid with food images & ratings, nutrition summary card
- **Menu**: Zomato-style food cards with images, ADD buttons (+/- counter), order type chips (dine-in/takeaway/delivery), category filtering, floating cart bar
- **Customize**: Fitness goal selector, budget input, grams/rupees toggle, real-time calorie/macro/price calc, AI meal suggestions (GPT-5.2)
- **Orders**: Timeline tracking (Placed→Preparing→Ready→Completed), nutrition breakdown, order history
- **Profile**: Fitness goals, daily macro targets, save settings

### Admin Flow
- **Dashboard**: Stats cards (products, pending orders, revenue), quick actions
- **Products**: Add with auto-nutrition detection (40+ foods), toggle active, delete
- **Kitchen**: Live orders with exact gram measurements, status workflow buttons

### Core Systems
- 16 seeded products with food images, descriptions, ratings
- Auto inventory deduction, low-stock auto-hide
- Order type charges (dine-in: free, takeaway: ₹10, delivery: ₹30)
- Daily meal history & nutrition tracking

## API Endpoints
- GET /api/banners, GET /api/products, POST /api/products
- POST /api/orders, GET /api/orders, GET /api/orders/kitchen
- PUT /api/orders/{id}/status, POST /api/ai/suggest
- GET /api/user/nutrition-summary, PUT /api/user/goals

## V2 Roadmap
- Razorpay payment, push notifications, Google OAuth, order analytics

## V1.1 - AI Quick Meal Builder (SHIPPED)
### New Features
- **AI Quick Meal Builder** on Home screen: Diet preference (Veg/Non-Veg/Both) + Goal + Budget → AI builds complete meal → Order
- **Veg/Non-Veg indicators** on all product cards across Home and Menu screens
- **Re-order button** on every past order in Orders tab
- **diet_type field** added to all products (auto-detected: chicken/fish/egg/kabab = non-veg)

### New API Endpoints
- POST /api/ai/quick-meal (diet_preference, goal, budget, order_type → AI-built meal)
- POST /api/orders/{order_id}/reorder (validates availability, returns cart-ready items)
- POST /api/migrate/diet-type (one-time migration for existing products)
