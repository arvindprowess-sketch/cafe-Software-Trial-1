#!/bin/bash
# FUEL cafe software — single preview URL serving BOTH surfaces:
#   /         -> Staff WEB PORTAL (Vite, Admin/Kitchen/Cashier)
#   /mobile   -> Customer MOBILE APP (Expo static web export, served from web-panel/public/mobile)
# The Expo export is produced by:  cd /app/frontend && npx expo export -p web --output-dir dist
# then copied into /app/web-panel/public/mobile (see scripts/build-mobile.sh).
export CI=1
# Serve a PRODUCTION BUILD via `vite preview` (no HMR/websocket) so the preview
# never full-reloads on an HMR reconnect behind the HTTPS ingress. The /api
# proxy and the /mobile export are wired for preview mode in vite.config.ts.
cd /app/web-panel && npx vite build && exec npx vite preview --host 0.0.0.0 --port 3000
