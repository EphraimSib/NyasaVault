#!/bin/sh
# Starts NyasaVault in sandbox mode on Termux / minimal Linux. Safe to re-run.
set -e
major=$(node -p "process.versions.node.split('.')[0]")
minor=$(node -p "process.versions.node.split('.')[1]")
if [ "$major" -lt 22 ] || { [ "$major" -eq 22 ] && [ "$minor" -lt 18 ]; }; then echo "Need Node 22.18+ (found $(node -v))"; exit 1; fi
if [ ! -d dist ]; then
  echo "Building the web UI (first run only)..."
  npm install --no-audit --no-fund --legacy-peer-deps
  npm run build:web || { echo; echo "UI build failed on this device. Build dist/ on a PC and copy it here. The API and /admin still work."; }
fi
[ -f .env ] || printf 'PROVIDER_MODE=sandbox\nPORT=3000\nAPP_URL=http://localhost:3000\nDATA_DIR=./data\n' > .env
echo "Starting on http://localhost:3000  (admin: /admin)"
exec node --env-file-if-exists=.env server/index.ts
