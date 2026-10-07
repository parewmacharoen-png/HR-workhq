#!/usr/bin/env bash
# ============================================================================
# docker/backup/entrypoint.sh
# Writes cron schedule from BACKUP_CRON_SCHEDULE and starts cron.
#
# cron runs jobs with an almost empty environment, so the variables the backup
# needs are written to a root-only env file that the cron line sources.
# ============================================================================

set -euo pipefail

export DATABASE_URL="${DATABASE_URL:?DATABASE_URL is required}"
export BACKUP_DIR="${BACKUP_DIR:-/backups}"
export BACKUP_RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}"

env_file=/etc/workhq-backup.env
: > "$env_file"
chmod 600 "$env_file"
for var in DATABASE_URL BACKUP_DIR BACKUP_RETENTION_DAYS BACKUP_ENCRYPTION_PASSPHRASE \
           BACKUP_S3_BUCKET BACKUP_S3_PREFIX BACKUP_S3_ENDPOINT AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_DEFAULT_REGION; do
  if [[ -n "${!var:-}" ]]; then
    printf 'export %s=%q\n' "$var" "${!var}" >> "$env_file"
  fi
done

schedule="${BACKUP_CRON_SCHEDULE:-0 2 * * *}"
{
  echo "SHELL=/bin/bash"
  echo "${schedule} root . ${env_file}; /usr/local/bin/workhq-backup.sh >> /var/log/workhq-backup.log 2>&1"
} > /etc/cron.d/workhq-backup
chmod 0644 /etc/cron.d/workhq-backup

mkdir -p "$BACKUP_DIR"

exec "$@"
