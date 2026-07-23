#!/usr/bin/env bash
# ============================================================================
# docker/backup/backup.sh
# Daily PostgreSQL backup via pg_dump with configurable retention.
#
# Environment:
#   DATABASE_URL            PostgreSQL connection string (required)
#   BACKUP_DIR              Output directory (default: ./backups)
#   BACKUP_RETENTION_DAYS   Delete dumps older than N days (default: 30)
#   PG_DUMP_CMD             pg_dump binary override (default: pg_dump)
# ============================================================================

set -euo pipefail

DATABASE_URL="${DATABASE_URL:?DATABASE_URL is required}"
BACKUP_DIR="${BACKUP_DIR:-./backups}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}"
PG_DUMP_CMD="${PG_DUMP_CMD:-pg_dump}"

if ! command -v "$PG_DUMP_CMD" >/dev/null 2>&1; then
  echo "ERROR: pg_dump not found (tried: $PG_DUMP_CMD)" >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR"

timestamp="$(date -u +%Y%m%d_%H%M%S)"
filename="workhq_${timestamp}.dump"
filepath="${BACKUP_DIR%/}/${filename}"

echo "[backup] Starting pg_dump → ${filepath}"
"$PG_DUMP_CMD" \
  --format=custom \
  --no-owner \
  --no-acl \
  --file="$filepath" \
  "$DATABASE_URL"

size_bytes="$(wc -c < "$filepath" | tr -d ' ')"
echo "[backup] Completed: ${filepath} (${size_bytes} bytes)"

if [[ "$RETENTION_DAYS" =~ ^[0-9]+$ ]] && [[ "$RETENTION_DAYS" -gt 0 ]]; then
  deleted=0
  while IFS= read -r -d '' old; do
    rm -f "$old"
    deleted=$((deleted + 1))
  done < <(find "$BACKUP_DIR" -maxdepth 1 -name 'workhq_*.dump' -type f -mtime "+${RETENTION_DAYS}" -print0 2>/dev/null || true)
  echo "[backup] Retention (${RETENTION_DAYS}d): removed ${deleted} old dump(s)"
fi

echo "[backup] Done"
