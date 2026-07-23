# WorkHQ Exit & Final Settlement Audit (QA-001)

| Flow | Status | Spec |
|------|--------|------|
| Exit case create | PASS | exit module |
| Owner Telegram approval | PARTIAL | unified inbox |
| Checklist | PASS | exit-case.controller |
| Final settlement draft | PASS | |
| Approve / mark paid | PARTIAL | `final-settlement-pay005c.integration.spec.ts` |
| Employee paid summary | PASS | `/me/final-settlement` |
| Permission scope | PASS | company access |

**Verdict:** PARTIAL — full exit E2E UAT required before rollout
