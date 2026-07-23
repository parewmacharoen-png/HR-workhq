# P0-005 Daily Workforce Core — Completion Report

**Sprint:** P0-005  
**Date:** 2026-06-29  
**Status:** Implemented (pending live UAT)

---

## Summary

Implemented Daily Workforce Core: shift assignment history, shift-aware attendance with 15-minute grace and hour-rounded late deductions, Telegram task-first employee menu, check-out OT prompt flow, separate Monthly Off entity/workflow, team calendar monthly-off visibility, and payroll integration hooks. Non-essential employee Telegram modules (KPI, AI, training, marketing submenu) removed from the default daily menu.

---

## Files Changed

### Schema & migration
- `prisma/schema.prisma` — `Shift`, `EmployeeShiftAssignment`, `MonthlyOffRequest`; extended `AttendanceRecord`, `OvertimeRecord`; `WorkflowEntityType.monthly_off`
- `prisma/migrations/20260629180000_p0_005_daily_workforce_core/migration.sql`

### Backend — attendance / workforce
- `backend/src/modules/attendance/domain/services/shift-resolver.service.ts` (new)
- `backend/src/modules/attendance/domain/services/shift-resolver.service.unit.spec.ts` (new)
- `backend/src/modules/attendance/domain/services/attendance-rules.service.ts`
- `backend/src/modules/attendance/domain/services/attendance-rules.service.unit.spec.ts`
- `backend/src/modules/attendance/domain/entities/attendance-record.entity.ts`
- `backend/src/modules/attendance/domain/repositories/attendance.repository.ts`
- `backend/src/modules/attendance/infrastructure/persistence/attendance.prisma.repository.ts`
- `backend/src/modules/attendance/application/attendance.service.ts`
- `backend/src/modules/attendance/application/dto/attendance.dto.ts`
- `backend/src/modules/attendance/application/shift-assignment.service.ts` (new)
- `backend/src/modules/attendance/application/employee-hourly-rate.service.ts` (new)
- `backend/src/modules/attendance/application/monthly-off.service.ts` (new)
- `backend/src/modules/attendance/attendance.module.ts`

### Backend — workflow / payroll / calendar / leave
- `backend/src/modules/workflow/domain/types/approval.types.ts`
- `backend/src/modules/workflow/domain/approval-defaults.ts`
- `backend/src/modules/workflow/domain/entities/workflow.entity.ts`
- `backend/src/modules/workflow/application/workflow-approver.service.ts`
- `backend/src/common/outbox/workflow-resolved.handler.ts`
- `backend/src/modules/payroll/application/used-off-days.service.ts`
- `backend/src/modules/leave/domain/services/leave-type-classification.ts`
- `backend/src/modules/calendar/application/team-calendar.service.ts`
- `backend/src/modules/calendar/application/team-calendar.handler.ts`
- `backend/src/modules/calendar/application/dto/team-calendar.dto.ts`
- `backend/src/modules/employee/application/employee-employment.service.ts`

### Backend — Telegram
- `backend/src/modules/telegram/application/telegram-bot.service.ts`
- `backend/src/modules/telegram/domain/entities/telegram-session.types.ts`

### Docs
- `WORKHQ_MASTER_POLICY_V1.md`
- `WORKHQ_POLICY_IMPLEMENTATION_MATRIX.md`
- `WORKHQ_UAT_CHECKLIST.md`
- `WORKHQ_P0_005_COMPLETION_REPORT.md` (this file)

---

## Business Rules Implemented

| # | Rule |
|---|------|
| 1 | Employee profile shows current shift from assignment history (`currentShift` on employment view) |
| 2 | `employee_shift_assignments` preserves history; new assignment closes prior open row |
| 3 | Late status uses effective shift `shiftStartAt` for the work date |
| 4 | 15-minute grace period (unchanged default) |
| 5 | Late minutes counted after shift start + grace |
| 6 | Late deduction: `CEIL(lateMinutes/60) × 2 × hourlyRate` (wage-hours) |
| 7 | Check-out no longer auto-creates OT |
| 8 | Telegram asks “วันนี้มี OT หรือไม่?” after checkout |
| 9 | OT record created as `PENDING` with workflow `ot_request` |
| 10 | Payroll includes approved OT only (existing payroll-builder path) |
| 11 | `MonthlyOffRequest` entity separate from `LeaveRequest` |
| 12 | Monthly off = normal monthly days off (selected dates per month) |
| 13 | Leave types (sick, emergency, unpaid, personal) unchanged; `monthly_off` excluded from leave off-day classification |
| 14–15 | Employee daily ops via simplified Telegram menu; web admin unchanged for Owner/Secretary/Big Leader |
| 16 | Telegram employee menu: 8 task-first items |
| 17 | Team calendar shows monthly off dates (🗓 category) |
| 18 | ATT-010 reminders unchanged (existing scheduler) |
| 19 | Manual payroll items unchanged (P0-002/003) |

---

## Tests Added

| Test file | Coverage |
|-----------|----------|
| `shift-resolver.service.unit.spec.ts` | Shift effective-date resolver, night shift midnight, grace, rounded late hours, OT from end time, monthly off ≠ leave |
| `attendance-rules.service.unit.spec.ts` | Updated hour-rounded late deduction expectations |

**Run results:**
```
npm run test:unit -- --runInBand --testPathPattern=shift-resolver.service.unit.spec
→ 8 passed
npm run test:unit -- --runInBand --testPathPattern=attendance-rules.service.unit.spec
→ 5 passed
cd backend && npx tsc --noEmit
→ exit 0
```

---

## Commands Run

```powershell
npx prisma generate
cd backend; npx tsc --noEmit
cd backend; $env:NODE_OPTIONS="--max-old-space-size=8192"; npm run test:unit -- --runInBand --testPathPattern=shift-resolver.service.unit.spec
cd backend; $env:NODE_OPTIONS="--max-old-space-size=8192"; npm run test:unit -- --runInBand --testPathPattern=attendance-rules.service.unit.spec
```

---

## Known Limitations

1. **Shift seed data** — Companies need `attendance.shifts` rows created; fallback uses company attendance settings when no assignment exists.
2. **Employment shift update** — Web employment tab still updates `adminCommissionEmployeeProfile.defaultShift`; full wiring to `ShiftAssignmentService.assignShift()` on web edit is not yet done.
3. **OT end time** — Telegram OT flow offers “ใช้เวลาปัจจุบัน” only; custom OT end time entry deferred.
4. **Monthly off UI (web)** — Submission via Telegram; web Approval Center uses existing workflow inbox.
5. **Frontend** — No web UI changes for shift assignment builder or monthly-off admin view in this sprint.
6. **Migration** — Run `npx prisma migrate deploy` against target DB before production use.
7. **Full Jest suite** — Full backend unit suite may OOM locally; use targeted `--testPathPattern` with increased heap.

---

## Remaining Manual UAT Checklist

See `WORKHQ_UAT_CHECKLIST.md` rows **P0-005**:

- [ ] Check-in shows shift name, window, on-time/late in Thai
- [ ] Check-out OT prompt (ไม่มี OT / มี OT)
- [ ] Pending OT excluded from payroll; approved OT included
- [ ] Monthly off submission + approval separate from leave
- [ ] Team calendar shows monthly off per date
- [ ] Late deduction uses rounded hours in payroll cycle
- [ ] Employee menu shows 8 items only
- [ ] Owner/Secretary/Big Leader retain approval/calendar menus

---

## P0-005b — Future-Dated Shift Assignments (2026-06-29)

### Scope delivered
- Future `effectiveFrom` on `EmployeeShiftAssignment` with overlap prevention
- Auto-close prior assignment to day before new `effectiveFrom`
- Employee profile: `shiftProfile.current`, `shiftProfile.nextScheduled`, `shiftProfile.history`
- API: `GET/POST /employees/:id/shift-assignments`, `GET /companies/:id/shifts`
- `needsRecalculation` on `AttendanceRecord` when scheduling affects dates with check-in (no silent payroll rewrite)
- Audit log action `shift_assignment_scheduled` with old/new shift and effective dates
- Admin UI: `EmployeeShiftScheduleCard` on employment tab

### Tests
- `shift-assignment.domain.unit.spec.ts` (7 tests)
- `shift-assignment.service.unit.spec.ts` (1 test)

### Migration
- `prisma/migrations/20260629190000_p0_005b_future_shift_assignments/`
