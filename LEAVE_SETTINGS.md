# Leave Settings (HR-11C)

Leave business rules are stored in the Settings Engine under category `leave`, key `rules`.

## Setting key

| Category | Key | Scope |
|----------|-----|-------|
| `leave` | `rules` | System default + optional company override |

## Resolution order

1. Company `leave.rules` (if set)
2. System `leave.rules` (seeded on deploy)
3. Built-in `DEFAULT_LEAVE_RULES` fallback

Future: Employee → Team → Company → System.

## Caching

`LeaveSettingsService` caches resolved rules per company. Cache is invalidated when any `leave` setting is updated via `SettingsService.setValue()`.

## Admin UI

**Settings → Leave** (`/settings/leave`)

Uses existing Settings API:

- `GET /api/v1/settings/leave?companyId=…`
- `PUT /api/v1/settings/leave/rules?companyId=…`

## Wired settings (used at runtime today)

| Key | Default | Used by |
|-----|---------|---------|
| `rescheduleNoticeDays` | 7 | `validateRescheduleRequest` |
| `maxReschedulesPerRequest` | 1 | Reschedule validator + eligible leave list |
| `rescheduleMustMoveForward` | true | Reschedule validator |
| `rescheduleMustKeepSameDuration` | true | Reschedule validator |
| `emergencyRescheduleExceptionAllowed` | true | Skips notice when `isEmergency` |
| `shiftSwapNoticeDays` | 7 | `validateShiftSwapRequest` |
| `minRescheduleReasonLength` | 10 | Reschedule reason validation |
| `unusedOffDayBonusAmount` | 600 | Automatic payroll leave bonus (`POST …/leave-bonus`) and legacy holiday conversion |
| `unusedOffDayBonusCap` | 1200 | Normal cap = 2 eligible days × rate; owner override can exceed via payroll API |

Shift swap consent/approval flags match existing workflow behavior (partner agree → management workflow) but are not gated by settings toggles yet.

## Reserved settings (stored, not wired to runtime logic)

These keys are seeded and editable in Admin UI for future sprints. Changing them does **not** alter behavior today.

| Key | Default | Notes |
|-----|---------|-------|
| `monthlyOffDays` | 4 | Admin commission calc still uses separate hardcoded constant |
| `minimumRecommendedOffDays` | 2 | Handbook only |
| `defaultLeaveNoticeDays` | 7 | Leave requests do not validate notice yet |
| `unpaidLeaveNoticeDays` | 7 | Not enforced |
| `emergencyLeaveEnabled` | true | No entitlement engine |
| `emergencyLeaveEligibilityMonths` | 3 | Not enforced |
| `emergencyLeaveDaysPerHalfYear` | 4 | Balances from DB, not computed |
| `newEmployeeEmergencyLeave` | 3mo → 2d / 1d | Not enforced |
| `sickLeaveRequiresCertificateAfterDays` | 1 | Not enforced |
| `sickLeaveAdjacentToOffDayRequiresCertificate` | true | Not enforced |
| `allowSplitFullDayLeave` | false | No split-leave feature |
| `shiftSwapRequiresBothConsent` | true | Workflow always requires partner |
| `shiftSwapRequiresManagementApproval` | true | Workflow always requires approval |
| `consecutiveLeavePenaltyEnabled` | true | Not implemented |
| `consecutiveLeaveBaseDays` | 2 | Not implemented |
| `additionalConsecutiveLeavePenaltyLaborUnits` | 5 | Not implemented |
| `absencePenalties.*` | 1000/2000/3000 | Not wired in leave/payroll/attendance |

## Migration notes (HR-11C)

- Hardcoded constants removed from `leave-reschedule-policy.service.ts` and `holiday-conversion.service.ts`.
- `LeaveService` loads rules via `LeaveSettingsService` for reschedule, shift swap, holiday conversion, and reschedule eligibility.
- System default seeded in `backend/prisma/seed.ts`.
- Telegram leave flows unchanged; they delegate to `LeaveService`.
- Admin commission leave allowance/penalty tiers remain in `RuleConfig` / hardcoded calculator — out of scope for HR-11C.

## Audit

Every save creates `SettingVersion` and `SettingAudit` records via Settings Engine.
