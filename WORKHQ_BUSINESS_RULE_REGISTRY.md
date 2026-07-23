# WorkHQ Business Rule Registry

**Document ID:** QA-003-A  
**Version:** 1.0  
**Date:** 2026-06-24  
**Sources:** WORKHQ_MASTER_POLICY_V1.md · Employee Handbook · Commission/Leave/Payroll/Attendance/KPI/Performance/Promotion/Exit/Referral/Security policies · Telegram Rules · Approval Rules · WORKHQ_POLICY_IMPLEMENTATION_MATRIX.md

---

## Registry Summary

| Metric | Value |
|--------|-------|
| Total business rules catalogued | 229 |
| Implemented (Complete) | 178 |
| Partially implemented | 38 |
| Not implemented / policy-only | 13 |
| Critical rules | 42 |
| Verified with E4+ evidence | 156 |
| Verified with E5 UAT | 0 |
| Owner | Owner / HR Director |

**Legend:** Implemented = code exists · Verified = E4+ automated test or reproducible evidence · Evidence = E0–E6 per QA-002

---

## Critical Rules (Payroll, Security, Exit)

| Rule ID | Category | Description | Priority | Owner | Implemented | Verified | Evidence | Risk |
|---------|----------|-------------|----------|-------|-------------|----------|----------|------|
| PAY-005b | Payroll | Final payroll settlement on employee exit | Critical | Owner | Yes | Yes | E4 | Low |
| PAY-005c | Payroll | Recalculate draft + deposit visibility + self-service | Critical | Owner | Yes | Yes | E4 | Low |
| PAY-005 | Payroll | Advance pay — Owner approver required | Critical | Owner | Partial | No | E3 | High |
| PAY-002 | Payroll | Leave bonus formula min(2,4-used)×600 | Critical | Owner | Yes | Yes | E4 | Medium |
| PAY-003 | Payroll | Approved OT flat hourly rate | Critical | Owner | Yes | Yes | E4 | Low |
| PAY-003a | Payroll | Missed meal/break OT item ฿50/hr | High | Owner | **No** | No | E0 | **Critical** |
| PAY-006 | Payroll | Bank transfer export with exception gating | Critical | Owner | Yes | Yes | E4 | Low |
| SAL-001 | Compensation | Salary review workflow + effective date apply | Critical | Owner | Yes | Yes | E4 | Medium |
| SEC-001 | Security | EmployeeAccessService on sensitive reads + audit | Critical | Owner | Yes | Yes | E4 | Low |
| SEC-001b | Security | Rehire scope, payroll items, disciplinary reads hardened | Critical | Owner | Yes | Yes | E4 | Low |
| EMP-012 | Exit | Exit case checklist, workflow, Telegram | Critical | Owner | Yes | Yes | E4 | Low |
| REQ-005b | Workflow | Unified Telegram approval inbox | Critical | Owner | Yes | Yes | E4 | Low |
| AC-001–012 | Access | Role-based permission matrix | Critical | Owner | Yes | Yes | E4 | Low |
| LV-001 | Leave | Leave request + approval workflow | Critical | Owner | Yes | Yes | E4 | Low |

---

## Organization & Employee (ORG, EMP, HR)

| Rule ID | Category | Description | Priority | Implemented | Verified | Evidence | Risk |
|---------|----------|-------------|----------|-------------|----------|----------|------|
| ORG-001 | Organization | Owner / two departments structure | Medium | Partial | Partial | E2 | Medium |
| ORG-006 | Organization | Multi-company employee assignments | Critical | Yes | Yes | E4 | Low |
| EMP-001 | Employee | OFFICE / WFH work category | High | Yes | Yes | E4 | Low |
| EMP-002 | Employee | Department enum (Marketing/Admin/HR/Finance) | Medium | **No** | No | E0 | Medium |
| EMP-010 | Probation | Probation review PASS/EXTEND/FAIL | High | Yes | Yes | E4 | Low |
| EMP-010b | Probation | Auto-review on onboard + Telegram inline | High | Yes | Yes | E4 | Low |
| EMP-011 | Recognition | Awards & service milestones | Medium | Yes | Yes | E4 | Low |
| EMP-012b | Exit | Exit cancel API + checklist normalization | High | Yes | Yes | E4 | Low |
| HR-013b | Recognition | Birthday/anniversary/probation buckets | Medium | Yes | Yes | E4 | Low |
| HR-013c | Recognition | Gift tracking + company-wide birthday broadcast | Medium | Yes | Yes | E4 | Low |
| EMP-014 | Career | Position framework linkage + career path API | High | Yes | Yes | E4 | Low |

---

## Attendance & Absence (ATT, ABS, SH)

| Rule ID | Category | Description | Priority | Implemented | Verified | Evidence | Risk |
|---------|----------|-------------|----------|-------------|----------|----------|------|
| ATT-001 | Attendance | Daily check-in/out | Critical | Yes | Yes | E4 | Low |
| ATT-002–005 | Attendance | Late/break/shift rules | High | Yes | Yes | E4 | Low |
| ATT-010 | Attendance | Alert engine + escalation + Telegram | High | Yes | Partial | E3 | Medium |
| ABS-001 | Absence | Four-criteria absence definition | High | Partial | Partial | E3 | High |
| ABS-002–004 | Absence | Role penalties ฿1k/2k/3k via payroll | High | Partial | Yes | E4 | Medium |
| ABS-006 | Absence | Missing >15 min rule | Medium | **No** | No | E0 | Medium |
| ABS-007 | Absence | 2 labor units/hr round up | Medium | **No** | No | E0 | Medium |
| ABS-009 | Absence | Secretary/Owner penalty rates | High | Partial | Partial | E3 | Medium |
| SH-001–003 | Shifts | Work shift configuration | Medium | Partial | Partial | E2 | Low |

---

## Leave & Calendar (HOL, LV, LR, LS, EL)

| Rule ID | Category | Description | Priority | Implemented | Verified | Evidence | Risk |
|---------|----------|-------------|----------|-------------|----------|----------|------|
| HOL-001 | Leave | No public holiday system (by design) | High | Yes | Yes | E4 | Low |
| HOL-004 | Leave | Special holidays Dec 31 / Jan 1 | Medium | **No** | No | E0 | Low |
| LV-001–003 | Leave | Personal leave types | Critical | Yes | Yes | E4 | Low |
| LV-004 | Leave | Monthly off-days (4) | High | Partial | Partial | E3 | Medium |
| LV-005 | Leave | Min usage 2 days (advisory) | Low | Partial | No | E1 | Low |
| LR-001–008 | Leave | Leave reschedule workflow | High | Yes | Yes | E4 | Low |
| LR-004 | Leave | new_start > original_end validation | High | Partial | Partial | E3 | Medium |
| LR-009 | Leave | Big Leader → Secretary approver | Medium | Partial | No | E2 | Medium |
| LS-001–007 | Leave | Leave swap | Medium | Partial | Partial | E2 | Medium |
| EL-001–007 | Leave | Emergency leave | High | Yes | Yes | E4 | Low |

---

## Payroll & Compensation (PAY, PR, SAL)

| Rule ID | Category | Description | Priority | Implemented | Verified | Evidence | Risk |
|---------|----------|-------------|----------|-------------|----------|----------|------|
| PAY-001 | Payroll | Meal allowance by work category | High | Yes | Yes | E4 | Low |
| PAY-004 | Payroll | Deductions; deferral/loss/refund partial | High | Partial | Partial | E3 | High |
| PAY-007 | Payroll | Company payroll overview | High | Yes | Yes | E4 | Low |
| PR-001–008 | Payroll | Payroll cycle lifecycle | Critical | Yes | Yes | E4 | Low |
| SAL-001b | Compensation | Compensation review UX + integration tests | High | Yes | Yes | E4 | Low |
| SAL-002 | Compensation | Advisory promotion path validation | Medium | Yes | Yes | E4 | Low |

---

## Performance & KPI (KPI, PERF)

| Rule ID | Category | Description | Priority | Implemented | Verified | Evidence | Risk |
|---------|----------|-------------|----------|-------------|----------|----------|------|
| KPI-001 | KPI | KPI engine foundation | High | Yes | Yes | E4 | Low |
| KPI-002 | KPI | Dynamic KPI builder + templates | High | Yes | Partial | E3 | Medium |
| KPI-003 | KPI | Weighted review (KPI+Leader+Self+360) | High | Yes | Partial | E3 | Medium |
| KPI-004 | KPI | Position framework + career paths | High | Yes | Yes | E4 | Low |
| KPI-005 | KPI | Position-driven KPI assignment | High | Yes | Partial | E3 | Medium |

---

## Workflow & Requests (REQ, WF)

| Rule ID | Category | Description | Priority | Implemented | Verified | Evidence | Risk |
|---------|----------|-------------|----------|-------------|----------|----------|------|
| REQ-001 | Workflow | Universal request center | Critical | Yes | Yes | E4 | Low |
| REQ-002–004 | Workflow | Dynamic type/form/approval builders | High | Yes | Yes | E4 | Low |
| REQ-006 | Workflow | Integration engine on final approval | High | Yes | Yes | E4 | Low |
| WF-001–005 | Workflow | Department-specific approval chains | High | Partial | Partial | E3 | Medium |

---

## Referral, Disciplinary, Documents, AI

| Rule ID | Category | Description | Priority | Implemented | Verified | Evidence | Risk |
|---------|----------|-------------|----------|-------------|----------|----------|------|
| REC-002 | Referral | Bonus after probation + payroll item | High | Yes | Partial | E4 | Medium |
| REF-001 | Referral | 90-day eligibility + discretion | Medium | Partial | Partial | E3 | Medium |
| DISC-001–005 | Disciplinary | Warning ladder + acknowledgement | High | Yes | Partial | E3 | Medium |
| DISC-001d/002 | Disciplinary | Termination settlement flag | High | **No** | No | E0 | High |
| AC-013 | Disciplinary | LEGAL_REVIEW_REQUIRED flag | Medium | **No** | No | E0 | Medium |
| DOC-001 | Documents | Document center + knowledge | Medium | Yes | Partial | E3 | Medium |
| ANN-001 | Announcement | Publish + acknowledge tracking | Medium | Yes | Partial | E3 | Low |
| ASSET-001 | Assets | Asset tracking API (no UI) | Low | Partial | No | E2 | Low |

---

## Formula Engine (FORM)

| Rule ID | Category | Description | Priority | Implemented | Verified | Evidence | Risk |
|---------|----------|-------------|----------|-------------|----------|----------|------|
| FORM-ATT | Formula | attendance.late_deduction + fallback | High | Yes | Partial | E3 | Medium |
| FORM-PAY | Formula | payroll leave bonus resolver | High | Yes | Yes | E4 | Low |
| FORM-COM | Formula | admin commission formula | High | Yes | Partial | E3 | Medium |
| FORM-KPI | Formula | performance score weights | High | Partial | Partial | E3 | Medium |
| FORM-REF | Formula | referral bonus calculation | Medium | Yes | Partial | E3 | Medium |

---

## Traceability Chain (per rule)

Every rule above maps through:

```
Business Decision → Master Policy → Database → Backend → API → Web UI → Telegram → Permission → Audit → Tests → Evidence → UAT → Production
```

Full per-rule trace chains are in [WORKHQ_REQUIREMENT_TRACEABILITY_MATRIX.md](./WORKHQ_REQUIREMENT_TRACEABILITY_MATRIX.md).

**Dashboard:** `/qa/traceability` (Owner, `reporting:owner`)

**Canonical implementation status:** [WORKHQ_POLICY_IMPLEMENTATION_MATRIX.md](./WORKHQ_POLICY_IMPLEMENTATION_MATRIX.md)
