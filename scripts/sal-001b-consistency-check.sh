#!/usr/bin/env bash
# SAL-001b — Compensation review UX completion consistency check
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "== Policy cross-reference =="
grep -q "SAL-001b" WORKHQ_MASTER_POLICY_V1.md || { echo "MISSING SAL-001b in master policy"; exit 1; }
grep -q "SAL-001b" WORKHQ_POLICY_IMPLEMENTATION_MATRIX.md || { echo "MISSING SAL-001b in matrix"; exit 1; }
grep -q "SAL-001b" HR_ROADMAP.md || { echo "MISSING SAL-001b in HR roadmap"; exit 1; }
echo "  OK SAL-001b docs"

echo "== Backend list route =="
grep -q "compensation-reviews/list" backend/src/modules/salary-review/interface/http/compensation-review.controller.ts || exit 1
echo "  OK list route"

echo "== Backend typecheck =="
(cd backend && npx prisma generate && npx tsc --noEmit)

echo "== Backend unit tests =="
(cd backend && npm run test:unit -- --testPathPattern="compensation-review|compensation-apply|compensation-reason")

echo "== Backend integration tests =="
if [[ -n "${DATABASE_URL:-}" ]] || [[ -f backend/.env ]]; then
  if [[ -z "${DATABASE_URL:-}" ]] && [[ -f backend/.env ]]; then
    set -a
    # shellcheck disable=SC1091
    source backend/.env
    set +a
  fi
  if [[ -n "${DATABASE_URL:-}" ]]; then
    (cd backend && npm run test:int -- --testPathPattern="compensation-review")
  else
    echo "  SKIP — DATABASE_URL not configured"
  fi
else
  echo "  SKIP — set DATABASE_URL or backend/.env for integration tests"
fi

echo "== Web tests =="
(cd web && npm test -- compensation-review)

echo "== Web UX pages =="
grep -q "CompensationReviewListPage" web/src/App.tsx || exit 1
grep -q "createSalaryReview" web/src/components/hr/EmployeeCompensationSection.tsx || exit 1
grep -q "applySalaryReview" web/src/pages/hr/CompensationReviewDashboardPage.tsx || exit 1

echo "== SAL-001b consistency check PASSED =="
