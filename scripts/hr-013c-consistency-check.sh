#!/usr/bin/env bash
# HR-013c consistency check — policy IDs, TypeScript, unit tests.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "== HR-013c policy cross-reference =="
for id in HR-013c EMP-009 EmployeeRecognition; do
  grep -q "$id" WORKHQ_MASTER_POLICY_V1.md || { echo "MISSING in master policy: $id"; exit 1; }
  grep -q "$id" WORKHQ_POLICY_IMPLEMENTATION_MATRIX.md || { echo "MISSING in matrix: $id"; exit 1; }
  echo "  OK $id"
done

echo "== Schema: EmployeeRecognition model =="
grep -q "model EmployeeRecognition" prisma/schema.prisma || { echo "MISSING EmployeeRecognition model"; exit 1; }
grep -q "birthdayGiftGiven" prisma/schema.prisma && { echo "FAIL: legacy gift columns still in schema"; exit 1; } || true

echo "== Backend typecheck =="
(cd backend && npx tsc --noEmit)

echo "== Backend unit tests (HR-013c) =="
(cd backend && npm run test:unit -- --testPathPattern="employee-access|employee-recognition|employee\.service\.access|employee-events\.access|employee-recognition\.notifier")

echo "== Web tests =="
(cd web && npm test)

echo "== HR-013c consistency check PASSED =="
