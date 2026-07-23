# WorkHQ Critical Scenario Certification

**Document ID:** QA-004-C  
**Version:** 1.0  
**Date:** 2026-06-24

---

## Summary

| Status | Count |
|--------|-------|
| Certified (E4+) | 14 |
| Provisionally Certified (E4, UAT pending) | 4 |
| Requires Fixes | 2 |

---

## Scenario Matrix

| # | Scenario | Preconditions | Expected Result | Actual Result | Evidence | Status |
|---|----------|---------------|-----------------|---------------|----------|--------|
| 1 | New employee onboarding | HR role, company exists | Employee created, probation review spawned | Integration test PASS | `employee-onboard.integration.spec.ts` | **Certified** |
| 2 | Daily attendance | Active employee, Telegram linked | Check-in/out recorded, audit logged | Integration test PASS | `attendance.integration.spec.ts` | **Certified** |
| 3 | Leave request | Leave types seeded, balance available | Workflow started, inbox entry | Integration + smoke PASS | `leave-workflow.integration.spec.ts` | **Certified** |
| 4 | OT request | Checked out with OT hours | Approval workflow, payroll source | Integration test PASS | `ot-workflow.integration.spec.ts` | **Certified** |
| 5 | Advance salary | Policy allows, Owner approver | Owner approval required | Partial — matrix incomplete | E3 code review | **Requires Fixes** |
| 6 | Referral bonus | Probation complete, program active | Payroll item on markPaid | Integration test PASS | `referral.integration.spec.ts` | **Provisionally Certified** |
| 7 | Probation pass | Review pending, manager role | Status PASS, employee confirmed | Integration test PASS | `probation-review.integration.spec.ts` | **Certified** |
| 8 | Probation extension | Review pending | EXTEND spawns next review | Unit + integration PASS | `performance.service.probation.unit.spec.ts` | **Certified** |
| 9 | Salary review | Compensation workflow active | Approval + apply on effective date | Integration test PASS | `compensation-review.integration.spec.ts` | **Provisionally Certified** |
| 10 | Promotion | Promotion review workflow | Same as salary review path | Integration test PASS | `compensation-review.integration.spec.ts` | **Provisionally Certified** |
| 11 | Payroll generation | Open cycle, attendance data | Items built, formulas applied | Integration test PASS | `payroll-build.integration.spec.ts` | **Certified** |
| 12 | Payroll export | Locked cycle, Owner/Secretary | XLSX/CSV with exception gating | Integration test PASS | `payroll.integration.spec.ts` | **Certified** |
| 13 | Final payroll settlement | Exit case approved | Settlement calculated, deposit pipeline | Integration test PASS | `final-settlement-pay005c.integration.spec.ts` | **Provisionally Certified** |
| 14 | Employee resignation | Exit workflow initiated | Checklist, approval, final settlement | Integration test PASS | `employee-exit-deposit.integration.spec.ts` | **Certified** |
| 15 | Document request | Template exists | PDF generated in document center | Partial — Telegram info-only | E3 | **Requires Fixes** |
| 16 | Announcement acknowledgement | Published announcement | Ack tracked web + Telegram | Unit test PASS | `announcement.service.unit.spec.ts` | **Provisionally Certified** |
| 17 | Training assignment | Course exists | Employee sees in menu | Manual smoke partial | E2 | **Provisionally Certified** |
| 18 | Competency update | Competency matrix seeded | Employee competency recorded | Limited test coverage | E1 | **Not Ready** |
| 19 | Succession candidate update | Owner role | Succession plan updated | Owner-only API | E2 | **Not Ready** |
| 20 | AI Morning Brief | Owner Telegram, 08:00 Bangkok | Thai summary delivered | Scheduler + integration PASS | `production-stabilization.integration.spec.ts` | **Certified** |

---

## E2E Trace Example (Leave Request — Certified)

```
LV-001 Policy → leave_requests DB → LeaveService → POST /leave/.../requests
→ /leave/requests UI → leave:menu Telegram → leave:write permission
→ leave_request_* audit → leave-workflow.integration.spec → E4 → UAT Pending
```

**Smoke test coverage:** Scenarios 2, 3, 11 (partial), 20 covered in `production-smoke.integration.spec.ts`
