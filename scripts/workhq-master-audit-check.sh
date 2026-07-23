#!/usr/bin/env bash
# WORKHQ QA-001 Master System Audit Check
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
FAIL=0

ok() { echo "OK: $1"; }
fail() { echo "FAIL: $1"; FAIL=1; }
skip() { echo "SKIP: $1"; }

# --- Audit artifacts ---
for f in \
  WORKHQ_SYSTEM_INVENTORY.md \
  WORKHQ_ARCHITECTURE_AUDIT.md \
  WORKHQ_DATABASE_AUDIT.md \
  WORKHQ_API_AUDIT.md \
  WORKHQ_PERMISSION_MATRIX_AUDIT.md \
  WORKHQ_TELEGRAM_AUDIT.md \
  WORKHQ_WORKFLOW_E2E_AUDIT.md \
  WORKHQ_PAYROLL_AUDIT.md \
  WORKHQ_ATTENDANCE_AUDIT.md \
  WORKHQ_LEAVE_CALENDAR_AUDIT.md \
  WORKHQ_EXIT_AUDIT.md \
  WORKHQ_PERFORMANCE_AUDIT.md \
  WORKHQ_DOCUMENT_KNOWLEDGE_ANNOUNCEMENT_AUDIT.md \
  WORKHQ_AI_AUDIT.md \
  WORKHQ_SCHEDULER_AUDIT.md \
  WORKHQ_DASHBOARD_AUDIT.md \
  WORKHQ_SECURITY_AUDIT.md \
  WORKHQ_PERFORMANCE_AUDIT.md \
  WORKHQ_DISASTER_RECOVERY_AUDIT.md \
  WORKHQ_UAT_CHECKLIST.md \
  WORKHQ_UAT_SEED_GUIDE.md \
  WORKHQ_PRODUCTION_READINESS_REPORT.md
do
  [ -f "$f" ] && ok "Audit doc: $f" || fail "Audit doc: $f"
done

[ -f backend/src/modules/qa/qa.module.ts ] && ok "QA module" || fail "QA module"
[ -f web/src/pages/qa/QaReadinessPage.tsx ] && ok "QA web page" || fail "QA web page"

# --- Prisma ---
cd backend
npx prisma validate --schema ../prisma/schema.prisma >/dev/null 2>&1 && ok "Prisma validate" || fail "Prisma validate"
npx prisma generate --schema ../prisma/schema.prisma >/dev/null 2>&1 && ok "Prisma generate" || fail "Prisma generate"
cd "$ROOT"

# --- Typecheck ---
if (cd backend && npx tsc --noEmit -p tsconfig.json >/dev/null 2>&1); then
  ok "Backend tsc --noEmit"
else
  fail "Backend tsc --noEmit"
fi

# --- Build ---
if (cd backend && npm run build >/dev/null 2>&1); then
  ok "Backend build"
else
  fail "Backend build"
fi

# --- Unit tests (formula + QA-related) ---
if (cd backend && npm run test:unit -- --passWithNoTests --testPathPattern="safe-formula|formula-resolver" >/dev/null 2>&1); then
  ok "Backend unit tests (formula)"
else
  fail "Backend unit tests (formula)"
fi

# --- Web ---
if (cd web && npm run build >/dev/null 2>&1); then
  ok "Web build"
else
  fail "Web build"
fi

# --- Integration ---
if [ -n "${DATABASE_URL:-}" ]; then
  if (cd backend && npm run test:integration -- --testPathPattern="production-stabilization|leave-workflow|telegram-workflow" >/dev/null 2>&1); then
    ok "Integration tests (sample)"
  else
    fail "Integration tests (sample)"
  fi
else
  skip "Integration tests (DATABASE_URL not set)"
fi

# --- Policy cross-ref ---
[ -f scripts/workhq-phase2-hr-os-check.sh ] && bash scripts/workhq-phase2-hr-os-check.sh >/dev/null 2>&1 && ok "Phase 2 policy check" || fail "Phase 2 policy check"

if [ "$FAIL" -ne 0 ]; then
  echo "Master audit check FAILED"
  exit 1
fi
echo "Master audit check PASSED"
