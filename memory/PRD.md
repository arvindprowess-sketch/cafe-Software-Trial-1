# AI Diet Café App - PRD

## Overview
Cure.fit-inspired AI Diet Café mobile app for fitness-conscious customers and café owners. Dark theme with vibrant red accents.

## Tech Stack
- **Frontend**: Expo (React Native) with expo-router
- **Backend**: FastAPI (Python) with MongoDB
- **AI**: OpenAI GPT-5.2 via Emergent LLM Key for meal suggestions

## Features Implemented (V1 MVP)

### Authentication
- Email/password JWT auth (customer/admin roles)
- Demo admin: admin@dietcafe.com / admin123

### Customer Flow
- **Home**: Daily nutrition dashboard (calories, protein, carbs, fat tracking)
- **Menu**: Browse products with nutrition info, add to cart, order type selection (dine-in/takeaway/delivery)
- **Customize**: Real-time calorie/macro/price calculator, grams or ₹ input modes, AI meal suggestions
- **Orders**: Order history with status tracking
- **Profile**: Fitness goals (fat loss/muscle gain/maintenance), daily macro targets

### Admin Flow
- **Dashboard**: Stats (products, orders, revenue)
- **Products**: Add/edit/delete products with auto-nutrition detection (40+ Indian foods DB)
- **Kitchen**: Live orders with exact gram measurements, status management (pending→preparing→ready→completed)

### Core Systems
- Auto nutrition matching from built-in database
- Auto inventory deduction on order completion
- Low-stock items auto-hidden from menu
- Order type charges (dine-in: free, takeaway: ₹10, delivery: ₹30)
- Meal history tracking per user per day

## API Endpoints
- POST /api/auth/register, /api/auth/login, GET /api/auth/me
- GET/POST /api/products, PUT/DELETE /api/products/{id}
- POST /api/orders, GET /api/orders, GET /api/orders/kitchen, PUT /api/orders/{id}/status
- POST /api/ai/suggest
- GET /api/user/nutrition-summary, PUT /api/user/goals

## V2 Roadmap
- Razorpay payment integration
- Push notification reminders for missed meals
- Google OAuth login
- Order analytics & reporting
