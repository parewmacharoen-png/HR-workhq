# Pilot Release — Today UX + Workforce Risk — Completion Report

**Date:** 2026-06-29  
**Status:** Complete (Telegram menu wiring verified)

---

## Summary

Pilot release simplifies employee Telegram to a **state-first Today screen** (max 4 secondary actions) and adds a **Workforce Risk Engine** fed by `WorkDayService`.

**Menu wiring fix (2026-06-29):** Removed the legacy attendance hub and dead `MENU_ROOT_*` constants. All employee/manager main keyboards now render exclusively through `telegram-menu.builder.ts` via `showMainMenu()` → `buildEmployeeMainMenu()` / `buildManagerMainMenu()`.

## Telegram menu wiring

| Item | Before | After |
|------|--------|-------|
| Employee main entry | `showMainMenu` called builder, but legacy `showAttendanceMenu()` still served 5-row punch hub on cancel / `attendance:menu` / `attendance:confirming_checkin` | Single path: `showMainMenu` → `buildEmployeeMainMenu` |
| Legacy constants | `MENU_ROOT_EMPLOYEE`, `MENU_ROOT_LEADER`, `MENU_ROOT_*_TH` in bot service | **Removed** — builder is sole source |
| Attendance sub-menu | `showAttendanceMenu()` (เข้างาน/ออกงาน/พัก/แก้ไขเวลา always visible) | **Deleted**; legacy callbacks redirect to `showMainMenu` |
| More menus | Inline arrays in bot service | `buildEmployeeMoreMenuKeyboard` / `buildOpsMoreMenuKeyboard` in builder |

### Employee main screen (SCHEDULED state — rendered output)

```
📍 วันนี้
กะ: กะเช้า
พร้อมเข้างาน

[ 🟢 เข้างาน              ]
[ 📅 ตารางทีม             ]
[ 🗓 แจ้งวันหยุด           ]
[ 📝 คำร้อง               ]
[ 💰 เงินเดือน/สลิป        ]
[ ⚙️ เพิ่มเติม             ]
[ ❌ ปิด                  ]
```

### Manager operations screen (Owner / Secretary / Big Leader)

```
🧭 ศูนย์ปฏิบัติการ
(+ today status card when employee record exists)

[ 📍 วันนี้               ]
[ 🧭 ศูนย์ปฏิบัติการ       ]
[ ⚠️ ความเสี่ยงกำลังคน     ]
[ ✅ งานรออนุมัติ          ]
[ 👥 พนักงาน              ]
[ 💰 เงินเดือน            ]
[ 📅 ปฏิทินบริษัท          ]
[ ⚙️ เพิ่มเติม             ]
[ ❌ ปิด                  ]
```

> **Screenshots:** Restart the bot (`TELEGRAM_USE_POLLING=true` or redeploy webhook) and send `/start` in Telegram to confirm the live UI matches the layouts above. Old pinned messages may still show legacy keyboards until `/start` or `home` is tapped.

## Business role admin (employment tab)

- `PATCH /api/v1/employees/:employeeId/business-role` — body `{ businessRole, reason? }`
- Owner can assign any role; Secretary cannot assign or change Owner
- Audit: `permission_audits` + `employee_change_history` (field `businessRole`)
- Telegram menu resolves from `business_role_assignments` on next `/start`

### Files

- `backend/src/modules/employee/application/employee-business-role.service.ts`
- `backend/src/modules/employee/application/dto/employee-business-role.dto.ts`
- `web/src/components/hr/employee/EmployeeEmploymentTab.tsx` — editable บทบาท dropdown

## Files changed

### Backend (new)

- `prisma/migrations/20260629200000_pilot_workforce_staffing_rules/`
- `backend/src/modules/workforce-risk/**`
- `backend/src/modules/telegram/application/telegram-menu.builder.ts`
- `backend/src/modules/telegram/application/telegram-menu.builder.unit.spec.ts`
- `backend/src/modules/workforce-risk/domain/workforce-risk.resolver.unit.spec.ts`
- `backend/src/modules/workforce-risk/application/workforce-risk.service.unit.spec.ts`

### Backend (modified)

- `prisma/schema.prisma` — `WorkforceStaffingRule`
- `backend/src/app.module.ts` — `WorkforceRiskModule`
- `backend/src/modules/telegram/application/telegram-bot.service.ts` — `showMainMenu` only; legacy `showAttendanceMenu` removed
- `backend/src/modules/telegram/domain/entities/telegram-session.types.ts` — removed `MENU_ROOT_EMPLOYEE` / `MENU_ROOT_LEADER`
- `backend/src/modules/telegram/telegram.module.ts`
- `backend/src/modules/workday/application/workday-daily-brief.service.ts` — risk in 08:00 brief
- `backend/src/modules/workday/workday.module.ts`

### Web (modified)

- `web/src/api/workday.ts` — `fetchWorkforceRisk`
- `web/src/pages/attendance/AttendanceCommandCenterPage.tsx` — risk card

### Docs

- `WORKHQ_CONSTITUTION_V1.md` (new, Rule #14 Predictive Operations)
- `WORKHQ_V1_FOUNDATION_BLUEPRINT.md` (updated)
- `WORKHQ_UAT_CHECKLIST.md` (updated)
- `WORKHQ_PILOT_RELEASE_COMPLETION_REPORT.md` (this file)

## Telegram Today UX

**Employee main screen:**
- Today status card from `getTodayStatus()`
- Primary action by state
- 4 secondary: ตารางทีม, แจ้งวันหยุด, คำร้อง, เงินเดือน/สลิป
- ⚙️ เพิ่มเติม for marketing/sub-leader extras only

**Removed from employee main (v1):** KPI, AI, Training, Competencies, Succession, Documents, Announcements, Morning Brief, Attendance Alerts

**Manager menu (Owner/Secretary/Big Leader):** วันนี้, ศูนย์ปฏิบัติการ, ความเสี่ยงกำลังคน, งานรออนุมัติ, พนักงาน, เงินเดือน, ปฏิทินบริษัท, เพิ่มเติม

## Workforce Risk Engine

**Methods:** `getCompanyRisk`, `getTeamRisk`, `getRiskForecast`

**Levels:** GREEN / YELLOW / ORANGE / RED from `availableCount` vs `minimumRequired`

**APIs:**
- `GET /companies/:companyId/workforce-risk?date=`
- `GET /companies/:companyId/workforce-risk/forecast?startDate=&days=`
- `GET/POST /companies/:companyId/workforce-staffing-rules`

## Tests added

| Pattern | Count |
|---------|-------|
| `workforce-risk` | 13 |
| `business-role` | 4 |
| `telegram-menu` | 13 |

## Commands run

```powershell
npx prisma generate
cd backend; npx tsc --noEmit
cd web; npm run typecheck
npm run test:unit -- --testPathPattern=workforce-risk
npm run test:unit -- --testPathPattern=telegram-menu
```

## Known limitations

1. Default staffing minimum inferred when no rules (50% of team size, min 1).
2. Role-key rules stored but not yet applied per employee role.
3. Manager "วันนี้" on ops menu re-opens manager hub (not raw employee punch UI).

## Manual UAT

| # | Case | Expected |
|---|------|----------|
| 1 | Employee Telegram home | ≤4 secondary + state primary only |
| 2 | Employee menu | No KPI/AI/Training on main |
| 3 | Secretary Telegram | Manager ops menu with risk |
| 4 | Command center | Risk card with team drilldown |
| 5 | 08:00 brief | Includes risk lines when ORANGE/RED |
