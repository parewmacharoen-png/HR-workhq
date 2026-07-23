#!/usr/bin/env bash
# KPI-001 — Performance KPI engine foundation consistency check
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "== Policy cross-reference =="
grep -q "KPI-001" WORKHQ_MASTER_POLICY_V1.md || { echo "MISSING KPI-001 in master policy"; exit 1; }
grep -q "KPI-001" WORKHQ_POLICY_IMPLEMENTATION_MATRIX.md || { echo "MISSING KPI-001 in matrix"; exit 1; }
grep -q "KPI-001" HR_ROADMAP.md || { echo "MISSING KPI-001 in HR roadmap"; exit 1; }
echo "  OK KPI-001 docs"

echo "== Prisma schema =="
grep -q "model KpiTemplate" prisma/schema.prisma || exit 1
grep -q "model KpiScore" prisma/schema.prisma || exit 1
echo "  OK KPI models"

echo "== Backend routes =="
grep -q "kpi/templates" backend/src/modules/kpi/interface/http/kpi.controller.ts || exit 1
grep -q "kpi/dashboard" backend/src/modules/kpi/interface/http/kpi.controller.ts || exit 1
echo "  OK KPI routes"

echo "== Backend typecheck =="
(cd backend && npx prisma generate && npx tsc --noEmit)

echo "== Backend unit tests =="
(cd backend && npm run test:unit -- --testPathPattern="kpi-")

echo "== Web tests =="
(cd web && npm test -- kpi)

echo "== Web pages =="
grep -q "KpiTemplatesPage" web/src/App.tsx || exit 1
grep -q "EmployeeKpiSection" web/src/pages/hr/EmployeeDetailPage.tsx || exit 1
grep -q "latestKpiScore" web/src/components/hr/EmployeeCompensationSection.tsx || exit 1

echo "== SAL-001 integration =="
grep -q "latestKpiScore" backend/src/modules/salary-review/application/compensation-dashboard.service.ts || exit 1

echo "== KPI-001 consistency check PASSED =="
