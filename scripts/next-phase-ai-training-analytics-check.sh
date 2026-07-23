#!/usr/bin/env bash
# Next Phase — AI, Training & Advanced Analytics verification
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "== WorkHQ Next Phase Check (AI/TRAIN/ANALYTICS/AUDIT/OPS) =="

fail() { echo "FAIL: $1"; exit 1; }
pass() { echo "  OK $1"; }

echo "== Schema & migration =="
grep -q "AiKnowledgeSource" prisma/schema.prisma || fail "AiKnowledgeSource missing"
grep -q "TrainingLesson" prisma/schema.prisma || fail "TrainingLesson missing"
grep -q "HrDailySnapshot" prisma/schema.prisma || fail "HrDailySnapshot missing"
pass "Prisma models present"
[[ -f prisma/migrations/20260624180000_next_phase_ai_training_analytics/migration.sql ]] || fail "Migration missing"
pass "Next phase migration file"

echo "== Backend modules =="
for f in \
  backend/src/modules/ai/application/knowledge-assistant.service.ts \
  backend/src/modules/training/training.module.ts \
  backend/src/modules/hr-analytics/hr-analytics.module.ts \
  backend/src/shared/audit/audit-explorer.service.ts \
  backend/src/modules/ops/ops.module.ts; do
  [[ -f "$f" ]] || fail "Missing $f"
  pass "$(basename "$f")"
done

echo "== Web pages =="
for p in \
  web/src/pages/ai/KnowledgeAssistantPage.tsx \
  web/src/pages/training/TrainingPage.tsx \
  web/src/pages/analytics/HrAnalyticsPage.tsx \
  web/src/pages/audit/HrAuditExplorerPage.tsx \
  web/src/pages/ops/OpsConsolePage.tsx; do
  [[ -f "$p" ]] || fail "Missing $p"
  pass "$(basename "$p")"
done

echo "== Telegram menus =="
grep -q "ai:knowledge" backend/src/modules/telegram/application/telegram-bot.service.ts || fail "Telegram ai:knowledge"
grep -q "training:menu" backend/src/modules/telegram/application/telegram-bot.service.ts || fail "Telegram training:menu"
grep -q "hr:summary" backend/src/modules/telegram/application/telegram-bot.service.ts || fail "Telegram hr:summary"
pass "Telegram flows wired"

echo "== Policy matrix tags =="
for tag in AI-001 TRAIN-001 ANALYTICS-001 AUDIT-002 OPS-001; do
  grep -q "$tag" WORKHQ_POLICY_IMPLEMENTATION_MATRIX.md || fail "Missing $tag in matrix"
  pass "$tag in matrix"
done

echo "== Backend build =="
(cd backend && npx prisma generate && npx tsc --noEmit) || fail "Backend typecheck"
pass "Backend typecheck"

echo "== Unit tests (next phase) =="
(cd backend && npm run test:unit -- --testPathPattern="knowledge-assistant|audit-explorer|training.service" --passWithNoTests) || fail "Unit tests failed"
pass "Next phase unit tests"

echo ""
echo "All next-phase checks passed."
