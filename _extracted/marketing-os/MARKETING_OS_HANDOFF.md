# MarketingOS Handoff Document

**Archive date:** 2026-06-22  
**Source repo:** WorkHQ monolith (`workhq-full`)  
**Archive location:** `_extracted/marketing-os/`  
**Purpose:** Preserve all Marketing-related code, schema, tests, and docs for a future standalone MarketingOS rebuild. **HR codebase is unchanged.**

---

## 1. Business Model

MarketingOS supports **direct-response / performance marketing operations** inside a multi-company HR platform:

1. **Field marketers** submit daily performance reports (contacted, new members, deposits, started work).
2. **Team leaders** review KPI, expenses, and team structure (root → sub-team hierarchy with big leader / sub leader roles).
3. **Finance/operations** tracks marketing expenses by category (line OA, telesales, promotion, etc.).
4. **Commission engine** calculates team pool + big leader share from net profit, KPI achievement (default 24 started-work candidates), new-hire ramp schedules, carry-forward, and redistribution.
5. **Back office** finalizes commission cycles, creates payroll items (via HR payroll schema), handles adjustments through workflow, and collects employee commission method declarations (Telegram onboarding).
6. **Executive layer** provides company-wide marketing insights, ROI, risk alerts, forecasts, and commission executive dashboards.

Marketing commission is **not HR payroll logic** — it is marketing operations compensation that **exports results** into HR payroll cycles.

---

## 2. Current Implemented Features

### 2.1 Marketing Operations (`marketing` module)

| Feature | API prefix | Description |
|---------|------------|-------------|
| Daily reports | `/api/v1/marketing/daily-reports` | CRUD, submit/approve/reject/void, employee `me` view |
| Back-office reports | `/api/v1/marketing/reports` | List, detail, approve/reject, audit trail |
| KPI | `/api/v1/marketing/kpi` | Me / team / company / review aggregation |
| Expenses | `/api/v1/marketing/expenses` | CRUD, submit/approve, summary by category |
| Teams | `/api/v1/marketing/teams` | Org tree, members, big/sub leader assignment, transfers |
| Cycle locks | `/api/v1/marketing/cycles` | Lock/unlock earn cycle for commission calculation |
| Insights | `/api/v1/marketing/insights` | Performance insights, alerts, forecast, team comparison |
| Audit | `/api/v1/marketing/audit` | Report audit history |

**Telegram (employee-facing):**

- Submit daily report FSM (`marketing:enter_*`)
- View latest report, personal KPI
- Submit marketing expenses
- Team KPI / team expenses (leaders)
- Company marketing overview (big leader)

### 2.2 Marketing Commission (`commission` module)

| Feature | API prefix | Description |
|---------|------------|-------------|
| Calculate & finalize | `/api/v1/commission/marketing` | Calculate cycle, finalize → payroll items |
| Unified cycles | `/api/v1/commission/cycles` | Approve, finalize, lock, preview |
| Adjustments | `/api/v1/commission/adjustments` | Workflow-backed post-lock corrections |
| Declarations | `/api/v1/commission/declarations` | Multi-assignment commission method onboarding |
| Admin commission | `/api/v1/commission/admin` | Back-office admin pool A/B calculation |
| Legacy accrual | `/api/v1/commission` | `CommissionRecord` accrual/hold/split (candidate-based) |

**Telegram (owner-facing):**

- Commission dashboard, cycle list, preview/approve/finalize/lock
- Adjustment list, approve, history
- Executive brief (today/yesterday/MTD)

### 2.3 Rule Configuration (`settings` module)

| Feature | API prefix | Description |
|---------|------------|-------------|
| Marketing commission rules | `/api/v1/settings/commission/marketing` | Versioned DB config (KPI target, pool %, ramp, carry-forward) |
| Admin commission rules | `/api/v1/settings/commission/admin` | Pool A/B %, leave penalty tiers |

Requires `reporting:owner` permission.

### 2.4 Reporting & Executive

| Feature | API prefix | Description |
|---------|------------|-------------|
| Company dashboards | `/api/v1/reporting/*` | Mixed HR + marketing metrics |
| Executive insight | `/api/v1/executive/*` | Cross-domain executive summaries |
| Commission executive dashboard | (via reporting service) | Marketing commission cycle KPIs for owners |

### 2.5 AI Marketing Manager / Executive Copilot

Single `/api/v1/ai/chat` endpoint with tool packs filtered by permissions.

**Marketing tools** (see `backend/.../ai/domain/tools/tool-definitions.ts`):

- `get_my_marketing_kpi`, `get_my_latest_marketing_report`, `get_my_marketing_expenses`
- `get_team_marketing_kpi`, `get_company_marketing_kpi`, expense summaries
- `get_marketing_report_audit`, ROI, insights, forecast, risk, team comparison
- `get_commission_dashboard`, cycle status, preview, adjustments
- `get_executive_*`, profit ranking, team performance rankings

---

## 3. Rules & Calculation Logic

### 3.1 Marketing commission (COM-MKT-001 … COM-MKT-012)

Implemented in `commission/domain/services/marketing-commission-calculation.service.ts`:

| Rule | Default | Configurable via RuleConfig |
|------|---------|----------------------------|
| KPI target (started work count) | 24 | Yes |
| Team pool rate | 10% of net profit | Yes (`teamPoolPercent`) |
| Big leader rate | 5% of net profit | Yes (`bigLeaderPercent`) |
| Company head deduction | 40% of profit after expenses | Yes |
| Promotion expense threshold | 500,000 THB gross | Yes |
| New hire ramp | 0/20/20/30/40% months 1–5 | Yes |
| Carry-forward max | 1 month | Yes |

**Net profit pipeline:**

```
grossProfit
  − employeeSalaryExpense − marketingExpense − lineExpense − telesalesExpense
  − promotionExpense (conditional on threshold)
  → profitAfterExpenses
  − companyHeadDeduction (40%)
  → netProfit
  → teamCommissionPool (10%) + bigLeaderCommission (5%)
```

**Member payout factors:**

- `achievedCandidates` from approved daily reports (`startedWorkCount`)
- Ramp % by tenure month (or `BIG_LEADER_SPLIT` declaration override)
- Approved commission declarations required (TEAM_POOL / BIG_LEADER_SPLIT only)
- Carry-forward for under-KPI amounts; redistribution for ramp difference / expired carry

### 3.2 Admin commission

Pool A/B percentages, leave penalty tiers based on excess leave days — see `admin-commission-calculation.service.ts`.

### 3.3 Commission declarations

Employees declare per company/team assignment:

- Types: PRIMARY / SECONDARY
- Methods: TEAM_POOL, BIG_LEADER_SPLIT, NONE, UNSURE
- BIG_LEADER_SPLIT: leader % + employee % (must total 100%)
- Workflow: SUBMITTED → HR_REVIEW → APPROVED | REJECTED
- **Only APPROVED** declarations affect commission engine

---

## 4. Data Models (Prisma)

Schema file: `prisma/schema.prisma` (full copy in archive). PostgreSQL schemas:

### 4.1 `marketing` schema

| Model | Purpose |
|-------|---------|
| `MarketingDailyReport` | Daily metrics: contacted, newMember, deposit, startedWork |
| `MarketingReportAuditLog` | Audit trail for report changes |
| `MarketingCycleLock` | Lock earn cycle before commission calc |
| `MarketingExpense` | Categorized expenses per earn cycle |
| `MarketingTeam` | Root/sub team hierarchy |
| `MarketingTeamMember` | Employee role on team (big_leader, sub_leader, member) |

### 4.2 `commission` schema (MarketingOS-owned)

| Model | Purpose |
|-------|---------|
| `MarketingCommissionCycle` | Calculation run per team/earn cycle |
| `MarketingCommissionMemberResult` | Per-employee payout breakdown |
| `MarketingCommissionCarryForward` | Pending carry amounts |
| `MarketingCommissionRedistribution` | Ramp diff / expired carry redistribution |
| `AdminCommission*` | Admin back-office commission cycles |
| `CommissionCycle` | Unified finalization wrapper |
| `CommissionAdjustment*` | Post-lock corrections |
| `CommissionDeclaration*` | Employee commission method declarations |
| `CommissionRecord/Hold/Split` | Legacy candidate accrual (recruitment-linked) |

### 4.3 Cross-schema references

- `MarketingTeamMember.employeeId` → `employee.Employee`
- `MarketingCommissionMemberResult` → payroll via `PayrollItem` (created in commission repo)
- `CommissionDeclaration.employeeId` → `employee.Employee`

### 4.4 Migrations (in archive)

| Migration | Content |
|-----------|---------|
| `20260621130000_marketing_commission` | Marketing commission tables |
| `20260621140000_admin_commission` | Admin commission tables |
| `20260621160000_marketing_daily_reports` | Daily reports |
| `20260621170000_marketing_backoffice` | Back-office report views |
| `20260621180000_marketing_expenses` | Expenses |
| `20260621190000_marketing_organization` | Teams |
| `20260621200000_commission_finalization` | Unified cycles |
| `20260621210000_commission_adjustment` | Adjustments |
| `20260621220000_rule_config` | RuleConfigProfile/Version |
| `20260622100000_commission_declarations` | Declarations |

---

## 5. API Surface (Complete List)

All routes prefixed with `/api/v1/` in production.

### Marketing

```
POST   marketing/daily-reports
PATCH  marketing/daily-reports/:id
POST   marketing/daily-reports/:id/submit|approve|reject|void
GET    marketing/daily-reports/me

GET    marketing/reports
GET    marketing/reports/:id
PATCH  marketing/reports/:id
POST   marketing/reports/:id/approve|reject|void
GET    marketing/reports/:id/audit

GET    marketing/kpi/me|team|company|review

POST   marketing/expenses
GET    marketing/expenses/summary
GET    marketing/expenses
GET    marketing/expenses/:id
PATCH  marketing/expenses/:id
POST   marketing/expenses/:id/submit|approve|reject|void

GET    marketing/teams
GET    marketing/teams/tree
GET    marketing/teams/:id
GET    marketing/teams/:id/members
POST   marketing/teams
PATCH  marketing/teams/:id
POST   marketing/teams/:id/deactivate|big-leader|sub-leader|members
DELETE marketing/teams/:id/members/:employeeId

POST   marketing/cycles/:earnCycleId/lock|unlock

GET    marketing/insights
GET    marketing/insights/alerts|forecast|teams

GET    marketing/audit
```

### Commission

```
POST   commission/marketing/calculate
POST   commission/marketing/:cycleId/finalize

GET    commission/cycles
GET    commission/cycles/:id
POST   commission/cycles/:id/approve|finalize|lock
GET    commission/cycles/:id/preview

GET    commission/adjustments
POST   commission/adjustments
GET    commission/adjustments/:id
POST   commission/adjustments/:id/submit|approve|reject|apply

GET    commission/declarations
GET    commission/declarations/summary
POST   commission/declarations/:id/hr-review|approve|reject

POST   commission/admin/calculate
POST   commission/admin/:cycleId/finalize

POST   commission/accrue|process-hold|finalize|split|big-leader  (legacy)
```

### Settings

```
GET/PUT settings/commission/marketing
GET/PUT settings/commission/admin
```

### Executive / Reporting

```
GET    reporting/company/:id/dashboard
GET    reporting/executive/*
GET    executive/summary|risks|forecast|recommendations
```

---

## 6. Telegram Features

| Flow | States / callbacks | Product |
|------|-------------------|---------|
| Daily report submit | `marketing:enter_date` → confirm | MarketingOS |
| Expense submit | `marketing:expense_*` | MarketingOS |
| My KPI / latest report | `marketing:my_kpi`, `marketing:latest_report` | MarketingOS |
| Team KPI / expenses | `marketing:team_kpi`, `marketing:team_expenses` | MarketingOS |
| Company overview | `marketing:company_overview` | MarketingOS |
| Owner commission ops | `owner:commission*`, cycle actions | MarketingOS |
| Executive brief | `owner:executive_brief:*` | MarketingOS Executive |
| Commission declaration onboarding | `onboarding_assign_*`, `declaration_*` | MarketingOS (+ HR employee create) |
| Employee commission summary | `commission:view_summary` | MarketingOS view |

**Key files:** `telegram-bot.service.ts` (~3600 lines, mixed), `telegram-onboarding.service.ts`, `telegram-declaration-correction.service.ts`, `telegram-session.types.ts`.

---

## 7. Web Pages

| Page | Route | Archive path |
|------|-------|--------------|
| Reports list/detail | `/marketing/reports` | `web/src/pages/ReportsPage.tsx` |
| KPI review | `/marketing/kpi` | `KpiReviewPage.tsx` |
| Expenses | `/marketing/expenses` | `ExpensesPage.tsx` |
| Expense dashboard | `/marketing/expenses/dashboard` | `ExpensesDashboardPage.tsx` |
| Teams | `/marketing/teams` | `TeamsPage.tsx` |
| Insights | `/marketing/insights` | `MarketingInsightsPage.tsx` |
| Audit | `/marketing/audit` | `AuditPage.tsx` |
| Commission cycles | `/commission/cycles` | `CommissionCyclesPage.tsx` |
| Adjustments | `/commission/adjustments` | `CommissionAdjustmentsPage.tsx` |
| Declarations | `/commission/declarations` | `commission/CommissionDeclarationsPage.tsx` |
| Executive | `/executive` | `ExecutivePage.tsx` |
| Settings | `/settings/commission/*` | `settings/*CommissionSettingsPage.tsx` |

Nav config: `web/src/layout/nav-config.ts` (mixed HR + marketing groups).

---

## 8. Tests

### Integration (14 specs in archive)

| File | Domain |
|------|--------|
| `marketing-daily-report.integration.spec.ts` | Daily reports |
| `marketing-expense.integration.spec.ts` | Expenses + commission calc |
| `marketing-organization.integration.spec.ts` | Teams |
| `marketing-backoffice.integration.spec.ts` | Back-office reports |
| `marketing-insight.integration.spec.ts` | Insights |
| `marketing-commission.integration.spec.ts` | Calculate/finalize |
| `admin-commission.integration.spec.ts` | Admin pool |
| `commission-finalization.integration.spec.ts` | Cycle workflow |
| `commission-adjustment.integration.spec.ts` | Adjustments |
| `commission-declaration.integration.spec.ts` | Declarations |
| `commission-executive-dashboard.integration.spec.ts` | Executive dashboard |
| `rule-config.integration.spec.ts` | Rule config |
| `executive-insight.integration.spec.ts` | Executive insight |
| `ai-tools.integration.spec.ts` | AI tools (mixed) |

### Unit tests

47+ unit specs across marketing, commission, reporting, AI, telegram modules (copied with source files).

### Shared test helpers

`backend/test/helpers/fixtures.ts` — contains `createMarketingTeamStructure`, `ensureMarketingTeam`, `ensureApprovedCommissionDeclarations`.

---

## 9. Knowledge Base Articles

Seeded in `company-policy-knowledge.seed.ts` / `company-policy-articles.ts`:

**MarketingOS articles:**

- `marketing-commission-pool-structure`
- `marketing-commission-net-profit`
- `marketing-commission-kpi-target`
- `marketing-commission-ramp-schedule`
- `marketing-commission-carry-forward`
- `marketing-commission-big-leader`
- `admin-commission-pool-overview`
- `admin-commission-pool-a-b`
- `admin-commission-leave-penalties`
- `admin-commission-shift-transfer`
- `admin-commission-payout-rules`

---

## 10. Permissions

MarketingOS-relevant permission keys (seeded in `backend/prisma/seed.ts`):

```
marketing:read, marketing:write, marketing:approve, marketing:audit, marketing:lock
commission:read, commission:write
commission:declaration:review, commission:declaration:approve, commission:declaration:reject
reporting:owner, reporting:executive
settings via reporting:owner for rule config
```

---

## 11. Known Coupling with HR

| Coupling | Location | Mitigation for rebuild |
|----------|----------|---------------------|
| Employee master data | All team members, declarations | Read-only EmployeeReference port |
| Payroll item creation | `marketing-commission.prisma.repository.ts` | PayrollExportPort boundary |
| Payroll cycles | Earn/pay cycle resolution | PayrollCycleQueryPort |
| Auth / permissions | Shared JWT + RBAC | Keep shared auth service |
| Workflow engine | Commission adjustments | Shared workflow or duplicate for MarketingOS |
| Telegram single bot | HR + marketing menus combined | Split menus or separate bot |
| Onboarding | Employee create + commission declaration | Split flows |
| AI single assistant | HR + marketing tools | Product-scoped tool packs |
| Organization schema | Company reference | Shared read |
| Recruitment | Legacy `CommissionService.accrue` | Deprecate or move to MarketingOS |

---

## 12. Recommended Future Rebuild Plan

Reference: `docs/PRODUCT_SPLIT_PLAN.md` (also in this archive).

### Phase 1 — Disable marketing in HR (no deletion)

1. Feature flag `MARKETING_ENABLED=false` on HR deployment
2. Hide marketing/commission nav groups in HR web (`VITE_PRODUCT=hr`)
3. Hide marketing Telegram menu items for non-marketing roles
4. Keep APIs active for compatibility

### Phase 2 — Standalone MarketingOS service

1. New NestJS app importing archived modules from this folder
2. Same database initially (marketing + commission schemas)
3. Implement `PayrollExportPort` calling HR API
4. Deploy `marketing-web` SPA from archived pages

### Phase 3 — Physical module relocation

1. Move `commission/` under `marketing-commission/` namespace
2. Split AI tool registry by product
3. Split Telegram menus

### Phase 4 — Optional database separation

Only after boundary ports proven stable.

---

## 13. Archive Structure

```
_extracted/marketing-os/
├── MANIFEST.md              ← file inventory with categories
├── MARKETING_OS_HANDOFF.md  ← this document
├── backend/                 ← NestJS modules (mirrors src paths)
├── web/                     ← React pages & nav
├── prisma/                  ← schema + migrations + seeds
├── tests/                   ← integration tests + fixtures
└── docs/                    ← PRODUCT_SPLIT_PLAN, UAT_FINDINGS
```

---

## 14. Quick Start for Rebuild Team

1. Read `MANIFEST.md` for category A (pure) vs mixed files
2. Start from category **A** (`backend/.../marketing/**`) — 46 files, zero HR logic
3. Add category **C** (`commission/**`) with payroll boundary refactor
4. Wire archived web pages to same API routes
5. Run archived integration tests against new service
6. Do **not** copy HR modules (employee, leave, attendance) — consume via API

---

*This archive is a point-in-time snapshot. HR source of truth remains in the main repo paths listed in MANIFEST.md.*
