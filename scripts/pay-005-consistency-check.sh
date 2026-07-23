#!/usr/bin/env bash
# PAY-005 / PAY-005c — Final payroll settlement consistency check
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "== Policy cross-reference =="
grep -q "PAY-005b" WORKHQ_MASTER_POLICY_V1.md || { echo "MISSING PAY-005b in master policy"; exit 1; }
grep -q "PAY-005c" WORKHQ_MASTER_POLICY_V1.md || { echo "MISSING PAY-005c in master policy"; exit 1; }
grep -q "PAY-005c" WORKHQ_POLICY_IMPLEMENTATION_MATRIX.md || { echo "MISSING PAY-005c in matrix"; exit 1; }
grep -q "PAY-005" HR_ROADMAP.md || { echo "MISSING PAY-005 in HR roadmap"; exit 1; }
echo "  OK PAY-005 final settlement docs"

echo "== Backend typecheck =="
(cd backend && npx prisma generate && npx tsc --noEmit)

echo "== Backend unit tests =="
(cd backend && npm run test:unit -- --testPathPattern="final-settlement|unpaid-salary")

echo "== Web tests =="
(cd web && npm test -- final-settlement)

if [[ -n "${DATABASE_URL:-}" ]]; then
  echo "== Integration tests (DATABASE_URL set) =="
  (cd backend && npm run test:integration -- --testPathPattern="final-settlement-pay005c")
else
  echo "== Skipping integration tests =="
  echo "   Set DATABASE_URL locally, or rely on CI job test-integration (.github/workflows/ci.yml)."
fi

echo "== PAY-005 consistency check PASSED =="
