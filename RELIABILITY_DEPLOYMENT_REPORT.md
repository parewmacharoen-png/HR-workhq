# WorkHQ Reliability & Operations Sprint — Deployment Report

**Date:** 2026-06-20  
**Sprint goal:** Make WorkHQ safe for production operation (no new business features)  
**Verdict:** **Production operations baseline met** — ready for staged rollout with remaining CD hardening

---

## Executive Summary

| Task | Status | Notes |
|------|--------|-------|
| 1. Outbox locking | ✅ Done | `FOR UPDATE SKIP LOCKED` verified; concurrent dispatch test |
| 2. Single migration runner | ✅ Done | Dedicated `Dockerfile.migrate`; API no longer migrates on boot |
| 3. Backup automation | ✅ Done | Daily cron container, 30-day retention, env-configurable |
| 4. Restore verification | ✅ Done | Restore script + `DISASTER_RECOVERY.md`; integration test |
| 5. Root `.gitignore` | ✅ Done | `backups/` added |
| 6. Redis brief locking | ✅ Done | `RedisLockService` + daily lock keys per replica |
| 7. Integration tests | ✅ Done | 7 reliability tests; full suite 28/28 integration |

**Test results (post-sprint):**

| Suite | Result |
|-------|--------|
| Unit | 295/295 ✅ |
| Integration | 28/28 ✅ (includes 7 reliability tests) |
| Build | ✅ |

---

## TASK 1 — Outbox Locking

**Implementation:** `OutboxDispatcherService` claims events inside a transaction using:

```sql
SELECT … FROM system.outbox_events
WHERE processed_at IS NULL AND attempts < $max
ORDER BY occurred_at ASC
LIMIT 1
FOR UPDATE SKIP LOCKED
```

Multiple API replicas skip rows already locked by another worker. Handler execution and `processed_at` update occur in the same transaction.

**Test:** `backend/test/integration/reliability.integration.spec.ts`
- Concurrent `processOneEventForTest()` → handler invoked once
- Raw SQL `SKIP LOCKED` → only one replica claims a row

---

## TASK 2 — Single Migration Runner

**Changes:**

| File | Change |
|------|--------|
| `Dockerfile` | CMD is now `node dist/main.js` only |
| `Dockerfile.migrate` | New one-shot image with full `npm ci` (includes Prisma CLI) |
| `docker-compose.yml` | `migrate` service (`restart: "no"`) |
| `docker-compose.prod.yml` | API `depends_on: migrate: service_completed_successfully` |
| `.github/workflows/deploy.yml` | SSH deploy runs `docker compose run --rm migrate` before API rollout |

**Guarantee:** Only the migrate job/container runs `prisma migrate deploy`. API replicas never race on migrations.

---

## TASK 3 — Backup Automation

**New files:**

```
docker/backup/
├── backup.sh          # pg_dump custom format + retention
├── restore.sh         # pg_restore into clean DB
├── entrypoint.sh      # Cron schedule from env
├── crontab            # Default: 02:00 UTC daily
├── Dockerfile         # postgres:16 + cron
└── DISASTER_RECOVERY.md
```

**Compose service:** `backup-cron` (dev + prod)

| Variable | Default | Purpose |
|----------|---------|---------|
| `BACKUP_DIR` | `./backups` / `/backups` | Dump output |
| `BACKUP_RETENTION_DAYS` | `30` | Auto-delete old dumps |
| `BACKUP_CRON_SCHEDULE` | `0 2 * * *` | Cron expression |
| `BACKUP_HOST_DIR` | `./backups` | Prod host volume (prod only) |

**Start backups:**

```bash
docker compose up -d backup-cron
```

---

## TASK 4 — Restore Verification

**Procedure:** Documented in `docker/backup/DISASTER_RECOVERY.md`

**Quick restore (verify):**

```bash
export RESTORE_DATABASE_URL="postgresql://workhq:workhq@localhost:5432/workhq_restore_verify"
./docker/backup/restore.sh ./backups/workhq_YYYYMMDD_HHMMSS.dump
```

Restore script drops application schemas, runs `pg_restore`, verifies table count > 0.

**Integration test:** Creates `workhq_restore_verify`, restores dump, asserts `permission` schema tables exist.

---

## TASK 5 — Root `.gitignore`

Added:

```
backups/
```

Existing entries retained: `.env`, `node_modules/`, `dist/`, `coverage/`.

---

## TASK 6 — Redis Brief Scheduler Locking

**New:** `RedisLockService` (`SET key instanceId EX ttl NX` + Lua release)

**Wired into:** `BriefService` — morning (`09:00`) and evening (`23:59`) jobs acquire:

```
workhq:brief:{morning|evening}:{YYYY-MM-DD}
```

TTL: 3600s. When Redis is unavailable (dev), locks are no-ops (single-instance fallback).

**Effect:** With `deploy.replicas: 2`, only one replica broadcasts briefs per day/kind.

---

## TASK 7 — Integration Tests

File: `backend/test/integration/reliability.integration.spec.ts`

| Test | Coverage |
|------|----------|
| Outbox processed once | Concurrent dispatcher + SKIP LOCKED |
| Migration singleton | Dockerfile CMD, compose migrate service, idempotent deploy |
| Backup script | Executes via host `pg_dump` or Docker fallback |
| Restore script | Full round-trip into clean `workhq_restore_verify` DB |

---

## Deployment Checklist

### First-time production setup

- [ ] Create external volumes: `workhq_postgres_data`, `workhq_redis_data`
- [ ] Set required env vars (`DATABASE_URL`, `REDIS_PASSWORD`, `JWT_SECRET`, `CORS_ORIGINS`, …)
- [ ] Create host backup directory and set `BACKUP_HOST_DIR`
- [ ] `docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d postgres redis`
- [ ] `docker compose run --rm migrate`  ← **run once before API**
- [ ] `docker compose up -d api nginx backup-cron`

### Every deploy

- [ ] CI/CD migrate job completes (GitHub Actions `migrate` job)
- [ ] SSH deploy runs `docker compose run --rm migrate` before `up -d api`
- [ ] Smoke test: `GET /api/v1/health` → 200, `db: up`
- [ ] Confirm backup-cron container healthy; check `/backups` for recent dump

### Monthly ops

- [ ] Run restore drill into `workhq_restore_verify` (see DISASTER_RECOVERY.md)
- [ ] Verify backup retention (30 days)
- [ ] Confirm Redis reachable from all API replicas (brief lock depends on it)

---

## Remaining Risks (pre-existing, not in sprint scope)

| Risk | Severity | Recommendation |
|------|----------|----------------|
| CD `deploy.yml` image tag uses `${{ github.sha }}` but build tags `sha-*` | High | Align tag format in deploy SSH script |
| CD sets `POSTGRES_PASSWORD` from `PRODUCTION_DATABASE_URL` | High | Use dedicated `PRODUCTION_POSTGRES_PASSWORD` secret |
| Swarm `deploy.replicas: 2` ignored by plain `docker compose` | Medium | Use Swarm/K8s or `docker compose up --scale api=2` |
| `TELEGRAM_WEBHOOK_URL` not in prod compose env | Medium | Add to prod environment block |
| Backup volume not off-host | Medium | Sync `./backups` to S3/NFS in production |

---

## Files Changed (summary)

**New:**
- `Dockerfile.migrate`
- `docker/backup/*` (scripts, Dockerfile, docs)
- `backend/src/common/monitoring/redis-lock.service.ts`
- `backend/test/integration/reliability.integration.spec.ts`
- `RELIABILITY_DEPLOYMENT_REPORT.md`

**Modified:**
- `Dockerfile` — remove migrate from CMD
- `docker-compose.yml` / `docker-compose.prod.yml` — migrate + backup-cron
- `.github/workflows/deploy.yml` — migrate before rollout
- `.gitignore` — `backups/`
- `backend/src/common/outbox/outbox-dispatcher.service.ts` — test hook
- `backend/src/modules/telegram/application/brief.service.ts` — Redis locks
- `backend/src/common/monitoring/monitoring.module.ts` — export lock service
- `backend/src/shared/kernel/company-access.service.ts` — self-scope fix for Telegram leave (regression from isolation sprint)

---

## Sign-off

Reliability & Operations Sprint objectives are **complete**. WorkHQ now has:

1. Safe multi-replica outbox processing
2. Singleton migration orchestration
3. Automated backups with documented recovery
4. Redis-guarded scheduled brief broadcasts
5. Automated verification via integration tests

Proceed to production after addressing CD tag/password issues and confirming off-host backup replication.
