#!/usr/bin/env bash
# KPI-002 — Dynamic KPI builder consistency check
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "== Policy =="
grep -q "KPI-002" WORKHQ_MASTER_POLICY_V1.md || exit 1
grep -q "KPI-002" WORKHQ_POLICY_IMPLEMENTATION_MATRIX.md || exit 1
grep -q "KPI-002" HR_ROADMAP.md || exit 1

echo "== Schema =="
grep -q "position_definition_id" prisma/schema.prisma || exit 1
grep -q "formula_expression" prisma/schema.prisma || exit 1

echo "== Routes =="
grep -q "templates/:id/clone" backend/src/modules/kpi/interface/http/kpi.controller.ts || exit 1
grep -q "templates/by-position" backend/src/modules/kpi/interface/http/kpi.controller.ts || exit 1

echo "== Backend =="
(cd backend && npx prisma generate && npx tsc --noEmit)
(cd backend && npm run test:unit -- --testPathPattern="kpi-data-source|kpi-template-builder")

echo "== Web =="
grep -q "positionDefinitionId" web/src/pages/hr/kpi/KpiTemplatesPage.tsx || exit 1
(cd web && npm test -- kpi)

echo "== KPI-002 consistency check PASSED =="
