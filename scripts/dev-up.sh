#!/usr/bin/env bash
# Start WorkHQ local dev stack (postgres/redis via Docker, API + web locally).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "[dev-up] Starting postgres + redis..."
docker compose up -d postgres redis

echo "[dev-up] Building backend..."
(cd backend && npm run build)

echo "[dev-up] Starting backend on :3000..."
pkill -f "node dist/main.js" 2>/dev/null || true
(cd backend && npm run start:prod > /tmp/workhq-api.log 2>&1 &)

echo "[dev-up] Starting web on :5173..."
pkill -f "vite" 2>/dev/null || true
(cd web && npm run dev > /tmp/workhq-web.log 2>&1 &)

sleep 5
echo "[dev-up] Checking health..."
curl -sf "http://localhost:3000/api/v1/health" >/dev/null && echo "[dev-up] API OK" || { echo "[dev-up] API failed — see /tmp/workhq-api.log"; exit 1; }
curl -sf "http://localhost:5173/" >/dev/null && echo "[dev-up] Web OK" || { echo "[dev-up] Web failed — see /tmp/workhq-web.log"; exit 1; }

echo "[dev-up] Ready:"
echo "  Back Office → http://localhost:5173  (admin / password)"
echo "  API health  → http://localhost:3000/api/v1/health"
echo "  Logs        → /tmp/workhq-api.log  /tmp/workhq-web.log"
