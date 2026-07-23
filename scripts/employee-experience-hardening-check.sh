#!/usr/bin/env bash
# Employee Experience Platform — production hardening consistency check
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "== Policy cross-reference =="
for tag in INF-001b INF-001c TEST-001b TEST-001c ANN-001 DOC-001 TEAM-001; do
  grep -q "$tag" WORKHQ_POLICY_IMPLEMENTATION_MATRIX.md || { echo "MISSING $tag in matrix"; exit 1; }
  echo "  OK $tag in matrix"
done

echo "== Backend typecheck =="
(cd backend && npx prisma generate && npx tsc --noEmit)

echo "== Backend unit tests =="
(cd backend && npm run test:unit -- --testPathPattern="bangkok-time|date\.provider|scheduler-time|announcement-reminder|document-center|probation-review\.scheduler|employee-recognition\.scheduler")

echo "== Web tests =="
(cd web && npm test)

if [[ -n "${DATABASE_URL:-}" ]]; then
  echo "== Integration tests (DATABASE_URL set) =="
  (cd backend && npm run test:int -- --testPathPattern="telegram-workflow-matrix|announcement-reminder")
else
  echo "== Skipping integration tests — set DATABASE_URL to run DB-backed specs =="
fi

echo "== Employee experience hardening check PASSED =="
