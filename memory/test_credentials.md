# Test Credentials — FUEL (formerly DietCafe)

## Admin (Web Panel — port 3000 / preview URL, "ADMIN LOGIN" tab)
- Email: `admin@dietcafe.com`
- Password: `admin123`

## Staff PIN login (Web Panel — "STAFF PIN" tab)
- Kitchen: PIN `4321` (name: Kitchen Karan)
- Cashier: PIN `5678` (name: Cashier Riya)
- (Created via `POST /api/staff` as admin. More can be added in code/seed.)

## Customer app (Expo) — phone + OTP
- Phone login uses 6-digit OTP. OTP is NOT returned in the API response (security fix A1).
- In DEV (no MSG91 keys configured), the OTP is printed in the backend log:
  `tail -n 80 /var/log/supervisor/backend.*.log | grep "\[SMS\]\[DEV\]"`

## Seeding
- `POST /api/seed` creates 16 products + the default admin (idempotent).

## Architecture
- Backend: FastAPI on :8001 (REST under /api/* + Socket.IO at /api/socket.io)
- Web panel: Vite on :3000 (Admin / Kitchen / Cashier) — served via supervisor `frontend`.
- Mobile: Expo customer app (`frontend/app`) — run separately; uses EXPO_PUBLIC_BACKEND_URL.
- All share ONE MongoDB (DB_NAME=dietcafe).
