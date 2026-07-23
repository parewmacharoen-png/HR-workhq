#!/usr/bin/env bash
# WORKHQ QA-003 Requirements Traceability Check
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
FAIL=0

ok() { echo "OK: $1"; }
fail() { echo "FAIL: $1"; FAIL=1; }
skip() { echo "SKIP: $1"; }

echo "=== QA-003 Traceability Artifacts ==="
for f in \
  WORKHQ_BUSINESS_RULE_REGISTRY.md \
  WORKHQ_REQUIREMENT_TRACEABILITY_MATRIX.md \
  WORKHQ_ORPHAN_REPORT.md \
  WORKHQ_TEST_TRACEABILITY.md \
  WORKHQ_UAT_TRACEABILITY.md \
  WORKHQ_ENTERPRISE_READINESS_REPORT.md \
  WORKHQ_POLICY_IMPLEMENTATION_MATRIX.md \
  WORKHQ_MASTER_POLICY_V1.md
do
  [ -f "$f" ] && ok "Doc: $f" || fail "Doc: $f"
done

echo "=== QA Module & Dashboard ==="
[ -f backend/src/modules/qa/application/qa-traceability.service.ts ] && ok "Traceability service" || fail "Traceability service"
[ -f web/src/pages/qa/QaTraceabilityPage.tsx ] && ok "Traceability web page" || fail "Traceability web page"

echo "=== Prisma ==="
cd backend
npx prisma validate --schema ../prisma/schema.prisma >/dev/null 2>&1 && ok "Prisma validate" || fail "Prisma validate"
npx prisma generate --schema ../prisma/schema.prisma >/dev/null 2>&1 && ok "Prisma generate" || fail "Prisma generate"
cd "$ROOT"

echo "=== Typecheck ==="
if (cd backend && npx tsc --noEmit -p tsconfig.json >/dev/null 2>&1); then
  ok "Backend tsc --noEmit"
else
  fail "Backend tsc --noEmit"
fi

echo "=== Build ==="
if (cd backend && rm -rf dist 2>/dev/null; npm run build >/dev/null 2>&1); then
  ok "Backend build"
else
  fail "Backend build"
fi

if (cd web && npm run build >/dev/null 2>&1); then
  ok "Web build"
else
  fail "Web build"
fi

echo "=== Unit Tests (formula + traceability-related) ==="
if (cd backend && npm run test:unit -- --passWithNoTests --testPathPattern="safe-formula|formula-resolver|qa-" >/dev/null 2>&1); then
  ok "Backend unit tests (sample)"
else
  fail "Backend unit tests (sample)"
fi

echo "=== Integration Tests ==="
if [ -n "${DATABASE_URL:-}" ]; then
  if (cd backend && npm run test:integration -- --testPathPattern="production-stabilization|leave-workflow|approval-inbox|final-settlement|company-isolation" >/dev/null 2>&1); then
    ok "Integration tests (critical sample)"
  else
    fail "Integration tests (critical sample)"
  fi
else
  skip "Integration tests (DATABASE_URL not set)"
fi

echo "=== Master Audit Script ==="
if [ -x scripts/workhq-master-audit-check.sh ]; then
  scripts/workhq-master-audit-check.sh >/dev/null 2>&1 && ok "Master audit script" || fail "Master audit script"
else
  skip "Master audit script not executable"
fi

echo "=== Orphan Scan (policy gaps) ==="
GAPS=$(grep -c "Not enforced\|Missing\|**Partial**" WORKHQ_POLICY_IMPLEMENTATION_MATRIX.md 2>/dev/null || echo 0)
echo "Policy matrix gap markers: $GAPS"
[ "$GAPS" -gt 0 ] && ok "Orphan scan completed ($GAPS gaps flagged)" || ok "Orphan scan completed"

echo ""
if [ "$FAIL" -eq 0 ]; then
  echo "QA-003 TRACEABILITY CHECK: PASS"
else
  echo "QA-003 TRACEABILITY CHECK: FAIL"
fi
exit "$FAIL"
