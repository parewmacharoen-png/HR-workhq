# WorkHQ v1 Foundation Blueprint — Work Day Engine

**Sprint:** Foundation Sprint — WorkHQ v1 Work Day Engine  
**Date:** 2026-06-29  
**Status:** Implemented

---

## Goal

Transform WorkHQ from HRMS modules into a **Daily Company Operating System** with `WorkDayService` as the central orchestrator — without a large DB refactor.

## Architecture

```
Employee / Shift / Attendance / MonthlyOff / Leave / OT / Payroll (existing)
                              ↓
                      WorkDayService
                              ↓
         ┌────────────────────┼────────────────────┐
         ↓                    ↓                    ↓
  Attendance Command    Employee Command      Telegram 2.0
       Center               Center              State UI
         ↓                    ↓                    ↓
  Exception Center      Payroll Preview      Daily Brief
         ↓
  Company Calendar
```

## Work Day States (central resolver)

Priority order:

1. Approved Leave → `LEAVE`
2. Approved Monthly Off → `MONTHLY_OFF`
3. Holiday (weekend HOL-001) → `HOLIDAY`
4. Attendance (`needsRecalculation` → `NEEDS_RECALCULATION`)
5. Working / Break / OT / Finished from punch data
6. Absent / Missing check-in / Missing check-out
7. Default → `SCHEDULED`

## Module layout

```
backend/src/modules/workday/
  domain/
    workday-state.types.ts
    workday-state.resolver.ts
  application/
    workday.service.ts
    workday-payroll-preview.service.ts
    workday-daily-brief.service.ts
    company-calendar-aggregator.service.ts
    workday-scope.service.ts
  interface/http/
    workday.controller.ts
  workday.module.ts
```

## APIs

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/companies/:companyId/workdays/today` | Company work days today |
| GET | `/companies/:companyId/workdays?date=` | Company work days by date |
| GET | `/companies/:companyId/attendance-command-center?date=` | Command + exception center |
| GET | `/companies/:companyId/company-calendar?month=` | Monthly event list |
| GET | `/employees/:employeeId/workdays/today` | Employee today status |
| GET | `/employees/:employeeId/workdays?month=` | Employee month timeline |
| GET | `/employees/:employeeId/payroll-preview?month=` | Payroll impact preview |

## Web UI

| Route | Component |
|-------|-----------|
| `/attendance/command-center` | `AttendanceCommandCenterPage` |
| `/hr/employees/:id` | `EmployeeWorkDayCommandCard` (top of detail) |

## Out of scope (this sprint)

KPI, Finance, AI, Survey, Workflow Builder, Formula Builder.

---

## Pilot Release — Today UX + Workforce Risk

### Telegram Today UX (employee)

- State-first home from `getTodayStatus()`
- Max 4 secondary actions; extras under ⚙️ เพิ่มเติม
- Manager role menu separate (Owner/Secretary/Big Leader)

### Workforce Risk Engine

```
WorkDayService (availability per employee)
         ↓
WorkforceRiskService + WorkforceStaffingRule
         ↓
Command Center risk card / Daily brief / Telegram workforce:risk
```

**Module:** `backend/src/modules/workforce-risk/`

**APIs:**
- `GET /companies/:companyId/workforce-risk?date=`
- `GET /companies/:companyId/workforce-risk/forecast?startDate=&days=`
- `GET/POST /companies/:companyId/workforce-staffing-rules`

**Risk levels:** GREEN (above min) · YELLOW (at min) · ORANGE (−1) · RED (−2+)

See [WORKHQ_CONSTITUTION_V1.md](./WORKHQ_CONSTITUTION_V1.md) Rule #14 Predictive Operations.
