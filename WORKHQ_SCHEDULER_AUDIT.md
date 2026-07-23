# WorkHQ Scheduler Audit (QA-001)

| Scheduler | Time (Bangkok) | Lock TTL | onModuleDestroy |
|-----------|------------------|----------|-----------------|
| AI Morning Brief | 08:00 | 3600s | ✓ |
| Legacy Owner Brief | 09:00 | 3600s | ✓ |
| Evening Brief | 23:59 | 3600s | ✓ |
| Attendance alerts | Periodic | Redis | Partial cleanup |
| Birthday / anniversary | Daily | Redis | ✓ |
| Probation reminders | Daily | Redis | ✓ |
| Recognition | Daily | Redis | ✓ |
| Exit reminders | Daily | Redis | ✓ |
| Announcement 24h/72h | Daily | Redis | ✓ |
| Compensation review | Daily | Redis | ✓ |
| HR daily snapshot | Daily | Redis | ✓ |

**Checks:** Bangkok via `SchedulerTimeProvider` — PASS | Idempotency via Redis — PASS

**Gap:** Jest worker force-exit on fake timers — yellow

**Verdict:** PASS
