#!/bin/bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FRONTEND_DIR="$ROOT_DIR/frontend"

if [ ! -d "$FRONTEND_DIR" ]; then
  echo "[start-expo-only] frontend directory not found: $FRONTEND_DIR"
  exit 1
fi

cd "$FRONTEND_DIR"
npm run start -- --tunnel
