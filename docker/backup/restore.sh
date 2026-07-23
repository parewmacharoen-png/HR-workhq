#!/usr/bin/env bash
# ============================================================================
# docker/backup/restore.sh
# Restore a pg_dump custom-format backup into a target database.
#
# Usage:
#   ./restore.sh <backup_file> [target_database_url]
#
# Environment:
#   RESTORE_DATABASE_URL   Target DB (overrides arg; required if no arg)
#   PG_RESTORE_CMD         pg_restore binary override (default: pg_restore)
#   DROP_SCHEMAS           When "true", drop application schemas first (default: true)
# ============================================================================

set -euo pipefail

backup_file="${1:-}"
target_url="${2:-${RESTORE_DATABASE_URL:-}}"

if [[ -z "$backup_file" ]]; then
  echo "Usage: $0 <backup_file> [target_database_url]" >&2
  exit 1
fi

if [[ ! -f "$backup_file" ]]; then
  echo "ERROR: backup file not found: $backup_file" >&2
  exit 1
fi

if [[ -z "$target_url" ]]; then
  echo "ERROR: target database URL required (arg or RESTORE_DATABASE_URL)" >&2
  exit 1
fi

PG_RESTORE_CMD="${PG_RESTORE_CMD:-pg_restore}"
DROP_SCHEMAS="${DROP_SCHEMAS:-true}"

if ! command -v "$PG_RESTORE_CMD" >/dev/null 2>&1; then
  echo "ERROR: pg_restore not found (tried: $PG_RESTORE_CMD)" >&2
  exit 1
fi

echo "[restore] Target: ${target_url}"
echo "[restore] Source: ${backup_file}"

if [[ "$DROP_SCHEMAS" == "true" ]]; then
  echo "[restore] Dropping application schemas for clean restore…"
  psql "$target_url" -v ON_ERROR_STOP=1 <<'SQL'
DO $$
DECLARE s text;
BEGIN
  FOR s IN
    SELECT nspname FROM pg_namespace
    WHERE nspname IN (
      'organization','employee','permission','attendance','leave','workflow',
      'payroll','commission','finance','performance','recruitment','referral',
      'training','assets','knowledge','ai','reporting','telegram','system','vector'
    )
  LOOP
    EXECUTE format('DROP SCHEMA IF EXISTS %I CASCADE', s);
  END LOOP;
END $$;
SQL
fi

echo "[restore] Running pg_restore…"
"$PG_RESTORE_CMD" \
  --dbname="$target_url" \
  --no-owner \
  --no-acl \
  --verbose \
  "$backup_file"

echo "[restore] Verifying schemas…"
table_count="$(psql "$target_url" -tAc "SELECT count(*) FROM information_schema.tables WHERE table_schema NOT IN ('pg_catalog','information_schema')")"
if [[ "$table_count" -lt 1 ]]; then
  echo "ERROR: restore verification failed — no tables found" >&2
  exit 1
fi

echo "[restore] Verified ${table_count} table(s)"
echo "[restore] Done"
