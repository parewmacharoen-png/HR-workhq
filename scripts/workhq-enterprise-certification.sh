#!/usr/bin/env bash
# WORKHQ QA-004 Enterprise Certification Check
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
FAIL=0

ok() { echo "OK: $1"; }
fail() { echo "FAIL: $1"; FAIL=1; }
skip() { echo "SKIP: $1"; }

echo "=== QA-004 Certification Artifacts ==="
for f in \
  WORKHQ_PRODUCTION_CERTIFICATION.md \
  WORKHQ_ENTERPRISE_SCORECARD.md \
  WORKHQ_OPERATIONAL_HEALTH.md \
  WORKHQ_BACKUP_RECOVERY_CERTIFICATION.md \
  WORKHQ_DEPLOYMENT_CERTIFICATION.md \
  WORKHQ_SECURITY_CERTIFICATION.md \
  WORKHQ_GO_LIVE_CHECKLIST.md \
  WORKHQ_POST_GO_LIVE_PLAN.md \
  WORKHQ_ENTERPRISE_CERTIFICATE.md \
  WORKHQ_ENTERPRISE_READINESS_REPORT.md \
  WORKHQ_BUSINESS_RULE_REGISTRY.md \
  WORKHQ_REQUIREMENT_TRACEABILITY_MATRIX.md
do
  [ -f "$f" ] && ok "Doc: $f" || fail "Doc: $f"
done

echo "=== Ops Health Dashboard ==="
[ -f backend/src/modules/ops/application/ops.service.ts ] && ok "Ops service" || fail "Ops service"
[ -f web/src/pages/ops/OpsHealthPage.tsx ] && ok "Ops health page" || fail "Ops health page"
[ -f backend/test/integration/production-smoke.integration.spec.ts ] && ok "Smoke tests" || fail "Smoke tests"

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

echo "=== Unit Tests ==="
if (cd backend && npm run test:unit -- --passWithNoTests --testPathPattern="safe-formula|formula-resolver" >/dev/null 2>&1); then
  ok "Unit tests (formula)"
else
  fail "Unit tests (formula)"
fi

echo "=== Smoke + Integration Tests ==="
if [ -n "${DATABASE_URL:-}" ]; then
  if (cd backend && npm run test:integration -- --testPathPattern="production-smoke" >/dev/null 2>&1); then
    ok "Production smoke tests"
  else
    fail "Production smoke tests"
  fi
  if (cd backend && npm run test:integration -- --testPathPattern="company-isolation|employee-access-audit" >/dev/null 2>&1); then
    ok "Security integration tests"
  else
    fail "Security integration tests"
  fi
else
  skip "Integration/smoke tests (DATABASE_URL not set)"
fi

echo "=== Prior QA Scripts ==="
[ -x scripts/workhq-traceability-check.sh ] && ok "Traceability script" || skip "Traceability script"
[ -x scripts/workhq-master-audit-check.sh ] && ok "Master audit script" || skip "Master audit script"

echo ""
if [ "$FAIL" -eq 0 ]; then
  echo "QA-004 ENTERPRISE CERTIFICATION CHECK: PASS"
else
  echo "QA-004 ENTERPRISE CERTIFICATION CHECK: FAIL"
fi
exit "$FAIL"
