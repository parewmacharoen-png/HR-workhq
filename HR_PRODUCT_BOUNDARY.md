# HR Product Boundary

**Effective:** 2026-06-22  
**Status:** WorkHQ HR is the active product; MarketingOS is archived for separate rebuild.

---

## What Remains in WorkHQ HR

| Domain | Features |
|--------|----------|
| **Employee** | Profiles, assignments, documents, bank accounts |
| **Attendance** | Check-in/out, OT, daily records |
| **Leave** | Requests, reschedule, shift swaps, balances |
| **Payroll** | Cycles, salary proration, meal allowance, deposit, payslips |
| **Manual Commission** | Externally calculated commission entry (`POST /payroll/manual-commissions`, bulk import) |
| **Recruitment** | Pipeline, candidates, analytics |
| **Referral Reward** | Qualification, rewards, payout |
| **Admin Commission** | Back-office pool A/B (HR-related incentive) |
| **Workflow** | Approvals for leave, OT, bonuses, adjustments |
| **Knowledge Base** | HR policy articles, RAG search |
| **AI HR Assistant** | Self-service, leave, attendance, payslip, referral tools |
| **Telegram HR** | Check-in/out, leave, payslip, referral, HR AI, approvals |
| **Reporting** | HR dashboards (non-marketing executive views where applicable) |

---

## What Moved to MarketingOS Archive

Location: `_extracted/marketing-os/` (203 files, see `MANIFEST.md`)

| Deprecated in HR UI | Still in codebase (hidden) |
|---------------------|----------------------------|
| Marketing daily reports | `backend/src/modules/marketing/**` |
| Marketing KPI / expenses / teams | Same module |
| Marketing commission **calculation** | `backend/src/modules/commission/**` (marketing paths) |
| Marketing insights / ROI / forecast | Marketing + reporting builders |
| AI Marketing Manager tools | 14+ tools in `tool-definitions.ts` |
| Marketing Telegram menus | `telegram-bot.service.ts` |
| Marketing / commission / executive web pages | `web/src/pages/**` |
| Marketing commission rule settings | `/settings/commission/marketing` |

**Database tables are NOT dropped.** Marketing and commission schemas remain for data retention and future MarketingOS service.

---

## How Marketing Commission Is Paid in HR Mode

1. Marketing commission is calculated **outside WorkHQ** (spreadsheet, future MarketingOS product, etc.).
2. HR opens a payroll cycle (`POST /payroll/cycles`).
3. HR enters commission via:
   - **Single:** `POST /api/v1/payroll/manual-commissions`
   - **Bulk:** `POST /api/v1/payroll/manual-commissions/bulk`
4. Required fields: `employeeId`, `companyId`, `payrollCycleId`, `amount`, `commissionType`, `reason`
5. Creates `ManualCommissionEntry` + `PayrollItem` (`itemType: commission`, `sourceRefType: manual_commission`)
6. Appears on payslip under `breakdown.commission` when cycle is locked and payslip generated
7. Full audit trail on `ManualCommissionEntry` + `AuditService`

**Commission types:** `marketing_manual`, `sales_manual`, `other_manual`

---

## Feature Flag: HR Mode

| Variable | Default | Effect |
|----------|---------|--------|
| `MARKETING_ENABLED` (backend) | `false` | Hides Telegram marketing menus, AI marketing tools, owner commission/executive brief actions |
| `VITE_PRODUCT=hr` or `VITE_MARKETING_ENABLED=false` (web) | HR build | Hides marketing/commission/executive nav and routes |

APIs remain active when disabled (compatibility / migration period). Surfaces only are hidden.

---

## Deprecated Modules (Do Not Delete Yet)

- `modules/marketing/**`
- `modules/commission/**` (marketing calculation paths)
- Marketing sections of `modules/reporting/**`, `modules/ai/**`, `telegram-bot.service.ts`
- Marketing web pages and commission back-office pages

See `_extracted/marketing-os/MARKETING_OS_HANDOFF.md` for rebuild guidance.

---

## Future Extraction Strategy

1. **Phase 1 (current):** Feature flags hide MarketingOS surfaces; manual commission entry in HR payroll
2. **Phase 2:** Standalone MarketingOS NestJS service from archive; same DB initially
3. **Phase 3:** `PayrollExportPort` — MarketingOS pushes calculated amounts to HR manual commission API
4. **Phase 4:** Optional DB separation after boundary ports proven

Reference: `PRODUCT_SPLIT_PLAN.md`, `_extracted/marketing-os/MANIFEST.md`

---

## Risks

| Risk | Mitigation |
|------|------------|
| Hidden APIs still callable if permissions granted | Tighten RBAC on HR deployments; remove marketing permissions from HR roles in seed |
| Shared DB — marketing data grows | Archive-only; no new marketing usage in HR mode |
| Manual commission duplicate entry | `idempotencyKey` on manual commission API |
| Payslip includes wrong commission | Require `reason`; audit on every entry |
| Integration tests for marketing | Opt-in via `enableMarketingForIntegrationTests()` in marketing spec files |
| Telegram single bot | Marketing callbacks return "feature disabled" message in HR mode |

---

## HR Pages Visible (Default Build)

- Dashboard, Employees, Attendance, Leave, Payroll, Finance, Knowledge, Admin Commission Settings

## Hidden in HR Mode

- `/marketing/*`, `/commission/*`, `/executive`, Marketing Commission settings
