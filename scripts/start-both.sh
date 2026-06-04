#!/bin/bash
# Customer mobile app (Expo) — runs in background; use the printed tunnel URL on a device.
cd /app/frontend && npx expo start --tunnel > /tmp/expo.log 2>&1 &

# Staff web panel (Admin / Kitchen / Cashier) on port 3000.
# Run in the foreground via exec so supervisor tracks it and keeps :3000 healthy.
cd /app/web-panel && exec npx vite --host 0.0.0.0 --port 3000
