# WorkHQ Backup & Recovery Certification

**Document ID:** QA-004-G  
**Version:** 1.0  
**Date:** 2026-06-24

---

## Summary

| Item | Status | Evidence |
|------|--------|----------|
| Database backup procedure | **Documented** | `BackupRegistry` model, DR audit |
| Database restore procedure | **Documented** | WORKHQ_DISASTER_RECOVERY_AUDIT.md |
| File storage backup | **Partial** | S3/local driver; no automated cert run |
| File restore | **Documented** | Manual procedure |
| Migration rollback | **Documented** | Forward-only; PITR recommended |
| Redis recovery | **Documented** | Ephemeral cache; locks re-acquire |
| Telegram outage recovery | **Documented** | Webhook retry; outbox backlog |

**Certification Status:** **Provisionally Certified** — procedures documented; live restore drill not executed

---

## Database Backup

- **Method:** RDS automated snapshots / `pg_dump` for self-hosted
- **Registry:** `system.backups_registry` tracks backup jobs
- **Frequency:** Daily minimum for production
- **Retention:** 30 days recommended

### Restore Procedure

1. Stop application instances
2. Restore PostgreSQL from snapshot or `pg_restore`
3. Verify migration version: `npx prisma migrate status`
4. Run health check: `GET /ops/health`
5. Smoke test: `npm run test:integration -- --testPathPattern=production-smoke`

---

## File Storage

| Driver | Backup | Restore |
|--------|--------|---------|
| local | Filesystem snapshot | Copy from backup mount |
| s3 | S3 versioning / cross-region replication | Restore object version |

Document files keyed in `EmployeeDocument`, `DocumentGenerationJob.outputFileKey`

---

## Migration Rollback

- Migrations are **forward-only** in production
- Rollback strategy: **restore DB to pre-deploy snapshot** + deploy previous application image
- Never run `prisma migrate reset` in production

---

## Redis Recovery

- Redis holds: distributed locks, optional cache
- Loss impact: schedulers may duplicate runs until lock re-acquired (idempotent handlers)
- Recovery: restart Redis, verify `GET /ops/health` redis.ok

---

## Telegram Outage Recovery

1. Telegram API unavailable → outbox events accumulate
2. Monitor `outboxBacklog` on `/ops/health`
3. On recovery: dispatcher processes backlog automatically
4. Manual: `POST /ops/actions/retry-outbox` (Owner)

---

## Recovery Time Objectives (Target)

| Scenario | RTO | RPO |
|----------|-----|-----|
| DB failure | 4 hours | 24 hours |
| App failure | 30 minutes | 0 |
| Telegram outage | 24 hours (backlog) | 0 |
| Storage failure | 4 hours | 24 hours |

**Live drill required before Enterprise Certified status.**
