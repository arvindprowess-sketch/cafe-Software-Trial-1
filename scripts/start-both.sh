#!/bin/bash
# FUEL cafe software — single preview URL serving BOTH surfaces:
#   /         -> Staff WEB PORTAL (Vite, Admin/Kitchen/Cashier)
#   /mobile   -> Customer MOBILE APP (Expo static web export, served from web-panel/public/mobile)
# The Expo export is produced by:  cd /app/frontend && npx expo export -p web --output-dir dist
# then copied into /app/web-panel/public/mobile (see scripts/build-mobile.sh).
export CI=1
cd /app/web-panel && exec npx vite --host 0.0.0.0 --port 3000
