#!/bin/bash
# Start web panel on port 3000 (for admin/kitchen/cashier browser access)
cd /app/web-panel && npx vite --host 0.0.0.0 --port 3000 &

# Start Expo tunnel on port 8081 (for customer mobile app)
cd /app/frontend && npx expo start --tunnel
