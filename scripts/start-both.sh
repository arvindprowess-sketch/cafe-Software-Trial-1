#!/bin/bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WEB_DIR="$ROOT_DIR/web-panel"
FRONTEND_DIR="$ROOT_DIR/frontend"
BACKEND_DIR="$ROOT_DIR/backend"

echo "[start-both] Root: $ROOT_DIR"

if [ -d "$BACKEND_DIR" ]; then
  if python -c "import uvicorn" >/dev/null 2>&1; then
    echo "[start-both] Starting backend on http://localhost:8001"
    (
      cd "$ROOT_DIR"
      python -m uvicorn backend.server:app --host 0.0.0.0 --port 8001
    ) &
  else
    echo "[start-both] WARNING: uvicorn not installed; backend not started."
    echo "[start-both] Install backend deps when network allows: pip install -r backend/requirements.txt"
  fi
fi

if [ -d "$WEB_DIR" ]; then
  echo "[start-both] Starting web panel on http://localhost:3000"
  (
    cd "$WEB_DIR"
    npm run dev -- --host 0.0.0.0 --port 3000
  ) &
fi

if [ -d "$FRONTEND_DIR" ]; then
  echo "[start-both] Starting Expo (customer app)"
  cd "$FRONTEND_DIR"
  npm run start -- --tunnel
else
  wait
fi
