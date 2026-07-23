# WorkHQ — Disaster Recovery Procedure

This document describes how to recover WorkHQ from a PostgreSQL backup.

## Prerequisites

- `pg_dump` / `pg_restore` (included in PostgreSQL client tools or the `postgres:16` Docker image)
- Access to a PostgreSQL instance (empty database or dedicated restore target)
- A backup file from `docker/backup/backup.sh` (custom format: `workhq_YYYYMMDD_HHMMSS.dump`)

## Backup location

| Environment | Default path |
|-------------|--------------|
| Docker cron | `/backups` (host volume `./backups`) |
| Manual run  | `./backups` (configurable via `BACKUP_DIR`) |

Retention defaults to **30 days** (`BACKUP_RETENTION_DAYS`).

## 1. Stop write traffic

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml stop api nginx
```

This prevents new writes while you restore.

## 2. Create a clean target database (recommended)

```bash
psql "postgresql://workhq:PASSWORD@postgres:5432/postgres" \
  -c "DROP DATABASE IF EXISTS workhq_restore;"
psql "postgresql://workhq:PASSWORD@postgres:5432/postgres" \
  -c "CREATE DATABASE workhq_restore OWNER workhq;"
```

For in-place recovery on the production database, use the production `DATABASE_URL` as the restore target. **This is destructive** — only do this when you intend to replace production data.

## 3. Restore the backup

```bash
export RESTORE_DATABASE_URL="postgresql://workhq:PASSWORD@postgres:5432/workhq_restore"
./docker/backup/restore.sh ./backups/workhq_20250620_020000.dump
```

The script drops application schemas (not `public`) before restore for a clean state, then verifies tables exist.

## 4. Verify the restore

```bash
psql "$RESTORE_DATABASE_URL" -c "\dt system.*"
psql "$RESTORE_DATABASE_URL" -c "SELECT count(*) FROM auth.users;"
psql "$RESTORE_DATABASE_URL" -c "SELECT count(*) FROM system.outbox_events WHERE processed_at IS NULL;"
```

Run integration tests against the restored database if possible:

```bash
DATABASE_URL="$RESTORE_DATABASE_URL" npm run test:int -- --testPathPattern=reliability
```

## 5. Promote restored database (if using a separate DB)

1. Rename databases or update `DATABASE_URL` in compose / secrets to point at `workhq_restore`.
2. Run migrations (idempotent): `docker compose run --rm migrate`
3. Start API: `docker compose up -d api nginx`

## 6. Post-recovery checks

- `GET /api/v1/health` → `status: ok`, `db: up`
- Login with a known admin account
- Confirm Telegram webhook is re-registered if URL changed

## Automated daily backups

The `backup-cron` service runs `docker/backup/backup.sh` on a schedule (default 02:00 UTC).

```bash
docker compose up -d backup-cron
docker compose logs -f backup-cron
```

## Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | — | Source DB for backups |
| `BACKUP_DIR` | `./backups` | Dump output directory |
| `BACKUP_RETENTION_DAYS` | `30` | Delete dumps older than N days |
| `BACKUP_CRON_SCHEDULE` | `0 2 * * *` | Cron expression (backup-cron container) |
| `RESTORE_DATABASE_URL` | — | Target DB for restore |
| `DROP_SCHEMAS` | `true` | Drop app schemas before restore |
