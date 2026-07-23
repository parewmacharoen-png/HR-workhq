# P0-002 — Payroll Recovery — Completion Report

**Date:** 2026-06-29  
**Status:** Complete (backend unchanged; frontend gaps restored)

---

## Executive summary

Full payroll module audit completed. **Backend APIs and core pages were largely intact**; the main regression was **missing/inaccessible UI** for opening cycles, manual items, salary adjustment wiring, and payslip access. Restorations reuse existing APIs with no layout redesign.

---

## Feature inventory & status

| Feature | Backend API | Frontend UI | Status |
|---------|-------------|-------------|--------|
| Payroll Cycle list | `GET /payroll/cycles` | `/payroll/cycles` | ✅ Restored list + **open cycle** |
| Open payroll cycle | `POST /payroll/cycles` | PayrollCyclesPage form | ✅ **Restored** |
| Payroll Overview | `GET .../overview` | `/payroll/cycles/:id/overview` | ✅ Working |
| Employee Payroll List | Overview + employee tab | Overview table + EmployeePayrollTab | ✅ Working |
| View payroll details | `GET .../overview/employees/:id` | Detail modal | ✅ Working |
| Salary Structure | Employee profile `payroll-info` | Personal tab bank/payroll card | ✅ Working |
| Salary Adjustment | Compensation review APIs | EmployeeCompensationSection on payroll tab | ✅ **Restored wiring** |
| Manual Payroll Items | `POST .../items` | Cycle detail form | ✅ **Restored** |
| Generate Payroll (build) | `POST .../build` | Cycle detail | ✅ Working |
| Approve Payroll (lock) | `POST .../lock` | Cycle detail | ✅ Working (lock = approve) |
| Close Payroll (paid) | `POST .../paid` | Cycle detail | ✅ Working |
| Export Bank File | Export APIs | Cycle detail export section | ✅ Working |
| Export Excel (XLSX) | `download?format=xlsx` | Download button | ✅ Working |
| Export CSV | `download?format=csv` | Download button | ✅ Working |
| Export PDF | — | — | ❌ **Not implemented** (never in backend) |
| Payslip | `GET/POST .../payslips/:employeeId` | Detail modal generate/view | ✅ **Restored** |
| Payroll History | `GET /employees/:id/payroll` | Employee payroll tab | ✅ Working |
| Audit Log | AuditService on build/export/overview | Backend only | ✅ Backend |
| Timeline | Compensation timeline + employee timeline | Compensation section | ✅ Working |
| Permission Matrix | `payroll:read` / `payroll:write` + salary visibility | Role bundles + UI gates | ✅ Working |
| Payroll settings | `GET/PUT /settings/payroll` | `/settings/payroll` | ✅ Working |
| Manual commission | `POST /payroll/manual-commissions` | No dedicated UI | ⚠️ API only (build pulls data) |
| Per-item triggers (meal/late/absence) | Individual POST endpoints | Build auto-aggregates | ⚠️ API only |

---

## Restored features (this sprint)

1. **Open payroll cycle** — form on `PayrollCyclesPage` with default 25th–23rd period; navigates to new cycle
2. **API client** — `listPayrollCycles`, `openPayrollCycle`, `addPayrollManualItem`, `generatePayslip`, `fetchPayslip`, `defaultPayrollPeriodDates`
3. **Manual payroll items** — form on open cycle detail page
4. **Payslip** — generate/view in `PayrollOverviewEmployeeDetailModal` (overview + employee tab)
5. **Salary adjustment** — `EmployeeCompensationSection` wired into employee payroll tab
6. **Compensation review link** — secondary action on payroll cycles page
7. **Routes registry** — compensation review paths in `APP_ROUTES`

---

## Broken / still requires work

| Item | Notes |
|------|-------|
| Export PDF | No backend endpoint; out of scope for recovery |
| Dedicated payslip page | Uses modal (same data as before Telegram self-service) |
| Manual commission UI | Backend exists; cycle build includes commission |
| Per-employee meal/late/absence buttons | Covered by build; individual POST APIs remain API-only |
| Secretary `payroll:write` | By design — only Owner can open/lock/build (role bundle) |
| PAY-003a missed meal/break item | Policy gap documented in `WORKHQ_ORPHAN_REPORT.md` |
| Live integration UAT | Requires DATABASE_URL + Owner sign-off per `WORKHQ_PAYROLL_AUDIT.md` |

---

## API changes

**None.** All restorations call existing endpoints.

---

## Files created

| File | Purpose |
|------|---------|
| `web/src/api/payroll.test.ts` | Period date helper tests |
| `WORKHQ_P0_002_COMPLETION_REPORT.md` | This report |

---

## Files updated

| File | Change |
|------|--------|
| `web/src/api/payroll.ts` | Open cycle, list, manual item, payslip APIs |
| `web/src/pages/payroll/PayrollCyclesPage.tsx` | Open cycle UI |
| `web/src/pages/payroll/PayrollCycleDetailPage.tsx` | Manual item form |
| `web/src/pages/payroll/PayrollCycleOverviewPage.tsx` | Pass `cycleId` to payslip modal |
| `web/src/components/payroll/PayrollOverviewEmployeeDetailModal.tsx` | Payslip generate/view |
| `web/src/components/hr/employee/EmployeePayrollTab.tsx` | Compensation section + payslip |
| `web/src/i18n/th-labels.ts` | Payroll recovery labels |
| `web/src/config/routes.ts` | Compensation routes |
| `WORKHQ_UAT_CHECKLIST.md` | P0-002 UAT rows |

---

## Tests added/updated

| Test | Result |
|------|--------|
| `web/src/api/payroll.test.ts` | ✅ 2 passed |
| Frontend build | ✅ pass |
| Backend payroll unit tests | Existing suite (run with `npx jest payroll --testPathPattern=unit`) |

---

## UAT checklist

See `WORKHQ_UAT_CHECKLIST.md` — **P0-002** rows (open cycle, build/lock, overview/export, employee tab, manual item, payslip).

**Recommended flow (Owner):**
1. `/payroll/cycles` → เปิดรอบ
2. Cycle detail → คำนวณตัวอย่าง → สร้างรายการ → ล็อครอบ
3. Overview → verify totals → export XLSX
4. Employee detail → เงินเดือน → history detail → payslip
5. Compensation propose on same tab

---

## Remaining gaps

1. PDF export not in product
2. Integration tests need DATABASE_URL in CI
3. Formula edge cases (late/absence) — conditional pass in audit
4. No UI for manual commission bulk entry

---

## Rollback impact

Revert frontend deploy only. No schema or API changes.

---

*P0-002 — WorkHQ HR Platform*
