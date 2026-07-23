# WorkHQ Attendance Audit (QA-001)

| Test | Code | Integration | UAT |
|------|------|-------------|-----|
| Check-in | PASS | `attendance.integration.spec.ts` | Required |
| Check-out | PASS | ✓ | Required |
| Break start/end | PASS | ✓ | Required |
| Missing check-in alert | PASS | Scheduler | Required |
| Missing break return | PASS | Reminder types | Required |
| Missing check-out | PASS | Reminder types | Required |
| Alert escalation | PARTIAL | Unit | Required |
| Alert auto-resolve | PASS | On check-in/out | Required |
| Time correction workflow | PASS | `time-correction-workflow.integration.spec.ts` | Required |
| OT request | PASS | `ot-workflow.integration.spec.ts` | Required |
| Bangkok day boundary | PASS | `BangkokTimeProvider` | Required |
| Late formula deduction | PARTIAL | Formula resolver | Required |

**Telegram:** `attendance:menu`, `attendance:alerts` — PASS (wired)

**Verdict:** PASS with UAT on alert escalation
