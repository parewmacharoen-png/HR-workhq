#!/usr/bin/env bash
# HR-013b consistency check — policy IDs, TypeScript, unit tests.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "== HR-013b policy cross-reference =="
for id in HR-013b EMP-006 EMP-007 EMP-008 EMP-009; do
  grep -q "$id" WORKHQ_MASTER_POLICY_V1.md || { echo "MISSING in master policy: $id"; exit 1; }
  grep -q "$id" WORKHQ_POLICY_IMPLEMENTATION_MATRIX.md || { echo "MISSING in matrix: $id"; exit 1; }
  echo "  OK $id"
done

echo "== Backend typecheck =="
(cd backend && npx tsc --noEmit)

echo "== Backend unit tests (HR-013b) =="
(cd backend && npm run test:unit -- --testPathPattern="employee-date-events|employee-events|employee-recognition")

echo "== Web tests =="
(cd web && npm test)

echo "== HR-013b consistency check PASSED =="
