# WorkHQ Master Policy V1

**Document ID:** POL-001  
**Version:** 1.3  
**Effective date:** 2026-06-29  
**Status:** Authoritative consolidated policy (audit baseline)  
**Scope:** WorkHQ HR product — all companies on the platform  
**Predecessor:** POL-000 Discovery (complete)  
**Amendment:** POL-001B Follow-Up Sprint (REQ-006b, REQ-005c, DOC-002, ATT-010b, INF-001); **POL-001C Final Hardening** (INF-001c Bangkok timezone domain migration, TEST-001c Telegram matrix, employee self-service home summary, production-readiness-check.sh)

---

## POL-000 / POL-001A discovery baseline

POL-000 catalogued policy sources. POL-001A merged **confirmed owner business decisions** (ORG-001, EMP-001, PAY-001–005, ATT-001–002, EMP-002, REF-001, DISC-001–002, WF-001–005, ASSET-001, HOL-001).

| Discovery area | Canonical source |
|----------------|------------------|
| Employee handbook | `company-policy-articles.ts` (5 `handbook-*` slugs) |
| Commission | KB + RuleConfig (COM-MKT / COM-ADM) |
| Referral | **REF-001** (confirmed) + `referral.rules` |
| Leave / reschedule | KB + `leave.rules` + **HOL-001**, **PAY-002** |
| Attendance / absence | `attendance.rules` + **ABS-001**, **ABS-002**, **PAY-003** |
| Payroll / meal / deposit / advance | **PAY-001–005** + settings schemas |
| Organization / employee model | **ORG-001**, **EMP-001**, **EMP-002** |
| Disciplinary / termination | **DISC-001–002** + handbook |
| Workflow / approvals | **WF-001–005** + `approval-defaults.ts` |
| Assets | **ASSET-001** |
| Access / Telegram | `BUSINESS_ROLE_PERMISSIONS.md`, `TELEGRAM_IDENTITY_SECURITY.md` |

**Consolidation principles:**

1. **Confirmed POL-001A decisions override** prior handbook/KB text where they conflict.
2. **Policy is source of truth.** Implementation gaps tracked in `WORKHQ_POLICY_IMPLEMENTATION_MATRIX.md`.
3. **Settings Engine** holds configurable numeric defaults aligned to confirmed decisions.
4. **Deprecated KB slugs** excluded: `commission-payout-policy`, `leave-personal-policy`, `ot-policy`.
5. **HR mode:** Marketing commission calculation out of scope; payment via manual payroll entry.

---

## Document control

| Field | Value |
|-------|-------|
| Conflict marker | `CONFLICT_REQUIRES_DECISION` — only items without confirmed decision |
| Missing marker | `POLICY_NOT_DOCUMENTED` — no confirmed rule |
| Confirmed decision marker | Rule IDs matching POL-001A register (ORG-001, EMP-001, PAY-00x, etc.) |

**Rule:** Where code conflicts with this document, **policy wins**.

---

## 1. Organization Structure

### Business rules — ORG-001 (confirmed)

| Rule ID | Rule |
|---------|------|
| ORG-001 | Company structure under **Owner** comprises two departments: **Admin Department** and **Marketing Department** |
| ORG-002 | **Admin Department** hierarchy: **Secretary** (highest authority of Admin Dept) → Admin, HR, Finance functions |
| ORG-003 | **Marketing Department** hierarchy: **Big Leader** (highest authority of Marketing Dept) → Sub Leader → Employee |
| ORG-004 | Secretary is the highest authority of the Admin Department |
| ORG-005 | Big Leader is the highest authority of the Marketing Department |
| ORG-006 | WorkHQ supports **multiple companies**; a single employee may have assignments in **multiple companies** |
| ORG-007 | Each company may have teams with optional parent hierarchy (`team.entity.ts`) |
| ORG-008 | Employee handbook remains official reference for culture and conduct (`handbook-welcome-culture`) |

### Org chart (authoritative)

```
OWNER
├── Admin Department
│   SECRETARY (highest authority — Admin)
│   ├── Admin
│   ├── HR
│   └── Finance
└── Marketing Department
    BIG LEADER (highest authority — Marketing)
    ├── Sub Leader
    └── Employee
```

### Examples

- Secretary approves Admin Department salary adjustments (WF-001) before Owner.
- Big Leader approves Marketing Department commission adjustments (WF-002) before Owner.
- Employee assigned to companies KW and MB has separate assignment records per company.

### Exceptions

- Marketing teams (MarketingOS) remain a separate technical structure when MarketingOS enabled; policy hierarchy above governs authority.

### Owner override rules

- Owner may create/update companies and teams.
- Owner assigns business roles, departments, positions, and scopes (see Section 2).

---

## 2. Business Roles & Employee Model

### Business rules — EMP-001 (confirmed)

| Rule ID | Rule |
|---------|------|
| EMP-001 | **Employee category:** `OFFICE` or `WFH` |
| EMP-001b | **Telegram invite link onboarding:** HR creates minimal employee record; one-time invite link (`invite_<token>`); SHA-256 hash storage; 7-day expiry; supersedes pending invites |
| EMP-001c | **Employee self-onboarding:** personal info + emergency contact + bank info + documents via Telegram; submitted data pending HR approval; HR-only fields rejected server-side; bank/documents promoted only on approval |
| EMP-002 | **Department:** Marketing, Admin, HR, Finance |
| EMP-003 | **Position:** Employee, Sub Leader, Big Leader, Secretary, Owner |
| EMP-004 | A single employee may have assignments in **multiple companies** |
| EMP-005 | Employee category `OFFICE` vs `WFH` determines meal allowance eligibility (PAY-001) |
| EMP-006 | **Birthday recognition:** store `dateOfBirth`; daily Telegram to employee; notify Owner, Secretary, Big Leader on birthday |
| EMP-007 | **Work anniversary recognition:** `hireDate` is source of truth for tenure and anniversary; daily Telegram on milestone anniversaries (1/2/3/5/10 years); notify leaders |
| EMP-008 | **Tenure display:** computed from `hireDate` and current date; formats: days only (&lt;1 month), months+days (&lt;1 year), years+months (≥1 year); probation status shown on profile |
| EMP-009 | **Gift tracking:** `EmployeeRecognition` records (`BIRTHDAY_GIFT`, `WORK_ANNIVERSARY_GIFT`, `EMPLOYEE_OF_MONTH`, `SPECIAL_REWARD`); dashboard mark-gift actions; profile timeline; Telegram on gift recorded (HR-013c) |
| EMP-010 | **Probation review:** `ProbationReview` outcomes PASS/EXTEND/FAIL; PASS → active; EXTEND → configurable extension; FAIL → auto exit case; Telegram reminders; Employee Detail UI |
| EMP-011 | **Awards & service milestones:** extended `EmployeeRecognition` types; award API; service automation; dashboard widgets; Telegram award flows (EMP-011) |
| EMP-012 | **Exit management & lifecycle completion:** `ExitCaseType` + checklist items; workflow links (probation FAIL, disciplinary termination, manual HR); dashboard widgets; Telegram exit flows (EMP-012) |
| EMP-012b | **Exit hardening:** cancel API with audit/Telegram; checklist UI normalization; award creation UI; CI integration docs |
| PAY-005b | **Final payroll settlement (exit):** `FinalPayrollSettlement` model; calculation engine; draft → approve → paid workflow; checklist auto-complete; Telegram (PAY-005 epic) |
| PAY-005c | **Final settlement recalculation & employee self-service:** recalculate draft; deposit visibility fields; employee paid summary page; Telegram summary link |
| PAY-006 | **Payroll bank transfer sheet export:** `PayrollExportBatch`/`PayrollExportItem` snapshots; XLSX/CSV; exception validation; Owner-confirmed exceptions; Telegram to Owner/Secretary |
| PAY-007 | **Company payroll overview:** cycle-level review page with summary totals, employee rows, exception flags, drill-down detail; pre-export review |
| SAL-001 | **Salary review & promotion workflow:** `SalaryReview`/`PromotionReview` models; propose → approve → apply on effective date; employee timeline; dashboard; Telegram |
| SAL-001b | **Compensation review UX:** employee create forms, list page with filters, manual apply, integration tests |
| KPI-001 | **Performance KPI engine:** templates, cycles, assignments, weighted scoring, grade mapping, dashboards, Telegram |
| KPI-002 | **Dynamic KPI builder:** position-based templates, hybrid data sources (MANUAL/FORMULA/SYSTEM/API), clone/version/archive |
| KPI-003 | **Performance review:** configurable weights (KPI + Leader + Self + 360), final score; no auto salary recommendation |
| KPI-004 | **Position framework:** Position Family/Level/Position, Career Path, Promotion Path with lifecycle management |

### Business rules — system access roles (HR-12)

| Rule ID | Role code | Also known as | Default scope | Summary |
|---------|-----------|---------------|---------------|---------|
| BR-001 | `owner` | Owner (position) | all | Full HR access, all companies |
| BR-002 | `secretary` | Secretary (position), HR Manager, Payroll Operator | all | Admin Department highest authority |
| BR-003 | `big_leader` | Big Leader (position) | company | Marketing Department highest authority |
| BR-004 | `sub_leader` | Sub Leader (position) | team | Marketing team leadership |
| BR-005 | `admin_manager` | — | company | Company HR operations |
| BR-006 | `admin` | Admin (function) | company | Company admin read/write |
| BR-007 | `employee` | Employee (position) | self | Self-service only |

| Rule ID | Rule |
|---------|------|
| BR-008 | Secretary, HR Manager, and Payroll Operator map to business role `secretary` |
| BR-009 | **Position** (EMP-003) and **business role** (BR-001–007) are related but not automatically equivalent; HR admin maps explicitly |
| BR-010 | Effective access: **role bundle → scope grants → user overrides** (audited) |
| BR-011 | **Department** (EMP-002) determines which workflow approver chain applies (WF-001–005) |

### Examples

- Marketing Sub Leader with `sub_leader` position: salary adjustment chain Big Leader → Owner (WF-001).
- Admin Department HR staff under Secretary: personal data change approved by Secretary (WF-005).
- WFH employee (`EMP-001`): no meal allowance (PAY-001).
- Employee hired 15 Jan 2025: tenure on 23 Jun 2026 displays **1 ปี 5 เดือน** (API) or **1 ปี 5 เดือน 8 วัน** (profile detailed).
- Birthday 6 Aug: dashboard widget **🎂 วันเกิดเดือนนี้** lists employee sorted by nearest upcoming date; Telegram sends **🎂 สุขสันต์วันเกิด** at 08:00.
- Hire anniversary 15 Jan completing 5 years: **🏆 ครบรอบการทำงาน** widget and leader Telegram notification.

### Exceptions

- Finance and HR are Admin Department functions; employees in those functions follow Admin Department workflow rules.

### Owner override rules

- Only users with `permission:write` (Owner) assign roles, scopes, overrides.
- Admin Manager / Admin salary visibility requires `UserPermissionOverride` per salary matrix.

---

### Business rules — employee date events & tenure (HR-013b / HR-013c / EMP-006–009)

| Rule ID | Rule |
|---------|------|
| HR-013b | Sprint deliverable: birthday recognition, work anniversary recognition, tenure display, dashboard widgets, daily Telegram scheduler |
| HR-013c | Sprint deliverable: `EmployeeRecognition` model replaces legacy gift columns; dashboard mark-gift actions; profile recognition timeline; Telegram on gift recorded; company-wide birthday broadcast |
| EMP-006 | Store `dateOfBirth`; profile shows วันเกิด and อายุ; dashboard **🎂 วันเกิดเดือนนี้**; daily Telegram birthday messages + company-wide broadcast |
| EMP-007 | `hireDate` required; source for probation, tenure, service, work anniversary; dashboard **🏆 ครบรอบการทำงานเดือนนี้** (milestones 1/2/3/5/10 years); daily Telegram anniversary messages |
| EMP-008 | Tenure API fields: `tenureYears`, `tenureMonths`, `tenureDays`, `tenureDisplay`; profile section **ข้อมูลการทำงาน** with probation status |
| EMP-009 | Gift workflow via `employee_recognitions`: types `BIRTHDAY_GIFT`, `WORK_ANNIVERSARY_GIFT`, `EMPLOYEE_OF_MONTH`, `SPECIAL_REWARD`; one gift per type per calendar year (birthday/anniversary); dashboard gift status column + mark actions |

**Telegram — birthday (EMP-006):**

- Employee: `🎂 สุขสันต์วันเกิด` + blessing text
- Leaders (Owner, Secretary, Big Leader in company scope): notify with name, position, department
- Company-wide: `🎂 ประกาศวันเกิด` broadcast to all linked Telegram accounts in company (daily scheduler + optional on mark-gift)

**Telegram — work anniversary (EMP-007):**

- Employee: `🏆 วันนี้เป็นวันครบรอบการทำงาน` + years
- Leaders: same fields as birthday notification

**Telegram — gift recorded (EMP-009 / HR-013c):**

- Employee: confirmation that HR recorded birthday or anniversary gift
- Leaders: notification with employee name, gift type, date, notes

**Scheduler:** daily **08:00** (Bangkok), Redis lock `workhq:employee-recognition:{date}`

**Access:** `employee:read` + company scope on dashboard APIs and `GET /employees/:id` (actor scope enforced — self or company); `employee:write` for mark-gift and create recognition

**Dashboard widgets:**

| Widget | API |
|--------|-----|
| 🎂 วันเกิดเดือนนี้ | `GET /employees/dashboard/recognition-events` (includes `birthdayGiftGivenThisYear`) |
| 🏆 ครบรอบการทำงานเดือนนี้ | same (includes `anniversaryGiftGivenThisYear`) |
| Mark birthday gift | `POST /employees/:id/recognitions/birthday-gift` |
| Mark anniversary gift | `POST /employees/:id/recognitions/anniversary-gift` |
| พนักงานอายุงานมากที่สุด | `GET /employees/dashboard/tenure-insights` |
| ใกล้ครบทดลองงาน | `probationEndingSoon` buckets in tenure-insights |

**Profile:** `GET /employees/:id/recognitions?companyId=` — recognition timeline on Employee Detail

---

### Business rules — employee access audit (SEC-001)

| Rule ID | Rule |
|---------|------|
| SEC-001 | All employee-scoped endpoints enforce `CompanyAccessService` + `EmployeeAccessService` (self or company scope) across employee, leave, attendance, payroll, disciplinary, and recognition modules |
| SEC-001a | Self-scoped actors may read/act on own employee record only |
| SEC-001b | Company-scoped HR/leaders may access employees in granted company |
| SEC-001c | All-scope Owner/Secretary may access any company |

**Enforced endpoints (representative):** `GET /employees/:id`, assignments, salary-history, telegram-identity; leave employee routes; attendance check-in/out; payroll payslip; performance probation/evaluation lists; recognition timeline.

**Tests:** `employee-access-audit.integration.spec.ts` — Employee, Sub Leader, Big Leader, Secretary, Owner role matrix.

---

### SEC-001b — Remaining employee access hardening

| Rule ID | Rule |
|---------|------|
| SEC-001b-R1 | `POST /employees/rehire` enforces prior-employee company scope via `EmployeeAccessService` |
| SEC-001b-R2 | Payroll cycle items (`meal`, `late`, `absence`, `leave-bonus`) enforce `assertEmployeeInCompany` |
| SEC-001b-R3 | Disciplinary reads use `EmployeeAccessService.assertEmployeeInCompany` before role-based gates |
| SEC-001b-R4 | Extended integration tests for rehire, disciplinary, and cross-company denial |

**Cross-reference:** SEC-001 foundation; `employee-access-audit.integration.spec.ts`.

---

### Business rules — probation review workflow (EMP-010)

| Rule ID | Rule |
|---------|------|
| EMP-010 | Probation review via `ProbationReview` model (`performance.probation_reviews`); outcomes **PASS**, **EXTEND**, **FAIL** |
| EMP-010a | **PASS** — `employmentStatus` → `active` |
| EMP-010b | **EXTEND** — configurable `extensionDays` (default 30) or `extendedUntil`; updates `employee.probationEndDate` |
| EMP-010c | **FAIL** — auto-creates `EmployeeExitCase` with `exitReason: performance_failure` |
| EMP-010d | Daily Telegram reminders at 09:00 for probation ending in 7/14/30 days |

**APIs:**

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/performance/probation` | Create review |
| `PATCH` | `/performance/probation/:id/resolve` | Resolve PASS/EXTEND/FAIL |
| `GET` | `/performance/employees/:employeeId/probation` | Employee timeline |
| `GET` | `/performance/probation/pending?companyId=` | Pending reviews dashboard |
| `GET` | `/performance/probation/dashboard?companyId=` | Pending + ending-soon dashboard (EMP-010b) |

**UI:** Employee Detail — **ประเมินทดลองงาน** section with PASS / EXTEND / FAIL actions.

---

### EMP-010b — Probation automation

| Rule ID | Rule |
|---------|------|
| EMP-010b-R1 | Auto-create pending `ProbationReview` on onboarding when `employmentStatus` is `probation` |
| EMP-010b-R2 | Dashboard widgets: pending reviews + probation ending within 30 days |
| EMP-010b-R3 | Telegram leader reminders include inline **PASS**, **EXTEND 30d**, **FAIL** actions |
| EMP-010b-R4 | **EXTEND** creates next pending review after resolving the current one |
| EMP-010b-R5 | **FAIL** auto-creates `EmployeeExitCase` when exit workflow is available; logs policy cross-reference otherwise |

**Telegram callbacks:** `probation:pass:{reviewId}`, `probation:extend:{reviewId}`, `probation:fail:{reviewId}` → `PerformanceService.resolveProbationFromTelegram`.

**Exit cross-reference:** EMP-010c / EXIT workflow (`EmployeeExitCase`, `exitReason: performance_failure`).

**Tests:** `probation-review.integration.spec.ts`, `performance.service.probation.unit.spec.ts`, `performance.test.ts` (web).

**Consistency:** `scripts/sec-001b-emp-010b-consistency-check.sh` (integration when `DATABASE_URL` set).

---

### EMP-011 — Employee awards & service milestones

| Rule ID | Rule |
|---------|------|
| EMP-011 | Extend `EmployeeRecognition` with award types: `EMPLOYEE_OF_MONTH`, `BEST_ATTENDANCE`, `BEST_PERFORMANCE`, `TOP_RECRUITER`, `TOP_MARKETING`, `SERVICE_AWARD_1/3/5/10_YEAR` |
| EMP-011a | Award API: `POST /employees/:id/recognitions` with optional `awardMonth`, `giftOrReward`, `givenBy`, `notes`; `recordedBy` audit |
| EMP-011b | Service automation: daily job creates service awards on hire-date anniversaries (1/3/5/10 years); duplicate prevention |
| EMP-011c | Dashboard: `GET /employees/dashboard/awards` — awards this month, service awards due, recent recognitions |
| EMP-011d | Telegram: notify employee + leaders on award; optional company-wide broadcast for major milestones |
| EMP-011e | Access: Owner (all), Secretary/Big Leader (company create+read), Sub Leader (team read), Employee (self read) |

**Schema:** `employee_recognitions.award_month`, `gift_or_reward`, `given_by`.

**Tests:** `employee-recognition*.spec.ts`, `scripts/emp-011-consistency-check.sh`.

**CI note:** Set `DATABASE_URL` to run integration tests in consistency scripts.

---

### EMP-012 — Exit management & employee lifecycle completion

| Rule ID | Rule |
|---------|------|
| EMP-012 | Extend `EmployeeExitCase` with `exitType` (`resignation` / `termination` / `absconding`), `sourceType`, `sourceId`; lifecycle mapping (`OPEN` / `IN_PROGRESS` / `COMPLETED` / `CANCELLED`) over existing workflow statuses |
| EMP-012a | Default exit checklist: return keys/laptop/phone, remove Telegram/system access, payroll settlement completed (`ExitChecklistItem`) |
| EMP-012b | Workflow links: probation FAIL → exit case (`probation_review`); disciplinary termination → exit case (`disciplinary_action`); manual HR via `POST /employees/:id/exit` |
| EMP-012c | Dashboard: `GET /exit-cases/dashboard` — active cases, pending clearance, upcoming effective dates |
| EMP-012d | Employee profile: `GET /employees/:id/exit-cases` — active case + history |
| EMP-012e | Telegram: new exit case, daily pending checklist reminder, exit completed |
| EMP-012f | Access: Owner / Secretary / Big Leader (manage + dashboard); Employee (self read only) |

**Schema:** `exit_checklist_items`, `employee_exit_cases.exit_type`, `source_type`, `source_id`.

**Tests:** `exit-lifecycle*.spec.ts`, `exit-checklist*.spec.ts`, `exit-case.notifier*.spec.ts`, `scripts/emp-012-consistency-check.sh`.

---

### EMP-012b — Exit management hardening & completion

| Rule ID | Rule |
|---------|------|
| EMP-012b | Cancel API: `POST /exit-cases/:id/cancel` with required `cancellationReason`; Owner/Secretary only (Big Leader read-only for cancel) |
| EMP-012b-a | Granular checklist is sole UI source of truth; legacy boolean bulk-complete hidden; backend sync retained |
| EMP-012b-b | Audit: `checklist_item_toggled`, `cancel`, `close`, `settlement_completed` on `EmployeeExitCase` |
| EMP-012b-c | Telegram: notify leaders + employee on cancellation |
| EMP-012b-d | Award creation UI on Employee Detail (`POST /employees/:id/recognitions`) — permission-gated |
| EMP-012b-e | CI: integration tests run in `.github/workflows/ci.yml` `test-integration` when `DATABASE_URL` is set |

**Schema:** `employee_exit_cases.cancelled_at`, `cancelled_by`, `cancellation_reason`.

**Tests:** `exit-case.service.unit.spec.ts`, `exit-access.service.unit.spec.ts`, `scripts/emp-012-consistency-check.sh`.

---

### PAY-005b — Final payroll settlement on exit (PAY-005 epic)

| Rule ID | Rule |
|---------|------|
| PAY-005b | `FinalPayrollSettlement` per exit case: salary prorate, unpaid salary, pending OT/commission/bonus, advance/equipment/penalty deductions, deposit return preview, net payable |
| PAY-005b-a | Workflow: HR/Secretary creates **draft** → submits **pending_review** → **Owner** approves → HR/Secretary marks **paid** |
| PAY-005b-b | On **paid**, auto-complete checklist item `payroll_settlement_completed`; audit actions: `draft_created`, `edited`, `submitted`, `approved`, `paid`, `cancelled` |
| PAY-005b-c | APIs: `POST /exit-cases/:id/final-settlement/draft`, `GET /exit-cases/:id/final-settlement`, `PATCH /final-settlements/:id`, submit/approve/mark-paid |
| PAY-005b-d | Access: Owner (approve, view all); Secretary (create/edit/submit/mark paid); Big Leader (view company, no approve); Employee (view own **paid** summary only) |
| PAY-005b-e | Telegram: submitted → Owner; approved → HR/Secretary; paid → employee with net amount |
| PAY-005b-f | Deposit exit pipeline (`POST /exit-cases/:id/settle`) unchanged; final settlement uses deposit return for **calculation preview** only |

**Note:** Existing **PAY-005** advance-pay rules (Owner approver, next-cycle recovery) remain separate.

**Schema:** `final_payroll_settlements`, enum `final_settlement_status`.

**Tests:** `final-settlement*.spec.ts`, `scripts/pay-005-consistency-check.sh`.

---

### PAY-005c — Final settlement recalculation & employee self-service

| Rule ID | Rule |
|---------|------|
| PAY-005c | `POST /final-settlements/:id/recalculate` — draft only; re-pulls calculated fields; preserves manual `pendingBonusAmount` (when edited), `otherAdjustmentAmount`, `notes`; audit `recalculated` |
| PAY-005c-a | Response deposit visibility: `depositPreviewAmount`, `depositSettledAmount`, `depositSettlementStatus` (`preview_only` / `settled` / `not_applicable`); does **not** auto-call deposit settle |
| PAY-005c-b | Employee self-service: `GET /employees/:id/final-settlement/paid-summary` + `/me/final-settlement` UI — paid only; hides internal notes/approval fields |
| PAY-005c-c | Telegram on paid: net amount, paid date, inline link to employee summary when `WORKHQ_WEB_URL` configured |
| PAY-005c-d | Unpaid salary heuristic documented in `unpaid-salary.heuristic.ts`; cycles `open`/`locked` only; **TODO** per-employee partial-paid (PR-010) |
| PAY-005c-e | Integration test: `final-settlement-pay005c.integration.spec.ts` — full workflow + employee access assertions |

**Tests:** `unpaid-salary.heuristic.unit.spec.ts`, `final-settlement-pay005c.integration.spec.ts`, `scripts/pay-005-consistency-check.sh`.

---

### PAY-006 — Payroll bank transfer sheet export

| Rule ID | Rule |
|---------|------|
| PAY-006 | Immutable export batch snapshots per payroll cycle: employee, bank, net pay, payroll components, export status |
| PAY-006-a | Cycle must be **locked** or **paid** (approved for payout) before export |
| PAY-006-b | Exception flags: missing bank account, net pay ≤ 0, pending bonus/manual adjustment without `workflow:approved` |
| PAY-006-c | Export blocked when exceptions exist unless **Owner** confirms (`confirmExceptions: true`) |
| PAY-006-d | Sheets: **Bank Transfer** (included rows), **Payroll Summary** (all rows + component totals), **Exceptions** |
| PAY-006-e | APIs: `POST /payroll/cycles/:id/export-bank-transfer`, preview/history, `GET /payroll/export-batches/:id`, download `?format=xlsx\|csv`, optional cancel/regenerate |
| PAY-006-f | Access: Owner + Secretary (company scope) export/download; Big Leader + Employee **no bank export** |
| PAY-006-g | Telegram: notify Owner/Secretary on export created; **no** employee notification at export time |
| PAY-006-h | Audit: `export_created`, `export_downloaded`, `export_regenerated`, `export_cancelled` |

**Schema:** `payroll_export_batches`, `payroll_export_items`.

**Tests:** `payroll-export*.spec.ts`, `scripts/pay-006-consistency-check.sh`.

---

### PAY-007 — Company payroll overview

| Rule ID | Rule |
|---------|------|
| PAY-007 | Company-level payroll review for a cycle: summary totals, searchable employee table, exception badges |
| PAY-007-a | API: `GET /payroll/cycles/:id/overview` with filters (`companyId`, `teamId`, `department`, `position`, `employmentStatus`, `payrollStatus`) |
| PAY-007-b | Employee row snapshots: salary components, deductions, net pay, masked bank account, tenure, payroll status |
| PAY-007-c | Exception flags: missing bank/name, net ≤ 0, pending adjustment, unapproved items, inactive without paid final settlement |
| PAY-007-d | Drill-down: `GET /payroll/cycles/:id/overview/employees/:employeeId` — components, OT, commission, advance pay, notes |
| PAY-007-e | Access: Owner + Secretary (all companies); Big Leader (company scope, read-only); Sub Leader / Employee / Admin → own payroll only (no company overview) |
| PAY-007-f | UI: `/payroll/cycles/:id/overview` — filters, summary cards, exception list, row detail modal, link to export (PAY-006) |
| PAY-007-g | Audit: `payroll_overview_viewed`, `payroll_overview_row_opened`, `payroll_overview_export_initiated` |

**Tests:** `payroll-overview*.spec.ts`, `scripts/pay-007-consistency-check.sh`.

---

### SAL-001 — Salary review & promotion workflow

| Rule ID | Rule |
|---------|------|
| SAL-001 | Structured salary review and promotion workflows with draft → pending approval → approved/rejected → applied |
| SAL-001-a | Models: `SalaryReview` (current/proposed salary, increase amount/percent, reason, effective date) and `PromotionReview` (current/proposed position, reason, effective date) |
| SAL-001-b | Status workflow: `draft`, `pending_approval`, `approved`, `rejected`, `applied` |
| SAL-001-c | API: salary/promotion CRUD + submit/approve/reject/apply; dashboard; employee compensation timeline |
| SAL-001-d | On effective date (scheduler): update `SalaryHistory` + employee position; audit log `applied` |
| SAL-001-e | Access: Owner (all + approve/reject); Secretary (company scope, create/edit/submit); Big Leader (propose only); Employee (own timeline only) |
| SAL-001-f | UI: `/hr/compensation-reviews` dashboard; employee detail compensation section (salary/promotion history + pending) |
| SAL-001-g | Telegram: submitted → Owner; approved/rejected → HR + employee; applied → employee |
| SAL-001-h | Audit: `draft_created`, `edited`, `submitted`, `approved`, `rejected`, `applied` |

**Tests:** `compensation-review*.spec.ts`, `scripts/sal-001-consistency-check.sh`.

---

### SAL-001b — Compensation review UX completion

| Rule ID | Rule |
|---------|------|
| SAL-001b | Complete user-facing UX for salary review and promotion workflows |
| SAL-001b-a | Employee detail: create salary/promotion review forms with auto-filled current values, reason, note, effective date |
| SAL-001b-b | Submit flow: save draft, submit for approval, create-and-submit in one action |
| SAL-001b-c | List page `/hr/compensation-reviews/list` with company/type/status/date/search filters |
| SAL-001b-d | Dashboard manual apply for approved reviews (Secretary/Owner) with confirmation modal |
| SAL-001b-e | Integration tests: full workflow, salary history update, position update, unauthorized denial |
| SAL-001b-f | Telegram unchanged from SAL-001 (submit/approve/reject/apply only; no draft notification) |

**Tests:** `compensation-review.integration.spec.ts`, `scripts/sal-001b-consistency-check.sh`.

---

### KPI-001 — Performance KPI engine foundation

| Rule ID | Rule |
|---------|------|
| KPI-001 | KPI templates, metrics, cycles, assignments, scores with weighted grading |
| KPI-001-a | Models: `KpiTemplate`, `KpiMetric`, `KpiCycle`, `KpiAssignment`, `KpiScore`, `KpiScoreItem` |
| KPI-001-b | Grade mapping: A 90–100, B 80–89, C 70–79, D 60–69, F &lt;60 |
| KPI-001-c | APIs: templates, cycles, assign, scores, submit, finalize, dashboard, employee KPI history |
| KPI-001-d | UI: `/hr/kpi/templates`, `/hr/kpi/cycles`, cycle detail, employee KPI section |
| KPI-001-e | Permissions: Owner all; Secretary company create/edit/finalize; Big Leader review; Sub Leader team; Employee self |
| KPI-001-f | Telegram: assignment created, score input needed, finalized |
| KPI-001-g | SAL-001 integration: compensation timeline shows latest KPI score as context only (no auto-approval) |

**Tests:** `kpi-*.unit.spec.ts`, `scripts/kpi-001-consistency-check.sh`.

---

### Business decisions — Performance & compensation (locked)

| Decision | Rule |
|----------|------|
| Performance model | Final score = KPI + Leader Review + Self Review + 360 Feedback; weights configurable per company profile |
| KPI templates | Position-based (`PositionDefinition` linkage) |
| KPI data sources | Hybrid: MANUAL, FORMULA, SYSTEM, API |
| Salary recommendation | **No automatic recommendation** — Owner decides compensation changes |
| Career path | Required — modeled via `CareerPath` + steps |
| Position framework | Required — Family, Level, Position, Career Path, Promotion Path |

---

### KPI-002 — Dynamic KPI builder

| Rule ID | Rule |
|---------|------|
| KPI-002 | Position-based KPI templates with hybrid metric data sources |
| KPI-002-a | Template lifecycle: create, edit, delete, archive, clone, version |
| KPI-002-b | Metric sources: MANUAL, FORMULA (`formulaExpression`), SYSTEM (`systemSourceKey`), API (`apiEndpoint`/`apiFieldPath`) |
| KPI-002-c | API: `GET /kpi/templates/by-position`, clone/archive/version/delete routes |
| KPI-002-d | Auto-resolve metric scores on assignment scoring via `KpiDataSourceService` |

**Tests:** `kpi-data-source*.spec.ts`, `kpi-template-builder*.spec.ts`, `scripts/kpi-002-consistency-check.sh`.

---

### KPI-003 — Performance review

| Rule ID | Rule |
|---------|------|
| KPI-003 | Full performance review cycle with configurable component weights |
| KPI-003-a | `PerformanceWeightProfile`: kpiWeight, leaderReviewWeight, selfReviewWeight, feedback360Weight (normalized) |
| KPI-003-b | Final score = weighted sum; grade A–F; **no salary recommendation output** |
| KPI-003-c | 360 feedback collection; submit/finalize workflow; Telegram on create/finalize |
| KPI-003-d | UI: `/hr/performance/reviews`, cycle detail with score breakdown |

**Tests:** `performance-score*.spec.ts`, `scripts/kpi-003-consistency-check.sh`.

---

### KPI-004 — Position framework

| Rule ID | Rule |
|---------|------|
| KPI-004 | Position Family, Level, Position Definition, Career Path, Promotion Path |
| KPI-004-a | All entities support: create, edit, delete (soft), archive, clone, version |
| KPI-004-b | Career paths: ordered steps linking position definitions |
| KPI-004-c | Promotion paths: from/to position with requirements text |
| KPI-004-d | UI: `/hr/position-framework` tabbed management |

**Tests:** `framework-entity*.spec.ts`, `scripts/kpi-004-consistency-check.sh`.

---

### REQ-001 — Universal Request Center

| Rule ID | Rule |
|---------|------|
| REQ-001 | Telegram-first request submission and tracking for all HR request types |
| REQ-001-a | `RequestInstance`, `RequestValue`, approval step instances, timeline, comments |
| REQ-001-b | Web Admin: list, detail, approve/reject, dashboard at `/requests` |
| REQ-001-c | Version-safe field label/type snapshots on submitted values |
| REQ-001-d | Every status change writes timeline event + audit log |

**Tests:** `request-condition*.spec.ts`, `scripts/request-platform-consistency-check.sh`.

---

### REQ-002 — Dynamic Request Type Builder

| Rule ID | Rule |
|---------|------|
| REQ-002 | Owner/Secretary create request types without code changes |
| REQ-002-a | `RequestType` + `RequestTypeVersion` with draft/publish/archive/clone |
| REQ-002-b | Published versions immutable; new submissions use latest published |
| REQ-002-c | Eight system templates seeded (leave, OT, advance, time correction, shift, off-day, document, generic) |
| REQ-002-d | Web Admin `/admin/request-types` |

---

### REQ-003 — Dynamic Form Builder

| Rule ID | Rule |
|---------|------|
| REQ-003 | Configurable form fields per request type version |
| REQ-003-a | Field types: text through system_auto_fill |
| REQ-003-b | Conditional visibility via `visibilityConditionJson` |
| REQ-003-c | Validation on type/range/required/select options |
| REQ-003-d | Telegram step-by-step collection with summary confirm |

---

### REQ-004 — Approval Flow Builder

| Rule ID | Rule |
|---------|------|
| REQ-004 | Configurable approval steps per request type version |
| REQ-004-a | Approver types: big leader, sub leader, owner, secretary, role, specific employee, field |
| REQ-004-b | Condition JSON on steps (field value or requester context) |
| REQ-004-c | Telegram inline approve/reject; Web detail approve/reject |
| REQ-004-d | Step snapshots preserved on submitted requests |

---

### REC-002 — Employee Referral Bonus after Probation

| Rule ID | Rule |
|---------|------|
| REC-002 | Employee submits candidate referral before hire |
| REC-002-a | Bonus eligible **only after referred employee passes probation** |
| REC-002-b | `EmployeeReferral`, `ReferralProgram`, `ReferralBonusPayout` models |
| REC-002-c | Probation pass hook creates pending payout; HR approves and marks paid |
| REC-002-d | Telegram `👥 แนะนำคน`; Web `/hr/referrals` |
| REC-002-e | Payroll integration: `markPaid` creates `PayrollItem` in open cycle |

---

## Platform Consolidation Sprint (Parts A–G)

### EMP-014 — Employee Position Linkage

| Rule ID | Rule |
|---------|------|
| EMP-014 | Employee linked to Position Framework via `positionFamilyId`, `positionLevelId`, `positionDefinitionId` |
| EMP-014-a | Legacy `position` text retained for backward compatibility |
| EMP-014-b | Bulk position assignment, bulk update, migration utility |
| EMP-014-c | Dashboard: employees missing position framework linkage |
| EMP-014-d | Audit: `position_assigned`, `position_changed`, `position_migrated` |

### KPI-005 — Position-Driven KPI Assignment

| Rule ID | Rule |
|---------|------|
| KPI-005 | `KpiPositionAssignmentRule` maps position → KPI template |
| KPI-005-a | Resolution order: employee position → company override → manual assignment |
| KPI-005-b | Dashboard: missing KPI template, multiple rules, coverage by position |

### SAL-002 — Promotion Path Validation (Advisory)

| Rule ID | Rule |
|---------|------|
| SAL-002 | Promotion path validation is **advisory only** — owner always decides |
| SAL-002-a | Never auto-reject promotion requests outside configured path |
| SAL-002-b | Telegram owner notification includes validation result and suggested paths |
| SAL-002-c | Dashboard: promotion requests outside career path |

### REQ-005b — Universal Approval Inbox

| Rule ID | Rule |
|---------|------|
| REQ-005b | Telegram menu `📥 งานรออนุมัติ` aggregates all pending approvals |
| REQ-005b-a | Covers leave, OT, advance, referral, promotion, salary, exit, request platform |
| REQ-005b-b | Approve/reject directly from Telegram |

### REQ-006 — Request Integration Engine

| Rule ID | Rule |
|---------|------|
| REQ-006 | Approved requests create real business records |
| REQ-006-a | Leave → leave record + balance; OT → OT record; advance → payroll deduction |
| REQ-006-b | Time correction → attendance correction; document → generation queue |
| REQ-006-c | `integrationStatus` synchronized; audit every step |

### ATT-010 — Attendance Alert Engine

| Rule ID | Rule |
|---------|------|
| ATT-010 | Missing check-in/out/break-return alerts with escalation |
| ATT-010-a | Configurable thresholds by owner; Telegram quick actions |
| ATT-010-b | Audit: `attendance_alert_sent`, `attendance_alert_escalated`, `attendance_alert_resolved` |

### REC-002 (completion)

| Rule ID | Rule |
|---------|------|
| REC-002-f | Telegram `👥 คนที่ฉันแนะนำ` lists referral status and bonus |
| REC-002-g | Payroll payout via `PayrollItem` on `markPaid` |

### DOC-001 — Knowledge & Document Center

| Rule ID | Rule |
|---------|------|
| DOC-001 | Employee documents, HR-generated docs, company knowledge, training library |
| DOC-001-a | Telegram `📚 ศูนย์ความรู้`, `📄 เอกสารของฉัน` |
| DOC-001-b | Permissions: employee own docs; secretary company scope; owner all |
| DOC-001-c | Version history (`EmployeeDocumentVersion`); multipart upload; storage driver `local\|s3` |
| DOC-001-d | Audit: `document_uploaded`, `document_replaced`, `document_version_downloaded`, `document_acknowledged` |

### ANN-001 — Announcement & Knowledge Distribution

| Rule ID | Rule |
|---------|------|
| ANN-001 | Company announcements with delivery, open, and acknowledge tracking |
| ANN-001-a | Telegram `📢 ประกาศใหม่` with รับทราบ / เปิดอ่าน |
| ANN-001-b | Audit: `published`, `edited`, `archived`, `opened`, `acknowledged`, `announcement_reminder_sent`, `announcement_overdue`, `announcement_acknowledged_from_reminder` |
| ANN-001-c | Daily Bangkok scheduler: 24h unopened reminder, 72h unacknowledged (when `mustAcknowledge`) |
| ANN-001-d | Dashboard widgets: unopened, unacknowledged, acknowledgement rate, overdue employees |

---

## 3. Access Control

### Business rules

| Rule ID | Rule |
|---------|------|
| AC-001 | Salary visibility **deny-by-default** |
| AC-002 | Owner and Secretary: all employees, all companies |
| AC-003 | Big Leader: all employees in scoped company/companies (company-level) |
| AC-004 | Sub Leader, Employee: own salary only |
| AC-005 | Admin Manager, Admin: own salary only unless UserPermissionOverride |
| AC-006 | Own salary always visible to linked employee |
| AC-007 | Telegram HR self-service requires `TelegramIdentity.status = ACTIVE` |
| AC-008 | Unverified / pending / revoked: no HR menus or AI self-service |
| AC-009 | Verification: employee code + phone → auto-approve on match |
| AC-010 | Alternate: invite code + phone |
| AC-011 | Blocked when inactive/terminated/revoked/pending/deleted |
| AC-012 | Identity admin actions require `security:write` |

### Examples

- Big Leader SB views all SB salaries; not MB.
- Gross misconduct termination flags `LEGAL_REVIEW_REQUIRED` (DISC-002) — access revoked on completion.

### Exceptions

- Unlisted roles: self salary only unless override.

### Owner override rules

- Owner resets/revokes/reactivates Telegram identities.
- Owner grants salary overrides to Admin / Admin Manager only.

---

## 4. Attendance

### Business rules — check-in / late / break

| Rule ID | Rule | Default | Wired |
|---------|------|---------|-------|
| ATT-001 | Employees check in/out via WorkHQ every working day | — | Yes (P0-005 Telegram-first) |
| ATT-002 | Grace period before late penalty | 15 min | Yes |
| ATT-003 | Late penalty: 2 wage-hours per **rounded-up** late hour × hourly rate | 2×/hr | Yes (P0-005) |
| ATT-004 | Unpaid break deducted from worked minutes | 60 min | Yes |
| ATT-005 | Default shift window | 09:00–21:00 | Yes |
| ATT-006 | OT detection gated by `overtimeEnabled` | true | Yes |
| ATT-007 | OT gate: shift end + delay, minimum minutes past shift end | 30 min / 60 min | Yes |
| ATT-008 | Missing check-in/out handling | disallowed | Partial (WDE exception center) |
| ATT-009 | Half-day / full-day absence classification | 4h / 6h | Reserved |

### Work Day Engine (WDE-001) — Foundation Sprint

All attendance/leave/off-day views for operations must resolve through **WorkDayService** central state — not per-page ad hoc logic.

| Rule ID | Rule | Implementation |
|---------|------|----------------|
| WDE-001 | Single work-day state per employee per date | `WorkDayService.getWorkDay` |
| WDE-002 | State priority: leave → monthly off → holiday → attendance → missing punch → scheduled | `workday-state.resolver.ts` |
| WDE-003 | `needsRecalculation` blocks treating payroll preview as final | Payroll preview warning |
| WDE-004 | Command center groups employees by resolved state | `/attendance/command-center` |
| WDE-005 | Telegram employee home shows actions by today state | Telegram 2.0 state UI |

### Business rules — PAY-003 OT (confirmed)

| Rule ID | Rule | Default |
|---------|------|---------|
| PAY-003 | **Approved OT:** ฿50 per hour | ฿50/hr |
| PAY-003a | **Missed meal/break due to workload:** ฿50 per hour | ฿50/hr |
| PAY-003b | **Overrides** all handbook references to 1.5× or 2× OT multipliers | — |
| PAY-003c | OT requires manager approval before payout | — |

### Examples

- Check-in 09:20, grace 15 min → 5 late minutes → **no penalty** (within grace).
- Check-in 09:20, grace 0 min → 20 late minutes → CEIL(20/60)=1 hour → 2 × hourly rate deduction.
- Approved OT 3 hours → 3 × ฿50 = ฿150 on payslip (pending OT excluded until approved).

### Exceptions

- Public holidays do not exist (HOL-001); OT on Dec 31 / Jan 1 follows company special holiday rules if scheduled to work.

### Owner override rules

- Owner / settings admin changes `attendance.rules` including `otHourlyRate`.
- OT approval chain configurable; default Direct Manager.

---

## 5. Work Shifts

### Business rules

| Rule ID | Rule |
|---------|------|
| SH-001 | Standard shift from `shiftStartMinutes` / `shiftEndMinutes` (default 09:00–21:00) |
| SH-001a | Per-employee shift assignments with `effectiveFrom` / `effectiveTo` history (no overwrite) |
| SH-001b | Attendance stores shift snapshot (`shiftId`, `shiftStartAt`, `shiftEndAt`) per work date |
| SH-001c | Late calculation uses effective shift for that date (supports night shift crossing midnight) |
| SH-002 | Admin commission may segment Day / Night shift per cycle |
| SH-003 | Leave shift swap: approved equal-duration leave between same-company employees |
| SH-004 | No general shift roster beyond default attendance shift times |

### Examples

- Admin Day+Night in one cycle → commission per segment; penalties redistribute within shift.

### Exceptions

- HOL-001: employees work every day; monthly off-days substitute for public holidays.

### Owner override rules

- Shift times configurable per company in attendance settings.

---

## 6. Missing From Work & Absence

### Business rules — ABS-001 Absence (confirmed decision ID: ATT-001)

| Rule ID | Rule |
|---------|------|
| ABS-001 | **Absence** means ALL of: (1) not a scheduled off-day, (2) employee does not report to work, (3) no prior approval, (4) cannot be contacted |
| ABS-002 | Absence penalty **Employee:** ฿1,000/day |
| ABS-003 | Absence penalty **Sub Leader:** ฿2,000/day |
| ABS-004 | Absence penalty **Big Leader:** ฿3,000/day |
| ABS-005 | Unauthorized absence without approved leave may be treated as **constructive resignation** (handbook) |

### Business rules — ABS-009 Secretary and Owner (confirmed)

| Rule ID | Rule |
|---------|------|
| ABS-009 | Absence penalty **Secretary:** ฿3,000/day — resolved by **position** (EMP-003), not `roleLevel` fallback |
| ABS-009a | **Owner** position is **exempt** from absence penalties and has **no absence status** — Owner is never flagged, never appears in absence queue, and creates no payroll deduction |
| ABS-009b | Secretary rate is configurable via `leave.rules.absencePenalties.secretary`; Owner exempt is policy-fixed (not a settings rate) |
| ABS-009c | Confirmed penalty rates: Employee ฿1,000 · Sub Leader ฿2,000 · Big Leader ฿3,000 · Secretary ฿3,000 · Owner exempt |

### Business rules — ABS-002 Missing from work (confirmed decision ID: ATT-002)

| Rule ID | Rule |
|---------|------|
| ABS-006 | Employee disappears from work **>15 minutes** without notifying manager |
| ABS-007 | Penalty: **2 labor units per hour**, round up partial hours |
| ABS-008 | Missing punch rules (`missingCheckInAllowed`, `autoCloseMissingCheckOut`) — reserved in settings, not yet enforced |

### Examples

- Employee no-call no-show on working day (not off-day) → absence; ฿1,000 deduction if Employee position.
- Employee leaves desk 40 minutes without notice → 1 hour × 2 labor units (rounded up).

### Exceptions

- Approved leave (including monthly off-day) is not absence.
- Emergency leave with approval is not absence.

### Owner override rules

- Owner adjusts penalty amounts via `leave.rules.absencePenalties` when wired.
- Constructive resignation / absconding determination: management judgment; absconding → no deposit refund (PAY-004).

---

## 7. Leave Policy

### Business rules — HOL-001 Holiday (confirmed)

| Rule ID | Rule |
|---------|------|
| HOL-001 | **No public holiday system** |
| HOL-002 | Employees work **every day** |
| HOL-003 | **Monthly off-days** used instead of public holidays |
| HOL-004 | **Special company holidays:** 31 December, 1 January |
| HOL-005 | Special company holidays treated per company schedule (off-day or worked with OT per PAY-003 if applicable) |

### Business rules — monthly off-days & personal leave

| Rule ID | Rule | Default |
|---------|------|---------|
| LV-001 | Personal leave entitlement | 3 days/year (handbook) |
| LV-002 | Personal leave advance notice | ≥1 business day (handbook) |
| LV-003 | Personal leave >3 days: manager + HR approval | — |
| LV-004 | **Monthly off-day entitlement** | **4 days/month** (PAY-002) |
| LV-005 | **Expected minimum off-day usage** | **2 days/month** (PAY-002) |
| LV-006 | Sick leave certificate after | 1 day (settings; not enforced) |
| LV-007 | Sick leave adjacent to off-day requires certificate | true (not enforced) |
| LV-008 | Unpaid leave notice | 7 days (reserved; not enforced) |
| LV-009 | Split full-day leave | not allowed |
| LV-010 | Consecutive leave penalty | base 2 days + 5 labor units (not implemented) |

### Business rules — PAY-002 Leave bonus (confirmed)

| Rule ID | Rule | Default |
|---------|------|---------|
| PAY-002 | **Unused leave bonus rate** | ฿600 per eligible day |
| PAY-002a | **Normal maximum** | ฿1,200/month |
| PAY-002b | **Formula:** `eligibleBonusDays = max(0, min(2, 4 - usedOffDays))` | — |
| PAY-002c | **Bonus amount:** `eligibleBonusDays × 600` | — |
| PAY-002d | **Owner override allowed** (may exceed normal cap) | — |

### Examples

- Employee uses 2 off-days → eligibleBonusDays = min(2, 4−2) = 2 → ฿1,200.
- Employee uses 0 off-days → eligibleBonusDays = min(2, 4−0) = 2 → ฿1,200 (not 4 × 600; cap is 2 eligible days).
- Employee uses 4 off-days → eligibleBonusDays = 0 → ฿0.
- No public holiday calendar; employee schedules Dec 31 off-day or works per company instruction.

### Exceptions

- Meal allowance on approved off-day: eligible for OFFICE only (PAY-001).
- Sick / emergency / unpaid leave: not eligible for meal allowance.

### Owner override rules

- Owner approves leave bonus above ฿1,200 cap via payroll API (`overrideApproved=true`).
- Leave rules editable via Settings Engine.

---

## 8. Emergency Leave

### Business rules

| Rule ID | Rule | Default |
|---------|------|---------|
| EL-001 | Emergency leave enabled | true |
| EL-002 | Eligibility: completed probation (manager evaluation per EMP-002) | — |
| EL-003 | Entitlement per half-year (Jan–Jun / Jul–Dec) | 4 days |
| EL-004 | New hire in half-year: ≥3 months remain → 2 days; else → 1 day |
| EL-005 | Requests validated against half-year balance | — |
| EL-006 | Emergency leave approval default: Any Owner | — |
| EL-007 | Emergency reschedule may skip 7-day notice; requires HR approval | — |

### Examples

- Probation not passed (no manager evaluation) → not eligible for emergency leave.

### Exceptions

- Terminated/suspended: not eligible.

### Owner override rules

- Owner approves emergency leave; may disable per company.

---

## 9. Leave Reschedule

### Business rules

| Rule ID | Rule | Default |
|---------|------|---------|
| LR-001 | Max reschedules per approved leave request | 1 |
| LR-002 | Notice before original leave date | 7 days |
| LR-003 | Must keep same duration | true |
| LR-004 | **New start date must be after original end date** (`new_start > original_end`) | true |
| LR-005 | Reason minimum length | 10 characters |
| LR-006 | Approved leave only | — |
| LR-007 | Workflow: pending → approved \| rejected; dates update on approve | — |
| LR-008 | Emergency exception skips notice when `isEmergency=true` | true |
| LR-009 | Approver chain: **Big Leader → Secretary** (2 steps) | WF-005 pattern |

### Examples

- Original Mar 10–12 → earliest new start Mar 13.
- Mar 11 start rejected (before original end Mar 12).

### Exceptions

- Emergency reschedule: notice waived; approver chain unchanged.

### Owner override rules

- Owner adjusts notice/max reschedules via leave settings.
- Owner edits approval matrix.

---

## 10. Leave Swap

### Business rules

| Rule ID | Rule | Default |
|---------|------|---------|
| LS-001 | Swap approved equal-duration leave between two employees | — |
| LS-002 | Same company required | — |
| LS-003 | Cannot swap with self | — |
| LS-004 | Notice before earliest leave date | 7 days |
| LS-005 | Partner consent required | true |
| LS-006 | Management approval required | true |
| LS-007 | Workflow: partner agree → **Big Leader → Secretary** | — |

### Examples

- Employee A Mar 5 ↔ Employee B Mar 12, both 1-day, submitted Feb 25 → valid.

### Exceptions

- `POLICY_NOT_DOCUMENTED`: cross-department swap restrictions beyond same company.

### Owner override rules

- Notice days configurable via `shiftSwapNoticeDays`.

---

## 11. Payroll

### Business rules

| Rule ID | Rule |
|---------|------|
| PR-001 | Payroll cycle: **25th to 24th** of following month |
| PR-002 | Payslip via WorkHQ Payroll menu / Telegram (self-only) |
| PR-003 | Cycle lifecycle: open → items → lock → payslip |
| PR-004 | Salary proration for partial periods |
| PR-005 | Builder aggregates: salary, meal (PAY-001), OT (PAY-003), missed meal/break (PAY-003a), late deduction, leave bonus (PAY-002), deposit (PAY-004), commission, deductions (WF-004), advance recovery (PAY-005) |
| PR-006 | Late deductions from attendance records |
| PR-007 | Manual commission entry (HR mode): `marketing_manual`, `sales_manual`, `other_manual` |
| PR-008 | Manual commission requires employeeId, companyId, payrollCycleId, amount, commissionType, reason |
| PR-009 | **Advance pay recovery:** automatically deducted from **next payroll cycle** (PAY-005) |

### Business rules — PAY-005 Advance pay (confirmed)

| Rule ID | Rule |
|---------|------|
| PAY-005 | Advance pay requests **approver: Owner** |
| PAY-005a | Recovery: automatic deduction next payroll cycle |

### Examples

- Owner-approved advance ฿5,000 in April cycle → deducted automatically in May cycle.

### Exceptions

- Marketing commission calculation outside WorkHQ HR scope in HR mode.

### Owner override rules

- Owner locks/paid cycles; approves advances.

---

## 12. Meal Allowance

### Business rules — PAY-001 (confirmed)

| Rule ID | Rule | Default |
|---------|------|---------|
| PAY-001 | **Rate:** ฿100 per day | ฿100 |
| PAY-001a | **Eligible:** working day (check-in) | — |
| PAY-001b | **Eligible:** approved **monthly off-day** | — |
| PAY-001c | **Not eligible:** sick leave | — |
| PAY-001d | **Not eligible:** emergency leave | — |
| PAY-001e | **Not eligible:** unpaid leave | — |
| PAY-001f | **Not eligible:** absence (ABS-001) | — |
| PAY-001g | **OFFICE** (`EMP-001`): eligible | — |
| PAY-001h | **WFH** (`EMP-001`): **not eligible** | — |
| PAY-001i | **Amount:** eligibleDays × rate | — |

### Examples

- OFFICE employee: 20 check-in days + 2 approved off-days → 22 × ฿100 = ฿2,200.
- WFH employee: ฿0 regardless of attendance.
- Sick leave day: excluded even if check-in attempted.

### Exceptions

- None.

### Owner override rules

- Rate configurable via `payroll.rules.mealAllowancePerDay`.

---

## 13. Deposit

### Business rules — PAY-004 (confirmed)

| Rule ID | Rule | Default |
|---------|------|---------|
| PAY-004 | **Monthly deduction** | ฿500 |
| PAY-004a | **Maximum balance** | ฿3,000 |
| PAY-004b | Deduction may be **delayed to a later month** if net pay after deposit would fall below `minimumNetPayAfterDeposit` | `deposit.rules.minimumNetPayAfterDeposit` |
| PAY-004c | **Deposit may be used for:** property damage, lost equipment, cash shortage, other company losses | — |
| PAY-004d | **Resignation per company process:** return **full deposit** | — |
| PAY-004e | **Absconding:** **no deposit refund** | — |
| PAY-004f | **Gross misconduct (DISC-002):** **no deposit refund** | — |
| PAY-004g | Deduction stops at cap | — |
| PAY-004h | **One deposit balance per employee** (not per company) | — |
| PAY-004i | Deposit ledger **records which company collected** each deduction amount | — |
| PAY-004j | On exit, refund is paid by the **company that collected** the deposit (non-transferable) | — |
| PAY-004k | **Rehire starts a new deposit cycle** — prior balance settled at exit before rehire | — |
| PAY-004l | Loss claims **above deposit balance** are **owner case-by-case** — no automatic debt module | — |

### Examples

- 6 months × ฿500 = cap ฿3,000 → month 7 no deduction.
- Proper resignation with asset return → full ฿3,000 refund from the company that collected it.
- Employee moves from SB to MB; resigns later → refund sourced from SB ledger entries only.
- Rehire after proper exit → new ฿0 balance; monthly deductions restart.
- Loss claim ฿4,000 with ฿3,000 deposit → owner decides remaining ฿1,000 outside system (no auto debt).

### Exceptions

- Performance-failure termination (DISC-001): deposit **refunded**.

### Owner override rules

- Owner/settings admin changes amounts, cap, enabled flag.
- Owner authorizes deposit retention for documented losses (PAY-004c).

---

## 14. Commission

### 14A Marketing Commission

| Rule ID | Rule |
|---------|------|
| COM-MKT-001 | Team Pool = 10% Net Profit |
| COM-MKT-002 | Net Profit formula per KB |
| COM-MKT-004/005 | Ramp schedule M1 0% … M6+ 100% |
| COM-MKT-006 | KPI 24 candidates |
| COM-MKT-007 | Big Leader KPI exempt |
| COM-MKT-012 | Big Leader Bonus 5% Leader Base |
| COM-MKT-CF | Carry forward max 1 month |
| COM-MKT-HOLD | Hold blocks payout until HR release |
| COM-MKT-PAY | Cycle 25th–24th |

**HR mode:** calculation hidden; manual payroll entry.

### 14B Admin Commission

| Rule ID | Rule |
|---------|------|
| COM-ADM-001 | Pool 2% Net Profit (A 1% + B 1%) |
| COM-ADM-002 | Pool A all Admin; Pool B Front Office only |
| COM-ADM-008 | Normal leave allowance 4 days/cycle |
| COM-ADM-009 | Extra leave penalty tiers |
| COM-ADM-010 | Day/Night shift segments |
| COM-ADM-011 | Resigned before payout → zero; prorate by days worked |

### Business rules — commission & probation (EMP-002)

| Rule ID | Rule |
|---------|------|
| EMP-002 | Passing probation requires **manager evaluation** — **not automatic** |
| EMP-002a | During probation: **full salary** |
| EMP-002b | During probation: **monthly off-days** apply |
| EMP-002c | During probation: **commission eligibility depends on department rules** |

### Examples

- Marketing employee on probation: commission per marketing department rules if manager evaluation passed.
- Performance-failure termination: eligible commission paid (DISC-001).

### Exceptions

- Gross misconduct: no commission (DISC-002).

### Owner override rules

- HR override marketing ramp.
- Commission adjustment: Big Leader → Owner (Marketing) or Secretary → Owner (Admin) per WF-002.

---

## 15. Recruitment & Referral

### Hiring pipeline

| Rule ID | Rule |
|---------|------|
| RC-001 | `POLICY_NOT_DOCUMENTED`: formal sourcing, interview, offer standards |
| RC-002 | System supports pipeline, interviews, offers, analytics (API) |

### Business rules — REF-001 Referral (confirmed)

| Rule ID | Rule |
|---------|------|
| REF-001 | **Referral reward:** ฿2,000 |
| REF-001a | **Condition:** referred employee must complete **3 months of employment** |
| REF-001b | **Payment subject to KPI and management discretion** |
| REF-001c | One reward per referred employee; no self-referral |
| REF-001d | Duplicate check before qualify |
| REF-001e | Lifecycle: pending → qualified → paid \| rejected |
| REF-001f | Paid in next payroll cycle after qualification and approval |

### Examples

- Referred employee completes 3 months → qualifies; Big Leader / management confirms KPI → ฿2,000 in next cycle.
- Referred employee terminated at 2 months → does not qualify.

### Exceptions

- Management may withhold payment despite tenure if KPI/discretion not met (REF-001b).

### Owner override rules

- Owner/HR may override duplicate block.
- Reward amount configurable via `referral.rules`.

---

## 16. Performance Reviews

| Rule ID | Rule | Default |
|---------|------|---------|
| PF-001 | Grade thresholds A≥90 B≥75 C≥60 D≥50 F<50 | scoring config |
| PF-002 | Min months for promotion readiness | 12 |
| PF-003 | Suggested salary increase A 10%, B 5% | — |
| PF-004 | Dimensions: attendance, recruitment, discipline, manager_review, owner_review | — |
| PF-005 | Probation pass requires manager evaluation (EMP-002) — linked to performance/probation review | — |
| PF-006 | `POLICY_NOT_DOCUMENTED`: review cycle frequency, weights, notifications | — |

### Examples

- Probation end: manager evaluation required before `active` status and full referral/emergency leave eligibility.

### Exceptions

- Scoring thresholds not yet in HR settings.

### Owner override rules

- Owner finalizes performance cycles.

---

## 17. Disciplinary Policy

### POL-025 — Disciplinary warning ladder (implemented)

| Rule ID | Rule | Code value |
|---------|------|------------|
| DISC-001 | **Verbal warning** (ตักเตือนด้วยวาจา) | `verbal_warning` |
| DISC-002 | **Warning 1** | `warning_1` |
| DISC-003 | **Warning 2** | `warning_2` |
| DISC-004 | **Termination** (เลิกจ้าง) — stores `termination_reason`, `termination_note` | `termination` |
| DISC-005 | **Warnings never expire** — no expiry fields; records permanent | — |

**Workflow:** create record → employee notified (Telegram) → employee acknowledges (รับทราบ) → stored permanently.

**Permissions:** Owner (full); Secretary (Admin/HR/Finance scope); Big Leader (Marketing scope); Employee (read/acknowledge own records only).

**Severe misconduct:** Company may skip warning levels (e.g. fraud, theft, company data disclosure, document forgery, drug use, working for competitors, serious company damage).

### Business rules — handbook conduct

| Rule ID | Rule |
|---------|------|
| DISC-C003 | No disclosure of confidential company/customer information |
| DISC-C004 | Prohibited: asset misuse, harassment, discrimination |

### Business rules — exit termination settlement (POL-004 cross-ref)

Settlement sub-rules use letter suffixes distinct from warning ladder DISC-001–003:

| Rule ID | Rule |
|---------|------|
| DISC-001d | **Performance failure exit:** deposit refunded (PAY-004d, RS-007) |
| DISC-002 | **Gross misconduct category** (exit reason): fraud, theft, document forgery, working for competitors, drug use, serious company damage, confidentiality breach |
| DISC-002a | **No salary payment** |
| DISC-002b | **No commission payment** |
| DISC-002c | **No deposit refund** |
| DISC-002d | **Flag:** `LEGAL_REVIEW_REQUIRED` |

Performance failure exit settlement (RS-007): salary by days worked, eligible commission, leave bonus if eligible, deposit refunded.

### Examples

- Verbal warning for tardiness → employee acknowledges via Telegram; record permanent.
- Theft confirmed → skip to termination (DISC-004); exit settlement applies DISC-002a–d.
- Performance failure after probation → prorated salary, commission owed, deposit returned (DISC-001d / RS-007).

### Exceptions

- Grievance: 14-day investigation, 7-day appeal (handbook).

### Owner override rules

- Owner sign-off on gross misconduct termination and LEGAL_REVIEW_REQUIRED cases.
- Owner may skip warning levels for severe misconduct.

---

## 18. Warning System

| Rule ID | Rule |
|---------|------|
| WS-001 | Implemented via POL-025 DISC-001–004 warning ladder |
| WS-002 | Warning 1/2 system — **implemented** (DISC-002, DISC-003) |
| WS-003 | Expiry — **not applicable** (DISC-005: warnings never expire) |

### Examples

- Absence ABS-001 may trigger written warning before termination.

### Exceptions

- Commission leave penalties are financial, not warning records.

### Owner override rules

- Planned configurable escalation via settings (HR-14).

---

## 19. Resignation & Exit

| Rule ID | Rule |
|---------|------|
| RS-001 | Unauthorized absence may be constructive resignation / absconding |
| RS-002 | Resigned before commission payout date → no admin commission |
| RS-003 | **Proper resignation (company process):** full deposit refund (PAY-004d) |
| RS-004 | **Absconding:** no deposit refund (PAY-004e) |
| RS-005 | **Gross misconduct exit:** no deposit refund (DISC-002) |
| RS-006 | Exit checklist: return assets (ASSET-001), clear debt, deposit settlement, final payroll, access revoke |
| RS-007 | Performance failure exit: DISC-001 settlement rules |
| RS-008 | **Exit case approval routing:** Marketing department → Big Leader → Owner; Admin / HR / Finance → Secretary → Owner |

### Business rules — ASSET-001 (confirmed)

| Rule ID | Rule |
|---------|------|
| ASSET-001 | Track company assets assigned to employees |
| ASSET-001a | Asset types: notebook, phone, SIM, access card, keys |
| ASSET-001b | Maintain **employee asset list** and **company asset register** |
| ASSET-001c | Used during **resignation** and **deposit review** (PAY-004c) |

### Examples

- Resignation: all assets returned → deposit review → full refund if no damage claims.
- Lost notebook at exit → deposit applied toward loss per PAY-004c.

### Exceptions

- `POLICY_NOT_DOCUMENTED`: notice period, resignation letter format.

### Owner override rules

- Owner initiates termination; orchestrates exit checklist.

---

## 20. Approval Matrix

### Business rules — WF-001 to WF-005 (confirmed)

| Rule ID | Workflow | Created by | Approver chain | Min approvals |
|---------|----------|------------|----------------|---------------|
| WF-001 | **Salary adjustment — Marketing** | — | **Big Leader → Owner** | 2 |
| WF-001a | **Salary adjustment — Admin Dept** | — | **Secretary → Owner** | 2 |
| WF-002 | **Commission adjustment — Marketing** | — | **Big Leader → Owner** | 2 |
| WF-002a | **Commission adjustment — Admin Dept** | — | **Secretary → Owner** | 2 |
| WF-003 | **Special bonus** | Big Leader, Secretary | **Owner** | 1 |
| WF-004 | **Deduction items** | Big Leader, Secretary | **None** (no approval workflow) | 0 |
| WF-005 | **Personal data change** | Employee | **Highest manager of department:** Marketing → Big Leader; Admin → Secretary | 1 |

| Rule ID | Workflow | Approver chain | Notes |
|---------|----------|----------------|-------|
| WF-L01 | Off day / general leave | Big Leader | 1 |
| WF-L02 | Sick / emergency / unpaid leave | Any Owner | 1 |
| WF-L03 | Leave reschedule / shift swap | Big Leader → Secretary | 2 |
| WF-L04 | OT request | Direct Manager | 1 |
| WF-P01 | **Advance payment (PAY-005)** | **Owner** | 1 |
| WF-P02 | Payroll adjustment (legacy) | Secretary → Owner | 2 — align to department rules |

| Rule ID | Rule |
|---------|------|
| AM-001 | Admin hierarchy override: Admin/Admin Manager requests → Secretary; Secretary → Owner |
| AM-002 | Matrix editable via `/workflow/approval-matrix` |
| AM-003 | Delegation supported |

### Examples

- Marketing employee salary change: Big Leader approves → Owner approves.
- Admin employee bank change: Secretary approves (WF-005).
- Big Leader creates deduction for team member: no workflow (WF-004).
- Secretary creates special bonus: Owner approves (WF-003).

### Exceptions

- Production seed may not yet reflect WF-001–005; policy is authoritative.

### Owner override rules

- Owner edits matrix; may use workflow override action.

---

## 21. Telegram Self-Service

| Rule ID | Rule |
|---------|------|
| TG-001 | Active identity required |
| TG-002 | Employee menu: attendance, leave, payslip, commission, referral, AI |
| TG-003 | Leave: new request, reschedule (shift swap not in menu) |
| TG-004 | Leader menu: approve leave, OT, team dashboard |
| TG-005 | Reschedule approval path hidden from leader menu (implementation gap) |
| TG-006 | Big Leader marketing overview requires root team assignment |
| TG-007 | Owner dashboard |
| TG-008 | Attendance confirm step |
| TG-009 | Payslip self-only |
| TG-010 | AI read-only, permission-gated |
| TG-011 | Marketing menus hidden when `MARKETING_ENABLED=false` |

### Examples

- Verified employee requests off-day leave → Big Leader approval (WF-L01).

### Exceptions

- AI permission gaps post-onboarding (implementation).

### Owner override rules

- HR revokes/resets Telegram identity.

---

## 22. Finance & P&L

| Rule ID | Rule |
|---------|------|
| FN-001 | Marketing Net Profit formula (COM-MKT-002) |
| FN-002 | Promotion expense if GP > 500,000 |
| FN-003 | Company Head deduction 40% |
| FN-004 | Admin commission 2% Net Profit |
| FN-005 | Referral via payroll (REF-001) |
| FN-006 | Advance: Owner approval; next-cycle recovery (PAY-005) |
| FN-007 | Deposit refunds via finance module; tied to PAY-004d/e/f |
| FN-008 | Deposit claims for losses (PAY-004c) |
| FN-009 | `POLICY_NOT_DOCUMENTED`: non-marketing expense approval |

### Examples

- Advance ฿10,000 approved → recovery line item next cycle.

### Exceptions

- HR mode: marketing P&L external.

### Owner override rules

- Owner approves advances, special bonuses, commission adjustments.

---

## 23. Company Reserved Rights

| Rule ID | Rule |
|---------|------|
| CR-001 | Handbook compliance required |
| CR-002 | Grievance: 14 business days investigation; 7-day appeal |
| CR-003 | Complainant confidentiality |
| CR-004 | HR may override marketing commission ramp |
| CR-005 | HR/Owner may override referral duplicate block |
| CR-006 | Business rules configuration-driven via Settings Engine |
| CR-007 | Management discretion on referral payment (REF-001b) |
| CR-008 | Deposit retention for documented losses (PAY-004c) |
| CR-009 | `LEGAL_REVIEW_REQUIRED` on gross misconduct (DISC-002) |
| CR-010 | `POLICY_NOT_DOCUMENTED`: legal jurisdiction, policy amendment clause |

### Examples

- Owner withholds referral payment despite 3 months tenure per KPI discretion (REF-001b).

### Exceptions

- KB advisory where superseded by POL-001A confirmed decisions.

### Owner override rules

- Owner: settings write, permission write, approval override, LEGAL_REVIEW_REQUIRED sign-off.

---

## Appendix A — Conflicts requiring decision

| ID | Topic | Status |
|----|-------|--------|
| ~~C-001~~ | OT rate handbook vs flat ฿50 | **RESOLVED** — PAY-003 |
| ~~C-002~~ | Reschedule forward date | **RESOLVED** — LR-004 (`original_end`) |
| ~~C-004~~ | Referral 3 months vs 90 days | **RESOLVED** — REF-001 (3 months employment) |
| ~~C-005~~ | monthlyOffDays dual store | **RESOLVED interim** — LV-004 + COM-ADM-008 (sync required; unify later) |
| ~~C-006~~ | Reschedule approver | **RESOLVED** — LR-009 / WF-L03 |
| C-003 | General leave notice when enforcement ships | **OPEN** — personal leave 1 day confirmed (LV-002); off-day/sick/unpaid TBD |

---

## Appendix B — Policy not documented (gap register)

| Domain | Missing policy |
|--------|----------------|
| Recruitment | RC-001 formal hiring stages |
| Performance | PF-006 review calendar/weights |
| Warnings | WS-003 Warning 1/2/3 definitions |
| Resignation | Notice period, resignation letter |
| Legal | CR-010 jurisdiction, amendment clause |
| Finance | FN-009 non-marketing expense approval |
| Absence penalties | **ABS-009 resolved** — Employee ฿1,000 · Sub Leader ฿2,000 · Big Leader ฿3,000 · Secretary ฿3,000 · Owner exempt (no absence status) |
| Deposit balance model | **PAY-004h–l** — one balance per employee; per-collector ledger; rehire new cycle; no auto debt above balance |

---

## Appendix C — POL-001A confirmed decision register

| Decision ID | Title | Master policy rule IDs |
|-------------|-------|------------------------|
| ORG-001 | Organization structure | ORG-001–ORG-008 |
| EMP-001 | Employee model | EMP-001–EMP-005, BR-011 |
| HR-013b | Employee date events & tenure | EMP-006–EMP-009, HR-013b |
| HR-013c | Employee recognition & gift tracking | EMP-009, HR-013c |
| SEC-001 | Employee access audit | SEC-001 |
| EMP-010 | Probation review workflow | EMP-010 |
| EMP-002 | Probation | EMP-002, EMP-002a–c, PF-005, EL-002 |
| PAY-001 | Meal allowance | PAY-001–PAY-001i |
| PAY-002 | Leave bonus | PAY-002–PAY-002d, LV-004, LV-005 |
| PAY-003 | OT & missed meal/break | PAY-003–PAY-003c, ATT-006–007 |
| PAY-004 | Deposit | PAY-004–PAY-004g, RS-003–RS-005 |
| PAY-005 | Advance pay | PAY-005, PAY-005a, PR-009, WF-P01 |
| ATT-001 | Absence | ABS-001–ABS-005 |
| ATT-002 | Missing from work >15 min | ABS-006–ABS-007 |
| REF-001 | Referral program | REF-001–REF-001f |
| DISC-001 | Performance failure termination | DISC-001–DISC-001d, RS-007 |
| DISC-002 | Gross misconduct | DISC-002–DISC-002d, CR-009 |
| WF-001 | Salary adjustment | WF-001, WF-001a |
| WF-002 | Commission adjustment | WF-002, WF-002a |
| WF-003 | Special bonus | WF-003 |
| WF-004 | Deduction items | WF-004 |
| WF-005 | Personal data change | WF-005 |
| ASSET-001 | Asset register | ASSET-001–ASSET-001c |
| HOL-001 | Holiday policy | HOL-001–HOL-005 |
| AI-001 | Knowledge Assistant | Policy-grounded Q&A with citations; salary visibility rules; query audit log |
| TRAIN-001 | Training & learning | Mandatory courses, quizzes, completion audit |
| ANALYTICS-001 | HR executive analytics | Daily snapshots; owner dashboard; Telegram HR summary |
| AUDIT-002 | Audit explorer | Searchable audit log with role scope and salary redaction |
| OPS-001 | Operations console | Owner-only health checks and support actions (audited) |
| UX-001 | Button-based employee forms | Predefined Telegram/Web pickers; summary before submit; form error audit |

---

*End of WORKHQ_MASTER_POLICY_V1.md*
