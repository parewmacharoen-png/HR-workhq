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
#   BACKUP_ENCRYPTION_PASSPHRASE  When set, the dump is AES-256 encrypted
#                           (openssl, PBKDF2) and the plaintext is removed.
#                           Keep this passphrase OFF the server too — without
#                           it the backups cannot be restored.
#   BACKUP_S3_BUCKET        When set, upload to s3://<bucket>/<prefix>daily/,
#                           plus monthly/ on the 1st and yearly/ on 1 January.
#                           Expiry per tier is an S3 lifecycle rule
#                           (see docs/s3-lifecycle.json).
#   BACKUP_S3_PREFIX        Key prefix (default: backups/)
#   BACKUP_S3_ENDPOINT      Optional S3-compatible endpoint (R2, MinIO)
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

if [[ -n "${BACKUP_ENCRYPTION_PASSPHRASE:-}" ]]; then
  openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -salt     -pass env:BACKUP_ENCRYPTION_PASSPHRASE     -in "$filepath" -out "${filepath}.enc"
  rm -f "$filepath"
  filepath="${filepath}.enc"
  filename="${filename}.enc"
  echo "[backup] Encrypted → ${filepath}"
fi

if [[ -n "${BACKUP_S3_BUCKET:-}" ]]; then
  s3_base="s3://${BACKUP_S3_BUCKET}/${BACKUP_S3_PREFIX:-backups/}"
  tiers=(daily)
  [[ "$(date -u +%d)" == "01" ]] && tiers+=(monthly)
  [[ "$(date -u +%m%d)" == "0101" ]] && tiers+=(yearly)
  for tier in "${tiers[@]}"; do
    aws ${BACKUP_S3_ENDPOINT:+--endpoint-url "$BACKUP_S3_ENDPOINT"} s3 cp --only-show-errors --sse AES256 \
      "$filepath" "${s3_base}${tier}/${filename}"
    echo "[backup] Uploaded → ${s3_base}${tier}/${filename}"
  done
fi

if [[ "$RETENTION_DAYS" =~ ^[0-9]+$ ]] && [[ "$RETENTION_DAYS" -gt 0 ]]; then
  deleted=0
  while IFS= read -r -d '' old; do
    rm -f "$old"
    deleted=$((deleted + 1))
  done < <(find "$BACKUP_DIR" -maxdepth 1 \( -name 'workhq_*.dump' -o -name 'workhq_*.dump.enc' \) -type f -mtime "+${RETENTION_DAYS}" -print0 2>/dev/null || true)
  echo "[backup] Retention (${RETENTION_DAYS}d): removed ${deleted} old dump(s)"
fi

echo "[backup] Done"
