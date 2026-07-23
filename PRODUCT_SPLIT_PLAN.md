# WorkHQ Product Split Architecture Plan

**Status:** Architecture plan only — no implementation in this document.  
**Date:** 2026-06-22  
**Scope:** Separate **WorkHQ HR** and **MarketingOS** while keeping one repo, one database, and zero test regressions in early phases.

---

## Executive Summary

WorkHQ today is a single NestJS monolith, one Prisma schema (20 PostgreSQL schemas), one React SPA (`web/`), and one Telegram bot serving HR workflows, marketing operations, commission engines, executive reporting, and a unified AI assistant.

The split is **organizational and product-boundary first**, not a database or auth fork. Marketing commission, KPI, expenses, and insights must live under **MarketingOS**. HR must not own marketing commission logic, but may consume **payroll export results** through a narrow boundary API.

Recommended approach: **phased refactor in one repo**, introduce **`hr-web`** and **`marketing-web`** as separate Vite apps sharing packages, introduce **backend product registries** and **boundary ports**, then physically relocate marketing commission code from `commission/` into `marketing/` without breaking existing HTTP routes until a compatibility window ends.

---

## 1. Current Module Map

### 1.1 Backend modules (`backend/src/modules/`)

| Module | Classification | Notes |
|--------|----------------|-------|
| `employee` | **HR-only** | Core HR master data |
| `attendance` | **HR-only** | Check-in/out, OT, corrections |
| `leave` | **HR-only** | Leave, reschedule, shift swap |
| `payroll` | **HR-only** (with inbound boundary) | Cycles, payslips, salary history; receives commission *outputs* as payroll items |
| `recruitment` | **HR-only** | Candidates, pipeline |
| `referral` | **HR-only** | Employee referral program |
| `knowledge` | **Mixed → split by content** | KB infrastructure shared; articles split HR vs marketing (see §1.4) |
| `marketing` | **Marketing-only** | Teams, daily reports, KPI, expenses, insights, cycle locks, audit |
| `commission` | **Mixed → extract to MarketingOS** | Contains legacy accrual, **all marketing commission**, admin commission, finalization, adjustments, declarations |
| `reporting` | **Mixed → split by dashboard** | Company/attendance/payroll dashboards (HR); executive brief, commission executive dashboard (MarketingOS) |
| `settings` | **Marketing-only today** | `RuleConfig` for `marketing_commission` and `admin_commission` only |
| `ai` | **Mixed → split tool packs** | Single assistant; tools span HR self-service, marketing KPI/expenses, owner commission |
| `telegram` | **Mixed → split menus/flows** | One bot: attendance/leave/payroll + marketing submit/KPI/expense + owner commission ops + onboarding w/ commission declarations |
| `organization` | **Shared** | Company, function, team org chart (referenced by both) |
| `permission` | **Shared** | RBAC, scopes, roles |
| `workflow` | **Shared** | Used by leave, OT, commission adjustments |
| `finance` | **Shared / Executive** | Finance overview; surfaced in owner Telegram + executive AI |
| `performance` | **HR-adjacent** | Not in MarketingOS spec; keep under HR until product decision |
| `asset` | **HR-adjacent** | Asset tracking; keep under HR |
| `training` | **HR-adjacent** | Prisma `training` schema exists; minimal backend module exposure |

### 1.2 Shared infrastructure (not feature modules)

| Path | Classification |
|------|----------------|
| `backend/src/auth/` | **Shared** |
| `backend/src/shared/prisma/` | **Shared** |
| `backend/src/shared/audit/` | **Shared** |
| `backend/src/shared/kernel/` | **Shared** (actor context, company access) |
| `backend/src/shared/payroll/` | **Shared boundary candidate** (`PayrollCycleResolver`) |
| `backend/src/common/` | **Shared** (monitoring, outbox, middleware) |
| `backend/src/config/` | **Shared** |

### 1.3 Prisma schema boundaries (`prisma/schema.prisma`)

PostgreSQL schemas today:

| Schema | Primary product | Classification |
|--------|-----------------|----------------|
| `organization` | Both | **Shared** — Company, Function, Team |
| `employee` | HR | **Shared read** — Employee is referenced by marketing teams |
| `permission` | Both | **Shared** |
| `attendance` | HR | **HR-only** |
| `leave` | HR | **HR-only** |
| `workflow` | Both | **Shared** |
| `payroll` | HR | **HR-owned storage**; marketing writes via boundary |
| `commission` | MarketingOS (+ legacy) | **Marketing-owned domain** — do not split DB yet |
| `marketing` | MarketingOS | **Marketing-only** |
| `recruitment`, `referral` | HR | **HR-only** |
| `performance`, `training`, `assets` | HR | **HR-adjacent** |
| `finance` | Executive | **Shared / Executive** |
| `knowledge` | Both | **Mixed content** |
| `ai` | Both | **Shared storage**; split tool visibility |
| `reporting` | Both | **Mixed snapshots** |
| `telegram` | Both | **Shared channel** |
| `system` | Both | **Shared** (audit, settings, outbox, rule config) |

**Important:** No second database in early phases. Schema names already approximate domain boundaries; `commission` schema tables are overwhelmingly marketing/admin commission, not core HR.

### 1.4 Knowledge base content (seeded articles)

| Article prefix | Product |
|----------------|---------|
| `handbook-*` | WorkHQ HR |
| `leave-reschedule-*` | WorkHQ HR |
| `referral-*` | WorkHQ HR |
| `marketing-commission-*` | MarketingOS |
| `admin-commission-*` | MarketingOS (back-office admin pool) |

Infrastructure (`knowledge` module, RAG, embeddings) stays **shared**; retrieval filters by product tag.

### 1.5 Web app (`web/`)

Single SPA (`workhq-marketing-backoffice`) with **mixed navigation**:

| Nav group | Routes | Product |
|-----------|--------|---------|
| Dashboard | `/dashboard` | **Mixed** — needs product-specific home |
| HR | `/hr/*` | WorkHQ HR |
| Attendance | `/attendance/*` | WorkHQ HR |
| Leave | `/leave/*` | WorkHQ HR |
| Payroll | `/payroll/*` | WorkHQ HR |
| Marketing | `/marketing/*` | MarketingOS |
| Commission | `/commission/*` | MarketingOS |
| Finance | `/finance` | Executive / shared |
| Knowledge | `/knowledge/*` | Mixed (filter by tag) |
| Settings | `/settings/commission/*` | MarketingOS |
| Executive | `/executive` | MarketingOS (Executive Copilot UI) |

**31 page components** — roughly 12 HR, 14 marketing/commission, 5 mixed/settings/executive.

### 1.6 Telegram bot (`backend/src/modules/telegram/`)

| Menu / flow | Product |
|-------------|---------|
| Attendance, leave, payslip, referral | WorkHQ HR |
| `marketing:*` (reports, KPI, expenses) | MarketingOS |
| `commission:view_summary` (employee commission summary) | **Mixed** — marketing commission view |
| `owner:commission*`, cycle finalize/lock | MarketingOS |
| `owner:executive_brief`, company/finance dashboards | MarketingOS Executive |
| `onboarding_*` + `declaration_*` (employee registration + commission declaration) | **Mixed** — HR registration + MarketingOS declaration |
| `ai:chatting` | **Mixed** — route by tool pack |
| Approvals (leave, OT) | WorkHQ HR |

### 1.7 AI tools (`backend/src/modules/ai/domain/tools/tool-definitions.ts`)

~40 tools. Suggested split:

**WorkHQ HR tool pack**

- Employee self-service: `get_my_*` (profile, leave, attendance, payslip, referral)
- Leader HR: `get_team_attendance`, `get_team_leave_requests`, `get_team_ot_requests`
- HR reporting: parts of `get_company_dashboard` (attendance/leave/payroll slices)
- `get_recruitment_summary`

**MarketingOS tool pack**

- `get_my_marketing_kpi`, `get_my_latest_marketing_report`, `get_my_marketing_expenses`
- `get_team_marketing_kpi`, `get_company_marketing_kpi`, expense summaries
- `get_marketing_report_audit`, ROI, insights, forecast, risk, team comparison
- Owner commission: `get_commission_dashboard`, `get_commission_cycle_status`, `get_commission_preview`, adjustments
- Executive: `get_executive_*`, `get_company_profit_ranking`, `get_team_performance_rankings`

**Shared / Executive**

- `get_finance_summary`, `get_payroll_summary`, `get_risk_summary` — assign to Executive Copilot or shared owner tier with explicit product flag

**Currently misplaced in HR Copilot**

- `get_commission_summary`, `get_my_commission`, `get_my_commission_history` — employee-facing **marketing commission**; move visibility to MarketingOS pack (or dual-register with `product=marketing` permission).

### 1.8 Commission module internals (critical mixed surface)

`backend/src/modules/commission/` today:

| Component | Belongs to |
|-----------|------------|
| `CommissionController` + `CommissionService` (accrue/hold/finalize/split, `CommissionRecord`) | **Legacy marketing candidate commission** → MarketingOS |
| `MarketingCommissionController/Service` | **MarketingOS** |
| `AdminCommissionController/Service` | **MarketingOS** (admin back-office pool) |
| `CommissionFinalizationController/Service` | **MarketingOS** |
| `CommissionAdjustmentController/Service` | **MarketingOS** |
| `CommissionDeclarationController/Service` | **MarketingOS** |
| `marketing-commission.prisma.repository` (creates `PayrollItem`) | **MarketingOS** with **Payroll boundary** |

**Dependency graph (today):**

```
CommissionModule → MarketingModule, WorkflowModule, SettingsModule, RecruitmentModule
MarketingModule  → (no CommissionModule import)
TelegramModule   → CommissionModule, MarketingModule, LeaveModule, …
AiModule         → CommissionModule, MarketingModule, ReportingModule, …
ReportingModule  → MarketingModule
PayrollModule    → (no direct CommissionModule import; items created via commission repo)
```

---

## 2. Target Module Map

### 2.1 Proposed backend layout (one repo, logical packages)

```
backend/src/
  products/
    hr/
      hr.module.ts              # aggregates HR feature modules only
    marketing/
      marketing-os.module.ts    # aggregates marketing + commission features
  modules/
    employee/ … attendance/ … leave/ … payroll/ … recruitment/ … referral/   # HR
    marketing/ …                                                              # Marketing data ops
    marketing-commission/   # NEW: moved from commission/ (phase 4)
      application/
      domain/
      interface/http/         # keeps /api/v1/commission/marketing/* aliases initially
    hr-commission/            # OPTIONAL later: only if legacy CommissionRecord stays
    reporting/
      hr/ … executive/ …      # split subfolders, single module initially
    ai/
      hr-assistant/ … marketing-assistant/ …   # split services, shared Claude provider
    telegram/
      hr-bot-menus/ … marketing-bot-menus/ …   # split constants + handlers
  shared/
    auth/ audit/ prisma/ kernel/ payroll-boundary/
```

### 2.2 Target products vs modules

| WorkHQ HR | MarketingOS | Shared |
|-----------|-------------|--------|
| employee, attendance, leave, payroll, recruitment, referral | marketing, marketing-commission*, settings (rule config), marketing insights | organization, permission, workflow, auth, audit, prisma, telegram gateway |
| HR reporting snapshots | executive reporting, commission dashboards | finance (executive read) |
| HR knowledge articles | marketing/admin KB articles | knowledge infra |
| AI HR Assistant (tool pack A) | AI Marketing Manager + Executive Copilot (tool packs B/C) | ai conversation storage |
| hr-web | marketing-web | login, `/auth/me`, company selector |

\*Physical module rename from `commission/` → `marketing-commission/` under `products/marketing/`.

### 2.3 What stays in HR explicitly

- Employee lifecycle (excluding marketing team membership UI — shown in MarketingOS)
- Attendance / leave / payroll cycles and payslips
- Recruitment and referral
- HR handbook knowledge
- HR Telegram flows (attendance, leave, payslip, HR approvals)
- HR back-office pages

### 2.4 What moves to MarketingOS

- All routes under `/marketing/*`
- All routes under `/commission/*` (marketing, admin, cycles, adjustments, declarations)
- `/settings/commission/*`
- `/executive` and commission executive reporting
- Marketing Telegram menus and owner commission operator flows
- Commission declaration onboarding/correction (Telegram `declaration_*`)
- Marketing + commission AI tools
- `RuleConfig` domains: `marketing_commission`, `admin_commission`

---

## 3. Shared Boundary Contracts

Minimal cross-product APIs — implement as **ports** in `backend/src/shared/` (or `shared/boundaries/`).

### 3.1 Required boundary interfaces

| Port | Owner | Consumers | Purpose |
|------|-------|-----------|---------|
| `EmployeeReferencePort` | HR (`employee`) | MarketingOS | Read-only: `employeeId`, `globalId`, name, company, active status |
| `CompanyReferencePort` | Shared (`organization`) | Both | Company list, codes, active flag |
| `PayrollExportPort` | HR (`payroll`) | MarketingOS | **Only** way marketing commission creates payroll items |
| `PayrollCycleQueryPort` | HR (`payroll`) | MarketingOS | Resolve earn/pay cycle IDs (already partially `PayrollCycleResolver`) |
| `AuthActorPort` | Shared (`auth`) | Both | JWT, `/auth/me`, permissions — unchanged |
| `AuditPort` | Shared | Both | Already `AuditService` |
| `NotificationPort` | Shared (`telegram` gateway) | Both | Outbound Telegram messages; no business logic |
| `WorkflowPort` | Shared | Both | Start/approve workflows (commission adjustments use this today) |

### 3.2 Payroll boundary (highest priority)

**Today:** `marketing-commission.prisma.repository.ts` calls `prisma.payrollItem.create()` directly.

**Target:**

```typescript
// shared/payroll/payroll-export.port.ts
export interface PayrollExportPort {
  createCommissionPayrollItem(input: CreatePayrollItemCommand): Promise<{ payrollItemId: string }>;
  findBySourceRef(sourceRefType: string, sourceRefId: string): Promise<string | null>;
}
```

- Implemented by `PayrollModule` (HR owns payroll schema).
- Marketing commission services depend on **port only**.
- Keeps single DB while enforcing product boundary in code.

### 3.3 Employee boundary

Marketing teams reference `employeeId`. MarketingOS must not import `EmployeeService` directly for writes.

- Reads: `EmployeeReferencePort.getByIds()`, `assertActiveEmployee()`.
- Writes to employee master data: HR APIs only.

### 3.4 Compatibility layer for HTTP

During migration, keep existing paths:

| Legacy path | Product | Notes |
|-------------|---------|-------|
| `/api/v1/commission/marketing/*` | MarketingOS | Stable; alias forever or version v2 later |
| `/api/v1/marketing/*` | MarketingOS | Stable |
| `/api/v1/payroll/*` | HR | Stable |
| `/api/v1/employee/*` | HR | Stable |

Add optional header `X-WorkHQ-Product: hr | marketing` for telemetry only (not auth) in phase 1.

---

## 4. Database Schema Boundary

**Phase 0–3: no DB split.**

| Rule | Detail |
|------|--------|
| Single PostgreSQL database | Keep all 20 schemas |
| HR must not query marketing tables directly | Enforce in code review + optional lint rules |
| MarketingOS writes payroll via port | Not direct cross-schema writes except through HR service |
| Foreign keys stay | `MarketingTeamMember.employeeId → Employee` remains |
| Future optional split | `commission` + `marketing` schemas could move to MarketingOS DB; `employee`/`payroll` stay HR — requires FK strategy (IDs only, no cross-DB FK) |

**Schema ownership table:**

| Schema | Owning product | Cross-read allowed |
|--------|----------------|-------------------|
| employee, attendance, leave, payroll, recruitment, referral | HR | Marketing reads employee |
| marketing, commission | MarketingOS | HR reads payroll items created by export |
| organization, permission, workflow, system, telegram, ai, reporting, knowledge | Shared platform | Both |

---

## 5. API Boundary

### 5.1 Route grouping (logical)

```
/api/v1/hr/…           # future prefix (optional); today unprefixed HR routes
/api/v1/marketing/…    # exists
/api/v1/commission/…   # marketing commission — document as MarketingOS
/api/v1/auth/…         # shared
/api/v1/organization/… # shared
/api/v1/ai/…           # shared endpoint; product selected by tool pack / query param
```

**Phase 1:** Document ownership in OpenAPI/README; **no route moves**.

**Phase 4+:** Add `/api/v1/marketing/commission/*` aliases delegating to existing handlers.

### 5.2 Permission domains

Current permission keys mix domains (`commission:*`, `marketing:*`). Split plan:

| Permission prefix | Product |
|-------------------|---------|
| `employee:`, `attendance:`, `leave:`, `payroll:`, `recruitment:`, `referral:` | HR |
| `marketing:`, `commission:`, `commission:declaration:*` | MarketingOS |
| `reporting:executive`, `reporting:owner` | MarketingOS Executive |
| `knowledge:read` | Shared; filter articles by product tag |

Add metadata table or enum `product_scope` on `Permission` model (future migration, optional phase 2).

---

## 6. Web App Split Plan

### 6.1 Target structure (monorepo)

```
web/
  packages/
    shell/          # auth, api client, layout, company selector, permission nav
    ui/             # shared components (StatusBadge, tables, …)
  apps/
    hr-web/         # WorkHQ HR back office
    marketing-web/  # MarketingOS back office
```

**Phase 1 (safest):** Stay in single `web/` app; split config:

- `web/src/products/hr/nav.ts`
- `web/src/products/marketing/nav.ts`
- `web/src/products/hr/routes.tsx`
- `web/src/products/marketing/routes.tsx`
- Build-time env `VITE_PRODUCT=hr|marketing|all` (default `all` for zero regression)

**Phase 2:** Extract `apps/hr-web` and `apps/marketing-web` with shared `packages/shell`.

### 6.2 Page migration map

| Current page | Target app |
|--------------|------------|
| `hr/EmployeesPage` | hr-web |
| `attendance/*`, `leave/*`, `payroll/*` | hr-web |
| `marketing/*`, `commission/*`, `settings/*`, `ExecutivePage` | marketing-web |
| `knowledge/*` | both apps; filter by article tag |
| `DashboardPage` | replace with product-specific dashboards |
| `finance/FinancePage` | marketing-web (executive) or shared read-only |

### 6.3 Auth

- Same login, same JWT, same `GET /auth/me`.
- Each app filters `filterNavGroups()` by product permission metadata.
- Deploy URLs: `hr.workhq.example` and `marketing.workhq.example` → same API origin.

---

## 7. Telegram Menu Split Plan

Single bot remains (shared gateway); **split menu composition** by product context.

### 7.1 Target menu structure

**WorkHQ HR menu (all employees)**

- Attendance, Leave, Payslip, Referral, HR AI Assistant
- HR approvals (leaders)

**MarketingOS menu (marketing roles only)**

- Submit daily report, KPI, expenses, latest report
- Team KPI / team expenses (leaders)
- Company marketing overview (big leader)

**MarketingOS Operator menu (owner / commission permissions)**

- Commission cycles, adjustments, executive brief
- Commission declarations review triggers → deep link to marketing-web

### 7.2 Implementation approach

1. Extract menu constants to:
   - `telegram/menus/hr.menu.ts`
   - `telegram/menus/marketing.menu.ts`
   - `telegram/menus/executive.menu.ts`
2. `showMainMenu()` composes based on **permission sets**, not single flat list.
3. Remove marketing items from default employee menu unless user has `marketing:read`.
4. Move `commission:view_summary` to MarketingOS menu block.
5. Onboarding: split **HR registration** (employee create) from **commission declaration** (MarketingOS); declaration can be phase 2 sub-flow after HR profile exists.

### 7.3 Session state namespaces

Already partially namespaced (`marketing:*`, `declaration:*`, `onboarding_*`). Continue prefix discipline:

- `hr:*` — attendance, leave, payroll
- `mkt:*` — rename from `marketing:*` only when compatibility allows
- `mkt-ops:*` — owner commission

---

## 8. AI Tool Split Plan

### 8.1 Target architecture

```
AiModule (shared infra)
  ├── HrAssistantService      → toolRouter.filter(product: 'hr')
  ├── MarketingAssistantService → toolRouter.filter(product: 'marketing')
  └── ExecutiveCopilotService → toolRouter.filter(product: 'executive')
```

Single `/api/v1/ai/chat` with `{ "assistant": "hr" | "marketing" | "executive" }` **or** separate endpoints per product.

### 8.2 Tool registry changes

Add field to `AiToolDefinition`:

```typescript
product: 'hr' | 'marketing' | 'executive' | 'shared';
```

`ToolRouter.getToolsForActor(actor, product)` filters by:

1. Product
2. Existing permission checks

### 8.3 Telegram AI entry

- HR menu: `ai:chatting` → `assistant=hr`
- Marketing menu (new): `ai:marketing` → `assistant=marketing`
- Owner menu: `ai:executive` → `assistant=executive`

---

## 9. Migration / Refactor Phases

### Phase 0 — Audit & guardrails (current)

- [x] Module classification (this document)
- [ ] ADR sign-off
- [ ] CI tag: `product:hr | product:marketing` on integration tests
- [ ] CODEOWNERS by directory

**Risk:** Low. **Tests:** unchanged.

---

### Phase 1 — Logical split, zero API breaks (recommended first implementation)

**Goals:** Separate navigation and ownership without moving business logic.

| Workstream | Actions |
|------------|---------|
| Web | Split `nav-config.ts` → `products/hr/nav.ts` + `products/marketing/nav.ts`; env `VITE_PRODUCT`; commission pages only in marketing nav |
| Backend docs | Mark controllers with `@ApiTags('MarketingOS')` / `@ApiTags('WorkHQ HR')` comments |
| AI | Add `product` field to tools; router filters marketing commission tools out of default HR chat in Telegram |
| Telegram | Compose menus by permission; hide marketing entries from non-marketing employees |
| Tests | All existing integration tests must pass unchanged |

**Affected files (primary):**

- `web/src/layout/nav-config.ts`, `web/src/App.tsx`
- `web/vite.config.ts` (env)
- `backend/src/modules/ai/domain/tools/tool-definitions.ts`
- `backend/src/modules/ai/application/tool-router.service.ts`
- `backend/src/modules/telegram/application/telegram-bot.service.ts` (menu constants)

**Risk:** Low–medium (Telegram menu visibility bugs).  
**Test strategy:** Run full `npm run test:unit`, `npm run test:int`, `web npm test`, manual Telegram menu smoke.

---

### Phase 2 — Dual web apps (still one API, one DB)

| Workstream | Actions |
|------------|---------|
| Monorepo | Extract `packages/shell`, `packages/ui` |
| Apps | Create `apps/hr-web`, `apps/marketing-web` |
| Deploy | Two static bundles; shared API URL |
| Dashboard | Product-specific home pages |

**Risk:** Medium (build pipeline).  
**Tests:** Add per-app vitest smoke; keep backend integration tests unified.

---

### Phase 3 — Payroll boundary service

| Workstream | Actions |
|------------|---------|
| Shared port | `PayrollExportPort` + implementation in payroll module |
| Refactor | `marketing-commission.prisma.repository.ts` uses port instead of direct `payrollItem.create` |
| Tests | Existing `marketing-commission.integration.spec.ts`, `payroll.integration.spec.ts` must pass |

**Affected files:**

- `backend/src/shared/payroll/` (new port)
- `backend/src/modules/payroll/` (adapter)
- `backend/src/modules/commission/infrastructure/persistence/marketing-commission.prisma.repository.ts`
- `backend/src/modules/commission/application/marketing-commission.service.ts`

**Risk:** Medium–high (payroll is money-critical).  
**Test strategy:** Integration tests + explicit boundary unit tests with mocked port.

---

### Phase 4 — Move marketing commission ownership to marketing domain

| Workstream | Actions |
|------------|---------|
| Structure | Create `backend/src/modules/marketing-commission/` (or `products/marketing/commission/`) |
| Move | Marketing + admin + finalization + adjustment + declaration **services** from `commission/` |
| Module | `MarketingCommissionModule` imported by `MarketingModule` (or parent `MarketingOsModule`) |
| Compatibility | Old `CommissionModule` re-exports controllers as thin wrappers |
| Legacy | Keep `CommissionService` (CommissionRecord accrual) under marketing until deprecated |

**Affected files:** Entire `backend/src/modules/commission/**` (~40 files), `commission.module.ts`, imports in `telegram`, `ai`, `reporting`.

**Risk:** High (wide import graph).  
**Test strategy:** Move files in small PRs; keep controllers stable; run full integration suite after each slice:

1. declarations
2. adjustments + workflow
3. finalization + cycles
4. marketing calculate/finalize
5. admin commission

---

### Phase 5 — Reporting & executive split

| Workstream | Actions |
|------------|---------|
| Split | `CommissionExecutiveDashboardService` → marketing reporting |
| HR reporting | Attendance/leave/payroll dashboards remain HR |
| Executive | `ExecutiveInsightService`, `ExecutiveDailyBriefService` → MarketingOS |

**Affected files:** `backend/src/modules/reporting/**`, `web/src/pages/ExecutivePage.tsx`

---

### Phase 6 — AI & Telegram product assistants

| Workstream | Actions |
|------------|---------|
| Services | Split `AiAssistantService` by product |
| Telegram | Separate chat entry points |
| Knowledge | RAG namespace filter by product |

---

### Phase 7 — Optional future (out of scope now)

- API v2 prefixed routes
- Separate databases
- Separate Telegram bots
- SSO product licensing

---

## 10. First Refactor Phase (Detailed Recommendation)

**Execute Phase 1 only** as the first coding sprint after plan approval.

### 10.1 Deliverables

1. **`web/src/products/` layout** with HR vs Marketing nav and routes
2. **`VITE_PRODUCT`** build flag (`all` default in CI)
3. **AI tool `product` tags**; HR Telegram chat excludes marketing/commission owner tools
4. **Telegram menu gating** by permission (`marketing:read`, `commission:read`)
5. **`PRODUCT_BOUNDARIES.md`** short reference linking to this plan
6. **No** file moves out of `commission/` yet
7. **No** payroll repository changes yet

### 10.2 Explicit non-goals for Phase 1

- No database migrations
- No API path changes
- No module renames
- No test deletions

### 10.3 Success criteria

- All backend unit + integration tests green
- Web build passes for `VITE_PRODUCT=hr`, `marketing`, `all`
- HR nav does not show Commission/Marketing groups when built as `hr-web`
- Marketing nav does not show Leave/Attendance when built as `marketing-web`

---

## 11. Test Strategy

### 11.1 Continuous requirements

| Layer | Command | Gate |
|-------|---------|------|
| Backend unit | `npm run test:unit` | 100% pass every PR |
| Backend integration | `npm run test:int` | 100% pass every PR |
| Web | `npm run test` + `npm run build` | 100% pass |

### 11.2 Product tagging (add in Phase 1)

Tag integration specs:

```typescript
/** @product hr */
/** @product marketing */
```

CI matrix (optional later):

- `test:int --group=hr`
- `test:int --group=marketing`

**HR-heavy tests:** attendance, leave, payroll, recruitment, referral, telegram leave flow.  
**Marketing-heavy tests:** marketing-*, commission-*, executive-insight, rule-config.

**Cross-product tests:** telegram onboarding (HR + declaration), company-isolation, auth — run in both groups.

### 11.3 Boundary tests (Phase 3+)

- `PayrollExportPort` fake implementation for marketing commission unit tests
- Contract test: marketing finalize creates payroll item only through port
- Regression: duplicate finalize idempotency (`marketing-commission.integration.spec.ts`)

### 11.4 Web tests

- Nav filtering per `VITE_PRODUCT`
- Permission-gated routes still respect `can()`
- Snapshot tests for nav groups per product

### 11.5 Manual UAT checklist per phase

| Phase | Manual smoke |
|-------|--------------|
| 1 | Login to hr-web vs marketing-web builds; Telegram menus for marketer vs non-marketer |
| 3 | Commission finalize → payroll item visible in HR payroll cycle |
| 4 | All commission API paths still respond |

---

## 12. Risks and Mitigations

| Risk | Severity | Mitigation |
|------|----------|------------|
| Circular module deps (`commission` ↔ `marketing` ↔ `telegram` ↔ `ai`) | High | Introduce ports; move code gradually; use `forwardRef` sparingly; prefer events for notifications |
| Payroll double-pay if boundary wrong | Critical | Port + idempotency keys; keep integration tests; no direct prisma cross-writes |
| Telegram single bot confusion | Medium | Permission-gated menus; clear product labels in UI text |
| Onboarding mixes HR + commission declaration | Medium | Phase 5: split flows; HR creates employee first |
| Executive dashboard spans finance + marketing + HR metrics | Medium | Define Executive as MarketingOS product; HR metrics read-only via ports |
| Legacy `CommissionRecord` accrual overlaps marketing engine | Medium | Document deprecation; single owner (MarketingOS) |
| Permission model not product-aware | Low | Phase 2 metadata on permissions |
| Two web apps duplicate code | Low | Shared `packages/shell` |
| Breaking API consumers | High | Compatibility controllers; no path changes until v2 |
| Test suite runtime | Low | Product-tagged parallel CI |

---

## 13. Affected Files Reference

### 13.1 High-touch (future phases)

| Area | Paths |
|------|-------|
| Commission / marketing commission | `backend/src/modules/commission/**` |
| Marketing ops | `backend/src/modules/marketing/**` |
| Payroll boundary | `backend/src/modules/payroll/**`, `backend/src/shared/payroll/**` |
| Telegram | `backend/src/modules/telegram/application/telegram-bot.service.ts`, `telegram-onboarding.service.ts`, `telegram-declaration-correction.service.ts` |
| AI tools | `backend/src/modules/ai/domain/tools/tool-definitions.ts`, `ai-tool-data.service.ts`, `tool-router.service.ts` |
| Reporting | `backend/src/modules/reporting/**` |
| Settings | `backend/src/modules/settings/**` |
| Web | `web/src/App.tsx`, `web/src/layout/nav-config.ts`, all `web/src/pages/**` |
| Schema (documentation only) | `prisma/schema.prisma` |
| Seeds | `backend/prisma/seed.ts`, knowledge seeds |
| Integration tests | `backend/test/integration/*commission*`, `*marketing*`, `telegram*`, `executive*` |

### 13.2 Low-touch / stable shared

| Area | Paths |
|------|-------|
| Auth | `backend/src/auth/**` |
| Permission | `backend/src/modules/permission/**` |
| Audit | `backend/src/shared/audit/**` |
| Workflow | `backend/src/modules/workflow/**` |
| Organization | `backend/src/modules/organization/**` |

---

## 14. Decision Log (recommended ADRs)

| # | Decision | Choice |
|---|----------|--------|
| ADR-1 | Repo strategy | Monorepo, one DB |
| ADR-2 | Marketing commission module location | Under marketing product (`marketing-commission/`) |
| ADR-3 | Payroll integration | HR-owned `PayrollExportPort` |
| ADR-4 | Telegram | Single bot, split menus |
| ADR-5 | AI | Shared infra, separate tool packs |
| ADR-6 | Admin commission | MarketingOS (not core HR) |
| ADR-7 | API compatibility | Keep `/commission/*` until v2 |
| ADR-8 | First coding phase | Phase 1 — nav + menu + AI visibility only |

---

## 15. Summary Checklist

| Item | HR | MarketingOS | Shared |
|------|:--:|:-----------:|:------:|
| Employee master | ✓ | read | ✓ org |
| Payroll cycles | ✓ | export only | |
| Marketing teams/KPI | | ✓ | |
| Marketing commission | | ✓ | |
| Commission declarations | | ✓ | |
| Leave / attendance | ✓ | | |
| Referral / recruitment | ✓ | | |
| HR handbook KB | ✓ | | infra |
| Marketing KB | | ✓ | infra |
| Auth / permissions | | | ✓ |
| Telegram gateway | | | ✓ |
| Workflow engine | | | ✓ |
| Executive copilot UI | | ✓ | |
| Finance overview | | ✓* | |

\*Treat as MarketingOS executive surface unless product team assigns to a third "Finance" product later.

---

*End of plan — implementation should begin with Phase 1 only after review.*
