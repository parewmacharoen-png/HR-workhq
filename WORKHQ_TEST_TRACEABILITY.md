# WorkHQ Test Traceability

**Document ID:** QA-003-L  
**Version:** 1.0  
**Date:** 2026-06-24

---

## Summary

| Metric | Value |
|--------|-------|
| Unit test files | ~125 |
| Integration test files | 59 |
| Business rules with unit OR integration test | 156/229 (68%) |
| Business rules with integration test only | 89 |
| Business rules UNVERIFIED (no automated test) | 38 |
| Formula tests | 11/11 PASS |

---

## Evidence Levels

| Level | Definition | Count (rules) |
|-------|------------|---------------|
| E0 | No evidence | 13 |
| E1 | Code review only | 22 |
| E2 | Manual smoke | 18 |
| E3 | Unit test pass | 45 |
| E4 | Integration test pass | 131 |
| E5 | UAT executed | 0 |
| E6 | Production log | 0 |

---

## Critical Rules — Test Mapping

| Rule ID | Unit Test | Integration Test | UAT | Status |
|---------|-----------|-------------------|-----|--------|
| ATT-001 | attendance-rules.service.unit.spec | attendance.integration.spec | Pending | E4 |
| PAY-003 | attendance-rules.service.unit.spec | ot-workflow.integration.spec | Pending | E4 |
| PAY-005b | — | final-settlement-pay005c.integration.spec | Pending | E4 |
| PAY-005 | — | — | Pending | **UNVERIFIED** |
| PAY-002 | leave-bonus.service.unit.spec | payroll-leave-bonus.integration.spec | Pending | E4 |
| LV-001 | — | leave-workflow.integration.spec | Pending | E4 |
| SEC-001 | employee-access.service.unit.spec | employee-access-audit.integration.spec | Pending | E4 |
| REQ-005b | — | approval-inbox.integration.spec | Pending | E4 |
| EMP-012 | exit-case.service.unit.spec | employee-exit-deposit.integration.spec | Pending | E4 |
| SAL-001 | — | compensation-review.integration.spec | Pending | E4 |
| ABS-002 | absence-penalty.service.unit.spec | absence-record.integration.spec | Pending | E4 |
| AC-001 | — | company-isolation.integration.spec | Pending | E4 |

---

## Integration Test Inventory (HR-critical)

| Spec File | Rules Covered |
|-----------|---------------|
| attendance.integration.spec.ts | ATT-001, ATT-002 |
| ot-workflow.integration.spec.ts | PAY-003, PAY-003c |
| leave-workflow.integration.spec.ts | LV-001, WF-LEAVE |
| leave-reschedule-workflow.integration.spec.ts | LR-001–008 |
| payroll-build.integration.spec.ts | PR-001, PAY-001 |
| payroll-leave-bonus.integration.spec.ts | PAY-002 |
| payroll.integration.spec.ts | PR-001, WF-ADV |
| final-settlement-pay005c.integration.spec.ts | PAY-005b, PAY-005c |
| compensation-review.integration.spec.ts | SAL-001, WF-SAL |
| employee-exit-deposit.integration.spec.ts | EMP-012, WF-EXIT |
| absence-record.integration.spec.ts | ABS-002 |
| approval-inbox.integration.spec.ts | REQ-005b |
| company-isolation.integration.spec.ts | AC-001, SEC-001 |
| employee-access-audit.integration.spec.ts | SEC-001 |
| probation-review.integration.spec.ts | EMP-010 |
| referral.integration.spec.ts | REC-002, REF-001 |
| production-stabilization.integration.spec.ts | FORM-*, Telegram, AI brief |
| telegram-workflow-matrix.integration.spec.ts | REQ-005b, Telegram approvals |
| time-correction-workflow.integration.spec.ts | WF-TIME |

---

## UNVERIFIED Rules (no unit, integration, or UAT)

| Rule ID | Category | Risk | Recommended Test |
|---------|----------|------|------------------|
| PAY-003a | Payroll | Critical | payroll item integration spec |
| PAY-005 | Payroll | Critical | advance-workflow.integration.spec |
| AC-013 | Disciplinary | Medium | disciplinary-flag.integration.spec |
| DISC-001d | Disciplinary | High | exit-settlement integration |
| ABS-006 | Attendance | Medium | absence-classification unit spec |
| ABS-007 | Attendance | Medium | labor-unit unit spec |
| EMP-002 | Employee | Low | schema migration test |
| HOL-004 | Leave | Low | calendar special-date spec |
| KPI-003 | Performance | Medium | performance-score E2E |
| DOC-001 | Documents | Medium | document-request integration |
| ANN-001 | Announcement | Low | announcement.integration.spec |

---

## Commands

```bash
# Unit tests
cd backend && npm run test:unit

# Integration (requires DATABASE_URL)
cd backend && npm run test:integration

# Formula subset (verified PASS)
cd backend && npm run test:unit -- --testPathPattern="safe-formula|formula-resolver"
```

**Acceptance:** Every critical rule must reach E4 minimum; payroll/salary require E5 before production.
