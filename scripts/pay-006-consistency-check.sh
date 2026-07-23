#!/usr/bin/env bash
# PAY-006 — Payroll bank transfer sheet export consistency check
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "== Policy cross-reference =="
grep -q "PAY-006" WORKHQ_MASTER_POLICY_V1.md || { echo "MISSING PAY-006 in master policy"; exit 1; }
grep -q "PAY-006" WORKHQ_POLICY_IMPLEMENTATION_MATRIX.md || { echo "MISSING PAY-006 in matrix"; exit 1; }
grep -q "PAY-006" HR_ROADMAP.md || { echo "MISSING PAY-006 in HR roadmap"; exit 1; }
echo "  OK PAY-006 export docs"

echo "== Prisma models =="
grep -q "model PayrollExportBatch" prisma/schema.prisma || { echo "MISSING PayrollExportBatch model"; exit 1; }
grep -q "model PayrollExportItem" prisma/schema.prisma || { echo "MISSING PayrollExportItem model"; exit 1; }
echo "  OK schema models"

echo "== Backend routes =="
grep -q "export-bank-transfer" backend/src/modules/payroll/interface/http/payroll-export.controller.ts || exit 1
grep -q "export-batches/:id/download" backend/src/modules/payroll/interface/http/payroll-export.controller.ts || exit 1
echo "  OK export routes"

echo "== Backend typecheck =="
(cd backend && npx prisma generate && npx tsc --noEmit)

echo "== Backend unit tests =="
(cd backend && npm run test:unit -- --testPathPattern="payroll-export")

echo "== Web export UI =="
grep -q "exportTitle" web/src/pages/payroll/PayrollCycleDetailPage.tsx || exit 1
grep -q "payroll-export" web/src/api/payroll-export.ts || exit 1

echo "== PAY-006 consistency check PASSED =="
