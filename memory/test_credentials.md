# Test Credentials — DietCafe

## Admin (Web Panel - port 3000, email/password login)
- Email: `admin@dietcafe.com`
- Password: `admin123`

## Notes
- Seed endpoint: `POST /api/seed` creates 16 products + default admin.
- Customer app (Expo) uses phone + OTP login. In dev, the OTP is returned in the response as `demo_otp`.
- Backend: FastAPI on :8001 | Web panel: Vite on :3000 | Mobile: Expo tunnel on :8081
