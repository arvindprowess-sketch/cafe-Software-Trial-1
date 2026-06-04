# Test Credentials — DietCafe / FUEL

## Admin (Web Panel - port 3000 / preview URL, "ADMIN LOGIN" tab)
- Email: `admin@dietcafe.com`
- Password: `admin123`

## Staff PIN login (Web Panel - "STAFF PIN" tab)
- Cashier / Kitchen staff are seeded by `POST /api/seed`. Check seed output for PINs if needed.

## Customer app (Expo) — phone + OTP
- Phone login uses 6-digit OTP. OTP is NO LONGER returned in the API response (security fix A1).
- In DEV (no MSG91 keys configured), the OTP is printed in the backend log:
  `tail -n 50 /var/log/supervisor/backend.*.log | grep "\[SMS\]\[DEV\]"`

## Architecture
- Backend: FastAPI on :8001 (REST under /api/* + Socket.IO at /api/socket.io)
- Web panel: Vite on :3000 (Admin / Kitchen / Cashier)
- Mobile: Expo customer app
- All share ONE MongoDB (DB_NAME=dietcafe)
