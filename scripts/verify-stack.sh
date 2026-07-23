#!/usr/bin/env bash
# ============================================================================
# scripts/verify-stack.sh
# Smoke-test a running WorkHQ stack (API health + web + optional metrics).
#
# Usage:
#   ./scripts/verify-stack.sh
#   API_BASE=http://localhost:3000/api/v1 WEB_BASE=http://localhost:8080 ./scripts/verify-stack.sh
# ============================================================================

set -euo pipefail

API_BASE="${API_BASE:-http://localhost:3000/api/v1}"
WEB_BASE="${WEB_BASE:-http://localhost:8080}"
METRICS_TOKEN="${METRICS_TOKEN:-}"

echo "[verify] API health → ${API_BASE}/health"
health="$(curl -sf "${API_BASE}/health")"
echo "$health" | grep -q '"status"' || { echo "Invalid health response"; exit 1; }
echo "[verify] Health OK"

echo "[verify] Web → ${WEB_BASE}/"
curl -sf "${WEB_BASE}/" >/dev/null
echo "[verify] Web OK"

if [[ -n "$METRICS_TOKEN" ]]; then
  echo "[verify] Health details (authenticated)"
  curl -sf -H "Authorization: Bearer ${METRICS_TOKEN}" "${API_BASE}/health/details" >/dev/null
  echo "[verify] Details OK"
fi

echo "[verify] Stack verification passed"
