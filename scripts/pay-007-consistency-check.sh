#!/usr/bin/env bash
# PAY-007 — Company payroll overview consistency check
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "== Policy cross-reference =="
grep -q "PAY-007" WORKHQ_MASTER_POLICY_V1.md || { echo "MISSING PAY-007 in master policy"; exit 1; }
grep -q "PAY-007" WORKHQ_POLICY_IMPLEMENTATION_MATRIX.md || { echo "MISSING PAY-007 in matrix"; exit 1; }
grep -q "PAY-007" HR_ROADMAP.md || { echo "MISSING PAY-007 in HR roadmap"; exit 1; }
echo "  OK PAY-007 overview docs"

echo "== Backend routes =="
grep -q "cycles/:id/overview" backend/src/modules/payroll/interface/http/payroll-overview.controller.ts || exit 1
echo "  OK overview route"

echo "== Backend typecheck =="
(cd backend && npx prisma generate && npx tsc --noEmit)

echo "== Backend unit tests =="
(cd backend && npm run test:unit -- --testPathPattern="payroll-overview")

echo "== Web tests =="
(cd web && npm test -- payroll-overview)

echo "== Web overview page =="
grep -q "PayrollCycleOverviewPage" web/src/App.tsx || exit 1

echo "== PAY-007 consistency check PASSED =="
