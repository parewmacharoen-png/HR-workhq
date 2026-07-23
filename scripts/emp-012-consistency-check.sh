#!/usr/bin/env bash
# EMP-012 / EMP-012b consistency check
#
# Integration tests require a live PostgreSQL DATABASE_URL.
# - Local: export DATABASE_URL=postgresql://... && ./scripts/emp-012-consistency-check.sh
# - CI: GitHub Actions job `test-integration` in .github/workflows/ci.yml sets DATABASE_URL
#       and runs `npm run test:int:cov` (includes exit-deposit + employee-recognition specs).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "== Policy cross-reference =="
grep -q "EMP-012" WORKHQ_MASTER_POLICY_V1.md || { echo "MISSING EMP-012 in master policy"; exit 1; }
grep -q "EMP-012b" WORKHQ_MASTER_POLICY_V1.md || { echo "MISSING EMP-012b in master policy"; exit 1; }
grep -q "EMP-012" WORKHQ_POLICY_IMPLEMENTATION_MATRIX.md || { echo "MISSING EMP-012 in matrix"; exit 1; }
grep -q "EMP-012b" WORKHQ_POLICY_IMPLEMENTATION_MATRIX.md || { echo "MISSING EMP-012b in matrix"; exit 1; }
echo "  OK EMP-012 / EMP-012b"

echo "== Backend typecheck =="
(cd backend && npx prisma generate && npx tsc --noEmit)

echo "== Backend unit tests =="
(cd backend && npm run test:unit -- --testPathPattern="exit-lifecycle|exit-checklist|exit-case|exit-access|disciplinary-action\.service")

echo "== Web tests =="
(cd web && npm test)

if [[ -n "${DATABASE_URL:-}" ]]; then
  echo "== Integration tests (DATABASE_URL set) =="
  (cd backend && npm run test:integration -- --testPathPattern="exit-deposit|employee-recognition")
else
  echo "== Skipping integration tests =="
  echo "   Set DATABASE_URL locally, or rely on CI job test-integration (.github/workflows/ci.yml)."
fi

echo "== EMP-012 consistency check PASSED =="
