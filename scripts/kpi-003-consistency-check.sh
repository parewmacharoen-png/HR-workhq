#!/usr/bin/env bash
# KPI-003 — Performance review consistency check
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "== Policy =="
grep -q "KPI-003" WORKHQ_MASTER_POLICY_V1.md || exit 1
grep -q "KPI-003" WORKHQ_POLICY_IMPLEMENTATION_MATRIX.md || exit 1
grep -q "KPI-003" HR_ROADMAP.md || exit 1

echo "== Schema =="
grep -q "model PerformanceWeightProfile" prisma/schema.prisma || exit 1
grep -q "model PerformanceReview" prisma/schema.prisma || exit 1

echo "== Routes =="
grep -q "performance/weight-profiles" backend/src/modules/performance-review/interface/http/performance-review.controller.ts || exit 1
grep -q "performance/reviews/:id/finalize" backend/src/modules/performance-review/interface/http/performance-review.controller.ts || exit 1

echo "== Backend =="
(cd backend && npx prisma generate && npx tsc --noEmit)
(cd backend && npm run test:unit -- --testPathPattern="performance-score|performance-review-access")

echo "== Web =="
grep -q "PerformanceReviewCyclesPage" web/src/App.tsx || exit 1
grep -q "EmployeePerformanceReviewSection" web/src/pages/hr/EmployeeDetailPage.tsx || exit 1
(cd web && npm test -- performance-review)

echo "== KPI-003 consistency check PASSED =="
