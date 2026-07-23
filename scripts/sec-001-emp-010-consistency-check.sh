#!/usr/bin/env bash
# SEC-001 / EMP-010 consistency check
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "== Policy cross-reference =="
for id in SEC-001 EMP-010; do
  grep -q "$id" WORKHQ_MASTER_POLICY_V1.md || { echo "MISSING in master policy: $id"; exit 1; }
  grep -q "$id" WORKHQ_POLICY_IMPLEMENTATION_MATRIX.md || { echo "MISSING in matrix: $id"; exit 1; }
  echo "  OK $id"
done

echo "== Backend typecheck =="
(cd backend && npx tsc --noEmit)

echo "== Backend unit tests =="
(cd backend && npm run test:unit -- --testPathPattern="employee-access|performance\.service|probation-review")

echo "== Web tests =="
(cd web && npm test)

echo "== SEC-001 / EMP-010 consistency check PASSED =="
