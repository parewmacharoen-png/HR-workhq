#!/usr/bin/env bash
# SAL-001 — Salary review & promotion workflow consistency check
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "== Policy cross-reference =="
grep -q "SAL-001" WORKHQ_MASTER_POLICY_V1.md || { echo "MISSING SAL-001 in master policy"; exit 1; }
grep -q "SAL-001" WORKHQ_POLICY_IMPLEMENTATION_MATRIX.md || { echo "MISSING SAL-001 in matrix"; exit 1; }
grep -q "SAL-001" HR_ROADMAP.md || { echo "MISSING SAL-001 in HR roadmap"; exit 1; }
echo "  OK SAL-001 docs"

echo "== Prisma schema =="
grep -q "model SalaryReview" prisma/schema.prisma || exit 1
grep -q "model PromotionReview" prisma/schema.prisma || exit 1
grep -q "compensation_review_status" prisma/schema.prisma || exit 1
echo "  OK schema models"

echo "== Backend routes =="
grep -q "compensation-reviews/dashboard" backend/src/modules/salary-review/interface/http/compensation-review.controller.ts || exit 1
grep -q "salary-reviews" backend/src/modules/salary-review/interface/http/compensation-review.controller.ts || exit 1
grep -q "promotion-reviews" backend/src/modules/salary-review/interface/http/compensation-review.controller.ts || exit 1
echo "  OK compensation routes"

echo "== Backend typecheck =="
(cd backend && npx prisma generate && npx tsc --noEmit)

echo "== Backend unit tests =="
(cd backend && npm run test:unit -- --testPathPattern="compensation-review|compensation-apply")

echo "== Web tests =="
(cd web && npm test -- compensation-review)

echo "== Web pages =="
grep -q "CompensationReviewDashboardPage" web/src/App.tsx || exit 1
grep -q "EmployeeCompensationSection" web/src/pages/hr/EmployeeDetailPage.tsx || exit 1

echo "== SAL-001 consistency check PASSED =="
