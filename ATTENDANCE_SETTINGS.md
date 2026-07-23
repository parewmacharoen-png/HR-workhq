# Attendance Settings (HR-11B)

Attendance business rules are stored in the Settings Engine under category `attendance`, key `rules`.

## Setting key

| Category | Key | Scope |
|----------|-----|-------|
| `attendance` | `rules` | System default + optional company override |

## Payload (`attendance.rules`)

| Field | Type | Default | Used by |
|-------|------|---------|---------|
| `graceMinutes` | number | `15` | Late calculation — no penalty within grace |
| `latePenaltyMultiplier` | number | `2` | Late deduction multiplier (แรง) |
| `breakMinutes` | number | `60` | Fixed break deducted from worked minutes |
| `breakOveragePenaltyThresholdHours` | number | `2` | Reserved for future break overage penalties |
| `halfDayAbsenceThresholdHours` | number | `4` | Reserved for future absence classification |
| `fullDayAbsenceThresholdHours` | number | `6` | Reserved for future absence classification |
| `missingCheckInAllowed` | boolean | `false` | Reserved for future validation |
| `missingCheckOutAllowed` | boolean | `false` | Reserved for future validation |
| `autoCloseMissingCheckOut` | boolean | `false` | Reserved for future auto-close job |
| `overtimeEnabled` | boolean | `true` | Gates OT detection on check-out |
| `minimumOvertimeMinutes` | number | `60` | Minimum minutes past shift end before OT counts |
| `shiftStartMinutes` | number | `540` (09:00) | Shift start for late calculation |
| `shiftEndMinutes` | number | `1260` (21:00) | Shift end for OT calculation |
| `otStartDelayMinutes` | number | `30` | Minutes past shift end before OT gate opens |
| `otHourlyRate` | number | `50` | Flat OT rate (THB/hour) |

Defaults preserve pre-HR-11B hardcoded behavior in `AttendanceRulesService`.

## Resolution order

1. Company `attendance.rules` (if set)
2. System `attendance.rules` (seeded on deploy)
3. Built-in `DEFAULT_ATTENDANCE_RULES` fallback if neither exists

Future: Employee → Team → Company → System.

## Caching

`AttendanceSettingsService` caches resolved rules per company in memory. Cache is invalidated when any `attendance` setting is updated via `SettingsService.setValue()`.

## Admin UI

**Settings → Attendance** (`/settings/attendance`)

Structured form sections: Attendance, Break, Absence, OT, Missing Attendance.

Uses existing Settings API:

- `GET /api/v1/settings/attendance?companyId=…`
- `PUT /api/v1/settings/attendance/rules?companyId=…`

## Audit

Every save creates `SettingVersion` and `SettingAudit` records (Settings Engine).

## Migration notes (HR-11B)

- Hardcoded constants removed from `attendance-rules.service.ts` and `attendance.service.ts`.
- System default seeded in `backend/prisma/seed.ts`.
- Telegram check-in/out/break commands unchanged; they call `AttendanceService`, which now reads settings.
- Reporting/dashboard thresholds (e.g. missing checkout alert `> 5`) are **not** part of this sprint.

## Example company override

```json
PUT /api/v1/settings/attendance/rules?companyId=<uuid>
{
  "value": {
    "graceMinutes": 20,
    "latePenaltyMultiplier": 2,
    "breakMinutes": 60,
    "breakOveragePenaltyThresholdHours": 2,
    "halfDayAbsenceThresholdHours": 4,
    "fullDayAbsenceThresholdHours": 6,
    "missingCheckInAllowed": false,
    "missingCheckOutAllowed": false,
    "autoCloseMissingCheckOut": false,
    "overtimeEnabled": true,
    "minimumOvertimeMinutes": 60,
    "shiftStartMinutes": 540,
    "shiftEndMinutes": 1260,
    "otStartDelayMinutes": 30,
    "otHourlyRate": 50
  }
}
```

Only changed fields need to be sent when merging client-side; the API stores the full object you submit.
