# WorkHQ Operational Health

**Document ID:** QA-004-D  
**Version:** 1.0  
**Date:** 2026-06-24  
**Live Dashboard:** `/ops/health` (Owner, `reporting:owner`)

---

## Infrastructure Verification

| Component | Check Method | Status | Notes |
|-----------|--------------|--------|-------|
| PostgreSQL | `SELECT 1` via Prisma | **PASS** | Primary data store |
| Redis | Lock acquire `workhq:ops:health` | **PASS** | Schedulers, distributed locks |
| Telegram Bot | `TELEGRAM_BOT_TOKEN` env | **PASS** | Webhook configured |
| Scheduler | Cron services registered | **PASS** | Asia/Bangkok timezone |
| Outbox | `outbox_events` pending count | **PASS** | Dispatcher on poll interval |
| Storage | Local/S3 driver check | **PASS** | Document center files |
| Audit | AuditService writes | **PASS** | SEC-001 enforced |
| Queue | Outbox as event queue | **PASS** | No separate message broker |
| Formula Engine | FormulaResolverService | **PASS** | Fallback audit in FormulaExecutionLog |
| Notification Engine | Outbox → Telegram handlers | **PASS** | Unified delivery path |

---

## Monitoring Metrics (24h window)

| Metric | Source | Threshold | Alert |
|--------|--------|-----------|-------|
| Outbox backlog | `OutboxEvent.processedAt IS NULL` | >100 critical, >20 warning | Auto |
| Stuck outbox | `attempts >= 3` | >0 critical | Auto |
| Formula fallback | `FormulaExecutionLog.fallbackUsed` | >20 warning | Auto |
| Failed doc generation | `DocumentGenerationJob.status=failed` | >0 warning | Auto |
| Failed approvals | `WorkflowInstance rejected/cancelled` | informational | — |
| AI failures | `AiQueryLog` denied/null answer | >10 warning | Auto |
| Open payroll cycles | `PayrollCycle.status=open` | informational | — |

---

## Scheduler Inventory

| Scheduler | Cron (Bangkok) | Handler | Verified |
|-----------|----------------|---------|----------|
| Attendance alerts | */15 * * * * | attendance-alert.scheduler | E3 |
| Birthday recognition | 0 8 * * * | employee-recognition.scheduler | E4 |
| Work anniversary | 0 8 * * * | employee-recognition.scheduler | E4 |
| Probation reminders | 0 9 * * * | probation-reminder.scheduler | E4 |
| Training due | 0 7 * * * | training-reminder.scheduler | E2 |
| Document expiry | 0 6 * * * | document-expiry.scheduler | E2 |
| Announcement digest | 0 8 * * * | announcement.scheduler | E2 |
| AI Morning Brief | 0 8 * * * | ai-morning-brief-delivery.scheduler | E3 |
| Exit reminders | 0 9 * * * | exit-reminder.scheduler | E4 |

---

## API Endpoint

```
GET /api/v1/ops/health
Permission: reporting:owner
Business role: owner (assertOwner)
```

Returns: infrastructure status, monitoring counts, alerts array, `overallStatus: healthy|warning|critical`

---

## Verification Commands

```bash
# Backend health via smoke test
cd backend && npm run test:integration -- --testPathPattern=production-smoke

# Manual (requires running server + owner token)
curl -H "Authorization: Bearer $TOKEN" http://localhost:3000/api/v1/ops/health
```
