#!/bin/bash
# Rebuild the customer MOBILE APP (Expo) as a static web bundle and publish it
# under the staff web portal at /mobile.
# Run this whenever you change anything inside /app/frontend (the Expo app).
set -e
echo "==> Building Expo web export (baseUrl=/mobile)..."
cd /app/frontend
rm -rf dist
npx expo export -p web --output-dir dist
echo "==> Publishing to web-panel/public/mobile ..."
rm -rf /app/web-panel/public/mobile
mkdir -p /app/web-panel/public
cp -r /app/frontend/dist /app/web-panel/public/mobile
echo "==> Done. Mobile app available at <preview-url>/mobile"
