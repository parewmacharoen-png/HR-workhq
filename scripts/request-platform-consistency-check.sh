#!/usr/bin/env bash
# Request Platform REQ-001..004 + REC-002 combined consistency check
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "== Policy cross-reference =="
for id in REQ-001 REQ-002 REQ-003 REQ-004 REC-002; do
  grep -q "$id" WORKHQ_MASTER_POLICY_V1.md || { echo "MISSING $id in master policy"; exit 1; }
  grep -q "$id" WORKHQ_POLICY_IMPLEMENTATION_MATRIX.md || { echo "MISSING $id in matrix"; exit 1; }
done
grep -q "REQ-001" HR_ROADMAP.md || { echo "MISSING REQ-001 in HR roadmap"; exit 1; }
echo "  OK policy docs"

echo "== Prisma schema =="
grep -q "model RequestInstance" prisma/schema.prisma || exit 1
grep -q "model RequestType" prisma/schema.prisma || exit 1
grep -q "model EmployeeReferral" prisma/schema.prisma || exit 1
echo "  OK models"

echo "== Backend routes =="
grep -q "requests/my" backend/src/modules/request/interface/http/request.controller.ts || exit 1
grep -q "request-types" backend/src/modules/request/interface/http/request.controller.ts || exit 1
grep -q "employee-referrals" backend/src/modules/request/interface/http/request.controller.ts || exit 1
echo "  OK routes"

echo "== Backend typecheck =="
(cd backend && npx prisma generate && npx tsc --noEmit)

echo "== Backend unit tests =="
(cd backend && npm run test:unit -- --testPathPattern="request-")

echo "== Web tests =="
(cd web && npm test -- request-platform)

echo "== Web pages =="
grep -q "RequestsListPage" web/src/App.tsx || exit 1
grep -q "RequestTypesPage" web/src/App.tsx || exit 1
grep -q "EmployeeReferralsPage" web/src/App.tsx || exit 1

echo "== Telegram menu =="
grep -q "request:menu" backend/src/modules/telegram/application/telegram-bot.service.ts || exit 1

echo "== Request platform consistency check PASSED =="
