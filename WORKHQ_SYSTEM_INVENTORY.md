# WorkHQ System Inventory Audit

**Sprint:** QA-001 Production Stabilization  
**Generated:** 2026-06-25  
**Scope:** 35 HR OS modules (HR-only product boundary; marketing hidden when disabled)

## Executive Summary

| Metric | Value |
|--------|-------|
| Total modules | 35 |
| Complete | 19 (54%) |
| Partial | 16 (46%) |
| Broken | 0 |
| Integration test specs | 73 |
| Overall readiness | 78% |

## Module Inventory

| # | Module | Backend Path | Web Path | Telegram | Status | Risk | Tests | Gaps |
|---|--------|--------------|----------|----------|--------|------|-------|------|
| 1 | Employee Core | `modules/employee` | `/hr/employees` | Y | Complete | Low | 2 | — |
| 2 | Company / Team / Position | `modules/organization` | `/hr/organization` | N | Complete | Low | 1 | — |
| 3 | Attendance | `modules/attendance` | `/attendance/daily` | Y | Complete | Medium | 4 | Formula late deduction needs UAT |
| 4 | Leave | `modules/leave` | `/leave/requests` | Y | Complete | Medium | 5 | Reschedule edge cases |
| 5 | Payroll | `modules/payroll` | `/payroll/cycles` | Y | Partial | High | 8 | Edge-case UAT required |
| 6 | Admin Commission | `modules/commission` | `/settings/commission/admin` | Y | Partial | Medium | 3 | HR admin commission only |
| 7 | Exit Management | `modules/exit` | `/hr/exit/:id` | Y | Partial | High | 3 | Multi-step leader/owner flow |
| 8 | Final Payroll Settlement | `modules/exit` | `/me/final-settlement` | Y | Partial | High | 1 | PAY-005c self-service partial |
| 9 | Probation | `modules/performance` | `/hr/performance/reviews` | Y | Complete | Medium | 1 | — |
| 10 | Recognition | `modules/telegram` | — | Y | Complete | Low | 1 | Scheduler-only; no web UI |
| 11 | Disciplinary | `modules/disciplinary` | `/hr/employees/:id/disciplinary` | Y | Complete | Medium | 1 | — |
| 12 | Referral | `modules/request` | `/hr/referrals` | Y | Partial | Medium | 2 | Telegram list info-only |
| 13 | Request Platform | `modules/request` | `/requests` | Y | Complete | Medium | 2 | — |
| 14 | Workflow Builder | `modules/request` | `/admin/workflows` | N | Complete | Low | 0 | Admin-only |
| 15 | Approval Builder | `modules/request` | `/admin/request-types` | N | Complete | Low | 0 | Admin-only |
| 16 | Formula Engine | `modules/formula-engine` | `/admin/formulas` | N | Partial | Medium | 1 | Phase 1 integrations only |
| 17 | KPI | `modules/kpi` | `/hr/kpi/cycles` | Y | Complete | Medium | 0 | — |
| 18 | Performance Review | `modules/performance-review` | `/hr/performance/reviews` | Y | Partial | Medium | 0 | Cycle weight profiles UAT |
| 19 | Salary Review | `modules/salary-review` | `/hr/compensation-reviews` | Y | Complete | High | 1 | Sensitive data handling |
| 20 | Competency Matrix | `modules/competency` | `/hr/competencies` | Y | Partial | Low | 0 | Telegram read-only |
| 21 | Succession Planning | `modules/succession` | `/hr/succession` | Y | Partial | Low | 0 | Owner-only Telegram |
| 22 | Team Calendar | `modules/calendar` | `/calendar/team` | Y | Complete | Low | 0 | — |
| 23 | Document Center | `modules/document-center` | `/documents/my` | Y | Partial | Medium | 0 | Telegram download info-only |
| 24 | Document Request | `modules/document-request` | `/requests` | Y | Complete | Medium | 1 | QA-001 permission guards added |
| 25 | Knowledge Center | `modules/knowledge` | `/knowledge/articles` | Y | Complete | Low | 0 | — |
| 26 | Training | `modules/training` | `/training` | Y | Partial | Medium | 0 | Completion tracking partial |
| 27 | Announcement Center | `modules/announcement` | `/announcements` | Y | Partial | Medium | 0 | Acknowledgement rate UAT |
| 28 | AI Knowledge Assistant | `modules/ai` | `/ai/knowledge-assistant` | Y | Complete | Medium | 1 | — |
| 29 | AI Manager | `modules/ai` | `/ai/manager` | Y | Partial | Medium | 1 | 08:00 brief scheduler |
| 30 | Knowledge Graph | `modules/ai` | `/ai/knowledge-graph` | Y | Partial | High | 0 | Salary redaction required |
| 31 | Audit Explorer | `shared/audit` | `/audit` | N | Complete | Medium | 1 | Salary redaction for employee role |
| 32 | Ops Console | `modules/ops` | `/ops` | N | Complete | Low | 0 | Owner-only |
| 33 | Telegram Bot | `modules/telegram` | — | Y | Partial | High | 4 | Legacy OT path fixed QA-001 |
| 34 | Schedulers | `multiple` | — | N | Partial | Medium | 0 | Bangkok TZ + Redis locks |
| 35 | Outbox / Notifications | `common/outbox` | `/ops` | N | Complete | Medium | 1 | Backlog monitoring |

## Status Legend

| Status | Definition |
|--------|------------|
| Complete | API, web, and primary flows verified |
| Partial | Core path works; edge cases or secondary channels incomplete |
| Broken | Blocking defect in production path |
| Not Implemented | Scaffold only |

## Risk Summary

| Risk | Modules |
|------|---------|
| Critical | 0 |
| High | Payroll, Exit, Final Settlement, Salary Review, Knowledge Graph, Telegram |
| Medium | Attendance, Leave, Commission, Request, Formula, KPI, Performance, Document Center, Document Request, Training, Announcement, AI Manager, Audit, Schedulers, Outbox |
| Low | Employee, Organization, Probation, Recognition, Workflow Builder, Approval Builder, Competency, Succession, Calendar, Knowledge, Ops |

## Cross-Cutting Gaps

1. **Payroll UAT** — absence, late, meal allowance, leave bonus combinations untested in production data.
2. **Telegram parity** — several web features are info-only or owner-gated on Telegram.
3. **Knowledge Graph** — salary fields redacted for unauthorized actors; full graph query UAT pending.
4. **Build stability** — backend `npm run build` may fail with ENOTEMPTY on concurrent dist writes.
5. **Integration tests** — 73 specs exist; require `DATABASE_URL` to execute in CI.

## Source

Inventory derived from `QaReadinessService.MODULE_INVENTORY` and QA sprint exploration (TEST-001 / QA-001).
