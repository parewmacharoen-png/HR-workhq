#!/usr/bin/env bash
# EMP-011 consistency check
# Integration tests require DATABASE_URL — set in CI to run employee-recognition.integration.spec.ts
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "== Policy cross-reference =="
grep -q "EMP-011" WORKHQ_MASTER_POLICY_V1.md || { echo "MISSING EMP-011 in master policy"; exit 1; }
grep -q "EMP-011" WORKHQ_POLICY_IMPLEMENTATION_MATRIX.md || { echo "MISSING EMP-011 in matrix"; exit 1; }
echo "  OK EMP-011"

echo "== Backend typecheck =="
(cd backend && npx prisma generate && npx tsc --noEmit)

echo "== Backend unit tests =="
(cd backend && npm run test:unit -- --testPathPattern="employee-recognition|probation-review\.notifier")

echo "== Web tests =="
(cd web && npm test)

if [[ -n "${DATABASE_URL:-}" ]]; then
  echo "== Integration tests (DATABASE_URL set) =="
  (cd backend && npm run test:integration -- --testPathPattern="employee-recognition")
else
  echo "== Skipping integration tests — set DATABASE_URL in CI to run DB-backed specs =="
fi

echo "== EMP-011 consistency check PASSED =="
