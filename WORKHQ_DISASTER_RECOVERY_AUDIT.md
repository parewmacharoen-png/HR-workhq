# WorkHQ Disaster Recovery Audit (QA-001)

| Scenario | Recovery | Status |
|----------|----------|--------|
| Postgres down | Health red, graceful 503 | DOCUMENTED |
| Redis down | Schedulers skip lock / degrade | PARTIAL |
| Telegram API failure | Brief marked failed, audit log | PASS |
| Storage unavailable | Document upload fails controlled | PARTIAL |
| Scheduler crash | Restart pod, Redis prevents dupes | PASS |
| Failed migration | `migrate deploy` rollback manual | DOCUMENTED |
| Outbox backlog | Ops retry endpoint | PASS |
| Duplicate Telegram callback | Idempotent handlers | PARTIAL |

## Manual Steps
1. Restore Postgres from backup → `prisma migrate deploy`
2. Clear stale Redis locks: `workhq:*` keys by date
3. Replay outbox: POST `/ops/actions/retry-outbox`
4. Re-run schedulers: ops rerun endpoints

**Verdict:** PARTIAL — document runbooks in ops wiki
