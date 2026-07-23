# WorkHQ Leave & Calendar Audit (QA-001)

| Test | Status | Spec |
|------|--------|------|
| Sick / annual leave | PASS | `leave-workflow.integration.spec.ts` |
| Emergency leave | PASS | `leave-emergency-entitlement.integration.spec.ts` |
| Leave reschedule | PASS | `leave-reschedule-workflow.integration.spec.ts` |
| Shift swap | PARTIAL | workflow matrix |
| 7-day notice | PASS | leave settings |
| Team calendar web | PASS | `/calendar/team` |
| Telegram calendar | PASS | `calendar:menu` |
| Dashboard today/tomorrow | PARTIAL | HR analytics |

**Verdict:** PASS — UAT calendar conflicts recommended
