#!/usr/bin/env bash
# WorkHQ Platform Consolidation Sprint Parts A-G consistency check
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "== Policy cross-reference =="
for id in EMP-014 KPI-005 SAL-002 REQ-005b REQ-006 ATT-010 REC-002 DOC-001 ANN-001; do
  grep -q "$id" WORKHQ_MASTER_POLICY_V1.md || { echo "MISSING $id in master policy"; exit 1; }
  grep -q "$id" WORKHQ_POLICY_IMPLEMENTATION_MATRIX.md || { echo "MISSING $id in matrix"; exit 1; }
done
grep -q "Platform Consolidation" HR_ROADMAP.md || grep -q "EMP-014" HR_ROADMAP.md || { echo "MISSING consolidation in HR roadmap"; exit 1; }
echo "  OK policy docs"

echo "== Prisma schema =="
grep -q "positionFamilyId" prisma/schema.prisma || exit 1
grep -q "model KpiPositionAssignmentRule" prisma/schema.prisma || exit 1
grep -q "integrationStatus" prisma/schema.prisma || exit 1
grep -q "model DocumentGenerationQueue" prisma/schema.prisma || exit 1
test -f prisma/migrations/20260624100000_platform_consolidation/migration.sql || exit 1
echo "  OK schema + migration"

echo "== Backend modules =="
grep -q "EmployeePositionService" backend/src/modules/position-framework/position-framework.module.ts || exit 1
grep -q "KpiPositionRuleService" backend/src/modules/kpi/kpi.module.ts || exit 1
grep -q "RequestIntegrationService" backend/src/modules/request/request.module.ts || exit 1
grep -q "UnifiedApprovalInboxService" backend/src/modules/telegram/telegram.module.ts || exit 1
grep -q "DocumentCenterModule" backend/src/app.module.ts || exit 1
grep -q "AnnouncementModule" backend/src/app.module.ts || exit 1
echo "  OK modules"

echo "== Backend routes =="
grep -q "assignments/missing" backend/src/modules/position-framework/interface/http/position-framework.controller.ts || exit 1
grep -q "kpi/position-rules" backend/src/modules/kpi/interface/http/kpi.controller.ts || exit 1
grep -q "bulk-position-update" backend/src/modules/employee/interface/http/employee.controller.ts || exit 1
grep -q "promotion-paths/validate" backend/src/modules/position-framework/interface/http/position-framework.controller.ts || exit 1
grep -q "documents/my" backend/src/modules/document-center/interface/http/document-center.controller.ts || exit 1
grep -q "announcements" backend/src/modules/announcement/interface/http/announcement.controller.ts || exit 1
echo "  OK routes"

echo "== Telegram menus =="
grep -q "งานรออนุมัติ" backend/src/modules/telegram/application/telegram-bot.service.ts || exit 1
grep -q "ศูนย์ความรู้" backend/src/modules/telegram/application/telegram-bot.service.ts || exit 1
grep -q "เอกสารของฉัน" backend/src/modules/telegram/application/telegram-bot.service.ts || exit 1
grep -q "ประกาศใหม่" backend/src/modules/telegram/application/telegram-bot.service.ts || exit 1
grep -q "คนที่ฉันแนะนำ" backend/src/modules/telegram/application/telegram-bot.service.ts || exit 1
echo "  OK Telegram"

echo "== Backend typecheck =="
(cd backend && npx prisma generate && npx tsc --noEmit)

echo "== Backend unit tests =="
(cd backend && npm run test:unit -- --testPathPattern="promotion-path-validation|request-integration|document-center|announcement|attendance-alert")

echo "== Web pages =="
grep -q "MyDocumentsPage" web/src/App.tsx || exit 1
grep -q "AnnouncementsPage" web/src/App.tsx || exit 1

echo "== Platform consolidation consistency check PASSED =="
