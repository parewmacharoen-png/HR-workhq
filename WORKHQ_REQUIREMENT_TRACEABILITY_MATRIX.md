# WorkHQ Requirement Traceability Matrix (RTM)

**Document ID:** QA-003-B  
**Version:** 1.0  
**Date:** 2026-06-24  
**Rule:** Every requirement appears exactly once. No orphan requirements. No orphan implementation.

---

## RTM Summary

| Metric | Count |
|--------|-------|
| Requirements in matrix | 229 |
| Verified (E4+) | 156 |
| Partial | 38 |
| Gap / not implemented | 13 |
| Integration test files | 59 |
| API routes (approx) | 621 |

---

## Critical Path Requirements

| Req ID | Requirement | Policy | Database | Migration | Entity | Repository | Service | Controller | API | Web | Telegram | Permission | Audit | Unit Test | Integration Test | UAT | Evidence | Status |
|--------|-------------|--------|----------|-----------|--------|------------|---------|------------|-----|-----|----------|------------|-------|-----------|------------------|-----|----------|--------|
| ATT-001 | Daily check-in/out | ATT-001 | attendance_records | 2024* | AttendanceRecord | attendance.prisma.repository | attendance.service | attendance.controller | POST /attendance/check-in | /attendance/daily | attendance:menu | attendance:write | check_in | attendance-rules.service.unit.spec | attendance.integration.spec | Pending | E4 | verified |
| PAY-003 | Approved OT hourly rate | PAY-003 | overtime_records | 2024* | OvertimeRecord | attendance.prisma.repository | attendance.service | attendance.controller | POST /attendance/check-out | /attendance/overtime | request:menu | attendance:write | overtime_created | attendance-rules.service.unit.spec | ot-workflow.integration.spec | Pending | E4 | verified |
| PAY-005b | Final settlement on exit | PAY-005b | final_payroll_settlements | 2025* | FinalPayrollSettlement | exit.prisma.repository | final-settlement.service | exit.controller | POST /exit/final-settlements | /me/final-settlement | unified:inbox | payroll:write | final_settlement_* | — | final-settlement-pay005c.integration.spec | Pending | E4 | verified |
| PAY-005 | Advance pay Owner approval | PAY-005 | advance_pay_records | 2024* | AdvancePayRecord | request.prisma.repository | request-integration.service | request.controller | POST /requests | /requests | unified:inbox | payroll:write | request_approved | — | — | Pending | E3 | partial |
| PAY-002 | Leave bonus formula | PAY-002 | payroll_items | 2024* | PayrollItem | payroll.prisma.repository | leave-bonus.service | payroll.controller | POST /payroll/cycles/:id/build | /payroll/cycles/:id | N/A | payroll:write | payroll_build | leave-bonus.service.unit.spec | payroll-leave-bonus.integration.spec | Pending | E4 | verified |
| LV-001 | Leave request workflow | LV-001 | leave_requests | 2024* | LeaveRequest | leave.prisma.repository | leave.service | leave.controller | POST /leave/employees/:id/requests | /leave/requests | leave:menu | leave:write | leave_request_* | — | leave-workflow.integration.spec | Pending | E4 | verified |
| LR-001 | Leave reschedule | LR-001 | leave_requests | 2024* | LeaveRequest | leave.prisma.repository | leave-reschedule.service | leave.controller | POST /leave/reschedule | /leave/reschedule | leave_reschedule:* | leave:write | leave_reschedule | — | leave-reschedule-workflow.integration.spec | Pending | E4 | verified |
| SEC-001 | Employee access audit | SEC-001 | audit_logs | 2024* | AuditLog | audit.prisma.repository | employee-access.service | employees.controller | GET /employees/:id | /hr/employees/:id | employee:profile | employee:read | employee_read | employee-access.service.unit.spec | employee-access-audit.integration.spec | Pending | E4 | verified |
| REQ-005b | Unified approval inbox | REQ-005b | workflow_instances | 2025* | WorkflowInstance | workflow.prisma.repository | unified-approval-inbox.handler | workflow.controller | GET /workflow/inbox | /approvals | unified:inbox | workflow:read | workflow_action | — | approval-inbox.integration.spec | Pending | E4 | verified |
| EMP-012 | Exit case management | EMP-012 | employee_exit_cases | 2025* | EmployeeExitCase | exit.prisma.repository | exit-case.service | exit.controller | POST /exit/cases | /hr/exit/:id | unified:inbox | employee:write | exit_* | exit-case.service.unit.spec | employee-exit-deposit.integration.spec | Pending | E4 | verified |
| SAL-001 | Salary review workflow | SAL-001 | salary_reviews | 2025* | SalaryReview | compensation.prisma.repository | compensation-review.service | compensation-review.controller | POST /compensation-reviews | /hr/compensation-reviews | unified:inbox | payroll:write | salary_review_* | — | compensation-review.integration.spec | Pending | E4 | verified |
| ABS-002 | Absence penalty payroll | ABS-002 | absence_records | 2025* | AbsenceRecord | absence.prisma.repository | absence-record.service | attendance.controller | POST /attendance/absences/:id/approve | /attendance/absences | N/A | attendance:write | approve_absence | absence-penalty.service.unit.spec | absence-record.integration.spec | Pending | E4 | verified |
| REC-002 | Referral bonus post-probation | REC-002 | employee_referrals | 2025* | EmployeeReferral | referral.prisma.repository | employee-referral.service | employee-referral.controller | POST /employee-referrals | /hr/referrals | referral:my:list | referral:pay | referral_* | — | referral.integration.spec | Pending | E4 | partial |
| EMP-010 | Probation review | EMP-010 | probation_reviews | 2025* | ProbationReview | performance.prisma.repository | performance.service | performance.controller | POST /performance/probation | /hr/performance/reviews | probation:pass:* | performance:write | probation_* | performance.service.probation.unit.spec | probation-review.integration.spec | Pending | E4 | verified |
| PAY-006 | Bank transfer export | PAY-006 | payroll_cycles | 2025* | PayrollCycle | payroll.prisma.repository | payroll-export.service | payroll.controller | GET /payroll/cycles/:id/export | /payroll/cycles/:id | N/A | payroll:write | payroll_export | — | payroll.integration.spec | Pending | E4 | verified |
| AC-001 | Cross-company isolation | AC-001 | companies | 2024* | Company | company.prisma.repository | employee-access.service | * | * | * | * | * | access_denied | — | company-isolation.integration.spec | Pending | E4 | verified |

---

## Workflow Request Types (Part J)

| Req ID | Requirement | Workflow | Approval | Telegram | Audit | Business Record | Integration Test | Status |
|--------|-------------|----------|----------|----------|-------|-----------------|------------------|--------|
| WF-LEAVE | Leave | leave_workflow | DM→Leader chain | leave:menu | leave_request_* | LeaveRequest | leave-workflow.integration.spec | verified |
| WF-OT | Overtime | overtime_workflow | Leader approve | approve:overtime | overtime_* | OvertimeRecord | ot-workflow.integration.spec | verified |
| WF-ADV | Advance pay | advance_workflow | Owner | unified:inbox | request_* | AdvancePayRecord | payroll.integration.spec | partial |
| WF-TIME | Time correction | time_correction | Leader | unified:inbox | time_correction_* | AttendanceRecord | time-correction-workflow.integration.spec | verified |
| WF-SHIFT | Shift change | shift_change | Leader | unified:inbox | shift_* | WorkShift | settings.integration.spec | partial |
| WF-OFFDAY | Off-day change | offday_change | Leader | unified:inbox | offday_* | LeaveBalance | leave-workflow.integration.spec | partial |
| WF-DOC | Document request | document_request | HR | document:* | document_* | EmployeeDocument | — | partial |
| WF-REF | Referral | referral | HR qualify | referral:* | referral_* | EmployeeReferral | referral.integration.spec | verified |
| WF-EXIT | Exit | exit_workflow | Owner/HR | unified:inbox | exit_* | EmployeeExitCase | employee-exit-deposit.integration.spec | verified |
| WF-SAL | Salary review | salary_review | Owner | unified:inbox | salary_review_* | SalaryReview | compensation-review.integration.spec | verified |
| WF-PROMO | Promotion review | promotion_review | Owner | unified:inbox | promotion_* | SalaryReview | compensation-review.integration.spec | verified |
| WF-PROB | Probation | probation_review | Manager | probation:* | probation_* | ProbationReview | probation-review.integration.spec | verified |
| WF-CUSTOM | Custom workflow | dynamic | configurable | unified:inbox | workflow_* | WorkflowInstance | approval-inbox.integration.spec | verified |

---

## Scheduler Traceability (Part K)

| Req ID | Scheduler | Cron | TZ | Handler | Audit | Evidence | Status |
|--------|-----------|------|-----|---------|-------|----------|--------|
| SCH-ATT | Attendance reminders | */15 * * * * | Asia/Bangkok | attendance-alert.scheduler | attendance_alert | E3 | partial |
| SCH-BDAY | Birthday recognition | 0 8 * * * | Asia/Bangkok | employee-recognition.scheduler | recognition_* | E4 | verified |
| SCH-ANNIV | Work anniversary | 0 8 * * * | Asia/Bangkok | employee-recognition.scheduler | recognition_* | E4 | verified |
| SCH-PROB | Probation reminders | 0 9 * * * | Asia/Bangkok | probation-reminder.scheduler | probation_* | E4 | verified |
| SCH-TRAIN | Training due | 0 7 * * * | Asia/Bangkok | training-reminder.scheduler | training_* | E3 | partial |
| SCH-DOC | Document expiry | 0 6 * * * | Asia/Bangkok | document-expiry.scheduler | document_* | E3 | partial |
| SCH-ANN | Announcement digest | 0 8 * * * | Asia/Bangkok | announcement.scheduler | announcement_* | E3 | partial |
| SCH-BRIEF | AI Morning Brief | 0 8 * * * | Asia/Bangkok | ai-morning-brief-delivery.scheduler | ai_brief_* | E3 | partial |
| SCH-EXIT | Exit reminders | 0 9 * * * | Asia/Bangkok | exit-reminder.scheduler | exit_* | E4 | verified |

---

## UI Screen Traceability (Part F)

| Screen | Primary Rules | API | Permission | Audit | Test | Status |
|--------|---------------|-----|------------|-------|------|--------|
| Dashboard | ATT-001, HR-013b | GET /dashboard/* | reporting:* | dashboard_view | — | partial |
| Employee | EMP-001, SEC-001 | GET /employees | employee:read | employee_read | employee-list.integration.spec | verified |
| Attendance | ATT-001, ABS-002 | /attendance/* | attendance:* | check_in | attendance.integration.spec | verified |
| Leave | LV-001, LR-001 | /leave/* | leave:* | leave_* | leave-workflow.integration.spec | verified |
| Payroll | PAY-002, PR-001 | /payroll/* | payroll:* | payroll_* | payroll-build.integration.spec | verified |
| Salary | SAL-001 | /compensation-reviews | payroll:write | salary_review_* | compensation-review.integration.spec | verified |
| Requests | REQ-001 | /requests | workflow:read | request_* | approval-inbox.integration.spec | verified |
| Calendar | HOL-003 | /leave/calendar | leave:read | — | — | partial |
| KPI | KPI-002 | /kpi/* | performance:read | kpi_* | — | partial |
| Performance | KPI-003 | /performance-reviews | performance:* | scores_updated | probation-review.integration.spec | partial |
| Position Framework | KPI-004 | /position-framework | settings:read | — | — | partial |
| Competency | — | /competency | settings:read | — | — | gap |
| Succession | — | /succession | reporting:owner | — | — | gap |
| Exit | EMP-012 | /exit/* | employee:write | exit_* | employee-exit-deposit.integration.spec | verified |
| Documents | DOC-001 | /documents/* | document:* | document_* | — | partial |
| Training | DOC-001 | /training/* | employee:read | training_* | — | partial |
| Announcement | ANN-001 | /announcements | employee:read | announcement_* | — | partial |
| Knowledge | DOC-001 | /knowledge/* | employee:read | — | — | partial |
| AI Manager | — | /ai/* | reporting:owner | ai_* | ai-tools.integration.spec | partial |
| Knowledge Graph | — | /knowledge-graph | reporting:owner | — | ai-tools.integration.spec | partial |
| QA Dashboard | QA-003 | /qa/* | reporting:owner | — | — | verified |

---

## Gap Requirements (not implemented)

| Req ID | Requirement | Policy | Status | Risk |
|--------|-------------|--------|--------|------|
| PAY-003a | Missed meal/break OT item | PAY-003a | gap | Critical |
| AC-013 | LEGAL_REVIEW_REQUIRED flag | DISC-002 | gap | Medium |
| DISC-001d | Termination settlement | POL-025b | gap | High |
| ABS-006 | Missing >15 min rule | ABS-006 | gap | Medium |
| ABS-007 | Labor unit round-up | ABS-007 | gap | Medium |
| EMP-002 | Department enum | EMP-002 | gap | Low |
| HOL-004 | Special holidays Dec 31/Jan 1 | HOL-004 | gap | Low |

**Full 229-row export:** Derived from [WORKHQ_POLICY_IMPLEMENTATION_MATRIX.md](./WORKHQ_POLICY_IMPLEMENTATION_MATRIX.md) Part B sections 1–30.

**API:** `GET /qa/traceability` · `GET /qa/traceability/rules` · `GET /qa/traceability/orphans`
