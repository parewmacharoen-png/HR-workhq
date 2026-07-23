#!/usr/bin/env bash
# KPI-004 — Position framework consistency check
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "== Policy =="
grep -q "KPI-004" WORKHQ_MASTER_POLICY_V1.md || exit 1
grep -q "KPI-004" WORKHQ_POLICY_IMPLEMENTATION_MATRIX.md || exit 1
grep -q "KPI-004" HR_ROADMAP.md || exit 1

echo "== Schema =="
grep -q "model PositionFamily" prisma/schema.prisma || exit 1
grep -q "model PromotionPath" prisma/schema.prisma || exit 1

echo "== Routes =="
grep -q "position-framework/families" backend/src/modules/position-framework/interface/http/position-framework.controller.ts || exit 1

echo "== Backend =="
(cd backend && npx prisma generate && npx tsc --noEmit)
(cd backend && npm run test:unit -- --testPathPattern="framework-entity")

echo "== Web =="
grep -q "PositionFrameworkPage" web/src/App.tsx || exit 1
(cd web && npm test -- position-framework)

echo "== KPI-004 consistency check PASSED =="
