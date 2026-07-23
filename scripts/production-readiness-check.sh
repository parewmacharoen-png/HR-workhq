#!/usr/bin/env bash
# PART J — Production readiness verification (repeatable deploy gate)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "== WorkHQ Production Readiness Check =="

fail() { echo "FAIL: $1"; exit 1; }
pass() { echo "  OK $1"; }

echo "== Environment =="
[[ -n "${DATABASE_URL:-}" ]] || fail "DATABASE_URL not set"
pass "DATABASE_URL"

if [[ -n "${REDIS_URL:-}" || -n "${REDIS_HOST:-}" ]]; then
  pass "Redis config present"
else
  echo "  WARN Redis env not set (optional for some features)"
fi

echo "== Database connectivity =="
(cd backend && npx prisma db execute --stdin <<< "SELECT 1" >/dev/null 2>&1) && pass "DB connectivity" || fail "Cannot connect to database"

echo "== Migration state =="
(cd backend && npx prisma migrate status) || fail "Migration drift detected"
pass "Prisma migrate status"

echo "== Backend build =="
(cd backend && npx prisma generate && npx tsc --noEmit) || fail "Backend typecheck"
pass "Backend typecheck"

echo "== Storage configuration =="
DRIVER="${DOCUMENT_STORAGE_DRIVER:-local}"
pass "DOCUMENT_STORAGE_DRIVER=${DRIVER}"
if [[ "$DRIVER" == "local" ]]; then
  BASE="${DOCUMENT_STORAGE_BASE_PATH:-backend/storage/documents}"
  mkdir -p "$BASE"
  [[ -w "$BASE" ]] || fail "Document storage path not writable: $BASE"
  pass "Local storage writable: $BASE"
elif [[ "$DRIVER" == "s3" ]]; then
  [[ -n "${DOCUMENT_STORAGE_BUCKET:-}" ]] || fail "DOCUMENT_STORAGE_BUCKET required for s3 driver"
  pass "S3 bucket configured"
fi

echo "== Telegram configuration =="
if [[ -n "${TELEGRAM_BOT_TOKEN:-}" ]]; then
  pass "TELEGRAM_BOT_TOKEN set"
else
  echo "  WARN TELEGRAM_BOT_TOKEN not set (Telegram bot disabled)"
fi

echo "== Scheduler registration (code presence) =="
for sched in \
  announcement-reminder.scheduler.ts \
  employee-recognition.scheduler.ts \
  probation-review.scheduler.ts \
  exit-case.scheduler.ts \
  compensation-review.scheduler.ts \
  attendance-alert.scheduler.ts; do
  find backend/src -name "$sched" | grep -q . || fail "Missing scheduler: $sched"
  pass "Scheduler registered: $sched"
done

echo "== Policy matrix tags =="
for tag in INF-001c TEST-001c ANN-001 DOC-001 TEAM-001; do
  grep -q "$tag" WORKHQ_POLICY_IMPLEMENTATION_MATRIX.md || fail "Missing $tag in matrix"
  pass "$tag in matrix"
done

echo "== Unit tests (core) =="
(cd backend && npm run test:unit -- --testPathPattern="bangkok-time|date\.provider|scheduler-time|announcement-reminder|employee-home" --passWithNoTests) || fail "Unit tests failed"
pass "Core unit tests"

if [[ -n "${DATABASE_URL:-}" ]]; then
  echo "== Integration smoke =="
  (cd backend && npm run test:int -- --testPathPattern="telegram-workflow-matrix" --passWithNoTests) || fail "Integration matrix failed"
  pass "Telegram workflow matrix"
fi

echo ""
echo "== Production readiness check PASSED =="
