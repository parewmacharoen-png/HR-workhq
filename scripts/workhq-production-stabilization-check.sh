#!/usr/bin/env bash
# WorkHQ production stabilization check
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
FAIL=0

ok() { echo "OK: $1"; }
fail() { echo "FAIL: $1"; FAIL=1; }

[ -f "prisma/migrations/20260624180000_production_stabilization/migration.sql" ] && ok "Stabilization migration" || fail "Stabilization migration"
[ -f "backend/src/modules/formula-engine/application/formula-resolver.service.ts" ] && ok "Formula resolver" || fail "Formula resolver"
[ -f "backend/src/modules/telegram/application/ai-morning-brief-delivery.scheduler.ts" ] && ok "Morning brief scheduler" || fail "Morning brief scheduler"
[ -f "backend/src/modules/telegram/application/phase2-telegram.handler.ts" ] && ok "Phase2 Telegram handler" || fail "Phase2 Telegram handler"
[ -f "WORKHQ_UAT_CHECKLIST.md" ] && ok "UAT checklist" || fail "UAT checklist"
[ -f "WORKHQ_PRODUCTION_READINESS.md" ] && ok "Production readiness doc" || fail "Production readiness doc"

cd backend && npx prisma validate --schema ../prisma/schema.prisma >/dev/null 2>&1 && ok "Prisma schema valid" || fail "Prisma schema valid"
npx prisma generate --schema ../prisma/schema.prisma >/dev/null 2>&1 && ok "Prisma generate" || fail "Prisma generate"

if npm run build >/dev/null 2>&1; then ok "Backend tsc"; else fail "Backend tsc"; fi

if npm run test:unit -- --passWithNoTests --testPathPattern="safe-formula|formula-resolver" >/dev/null 2>&1; then
  ok "Backend unit tests (formula)"
else
  fail "Backend unit tests (formula)"
fi

cd "$ROOT/web"
if npm run build >/dev/null 2>&1; then ok "Web build"; else fail "Web build"; fi

cd "$ROOT"
if [ -f "scripts/workhq-phase2-hr-os-check.sh" ]; then
  bash scripts/workhq-phase2-hr-os-check.sh >/dev/null 2>&1 && ok "Phase 2 policy cross-reference" || fail "Phase 2 policy cross-reference"
fi

if [ -n "${DATABASE_URL:-}" ]; then
  cd backend
  if npm run test:integration -- --testPathPattern=production-stabilization >/dev/null 2>&1; then
    ok "Integration tests (DATABASE_URL set)"
  else
    fail "Integration tests (DATABASE_URL set)"
  fi
else
  echo "SKIP: integration tests (DATABASE_URL not set)"
fi

if [ "$FAIL" -ne 0 ]; then
  echo "Production stabilization check FAILED"
  exit 1
fi
echo "Production stabilization check PASSED"
