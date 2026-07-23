# Foundation Sprint — WorkHQ v1 Work Day Engine — Completion Report

**Sprint:** Foundation Sprint — WorkHQ v1 Work Day Engine  
**Date:** 2026-06-29  
**Status:** Complete

---

## Files changed

### Backend (new)

- `backend/src/modules/workday/domain/workday-state.types.ts`
- `backend/src/modules/workday/domain/workday-state.resolver.ts`
- `backend/src/modules/workday/domain/workday-state.resolver.unit.spec.ts`
- `backend/src/modules/workday/application/workday.service.ts`
- `backend/src/modules/workday/application/workday-payroll-preview.service.ts`
- `backend/src/modules/workday/application/workday-payroll-preview.service.unit.spec.ts`
- `backend/src/modules/workday/application/workday-daily-brief.service.ts`
- `backend/src/modules/workday/application/company-calendar-aggregator.service.ts`
- `backend/src/modules/workday/application/workday-scope.service.ts`
- `backend/src/modules/workday/application/workday-scope.service.unit.spec.ts`
- `backend/src/modules/workday/interface/http/workday.controller.ts`
- `backend/src/modules/workday/workday.module.ts`

### Backend (modified)

- `backend/src/app.module.ts` — register `WorkdayModule`
- `backend/src/modules/telegram/telegram.module.ts` — import `WorkdayModule`
- `backend/src/modules/telegram/application/telegram-bot.service.ts` — Telegram 2.0 state UI

### Web (new)

- `web/src/api/workday.ts`
- `web/src/pages/attendance/AttendanceCommandCenterPage.tsx`
- `web/src/components/hr/employee/EmployeeWorkDayCommandCard.tsx`

### Web (modified)

- `web/src/App.tsx` — route `/attendance/command-center`
- `web/src/pages/attendance/AttendanceHubPage.tsx` — hub link
- `web/src/pages/hr/EmployeeDetailPage.tsx` — work day command card

### Docs

- `WORKHQ_V1_FOUNDATION_BLUEPRINT.md` (new)
- `WORKHQ_V1_FOUNDATION_COMPLETION_REPORT.md` (this file)
- `WORKHQ_POLICY_IMPLEMENTATION_MATRIX.md` — WDE rows
- `WORKHQ_UAT_CHECKLIST.md` — Foundation UAT rows
- `WORKHQ_MASTER_POLICY_V1.md` — WDE-001 policy stub

---

## WorkDayService methods added

| Method | Description |
|--------|-------------|
| `getWorkDay(employeeId, date)` | Single employee work day DTO |
| `getTodayStatus(employeeId)` | Today shortcut |
| `getEmployeeMonthWorkDays(employeeId, month)` | Month timeline |
| `getCompanyWorkDays(actor, companyId, date)` | Scoped company list |
| `getAttendanceCommandCenter(actor, companyId, date?)` | Widgets + exceptions |
| `getPayrollImpactPreview(employeeId, month)` | Delegates to preview service |
| `getCompanyWorkDaysByEmployeeIds(...)` | Internal batch for briefs |

## State resolver rules

Implemented in `workday-state.resolver.ts`:

1. Approved leave → `LEAVE`
2. Approved monthly off → `MONTHLY_OFF`
3. Holiday (Sat/Sun Bangkok) → `HOLIDAY`
4. `needsRecalculation` on attendance → `NEEDS_RECALCULATION`
5. Check-in + break start, no break end → `BREAK`
6. Check-in, no check-out → `WORKING`
7. Check-out + pending OT → `OT`; else → `FINISHED`
8. Absence without check-in → `ABSENT`
9. Missing check-out / missing check-in flags → respective states
10. Default → `SCHEDULED`

## API added

All routes on `WorkdayController` (see blueprint).

## UI pages/cards added

- **Attendance Command Center** — widgets (working, late, not checked in, break, OT, off, leave, needs action) + Exception Center tab
- **Employee Work Day Command Card** — today status, shift, punches, late, OT, payroll preview, 14-day timeline

## Telegram behavior changed

- Main menu for employees uses `getTodayStatus()` — primary action buttons follow state
- Secondary row: team calendar, monthly off, requests, payslip (de-emphasized)
- Leader/owner menus unchanged, appended after employee actions

## Payroll preview logic

`WorkDayPayrollPreviewService.preview()`:

- Base salary from active `salaryHistory`
- **+** approved OT only (pending/rejected excluded)
- **+** manual bonus, commission, allowances (active definitions in month)
- **−** late deductions (stored attendance values)
- **−** unpaid leave (approved unpaid days × monthly/30)
- **−** manual deductions
- `needsRecalculation` on any attendance in month → warning; preview not final

## Tests added

| Suite | Count |
|-------|-------|
| `workday-state.resolver.unit.spec.ts` | 13 |
| `workday-payroll-preview.service.unit.spec.ts` | 4 |
| `workday-scope.service.unit.spec.ts` | 2 |

**Total:** 19 passed

## Commands run

```powershell
cd backend; npx tsc --noEmit          # ✓
cd web; npm run typecheck             # ✓
cd backend; npm run test:unit -- --runInBand --testPathPattern=workday  # ✓ 19 passed
```

## Known limitations

1. Holiday detection is weekend-only (HOL-001); no company holiday table yet.
2. Command center loads work days per employee (N+1 queries) — acceptable for v1; batch optimization later.
3. Payroll preview is estimate only; does not replace `PayrollBuilderService` cycle run.
4. Daily Brief service has methods only — no production cron wired.
5. Company calendar shift-change events use `effectiveFrom` in month only.
6. Telegram state UI tests are covered indirectly via resolver unit tests; no bot integration test.

## Manual UAT checklist

| # | Case | Steps | Expected |
|---|------|-------|----------|
| 1 | Command center widgets | Web → Attendance → Command Center | Counts match employee states |
| 2 | Exception center | Tab Exception Center | Missing punch, OT pending, etc. with links |
| 3 | Employee card | HR → Employee detail | Today status + timeline + payroll preview |
| 4 | Telegram scheduled | Before check-in | Only 🟢 เข้างาน prominent |
| 5 | Telegram working | After check-in | ☕ พัก + 🔴 เลิกงาน |
| 6 | Telegram break | On break | ▶️ กลับจากพัก |
| 7 | Telegram finished | After checkout | Summary text, no punch buttons |
| 8 | Payroll preview OT | Approved + pending OT in month | Only approved in preview |
| 9 | needsRecalculation | Shift reschedule on past attendance | Warning on preview + NEEDS_RECALCULATION state |
| 10 | Big Leader scope | Command center as Big Leader | Only team employees visible |
