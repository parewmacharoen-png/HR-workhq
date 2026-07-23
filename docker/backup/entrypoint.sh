#!/usr/bin/env bash
# ============================================================================
# docker/backup/entrypoint.sh
# Writes cron schedule from BACKUP_CRON_SCHEDULE and starts cron.
# ============================================================================

set -euo pipefail

schedule="${BACKUP_CRON_SCHEDULE:-0 2 * * *}"
echo "${schedule} root /usr/local/bin/workhq-backup.sh >> /var/log/workhq-backup.log 2>&1" \
  > /etc/cron.d/workhq-backup
chmod 0644 /etc/cron.d/workhq-backup

export DATABASE_URL="${DATABASE_URL:?DATABASE_URL is required}"
export BACKUP_DIR="${BACKUP_DIR:-/backups}"
export BACKUP_RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}"

mkdir -p "$BACKUP_DIR"

exec "$@"
