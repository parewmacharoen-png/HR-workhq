# WorkHQ Policy Implementation Matrix

**Document ID:** POL-001 (Part B–E)  
**Version:** 1.1  
**Date:** 2026-06-23  
**Amendment:** POL-001A Discovery Delta Consolidation  
**Companion:** [WORKHQ_MASTER_POLICY_V1.md](./WORKHQ_MASTER_POLICY_V1.md)

---

## POL-001A delta summary

Confirmed business decisions merged from POL-001A. Conflicts C-001, C-002, C-004, C-005 (interim), C-006 **closed**. C-003 partially open.

| Decision ID | Policy status after merge | Primary implementation gap |
|-------------|---------------------------|----------------------------|
| HR-013b | Complete | Probation-ending-soon dashboard UI (7/14-day buckets) |
| HR-013c | Complete | — |
| SEC-001 | Complete | — |
| SEC-001b | Complete | — |
| EMP-010 | Complete | — |
| EMP-010b | Complete | — |
| EMP-011 | Complete | — |
| EMP-012 | Complete | — |
| EMP-012b | Complete | — |
| ORG-001 | Complete | No org chart UI; department/position not in employee schema |
| EMP-001 | Complete | `workCategory` exists; department enum missing |
| EMP-002 | Complete | Probation not gated on manager evaluation |
| PAY-001 | Complete | Meal logic mostly wired; absence exclusion missing |
| PAY-002 | Partial | Formula in code differs from `min(2, 4-used)` — verify `leave-bonus.service.ts` |
| PAY-003 | Complete | OT flat rate wired; missed meal/break item **missing** |
| PAY-004 | Partial | Deduction wired; deferral, loss claims, refund rules **missing** |
| PAY-005 | Partial | Advance API exists; Owner-only approver + auto-recovery **partial** |
| PAY-005b | Complete | Final payroll settlement engine on exit (PAY-005 epic) |
| PAY-005c | Complete | Recalculate draft, deposit visibility, employee self-service |
| PAY-006 | Complete | Payroll bank transfer export batches, XLSX/CSV, exception gating |
| PAY-007 | Complete | Company payroll overview page with exceptions and drill-down |
| SAL-001 | Complete | Salary review & promotion workflow with apply-on-effective-date |
| SAL-001b | Complete | Compensation review UX: forms, list, manual apply, integration tests |
| KPI-001 | Complete | Performance KPI engine foundation with SAL-001 timeline integration |
| KPI-002 | Complete | Dynamic KPI builder with position-based templates and hybrid data sources |
| KPI-003 | Complete | Performance review with configurable KPI+Leader+Self+360 weights |
| KPI-004 | Complete | Position framework with career and promotion paths |
| REQ-001 | Complete | Universal request center — Telegram + Web + audit/timeline |
| REQ-002 | Complete | Dynamic request type builder with versioning |
| REQ-003 | Complete | Dynamic form builder with conditional fields |
| REQ-004 | Complete | Approval flow builder with step resolution |
| REC-002 | Complete | Referral after probation; payroll item on markPaid; Telegram my-referrals list |
| EMP-014 | Complete | Employee position framework linkage, bulk tools, career path API |
| KPI-005 | Complete | Position-driven KPI assignment rules and resolution |
| SAL-002 | Complete | Advisory promotion path validation; dashboard outside-path count |
| REQ-005b | Complete | Unified Telegram approval inbox |
| REQ-006 | Complete | Request integration engine on final approval |
| ATT-010 | Complete | Attendance alert engine with escalation and Telegram actions |
| DOC-001 | Complete | Document center + knowledge + training stub; Telegram menus |
| ANN-001 | Complete | Announcements with acknowledge tracking; Telegram + Web |
| ABS-001 (ATT-001) | **Partial** | Queue + payroll deduction wired (POL-003 3a+3b); Telegram deferred |
| ABS-009 Secretary/Owner penalty | **Partial** | POL-003 — rates confirmed; Owner has no absence status; Phase 3b payroll deduction |
| ABS-002 (ATT-002) | Complete | Labor-unit penalty **not implemented** |
| REF-001 | Complete | 3-month + discretion **partial** — code uses 90 days + dual path |
| DISC-001–005 (POL-025 foundation) | Complete | Complete | Complete | Complete | Complete | Partial | Enforced | Warning ladder + acknowledgement |
| DISC-001d/002 settlement | Complete | Missing | Missing | Missing | Missing | Missing | Not enforced | POL-025b termination settlement |
| WF-001–005 | Complete | Department-specific chains **not in** `approval-defaults.ts` |
| ASSET-001 | Partial | Backend API exists; no UI; not in exit checklist |
| HOL-001 | Complete | No public holiday system in code (correct); special dates **not configured** |

---

## Part B — Policy Implementation Matrix

**Legend**

| Column | Values |
|--------|--------|
| Policy Status | **Complete** · **Partial** · **Missing** |
| DB / API / UI / Telegram / Tests | **Complete** · **Partial** · **Missing** |
| Enforcement | **Fully enforced** · **Partially enforced** · **Not enforced** |

---

### 1. Organization Structure (ORG-001)

| Policy Rule | Policy Status | DB | API | UI | Telegram | Tests | Enforcement | Notes |
| ----------- | ------------- | -- | --- | -- | -------- | ----- | ----------- | ----- |
| ORG-001 Owner / two departments | Complete | Partial | Partial | Missing | N/A | Partial | Not enforced | No department entity |
| ORG-002 Admin: Secretary → Admin/HR/Finance | Complete | Missing | Missing | Missing | N/A | Missing | Not enforced | Policy only |
| ORG-003 Marketing: Big Leader → Sub Leader → Employee | Complete | Partial | Partial | Partial | Partial | Partial | Partially enforced | Teams + marketing teams |
| ORG-004 Secretary highest Admin authority | Complete | Partial | Partial | Partial | N/A | Partial | Partially enforced | Business role `secretary` |
| ORG-005 Big Leader highest Marketing authority | Complete | Partial | Partial | Partial | Partial | Partial | Partially enforced | |
| ORG-006 Multi-company assignments | Complete | Complete | Complete | Partial | N/A | Partial | Fully enforced | |
| ORG-007 Team hierarchy | Partial | Complete | Complete | Missing | N/A | Partial | Partially enforced | |
| ORG-008 Handbook culture | Complete | Complete | Complete | Complete | Partial | Complete | Partially enforced | KB advisory |

---

### 2. Business Roles & Employee Model (EMP-001, EMP-002)

| Policy Rule | Policy Status | DB | API | UI | Telegram | Tests | Enforcement | Notes |
| ----------- | ------------- | -- | --- | -- | -------- | ----- | ----------- | ----- |
| EMP-001 OFFICE / WFH category | Complete | Complete | Complete | Partial | Partial | Complete | Fully enforced | `workCategory` |
| EMP-002 Department enum | Complete | Missing | Missing | Missing | N/A | Missing | Not enforced | Marketing/Admin/HR/Finance |
| EMP-003 Position enum | Complete | Partial | Partial | Partial | Partial | Partial | Partially enforced | Maps to roleLevel + business role |
| EMP-004 Multi-company assignments | Complete | Complete | Complete | Partial | N/A | Partial | Fully enforced | |
| EMP-005 Category → meal eligibility | Complete | Complete | Complete | Partial | Partial | Complete | Fully enforced | PAY-001 |
| EMP-002 Probation manager evaluation | Complete | Partial | Partial | Partial | N/A | Partial | Not enforced | Not automatic; status transition manual |
| EMP-002a Full salary during probation | Complete | Complete | Complete | Complete | N/A | Complete | Fully enforced | |
| EMP-002b Off-days during probation | Complete | Complete | Complete | Partial | N/A | Partial | Partially enforced | |
| EMP-002c Commission during probation | Complete | Partial | Partial | Partial | N/A | Partial | Partially enforced | Department rules |
| EMP-006 Birthday recognition | Complete | Complete | Complete | Complete | Complete | Complete | Fully enforced | HR-013b — `dateOfBirth`, dashboard, Telegram 08:00 |
| EMP-007 Work anniversary recognition | Complete | Complete | Complete | Complete | Complete | Complete | Fully enforced | HR-013b — milestones 1/2/3/5/10 |
| EMP-008 Tenure display | Complete | Complete | Complete | Complete | N/A | Complete | Fully enforced | HR-013b — `tenureYears/Months/Days/Display` |
| EMP-009 Gift tracking & recognition | Complete | Complete | Complete | Complete | Complete | Complete | Fully enforced | HR-013c — `EmployeeRecognition` model, dashboard mark-gift, timeline, Telegram |
| HR-013b Employee date events sprint | Complete | Complete | Complete | Complete | Complete | Complete | Fully enforced | Recognition + tenure + probation buckets API |
| HR-013c Recognition & gift tracking | Complete | Complete | Complete | Complete | Complete | Complete | Fully enforced | Gift workflow, actor scope on GET /employees/:id, company-wide birthday broadcast |
| SEC-001 Employee access audit | Complete | Complete | Complete | Complete | Complete | Complete | Fully enforced | EmployeeAccessService on employee/leave/attendance/payroll/performance reads |
| SEC-001b Remaining access hardening | Complete | Complete | Complete | Complete | N/A | Complete | Fully enforced | Rehire scope, payroll cycle items, disciplinary reads via EmployeeAccessService |
| EMP-010 Probation review workflow | Complete | Complete | Complete | Complete | Complete | Complete | Fully enforced | PASS/EXTEND/FAIL, exit on fail, Telegram reminders, UI |
| EMP-010b Probation automation | Complete | Complete | Complete | Complete | Complete | Complete | Fully enforced | Auto-review on onboard, dashboard widget, Telegram inline actions, EXTEND spawns next review |
| EMP-011 Awards & service milestones | Complete | Complete | Complete | Complete | Complete | Complete | Fully enforced | Extended recognition types, award API, service automation, dashboard, Telegram, role access |
| EMP-012 Exit management & lifecycle | Complete | Complete | Complete | Complete | Complete | Complete | Fully enforced | Checklist items, workflow links, dashboard, profile history, Telegram, role access |
| EMP-012b Exit hardening | Complete | Complete | Complete | Complete | Complete | Complete | Fully enforced | Cancel API, checklist UI normalization, audit actions, award UI, CI docs |
| BR-001–011 Access roles & department routing | Complete | Complete | Complete | Complete | Partial | Complete | Partially enforced | WF routing not wired |

---

### 3. Access Control

| Policy Rule | Policy Status | DB | API | UI | Telegram | Tests | Enforcement | Notes |
| ----------- | ------------- | -- | --- | -- | -------- | ----- | ----------- | ----- |
| AC-001–AC-012 | Complete | Complete | Complete | Complete | Complete | Complete | Fully enforced | Unchanged from v1.0 |
| AC-013 LEGAL_REVIEW_REQUIRED flag (DISC-002) | Complete | Missing | Missing | Missing | Missing | Missing | Not enforced | New |

---

### 4. Attendance & OT (PAY-003)

| Policy Rule | Policy Status | DB | API | UI | Telegram | Tests | Enforcement | Notes |
| ----------- | ------------- | -- | --- | -- | -------- | ----- | ----------- | ----- |
| ATT-001 Daily check-in/out | Complete | Complete | Complete | Partial | Complete | Complete | Fully enforced | P0-005 Telegram task-first menu |
| ATT-002–005 Late/break/shift | Complete | Complete | Complete | Partial | Complete | Complete | Fully enforced | P0-005 hour-rounded late + shift assignments |
| DW-001 Monthly off separate from leave | Complete | Complete | Complete | Partial | Complete | Complete | Fully enforced | P0-005 `MonthlyOffRequest` entity |
| WDE-001 Work Day Engine central state | Complete | N/A | Complete | Complete | Complete | Complete | Fully enforced | Foundation Sprint `WorkDayService` |
| WDE-002 Attendance Command Center | Complete | N/A | Complete | Complete | N/A | Partial | Fully enforced | `/attendance/command-center` |
| WDE-003 Payroll impact preview | Complete | N/A | Complete | Complete | N/A | Complete | Partially enforced | Preview only — not payroll finalization |
| PAY-003 Approved OT ฿50/hr | Complete | Complete | Complete | Complete | Complete | Complete | Fully enforced | C-001 resolved |
| PAY-003a Missed meal/break ฿50/hr | Complete | Missing | Missing | Missing | Missing | Missing | Not enforced | **New item type needed** |
| PAY-003b Overrides handbook 1.5×/2× | Complete | Complete | Complete | Partial | N/A | Complete | Fully enforced | Policy doc |
| PAY-003c OT approval required | Complete | Complete | Complete | Complete | Complete | Complete | Fully enforced | |
| ATT-008–009 Missing punch / absence class | Partial | Complete | Partial | Partial | Partial | Partial | Partially enforced | Foundation WDE exception center + state resolver |

---

### 5. Work Shifts

| Policy Rule | Policy Status | DB | API | UI | Telegram | Tests | Enforcement | Notes |
| ----------- | ------------- | -- | --- | -- | -------- | ----- | ----------- | ----- |
| SH-001–SH-003 | Complete | Complete | Partial | Partial | Partial | Partial | Partially enforced | Unchanged |
| SH-004 HOL-001 no shift roster | Complete | N/A | N/A | N/A | N/A | N/A | Fully enforced | Work every day policy |

---

### 6. Missing From Work & Absence (ABS-001, ABS-002)

| Policy Rule | Policy Status | DB | API | UI | Telegram | Tests | Enforcement | Notes |
| ----------- | ------------- | -- | --- | -- | -------- | ----- | ----------- | ----- |
| ABS-001 Absence definition | Complete | Missing | Missing | Missing | Missing | Missing | Not enforced | Four-criteria rule |
| ABS-002–004 Role penalties 1k/2k/3k | **Partial** | `leave.rules` + `absence_deduction` payroll item | `AbsenceDeductionAggregatorService` | `POST /payroll/cycles/:id/absence-deduction` | `/attendance/absences` · payroll cycle | N/A | Wired via approved absence records | **POL-003** 3b |
| ABS-005 Constructive resignation | Complete | Missing | Missing | Missing | Missing | Missing | Not enforced | |
| ABS-006 Missing >15 min | Complete | Missing | Missing | Missing | Missing | Missing | Not enforced | **New rule** |
| ABS-007 2 labor units/hr round up | Complete | Missing | Missing | Missing | Missing | Missing | Not enforced | **New rule** |
| ABS-008 Missing punch reserved | Partial | Complete | Missing | Partial | Missing | Missing | Not enforced | |
| ABS-009 Secretary/Owner penalty | **Partial** | `leave.rules.absencePenalties` | `AbsencePenaltyService` | approve + `absence_deduction` | `/attendance/absences` | N/A | Secretary ฿3k in payroll; **Owner: no absence status** | **POL-003** 3a+3b |

---

### 7. Leave Policy (HOL-001, PAY-002)

| Policy Rule | Policy Status | DB | API | UI | Telegram | Tests | Enforcement | Notes |
| ----------- | ------------- | -- | --- | -- | -------- | ----- | ----------- | ----- |
| HOL-001 No public holiday system | Complete | Complete | Complete | Partial | N/A | Partial | Fully enforced | No holiday calendar |
| HOL-002 Work every day | Complete | Partial | Partial | Partial | N/A | Partial | Partially enforced | Policy |
| HOL-003 Monthly off-days substitute | Complete | Complete | Complete | Partial | Complete | Partial | Partially enforced | |
| HOL-004 Special holidays Dec 31 / Jan 1 | Complete | Missing | Missing | Missing | N/A | Missing | Not enforced | Not in system |
| HOL-005 Special holiday handling | Partial | Missing | Missing | Missing | N/A | Missing | Not enforced | |
| LV-001–LV-003 Personal leave | Complete | Complete | Complete | Complete | Complete | Partial | Partially enforced | |
| LV-002 Personal notice 1 day | Complete | Complete | Partial | Complete | Partial | Missing | Not enforced | C-003 partial |
| LV-004 Monthly off-days 4 | Complete | Complete | Partial | Partial | N/A | Partial | Partially enforced | PAY-002 |
| LV-005 Min usage 2 days | Complete | Complete | Missing | Partial | N/A | Missing | Not enforced | Advisory |
| PAY-002 Formula min(2, 4-used)×600 | Complete | Complete | Complete | Complete | N/A | Complete | Fully enforced | Verify cap logic |
| PAY-002d Owner override bonus | Complete | Complete | Complete | Complete | N/A | Complete | Fully enforced | |
| LV-006–LV-010 Sick/unpaid/consecutive | Partial | Complete | Partial | Partial | Partial | Partial | Not enforced | Reserved |

---

### 8. Emergency Leave

| Policy Rule | Policy Status | DB | API | UI | Telegram | Tests | Enforcement | Notes |
| ----------- | ------------- | -- | --- | -- | -------- | ----- | ----------- | ----- |
| EL-001–EL-007 | Complete | Complete | Complete | Partial | Partial | Complete | Fully enforced | EL-002 linked EMP-002 |

---

### 9. Leave Reschedule

| Policy Rule | Policy Status | DB | API | UI | Telegram | Tests | Enforcement | Notes |
| ----------- | ------------- | -- | --- | -- | -------- | ----- | ----------- | ----- |
| LR-001–LR-008 | Complete | Complete | Complete | Complete | Complete | Complete | Fully enforced | |
| LR-004 new_start > original_end | Complete | Complete | Partial | Complete | Complete | Partial | Partially enforced | **Code uses original_start — fix POL-010** |
| LR-009 Big Leader → Secretary | Complete | Complete | Partial | Complete | Partial | Partial | Not enforced | **Not in DEFAULT_MATRICES — POL-011** |

---

### 10. Leave Swap

| Policy Rule | Policy Status | DB | API | UI | Telegram | Tests | Enforcement | Notes |
| ----------- | ------------- | -- | --- | -- | -------- | ----- | ----------- | ----- |
| LS-001–LS-007 | Complete | Complete | Complete | Complete | Missing | Missing | Partially enforced | WF-L03 approval gap |

---

### 11. Payroll (PAY-005)

| Policy Rule | Policy Status | DB | API | UI | Telegram | Tests | Enforcement | Notes |
| ----------- | ------------- | -- | --- | -- | -------- | ----- | ----------- | ----- |
| PR-001–PR-008 | Complete | Complete | Complete | Complete | Partial | Complete | Fully enforced | |
| PAY-005 Advance Owner approver | Complete | Complete | Partial | Partial | Missing | Partial | Partially enforced | Default matrix: DM→Owner |
| PAY-005a Auto recovery next cycle | Complete | Partial | Partial | Partial | Missing | Partial | Partially enforced | |
| PAY-005b Final payroll settlement (exit) | Complete | Complete | Complete | Complete | Complete | Complete | Fully enforced | Separate from advance PAY-005; deposit settle pipeline unchanged |
| PAY-005c Recalculate + employee self-service | Complete | Complete | Complete | Complete | Complete | Complete | Fully enforced | Deposit preview vs settled shown separately |
| PAY-006 Bank transfer sheet export | Complete | Complete | Complete | Complete | Complete | Complete | Fully enforced | Owner confirms exceptions; Secretary company scope |
| PAY-007 Company payroll overview | Complete | Complete | Complete | Complete | N/A | Complete | Fully enforced | Pre-export review; Big Leader read-only company scope |
| SAL-001 Salary review & promotion | Complete | Complete | Complete | Complete | Complete | Complete | Fully enforced | Owner approves; Secretary edits; Big Leader proposes; scheduler applies on effective date |
| SAL-001b Compensation review UX | Complete | N/A | Complete | Complete | N/A | Complete | Fully enforced | Employee detail forms; list page; manual apply; integration tests |
| KPI-001 Performance KPI engine | Complete | Complete | Complete | Complete | Complete | Complete | Fully enforced | Weighted scoring; grade A–F; dashboard; SAL-001 KPI context |
| KPI-002 Dynamic KPI builder | Complete | Complete | Complete | Complete | N/A | Complete | Fully enforced | Position-based templates; MANUAL/FORMULA/SYSTEM/API; clone/version |
| KPI-003 Performance review | Complete | Complete | Complete | Complete | Complete | Complete | Fully enforced | Configurable weights; no auto salary recommendation |
| KPI-004 Position framework | Complete | Complete | Complete | Complete | N/A | Complete | Fully enforced | Family/Level/Position/Career/Promotion paths with lifecycle |

---

### 12. Meal Allowance (PAY-001)

| Policy Rule | Policy Status | DB | API | UI | Telegram | Tests | Enforcement | Notes |
| ----------- | ------------- | -- | --- | -- | -------- | ----- | ----------- | ----- |
| PAY-001 Rate ฿100/day | Complete | Complete | Complete | Partial | Partial | Complete | Fully enforced | |
| PAY-001a Working day eligible | Complete | Complete | Complete | Partial | Partial | Complete | Fully enforced | |
| PAY-001b Approved off-day eligible | Complete | Complete | Complete | Partial | Partial | Complete | Fully enforced | |
| PAY-001c–e Sick/emergency/unpaid ineligible | Complete | Complete | Complete | Partial | Partial | Complete | Fully enforced | |
| PAY-001f Absence ineligible | Complete | Complete | Missing | Partial | Missing | Missing | Not enforced | **Gap** |
| PAY-001g OFFICE eligible | Complete | Complete | Complete | Partial | Partial | Complete | Fully enforced | |
| PAY-001h WFH ineligible | Complete | Complete | Complete | Partial | Partial | Complete | Fully enforced | |

---

### 13. Deposit (PAY-004)

| Policy Rule | Policy Status | DB | API | UI | Telegram | Tests | Enforcement | Notes |
| ----------- | ------------- | -- | --- | -- | -------- | ----- | ----------- | ----- |
| PAY-004 ฿500/month cap ฿3,000 | Complete | Complete | Complete | Complete | Missing | Complete | Fully enforced | |
| PAY-004b Defer if payroll too small | Complete | Missing | Missing | Missing | Missing | Missing | Not enforced | **New rule** |
| PAY-004c Deposit for losses | Complete | Partial | Partial | Partial | Missing | Missing | Not enforced | Finance partial |
| PAY-004d Proper resignation full refund | Complete | Complete | Partial | Partial | Missing | Missing | Not enforced | |
| PAY-004e Absconding no refund | Complete | Missing | Missing | Missing | Missing | Missing | Not enforced | |
| PAY-004f Gross misconduct no refund | Complete | Missing | Missing | Missing | Missing | Missing | Not enforced | DISC-002 |

---

### 14. Commission

| Policy Rule | Policy Status | DB | API | UI | Telegram | Tests | Enforcement | Notes |
| ----------- | ------------- | -- | --- | -- | -------- | ----- | ----------- | ----- |
| COM-MKT-* | Complete | Complete | Complete | Hidden | Partial | Complete | Partially enforced | HR mode |
| COM-ADM-* | Complete | Complete | Complete | Complete | Partial | Complete | Fully enforced | |
| EMP-002c Probation commission | Complete | Partial | Partial | Partial | N/A | Partial | Partially enforced | |

---

### 15. Recruitment & Referral (REF-001)

| Policy Rule | Policy Status | DB | API | UI | Telegram | Tests | Enforcement | Notes |
| ----------- | ------------- | -- | --- | -- | -------- | ----- | ----------- | ----- |
| RC-001 | Missing | N/A | N/A | N/A | N/A | N/A | Not enforced | |
| RC-002 | Missing | Complete | Complete | Missing | Partial | Partial | Partially enforced | |
| REF-001 Reward ฿2,000 | Complete | Complete | Complete | Partial | Complete | Complete | Fully enforced | |
| REF-001a 3 months employment | Complete | Complete | Partial | Partial | Partial | Complete | Partially enforced | Code: 90 days — **align POL-025** |
| REF-001b KPI/management discretion | Complete | Missing | Missing | Missing | Missing | Missing | Not enforced | **New gate needed** |
| REF-001c–f Lifecycle/duplicate/payout | Complete | Complete | Complete | Partial | Partial | Complete | Fully enforced | |

---

### 16. Performance Reviews

| Policy Rule | Policy Status | DB | API | UI | Telegram | Tests | Enforcement | Notes |
| ----------- | ------------- | -- | --- | -- | -------- | ----- | ----------- | ----- |
| PF-001–PF-004 | Partial | Complete | Complete | Missing | Missing | Partial | Partially enforced | |
| PF-005 Probation evaluation link | Complete | Partial | Partial | Missing | Missing | Partial | Not enforced | EMP-002 |
| PF-006 | Missing | Missing | Missing | Missing | Missing | Missing | Not enforced | |

---

### 17. Disciplinary (POL-025 foundation + exit settlement)

| Policy Rule | Policy Status | DB | API | UI | Telegram | Tests | Enforcement | Notes |
| ----------- | ------------- | -- | --- | -- | -------- | ----- | ----------- | ----- |
| DISC-001 Verbal warning | Complete | Complete | Complete | Complete | Complete | Partial | Enforced | `employee.disciplinary_actions` |
| DISC-002 Warning 1 | Complete | Complete | Complete | Complete | Complete | Partial | Enforced | |
| DISC-003 Warning 2 | Complete | Complete | Complete | Complete | Complete | Partial | Enforced | |
| DISC-004 Termination record | Complete | Complete | Complete | Complete | Complete | Partial | Enforced | `termination_reason`, `termination_note` |
| DISC-005 Warnings never expire | Complete | Complete | Complete | Complete | N/A | Partial | Enforced | No expiry fields |
| Skip levels (severe misconduct) | Complete | Complete | Complete | Complete | Complete | Partial | Enforced | Policy-only guard; any type allowed |
| DISC-001d Performance failure settlement | Complete | Missing | Missing | Missing | Missing | Missing | Not enforced | Exit settlement — POL-025b |
| DISC-002 Gross misconduct settlement | Complete | Missing | Missing | Missing | Missing | Missing | Not enforced | Exit settlement — POL-025b |
| DISC-002d LEGAL_REVIEW_REQUIRED | Complete | Missing | Missing | Missing | Missing | Missing | Not enforced | |

---

### 18. Warning System

| Policy Rule | Policy Status | DB | API | UI | Telegram | Tests | Enforcement | Notes |
| ----------- | ------------- | -- | --- | -- | -------- | ----- | ----------- | ----- |
| WS-001–WS-003 | Complete | Complete | Complete | Complete | Complete | Partial | Enforced | Via POL-025 DISC-001–005 |

---

### 19. Resignation & Assets (ASSET-001)

| Policy Rule | Policy Status | DB | API | UI | Telegram | Tests | Enforcement | Notes |
| ----------- | ------------- | -- | --- | -- | -------- | ----- | ----------- | ----- |
| RS-001–RS-007 | Complete | Partial | Partial | Partial | Missing | Partial | Partially enforced | |
| ASSET-001 Asset register | Complete | Complete | Complete | Missing | Missing | Partial | Partially enforced | API only |
| ASSET-001a Types notebook/phone/SIM/card/keys | Complete | Partial | Partial | Missing | Missing | Partial | Partially enforced | |
| ASSET-001b Employee list + company register | Complete | Complete | Partial | Missing | Missing | Partial | Partially enforced | |
| ASSET-001c Used in resignation/deposit review | Complete | Partial | Partial | Missing | Missing | Missing | Not enforced | Exit checklist missing |

---

### 20. Approval Matrix (WF-001–005)

| Policy Rule | Policy Status | DB | API | UI | Telegram | Tests | Enforcement | Notes |
| ----------- | ------------- | -- | --- | -- | -------- | ----- | ----------- | ----- |
| WF-001 Marketing salary Big Leader→Owner | Complete | Complete | Partial | Complete | Partial | Partial | Not enforced | **Replace Secretary→Owner default** |
| WF-001a Admin salary Secretary→Owner | Complete | Complete | Partial | Complete | Partial | Partial | Partially enforced | Close to current |
| WF-002 Marketing commission Big Leader→Owner | Complete | Complete | Partial | Complete | Partial | Partial | Not enforced | |
| WF-002a Admin commission Secretary→Owner | Complete | Complete | Partial | Complete | Partial | Partial | Partially enforced | |
| WF-003 Special bonus → Owner | Complete | Partial | Partial | Missing | Missing | Missing | Not enforced | **New workflow type** |
| WF-004 Deduction no approval | Complete | Partial | Partial | Partial | Missing | Partial | Partially enforced | Manual payroll items |
| WF-005 Personal data dept manager | Complete | Complete | Partial | Complete | Partial | Partial | Partially enforced | Default Secretary only |
| WF-L03 Reschedule Big Leader→Secretary | Complete | Complete | Partial | Complete | Partial | Partial | Not enforced | POL-011 |
| WF-P01 Advance Owner only | Complete | Complete | Partial | Partial | Missing | Partial | Not enforced | **Replace DM→Owner** |
| AM-001–AM-003 | Complete | Complete | Complete | Complete | Partial | Complete | Partially enforced | |

---

### 21–23. Telegram, Finance, Reserved Rights

| Section | Policy Status | Primary gap |
|---------|---------------|-------------|
| Telegram (TG-001–011) | Partial | TG-005 reschedule menu; permission gaps |
| Finance (FN-001–FN-009) | Partial | PAY-004c losses; PAY-005 recovery |
| Reserved Rights (CR-001–CR-010) | Partial | CR-009 LEGAL_REVIEW flag; CR-007 referral discretion |

---

## Part C — Gap Report

### 1. Fully implemented policies

| Rule area | Rules |
|-----------|-------|
| Access control | AC-001–AC-012 |
| OT flat rate (PAY-003) | PAY-003, PAY-003b, PAY-003c |
| Meal allowance core (PAY-001) | PAY-001, PAY-001a–e, PAY-001g–h |
| Leave bonus formula (PAY-002) | PAY-002, PAY-002a–c |
| Deposit deduction (PAY-004 base) | PAY-004, PAY-004g |
| Emergency leave | EL-001–EL-006 |
| Leave reschedule validation (except LR-004/LR-009) | LR-001–LR-003, LR-005–LR-008 |
| Admin commission | COM-ADM-* |
| Telegram identity | AC-007–012, TG-001 |
| Core attendance | ATT-001–005 |
| Payroll cycle | PR-001–PR-006 |
| OFFICE/WFH category | EMP-001, PAY-001g–h |
| No public holidays | HOL-001 |

### 2. Partially implemented policies

| Rule area | Gap |
|-----------|-----|
| Organization ORG-001 | Policy complete; no department model |
| Employee department/position EMP-002 | Policy complete; schema partial |
| Probation evaluation EMP-002 | Not gated on manager sign-off |
| Missed meal/break PAY-003a | Policy complete; no payroll item |
| Absence ABS-001–004 | Policy complete; not wired to payroll |
| Missing >15 min ABS-006–007 | Policy complete; not implemented |
| Deposit deferral/refund rules PAY-004b–f | Policy complete; not implemented |
| Referral 3 months + discretion REF-001 | Code uses 90 days; no KPI gate |
| Termination types DISC-001/002 | Policy complete; no settlement engine |
| Workflow WF-001–005 | Policy complete; defaults wrong/missing |
| Reschedule LR-004/LR-009 | Validator + matrix gaps |
| Asset register ASSET-001 | API only; no exit integration |
| Special holidays HOL-004 | Not configured |
| Meal absence exclusion PAY-001f | Not enforced |
| Advance PAY-005 | Wrong approver chain |

### 3. Missing policies

| Domain | Rules |
|--------|-------|
| Recruitment | RC-001 |
| Performance calendar | PF-006 |
| Warnings | WS-003 |
| Resignation notice | RS notice period |
| Legal | CR-010 |
| Finance expenses | FN-009 |

### 4. Implemented but not enforced

| Rule | Why |
|------|-----|
| ABS-001–004 | Penalties not wired |
| ABS-006–007 | Labor units not implemented |
| REF-001b | No KPI/discretion gate |
| DISC-001/002 | No termination settlement |
| PAY-004b–f | Deferral/refund rules |
| PAY-003a | No missed break item |
| PAY-001f | Absence not excluded from meal |
| WF-001–003, WF-P01 | Wrong/missing approval defaults |
| LR-004 | Validator uses wrong date |
| HOL-004 | Special dates not in system |

### 5. Implemented but not tested

| Area | Gap |
|------|-----|
| Shift swap | No integration tests |
| ABS-006–007 | No tests |
| DISC-001/002 settlement | No tests |
| WF department routing | No tests |
| PAY-003a missed break | No tests |
| REF-001b discretion | No tests |

---

## Part D — Priority Ranking (updated post POL-001A)

| Priority | Gap ID | Gap | Policy rules | Rationale |
|----------|--------|-----|--------------|-----------|
| **P0** | G-101 | Absence penalties not wired | ABS-002–004 | Money risk — confirmed policy |
| **P0** | G-102 | Deposit refund/deferral/absconding rules | PAY-004b–f, RS-003–005 | Legal/money risk |
| **P0** | G-103 | Gross misconduct / performance termination settlement | DISC-001, DISC-002 | Legal/money risk |
| **P0** | G-104 | Reschedule validator wrong date | LR-004 | Wrong leave dates today |
| **P0** | G-105 | WF-001–005 / WF-P01 approval defaults | WF-001–005, WF-P01 | Wrong approvers |
| **P1** | G-106 | Missing >15 min labor penalty | ABS-006–007 | Operational attendance |
| **P1** | G-107 | Missed meal/break compensation | PAY-003a | Payroll completeness |
| **P1** | G-108 | Referral 3 months + KPI discretion | REF-001a–b | Payout control |
| **P1** | G-109 | Department/position on employee | EMP-002, ORG-002 | WF routing dependency |
| **P1** | G-110 | Probation manager evaluation gate | EMP-002 | Eligibility integrity |
| **P1** | G-111 | Shift swap Telegram + tests | LS-001–007 | Core ops |
| **P1** | G-112 | Asset register in exit flow | ASSET-001, RS-006 | Deposit review |
| **P1** | G-113 | Special holidays Dec 31/Jan 1 | HOL-004 | Scheduling |
| **P1** | G-114 | Meal allowance absence exclusion | PAY-001f | Payroll accuracy |
| **P1** | G-115 | Telegram reschedule approval menu | TG-005 | Ops UX |
| **P2** | G-116 | Special bonus workflow WF-003 | WF-003 | New workflow type |
| **P2** | G-117 | LEGAL_REVIEW_REQUIRED flag | DISC-002d, AC-013 | Compliance |
| **P2** | G-118 | Warning system | WS-001–003 | HR experience |
| **P2** | G-119 | Org chart UI | ORG-001 | Visibility |
| **P3** | G-120 | General leave notice C-003 | LV-002 open scope | Blocked partial |

**Closed gaps (POL-001A):** G-001 OT conflict, G-005 referral label, G-010 reschedule date (policy side), G-011 approver (policy side), G-015 monthlyOffDays (interim)

---

## Part E — Sprint Backlog (updated)

### POL-010 — Fix reschedule validator (LR-004) [P0]

**Policy:** `new_start_date > original_end_date`  
**Closes:** G-104  
**Files:** `leave-reschedule-policy.service.ts`, unit tests, `WORKHQ_MASTER_POLICY_V1.md` (done)

---

### POL-011 — Seed WF-L03 + department approval matrices [P0]

**Policy:** WF-001–002, WF-L03, WF-P01, LR-009  
**Closes:** G-105  
**Files:** `approval-defaults.ts`, `prisma/seed.ts`, `fixtures.ts`, workflow types

---

### POL-003 — Wire absence penalties to payroll [P0]

**Policy:** ABS-002–004  
**Closes:** G-101  
**Files:** payroll builder, leave settings consumer

---

### POL-004 — Deposit deferral, refund, forfeiture rules [P0]

**Policy:** PAY-004b–f, RS-003–005, DISC-002d, ASSET-001c  
**Closes:** G-102 (Phase 4a–4b core)  
**Status:** Phase 4b implemented — deferral, loss claims CRUD, asset gate, settlement enforcement  
**Remaining:** Phase 4c — constructive resignation automation, Telegram, finance queue UI

**Phase 4b delivered:**
- PAY-004b deposit deferral (`minimumNetPayAfterDeposit`, Thai warning, retry next cycle)
- Loss claim CRUD + owner approval before settlement
- Asset gate (returned/damaged/lost/waived) blocks settlement
- Settlement preview: owner case-by-case flag for excess claims (PAY-004l)

---

### POL-025 — Disciplinary foundation [P0] ✅ Phase 1 implemented

**Policy:** DISC-001–005 (warning ladder, no expiry, skip levels)  
**Closes:** G-103 (foundation portion)  
**Delivered:**
- `employee.disciplinary_actions` table
- `DisciplinaryActionService` (create, acknowledge, list, summary)
- APIs: `GET/POST /employees/:id/disciplinary`, `GET /disciplinary-actions/:id`, `POST /disciplinary-actions/:id/acknowledge`
- UI: employee profile tab **วินัย** (`/hr/employees/:id/disciplinary`)
- Telegram: notify + **รับทราบ** callback (`disciplinary:ack:{id}`)
- Permissions: Owner / Secretary (Admin scope) / Big Leader (Marketing) / Employee (own read+ack)

**Remaining (POL-025b):** Termination settlement engine (DISC-001d, DISC-002a–d, `LEGAL_REVIEW_REQUIRED`)

---

### POL-026 — Missing-from-work labor penalty [P1]

**Policy:** ABS-006–007  
**Closes:** G-106  
**Files:** attendance service, payroll deduction, settings schema

---

### POL-027 — Missed meal/break payroll item [P1]

**Policy:** PAY-003a  
**Closes:** G-107  
**Files:** payroll builder, attendance linkage

---

### POL-028 — Referral 3 months + KPI discretion gate [P1]

**Policy:** REF-001a–b  
**Closes:** G-108  
**Files:** `qualification.service.ts`, referral service, KB article

---

### POL-029 — Employee department & position fields [P1]

**Policy:** EMP-002, ORG-002–003  
**Closes:** G-109  
**Files:** prisma schema, employee DTO, UI

---

### POL-030 — Probation manager evaluation gate [P1]

**Policy:** EMP-002, PF-005  
**Closes:** G-110  
**Files:** leave service, probation review API

---

### POL-012 — Telegram shift swap [P1]

**Policy:** LS-001–007  
**Closes:** G-111

---

### POL-031 — Asset register exit integration [P1]

**Policy:** ASSET-001, RS-006, PAY-004c  
**Closes:** G-112

---

### POL-032 — Special company holidays [P1]

**Policy:** HOL-004–005  
**Closes:** G-113

---

### POL-033 — Meal allowance absence exclusion [P1]

**Policy:** PAY-001f  
**Closes:** G-114

---

### POL-013 — Telegram reschedule approval menu [P1]

**Policy:** TG-005, LR-009  
**Closes:** G-115

---

### POL-034 — Special bonus workflow (WF-003) [P2]

**Policy:** WF-003  
**Closes:** G-116

---

### POL-016 — Exit checklist orchestration [P1]

**Policy:** RS-006, ASSET-001c  
**Closes:** G-112 (partial)

---

### Backlog summary

| Item | Priority | Closes | Policy rules |
|------|----------|--------|--------------|
| POL-010 | P0 | G-104 | LR-004 |
| POL-011 | P0 | G-105 | WF-001–002, WF-L03, WF-P01, LR-009 |
| POL-003 | P0 | G-101 | ABS-002–004 |
| POL-004 | P0 | G-102 | PAY-004b–f |
| POL-025 | P0 | G-103 | DISC-001, DISC-002 |
| POL-026 | P1 | G-106 | ABS-006–007 |
| POL-027 | P1 | G-107 | PAY-003a |
| POL-028 | P1 | G-108 | REF-001 |
| POL-029 | P1 | G-109 | EMP-002, ORG-002 |
| POL-030 | P1 | G-110 | EMP-002 |
| POL-012 | P1 | G-111 | LS-* |
| POL-031 | P1 | G-112 | ASSET-001 |
| POL-032 | P1 | G-113 | HOL-004 |
| POL-033 | P1 | G-114 | PAY-001f |
| POL-013 | P1 | G-115 | TG-005 |
| POL-034 | P2 | G-116 | WF-003 |
| POL-016 | P1 | G-112 | RS-006 |

**Retired/superseded from v1.0:** POL-002 (OT doc — merged PAY-003), POL-006 (referral — merged REF-001), POL-005 (partial — merged DISC/ABS), POL-007 (partial — LV-002 confirmed, general C-003 remains G-120)

---

## Appendix — Affected rule IDs (POL-001A delta)

### New confirmed rule IDs

| ORG-001–ORG-008 · EMP-001–EMP-010 · HR-013b · HR-013c · SEC-001 · EMP-002/EMP-002a–c · PAY-001–PAY-001i · PAY-002–PAY-002d · PAY-003–PAY-003c · PAY-004–PAY-004g · PAY-005/PAY-005a · ABS-001–ABS-008 · REF-001–REF-001f · DISC-001–DISC-005 · DISC-002a–d · WF-001–WF-005 · WF-001a · WF-002a · WF-L01–L04 · WF-P01 · ASSET-001–ASSET-001c · HOL-001–HOL-005 · AC-013 · CR-007–CR-009 · BR-011 · LR-009 · RS-004–RS-007

### Modified rule IDs

ATT-006–008 (→ PAY-003) · LV-004–LV-005 (→ PAY-002) · MA-* (→ PAY-001) · DP-* (→ PAY-004) · RF-* (→ REF-001) · AM-* (→ WF-*) · FN-006 (→ PAY-005) · EL-002 (→ EMP-002) · PF-005 (→ EMP-002)

### Resolved conflict IDs

C-001 · C-002 · C-004 · C-005 (interim) · C-006

### Remaining conflict

C-003 (partial) — general leave notice when enforcement ships (G-120)

### Affected backlog items

### EMP-001b / EMP-001c (2026-06-24) — P0-001 fix (2026-06-29)

| Rule | Schema | API | Telegram | Web | Tests | Status |
|------|--------|-----|----------|-----|-------|--------|
| EMP-001b Invite link | Complete | Complete | Complete | Complete | Partial | **P0 fixed** — invitation-first → Approval Center |
| EMP-001c Self-onboarding | Complete | Complete | Complete | Complete | Partial | **P0 fixed** — bridge + badge + `/status` |

**State machine:** `INVITE_CREATED → INVITE_ACTIVE → TELEGRAM_STARTED → ONBOARDING_IN_PROGRESS → ONBOARDING_SUBMITTED → HR_REVIEW_PENDING → APPROVED → EMPLOYEE_CREATED → TELEGRAM_LINKED → ACTIVE`

**Request type:** `telegram_registration_review` (status `in_review`)

**Repair:** `cd backend && npm run repair:telegram-onboarding-requests`

**Approve side effects:** promote PENDING identity → ACTIVE, apply self-onboarding data, mark invite `used`, audit + change history, Telegram `✅ ลงทะเบียนสำเร็จ HR อนุมัติแล้ว`

**Reject side effects:** revoke identity, reject submission, cancel invite, Telegram `❌ คำขอลงทะเบียนไม่ผ่านการอนุมัติ`

See `WORKHQ_EMP001_COMPLETION_REPORT.md`.

### EMP-001b / EMP-001c — P0-001b production hardening (2026-06-29)

| Rule | Schema | API | Telegram | Web | Tests | Status |
|------|--------|-----|----------|-----|-------|--------|
| Full assignment on approve | Partial | Complete | — | — | Partial | company/team/role/employmentType/position/startDate + assignment + businessRole + probation bootstrap |
| Idempotent approve | — | Complete | — | — | Partial | `isAlreadyApproved` + integration skip + timeline idempotency keys |
| Invitation management | — | Complete | — | Complete | Partial | `GET /employee-telegram-invites`, detail, regenerate, cancel |
| Request type rename | — | Complete | — | Complete | Partial | **Option A:** `employee_onboarding` forward; legacy `telegram_registration_review` still works; display `รับพนักงานใหม่` |
| Approval Center preview | — | Complete | — | Complete | Partial | `onboardingPreview` on list/detail; inline approve/reject for request items |
| Onboarding timeline | — | Complete | — | Complete | Partial | `employeeChangeHistory` field `onboarding` + Thai labels in timeline API |

**Request types:** New invites → `employee_onboarding`. Legacy rows → `telegram_registration_review` (same handler, label `รับพนักงานใหม่`).

**Idempotency:** `EmployeeOnboardingApprovalService.isAlreadyApproved()`; `request-integration` skips `integrationStatus === 'completed'`; timeline `idempotencyKey` = `{eventKey}:{requestInstanceId|invitationId}`.

**Invitation actions:** Copy link only when raw token available (create/regenerate session); hash-only invites show `ต้อง Regenerate เพื่อคัดลอกลิงก์ใหม่`; regenerate cancels prior active token; cancel blocks Telegram start.

**Assignment gaps (no schema field / no service):** `shiftId` (no Employee/Assignment column), default leave policy auto-assign, default attendance policy auto-assign, salary visibility baseline — not applied.

**Assignment applied on approve:** `companyId`, `departmentId` → `functionId` + `employee.department`, `teamId`, `businessRole` → assignment `roleLevel` + `AccessControlService.assignBusinessRole`, `employmentType`, `position`, `startDate` → assignment `effectiveFrom`, `workLocation` → `employee.workCategory`, probation bootstrap via `PerformanceService`, primary assignment record.

**APIs added/enriched:** `GET /employee-telegram-invites/:id`, `POST /employee-telegram-invites/:id/regenerate`, enriched list; `GET /requests/:id` and `GET /requests/pending-approval` include `onboardingPreview`.

**Rollback:** Revert deploy; no destructive migration. New `employee_onboarding` request type rows remain readable via legacy handler if code rolled back partially.

### P0-001c — Configurable onboarding invite permissions (2026-06-29)

| Rule | Schema | API | Telegram | Web | Tests | Status |
|------|--------|-----|----------|-----|-------|--------|
| Invite permission keys | Complete | Complete | — | Complete | Partial | 7 keys seeded; category `Employee Onboarding` |
| Role bundles | — | Complete | — | Complete | Partial | Owner/Secretary all; Big Leader no cancel; others deny |
| Backend enforcement | — | Complete | — | — | Partial | `OnboardingInviteAccessService` on all invite endpoints |
| Scope filtering | — | Complete | — | — | Partial | List/detail filtered by company/team scope |
| Settings UI | — | — | — | Complete | Partial | Role templates + override options with Thai labels |
| Audit | — | Complete | — | — | Partial | `new_employee_invite_created`, `existing_employee_link_created`, `invite_regenerated`, `invite_cancelled`, `invite_viewed` |

**Deploy note:** run `npx prisma db seed` (or migrate deploy + seed) to upsert new permission keys into existing environments.

---

| Rule | Schema | API | Telegram | Web | Tests | Status |
|------|--------|-----|----------|-----|-------|--------|
| EMP-001b Invite link | Complete | Complete | Complete | Partial | Partial | Superseded by P0-001 fix above |
| EMP-001c Self-onboarding | Complete | Complete | Complete | Partial | Partial | Superseded by P0-001 fix above |

---

| Action | Items |
|--------|-------|
| **New** | POL-025, POL-026, POL-027, POL-028, POL-029, POL-030, POL-031, POL-032, POL-033, POL-034 |
| **Reprioritized P0** | POL-010, POL-011, POL-003, POL-004 |
| **Retired/merged** | POL-002, POL-006 |
| **Unchanged P1** | POL-012, POL-013, POL-016 |
| **Open P3** | G-120 / C-003 general leave notice |

---

## Employee Experience Platform Sprint (2026-06-24)

| Req | Status | Notes |
|-----|--------|-------|
| TEAM-001 Team Calendar | **Complete** | Month/week/list views, dashboard widgets, employee filters, Telegram 📅 ปฏิทินทีม, conflict warnings on submit |
| INF-001b Bangkok TZ | **Complete** | All Telegram schedulers + attendance alerts + compensation apply use `DateProvider`/`SchedulerTimeProvider` |
| INF-001c Bangkok TZ (full) | **Complete** | Leave/attendance/exit/payroll/workflow/request/document-request modules migrated; payroll cycle resolver uses `DateProvider` |
| TEST-001b Telegram Matrix | **Complete** | Shared fixtures; leave approve/reject, time correction, calendar, documents, announcements; conditional on `DATABASE_URL` |
| TEST-001c Telegram Matrix | **Complete** | `TelegramTestFactory`, `WorkflowTestFactory`, `CompanyScopeFixtures`, `RoleFixtures`; cross-company denial, doc approval audit, referral/home/balance smoke |
| DOC-002b Real PDF | **Complete** | pdfkit + QR; storage abstraction; download API |
| DOC-001 Document Center | **Complete** | Versioning, multipart upload, storage driver config, Telegram submenus, dashboard widgets |
| ANN-001 Announcements | **Complete** | 24h/72h reminder scheduler, owner Telegram escalation, dashboard widgets, delivery-status API, manual remind |
| PART F Employee Self-Service | **Complete** | Telegram leave balances; `GET /employees/:id/home-summary`; employee home API |
| PART G Referral | **Complete** | Telegram 👥 คนที่ฉันแนะนำ list; matrix referral callback test |
| PART J Deployment | **Complete** | `scripts/production-readiness-check.sh` — DB, migrations, storage, Telegram, schedulers |

### Production Hardening Sprint (2026-06-24)

| Check | Script |
|-------|--------|
| Consistency | `scripts/employee-experience-hardening-check.sh` |
| Production gate | `scripts/production-readiness-check.sh` |

---

### Next Phase Sprint — AI, Training & Advanced Analytics (2026-06-24)

| Req | Status | Notes |
|-----|--------|-------|
| AI-001 Knowledge Assistant | **Complete (MVP)** | RAG + citations; salary denial; query log; Telegram + Web |
| TRAIN-001 Training Library | **Complete (MVP)** | Course CRUD, assign, quiz, dashboard; Telegram menu |
| ANALYTICS-001 HR Analytics | **Complete (MVP)** | Daily snapshot scheduler; dashboard + CSV export; owner Telegram summary |
| AUDIT-002 Audit Explorer | **Complete (MVP)** | Search, diff, export, role scope, salary redaction |
| OPS-001 Ops Console | **Complete (MVP)** | Owner health checks; audited retry/rerun stubs |
| UX-001 Button Forms | **Complete (MVP)** | Telegram inline pickers; REQ-001 button flow; form UX audit |

| Check | Script |
|-------|--------|
| Next phase gate | `scripts/next-phase-ai-training-analytics-check.sh` |

---

### Phase 2 HR OS Sprint (2026-06-24)

| Req | Status | Notes |
|-----|--------|-------|
| EMP-018 Employee Personal Tab scope lock | **Complete** | Locked to confirmed minimal scope: personal/contact/government/emergency/education/experience + identity docs (ID card + passport only). Removed Line ID, tax ID, profile photo from Personal tab. Uses document center multipart upload/delete with audit. |
| EMP-019 Employee Employment Tab | **Complete** | Scoped employment tab (org, dates, supervisor, shift, work location); GET/PATCH `/employees/:id/employment`; EmployeeChangeHistory + audit on mutation; read-only default with edit/save/cancel. |
| EMP-020 Employee Timeline Tab | **Complete** | Read-only merged timeline from EmployeeChangeHistory + AuditService via GET `/employees/:id/timeline`; category filters, search, date grouping, sensitive/salary masking. |
| EMP-020b Employee Detail Timeline Polish | **Complete** | Removed duplicate History tab (Timeline is sole employee history surface); Employee Detail tab deep links via `?tab=` (overview/personal/employment/timeline + existing tabs); timeline items include stable `eventKey` for notifications/workflows. |
| EMP-021 Employee Leave Tab | **Complete** | Read-only Leave tab (`การลา`) via GET `/employees/:id/leave`; summary cards + filtered history table; reuses LeaveService balances and workflow approval timeline detail modal; `leave:read` permission gate. |
| EMP-022 Employee Attendance Tab | **Complete** | Read-only Attendance tab (`เวลาทำงาน`) via GET `/employees/:id/attendance`; summary cards + filtered history table; reuses AttendanceService calculations; row click opens attendance detail modal; `attendance:read` permission gate; deep link `?tab=attendance`. |
| EMP-023 Employee Payroll Tab | **Complete** | Read-only Payroll tab (`เงินเดือน`) via GET `/employees/:id/payroll`; summary cards + filtered payroll history; reuses PayrollOverviewAssemblerService and payroll overview detail modal; salary visibility enforced on backend via SalaryVisibilityService; tab hidden without access; deep link `?tab=payroll`. |
| EMP-024 Employee Performance Tab | **Complete** | Read-only Performance tab (`ผลการทำงาน`) via GET `/employees/:id/performance`; summary cards + current goals/KPI table + filtered review history + probation/improvement notes; reuses KpiAssignmentService, PerformanceReviewService, and PerformanceService (no duplicated score calculations); row click opens existing performance review cycle detail; `performance:read` permission gate; deep link `?tab=performance` (legacy `?tab=kpi`). |
| EMP-025 Employee Commission Tab | **Complete** | Read-only Commission tab (`ค่าคอมมิชชั่น`) via GET `/employees/:id/commission`; summary cards + current assignment + filtered history for Marketing and Admin commission engines; reads persisted member results (no recalculation); row click opens existing `/commission/cycles/:id` detail; `commission:read` permission gate; deep link `?tab=commission`. |
| WF-001 Workflow Builder | **Complete** | Extends Request Platform; `/workflows`; action steps; version immutability |
| RULE-001 Formula Engine | **Complete** | Safe evaluator (no eval); `/formulas`; variables + test + execution log |
| WF-002 Dynamic Approval Builder | **Complete** | Standalone `/approval-flows`; preview; Telegram unified inbox |
| AI-002 AI Manager | **Complete** | Insights + morning brief; `/ai/manager`; advisory-only |
| HR-020 Competency Matrix | **Complete** | `/hr/competencies`; gap analysis; position requirements |
| HR-021 Succession Planning | **Complete** | `/hr/succession`; critical roles; readiness levels |
| AI-003 Knowledge Graph | **Complete** | Relational graph; `/ai/graph/query`; salary/document redaction |

| Check | Script |
|-------|--------|
| Phase 2 gate | `scripts/workhq-phase2-hr-os-check.sh` |

**Explicitly out of scope:** Finance/P&L, accounting, revenue tracking, CRM, marketing platform.

---

*End of WORKHQ_POLICY_IMPLEMENTATION_MATRIX.md*
