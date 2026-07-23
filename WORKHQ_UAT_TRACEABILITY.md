# WorkHQ UAT Traceability

**Document ID:** QA-003-M  
**Version:** 1.0  
**Date:** 2026-06-24  
**Source:** WORKHQ_UAT_CHECKLIST.md · WORKHQ_UAT_SEED_GUIDE.md

---

## Summary

| Metric | Value |
|--------|-------|
| UAT cases defined | 42 |
| Executed | 0 |
| Pass | 0 |
| Fail | 0 |
| Blocked | 42 (awaiting UAT sprint) |
| Critical money flows with E5 | 0/8 |

---

## UAT Case Traceability

### Owner Role

| UAT ID | Requirement | Business Rule | Module | Expected Result | Evidence | Pass/Fail |
|--------|-------------|---------------|--------|-----------------|----------|-----------|
| UAT-O-01 | Morning Brief delivery | AI-BRIEF | AI | Thai summary 08:00 Bangkok with action buttons | — | **Not Run** |
| UAT-O-02 | Approval inbox | REQ-005b | Workflow | Pending list with approve/reject | — | **Not Run** |
| UAT-O-03 | Payroll overview | PAY-007 | Payroll | Summary visible, no unauthorized data | — | **Not Run** |
| UAT-O-04 | Salary review approve | SAL-001 | Compensation | Status updated, audit logged | — | **Not Run** |
| UAT-O-05 | Exit approval | EMP-012 | Exit | Case advances, requester notified | — | **Not Run** |
| UAT-O-06 | Announcement publish | ANN-001 | Announcement | Employees receive Telegram | — | **Not Run** |
| UAT-O-07 | AI Manager menu | — | AI | Brief + urgent list loads | — | **Not Run** |
| UAT-O-08 | Knowledge Graph query | SEC-001 | AI | Scoped company results, salary redacted | — | **Not Run** |

### Secretary Role

| UAT ID | Requirement | Business Rule | Module | Expected Result | Evidence | Pass/Fail |
|--------|-------------|---------------|--------|-----------------|----------|-----------|
| UAT-S-01 | Employee CRUD | EMP-001, SEC-001 | Employee | CRUD within company scope | — | **Not Run** |
| UAT-S-02 | Document center | DOC-001 | Documents | Upload/list scoped to company | — | **Not Run** |
| UAT-S-03 | Payroll export | PAY-006 | Payroll | File generated, permission guarded | — | **Not Run** |
| UAT-S-04 | Requests dashboard | REQ-001 | Workflow | Company-scoped counts | — | **Not Run** |
| UAT-S-05 | Final settlement | PAY-005b | Exit/Payroll | Approval flow completes | — | **Not Run** |
| UAT-S-06 | Announcement tracking | ANN-001 | Announcement | Acknowledgement dashboard updates | — | **Not Run** |
| UAT-S-07 | Training assignment | DOC-001 | Training | Employee sees in Telegram menu | — | **Not Run** |

### Big Leader Role

| UAT ID | Requirement | Business Rule | Module | Expected Result | Evidence | Pass/Fail |
|--------|-------------|---------------|--------|-----------------|----------|-----------|
| UAT-BL-01 | Team calendar | HOL-003 | Leave | Leave/off-day visible for team | — | **Not Run** |
| UAT-BL-02 | Leave approval | LV-001 | Leave | Approved, calendar updated | — | **Not Run** |
| UAT-BL-03 | OT approval | PAY-003 | Attendance | OT record + payroll source | — | **Not Run** |
| UAT-BL-04 | Time correction | WF-TIME | Attendance | Attendance corrected | — | **Not Run** |
| UAT-BL-05 | KPI team view | KPI-002 | Performance | Team performance summary | — | **Not Run** |
| UAT-BL-06 | Performance review | KPI-003 | Performance | Weighted score calculated | — | **Not Run** |
| UAT-BL-07 | Attendance alerts | ATT-010 | Attendance | Alert list in Thai | — | **Not Run** |

### Sub Leader Role

| UAT ID | Requirement | Business Rule | Module | Expected Result | Evidence | Pass/Fail |
|--------|-------------|---------------|--------|-----------------|----------|-----------|
| UAT-SL-01 | Team leave approval | LV-001 | Leave | Approved within team scope | — | **Not Run** |
| UAT-SL-02 | Own payslip only | SEC-001 | Payroll | Cannot see other salaries | — | **Not Run** |
| UAT-SL-03 | Team calendar | HOL-003 | Leave | Team events only | — | **Not Run** |

### Employee Role

| UAT ID | Requirement | Business Rule | Module | Expected Result | Evidence | Pass/Fail |
|--------|-------------|---------------|--------|-----------------|----------|-----------|
| UAT-E-01 | Check in/out | ATT-001 | Attendance | Record saved, audit logged | — | **Not Run** |
| UAT-E-02 | Break start/end | ATT-002 | Attendance | Break times recorded | — | **Not Run** |
| UAT-E-03 | Leave request | LV-001 | Leave | Workflow started | — | **Not Run** |
| UAT-E-04 | OT request | PAY-003 | Attendance | Approval workflow | — | **Not Run** |
| UAT-E-05 | Advance pay | PAY-005 | Payroll | Owner approval required | — | **Not Run** |
| UAT-E-06 | Document request | DOC-001 | Documents | PDF in document center | — | **Not Run** |
| UAT-E-07 | Payslip | PR-001, SEC-001 | Payroll | Own payslip only | — | **Not Run** |
| UAT-E-08 | Announcement ack | ANN-001 | Announcement | Status tracked | — | **Not Run** |
| UAT-E-09 | Referral | REC-002 | Referral | Status through probation | — | **Not Run** |
| UAT-E-10 | KPI/Training/Competency | KPI-002, DOC-001 | Performance | Own data only | — | **Not Run** |

---

## Critical Money Flow UAT (E5 required)

| Flow | UAT IDs | Business Rules | E5 Status |
|------|---------|----------------|-----------|
| Payroll cycle build + export | UAT-O-03, UAT-S-03, UAT-E-07 | PAY-002, PAY-006, PAY-007, PR-001 | **Missing** |
| Final settlement on exit | UAT-O-05, UAT-S-05 | PAY-005b, EMP-012 | **Missing** |
| Salary review apply | UAT-O-04 | SAL-001 | **Missing** |
| Advance pay recovery | UAT-E-05 | PAY-005 | **Missing** |
| OT → payroll item | UAT-BL-03 | PAY-003 | **Missing** |
| Absence deduction | — | ABS-002 | **Missing** |
| Referral bonus payout | UAT-E-09 | REC-002 | **Missing** |
| Cross-company salary isolation | UAT-SL-02 | SEC-001, AC-001 | **Missing** |

---

## UAT Execution Plan

1. Seed UAT environment per WORKHQ_UAT_SEED_GUIDE.md
2. Execute checklist by role (Owner → Secretary → Leaders → Employee)
3. Capture screenshots + audit log IDs as evidence artifacts
4. Update this document with Pass/Fail and evidence links
5. Re-run `GET /qa/uat-status` and `/qa/traceability` dashboards

**Acceptance criteria:** 100% payroll and salary flows must have E5 before Enterprise Ready declaration.
