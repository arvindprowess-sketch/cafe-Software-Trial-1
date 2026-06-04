#!/bin/bash
# TEMP (Phase 2 review): serve the Expo CUSTOMER MOBILE APP as web on port 3000
# so it can be previewed in the browser at the preview URL.
# To restore the staff WEB PANEL, swap the exec line below back to the vite command:
#   cd /app/web-panel && exec npx vite --host 0.0.0.0 --port 3000
export CI=1
cd /app/frontend && exec npx expo start --web --port 3000
