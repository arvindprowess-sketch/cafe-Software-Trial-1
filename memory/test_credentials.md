# Test Credentials — FUEL Cafe Software

## 🔗 One Preview URL, two surfaces
- **Staff WEB PORTAL** → `https://4602d0fe-b014-4bd5-b917-564d8a014f6c.preview.emergentagent.com/`
- **Customer MOBILE APP** → `https://4602d0fe-b014-4bd5-b917-564d8a014f6c.preview.emergentagent.com/mobile/`

## Admin (Web Portal — "ADMIN LOGIN" tab)
- Email: `admin@dietcafe.com`
- Password: `admin123`

## Staff PIN login (Web Portal — "STAFF PIN" tab)
- Kitchen: PIN `4321` (Kitchen Karan)
- Cashier: PIN `5678` (Cashier Riya)

## Customer app (Mobile, /mobile) — phone + OTP
- 10-digit phone + 6-digit OTP.
- **DEV MODE**: MSG91 SMS not configured, so OTP is NOT sent to the phone — it is printed in the backend log:
  `grep "\[SMS\]\[DEV\]" /var/log/supervisor/backend.*.log | tail -1`
- To enable real SMS OTP: add `MSG91_AUTH_KEY` + `MSG91_TEMPLATE_ID` to `/app/backend/.env`.

## Seeding (already done)
- `POST /api/seed` → 16 products + admin (idempotent)
- `POST /api/categories/seed-defaults` (admin token) → 6 categories
- `POST /api/seed-offers-packs` → 3 offers + 3 packs
- `POST /api/staff` (admin token) → kitchen (4321) + cashier (5678)

## Architecture / serving
- Backend: FastAPI on :8001 (REST `/api/*` + Socket.IO `/api/socket.io`).
- Web portal: Vite dev on :3000 (supervisor `frontend` → `scripts/start-both.sh`). Served at `/`.
- Mobile: Expo static web export (baseUrl=`/mobile`) copied into `web-panel/public/mobile`, served at `/mobile`.
  - Rebuild after editing the Expo app: `bash /app/scripts/build-mobile.sh`
- DB: MongoDB (DB_NAME=dietcafe).
