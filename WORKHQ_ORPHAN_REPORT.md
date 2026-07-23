# WorkHQ Orphan Detection Report

**Document ID:** QA-003-N  
**Version:** 1.0  
**Date:** 2026-06-24  
**Method:** Automated scan of policy matrix + codebase cross-reference + QA traceability service

---

## Summary

| Orphan Type | Count | Critical |
|-------------|-------|----------|
| Business rules with no implementation | 13 | 3 |
| Policy sections with no code | 18 | 5 |
| Database tables with no service (low-use) | 4 | 0 |
| Services with no controller | 2 | 0 |
| Controllers with no route | 0 | 0 |
| Routes with no UI | 12 | 2 |
| UI with no API | 1 | 0 |
| Telegram handlers with no menu | 3 | 1 |
| Tests with no production code | 0 | 0 |

---

## Critical Orphans (must resolve before production)

| ID | Kind | Description | Severity |
|----|------|-------------|----------|
| PAY-003a | rule_no_impl | Missed meal/break payroll item — policy requires ฿50/hr; no item type in payroll engine | **Critical** |
| PAY-005 | impl_no_test | Advance pay Owner approval — partial impl, no integration test | **Critical** |
| WF-ADV | telegram_no_menu | Advance pay Telegram flow incomplete vs web workflow | **High** |
| DISC-001d | policy_gap | Termination settlement on disciplinary exit — not enforced | **High** |
| SAL-001 | uat_gap | Salary review — E4 only, E5 UAT not executed | **Critical** |
| PAY-005b | uat_gap | Final settlement — E4 only, E5 UAT not executed | **Critical** |

---

## Business Rules Without Implementation

| Rule ID | Policy Source | Gap |
|---------|---------------|-----|
| PAY-003a | Commission/Payroll Policy | No payroll item type for missed meal/break |
| AC-013 | Security/Disciplinary Policy | LEGAL_REVIEW_REQUIRED flag missing |
| DISC-001d/002 | Exit/Disciplinary Policy | Termination settlement pipeline |
| ABS-001 | Attendance Policy | Four-criteria absence auto-detection |
| ABS-006 | Attendance Policy | Missing >15 min classification |
| ABS-007 | Attendance Policy | 2 labor units/hr round up |
| ABS-005 | Attendance Policy | Constructive resignation trigger |
| EMP-002 | Employee Handbook | Department enum not in schema |
| ORG-002 | Master Policy | Admin hierarchy — policy only |
| HOL-004 | Leave Policy | Dec 31 / Jan 1 special holidays |
| HOL-005 | Leave Policy | Special holiday handling |
| PAY-004 (partial) | Payroll Policy | Deferral, loss claims, refund rules |
| ASSET-001 (partial) | Exit Policy | Asset UI + exit checklist integration |

---

## Implementation Without Tests

| ID | Component | Notes |
|----|-----------|-------|
| PAY-005 | Advance pay workflow | No dedicated integration spec |
| KPI-003 | Performance weighted score | Unit test only; no E2E |
| ATT-010 | Attendance alert scheduler | Unit test only |
| DOC-001 | Document center | Unit test only |
| ANN-001 | Announcements | Unit test only |
| FORM-COM | Commission formula resolver | Partial unit coverage |

---

## API Without UI

| API | Permission | Notes |
|-----|------------|-------|
| POST /payroll/cycles/:id/absence-deduction | payroll:write | Triggered from payroll cycle UI (partial) |
| GET /attendance/alerts | attendance:read | Embedded in attendance daily page |
| POST /formulas/:id/execute | settings:write | Admin formulas — settings only |
| GET /succession/* | reporting:owner | Owner-only, no dedicated nav for all roles |
| GET /competency/* | settings:read | Backend exists; UI minimal |

---

## Telegram Handlers Without Menu Entry

| Handler | Callback | Notes |
|---------|----------|-------|
| leave_swap | leave_swap:* | LS-001 — no top-level menu button |
| asset_return | asset:* | ASSET-001 — backend only |
| disciplinary_ack | disc:ack:* | Accessible via notification only |

---

## Dead / Low-Use Database Objects

| Model | Status | Notes |
|-------|--------|-------|
| AssetAssignment | low-use | API exists; no UI workflow |
| CompetencyAssessment | low-use | Phase 2 stub |
| SuccessionPlan | low-use | Owner-only read |

No confirmed dead tables requiring migration rollback. All Prisma models referenced in at least one repository or seed script.

---

## Routes Without Policy Mapping

| Route | Notes |
|-------|-------|
| GET /health | Infrastructure — exempt |
| POST /telegram/webhook | Public webhook — exempt |
| GET /qa/* | QA meta — Owner only |

All 621 HR API routes mapped in WORKHQ_API_AUDIT.md. 614/621 have `@RequirePermission`.

---

## Remediation Priority

1. **P0:** Execute UAT (E5) for payroll, salary, exit flows
2. **P0:** Implement or formally defer PAY-003a with Owner sign-off
3. **P1:** Add advance pay integration test + complete Telegram path
4. **P1:** DISC-001d termination settlement or document as post-go-live
5. **P2:** Department enum, special holidays, asset UI

**Live orphan scan:** `GET /qa/traceability/orphans` · `scripts/workhq-traceability-check.sh`
