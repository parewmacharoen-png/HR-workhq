#!/usr/bin/env bash
# SEC-001b / EMP-010b consistency check
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "== Policy cross-reference =="
for id in SEC-001b EMP-010b; do
  grep -q "$id" WORKHQ_MASTER_POLICY_V1.md || { echo "MISSING in master policy: $id"; exit 1; }
  grep -q "$id" WORKHQ_POLICY_IMPLEMENTATION_MATRIX.md || { echo "MISSING in matrix: $id"; exit 1; }
  echo "  OK $id"
done

echo "== Backend typecheck =="
(cd backend && npx tsc --noEmit)

echo "== Backend unit tests =="
(cd backend && npm run test:unit -- --testPathPattern="employee-access|performance\.service|probation-review|disciplinary-action")

echo "== Web tests =="
(cd web && npm test)

if [[ -n "${DATABASE_URL:-}" ]]; then
  echo "== Integration tests (DATABASE_URL set) =="
  (cd backend && npm run test:integration -- --testPathPattern="employee-access-audit|probation-review")
else
  echo "== Skipping integration tests — set DATABASE_URL in CI to run DB-backed specs =="
fi

echo "== SEC-001b / EMP-010b consistency check PASSED =="
