# POL-003 — Absence Penalty Enforcement

**Status:** Design review complete — **approved for implementation** (Phase 3a scope)  
**Design review:** 2026-06-23 — all sections approved; **ABS-009 resolved** (Employee ฿1k · Sub ฿2k · Big ฿3k · Secretary ฿3k · **Owner: no absence status**)  
**Policy authority:** `WORKHQ_MASTER_POLICY_V1.md` v1.1 — ABS-001 to ABS-009  
**Closes gap:** G-101 (partial — payroll wiring in Phase 3b)  
**Date:** 2026-06-23

> Policy is approved. This document covers **enforcement only**. It does not redefine policy rules except where **ABS-009** is explicitly registered as an open gap.

---

## Design review outcome

| Item | Status |
|------|--------|
| Absence detection (ABS-001 criteria 1–3) | ✅ Approved |
| Manager approval + contact attestation (ABS-001 criterion 4) | ✅ Approved |
| Role penalties Employee / Sub Leader / Big Leader (ABS-002–004) | ✅ Approved |
| Payroll auto-deduction pipeline | ✅ Approved — **deferred Phase 3b** |
| Telegram notifications | ✅ Approved — **deferred Phase 3c** |
| Absence queue UI (manager review) | ✅ Approved — **included Phase 3a** |
| **ABS-009 Secretary / Owner penalty** | ✅ **Resolved** — Secretary ฿3,000/day; **Owner: no absence status** (never flagged) |

---

## Goal

Automatically convert **approved** absence records into payroll penalties at cycle build time, using role-based rates from `leave.rules.absencePenalties`:

| Role (`roleLevel`) | Penalty (ABS-002–004) |
|--------------------|------------------------|
| Employee | ฿1,000 / day |
| Sub Leader | ฿2,000 / day |
| Big Leader | ฿3,000 / day |
| **Secretary** (EMP-003 position) | **ABS-009 — rate undefined** |
| **Owner** (EMP-003 position) | **ABS-009 — rate undefined** |

**Out of scope for POL-003:** ABS-006–007 (missing >15 min labor units → POL-026), ABS-008 (missing punch settings), ABS-005 (constructive resignation — manual HR process).

**Phase split:**

| Phase | Scope |
|-------|--------|
| **3a** | DB + domain services + absence API + absence queue UI |
| **3b** | Payroll posting (`absence_deduction` item, builder, preview) — **implemented** |
| **3c** | Telegram notifications + payslip line display |

---

# Part A — Gap Analysis

## A.1 Modules reviewed

| Module | Root path |
|--------|-----------|
| Attendance | `backend/src/modules/attendance/` |
| Leave | `backend/src/modules/leave/` |
| Payroll | `backend/src/modules/payroll/` |
| Workflow | `backend/src/modules/workflow/` |
| Settings | `backend/src/modules/settings/` |
| Telegram | `backend/src/modules/telegram/` |
| Web UI | `web/src/pages/` |

---

## A.2 Existing attendance statuses

### Prisma enum `AttendanceRecordStatus`

**File:** `prisma/schema.prisma` (lines 123–131)

| Value | Used in app code? |
|-------|-------------------|
| `present` | Yes — set on check-in |
| `incomplete` | Yes — default before check-out |
| `corrected` | Yes — after approved correction |
| `absent` | **No** — enum exists; never written by services |

### Domain mirror

**File:** `backend/src/modules/attendance/domain/entities/attendance-record.entity.ts` (line 12)

```typescript
export type RecordStatus = 'present' | 'absent' | 'incomplete' | 'corrected';
```

### Related attendance enums (same schema file)

| Enum | Values | Purpose |
|------|--------|---------|
| `AttendanceRecordSource` | `telegram`, `web`, `correction` | Check-in channel |
| `AttendanceApprovalStatus` | `pending`, `approved`, `rejected` | OT + corrections |
| `ReminderType` | `break_start`, `break_end`, `missing_checkin`, `missing_checkout` | Schema only — no job |

### Attendance module files (current)

| File | Role |
|------|------|
| `backend/src/modules/attendance/application/attendance.service.ts` | Check-in/out, breaks, OT workflow, corrections |
| `backend/src/modules/attendance/domain/services/attendance-rules.service.ts` | Late minutes + late deduction only |
| `backend/src/modules/attendance/interface/http/attendance.controller.ts` | `POST check-in/out`, `GET daily`, `GET overtime/pending` |
| `backend/src/modules/attendance/infrastructure/persistence/attendance.prisma.repository.ts` | Persistence |
| `web/src/pages/attendance/AttendanceDailyPage.tsx` | Daily table |
| `web/src/pages/attendance/AttendanceOvertimePage.tsx` | Pending OT |

**Gap:** No absence record entity, no absence API, no job to flag absences, `absent` status unused.

---

## A.3 Existing payroll item types

### Prisma enum `PayrollItemType`

**File:** `prisma/schema.prisma` (lines 295–311)

```
salary | ot | meal_allowance | cross_border | bonus | leave_bonus |
late_deduction | commission | commission_adjustment | referral |
deposit | manual_adjustment
```

**Gap:** No `absence_deduction`.

### Builder-managed types

**File:** `backend/src/modules/payroll/domain/payroll-builder.constants.ts` (lines 8–14)

```typescript
export const BUILDER_MANAGED_ITEM_TYPES = [
  'salary', 'meal_allowance', 'late_deduction', 'leave_bonus', 'deposit',
] as const;
```

**Gap:** `absence_deduction` not included.

### Prisma enum `PayrollSourceRefType`

**File:** `prisma/schema.prisma` (lines 313–332)

Includes `attendance` (used by `late_deduction`). **Gap:** No `absence_record` ref type.

---

## A.4 Existing attendance-to-payroll integrations

| Integration | File(s) | Mechanism |
|-------------|---------|-----------|
| **Late deduction at check-in** | `attendance.service.ts` (59–74), `attendance-rules.service.ts` (67–77) | Computes `lateDeduction` → stored on `AttendanceRecord.lateDeduction` |
| **Late deduction aggregation** | `payroll/application/late-deduction-aggregator.service.ts` | Sums `lateDeduction > 0` for cycle period |
| **Late deduction domain** | `payroll/domain/services/late-deduction.service.ts` | Summarize + format note |
| **Payroll builder** | `payroll/application/payroll-builder.service.ts` (197–215, 313–318) | Auto-upserts `late_deduction` item |
| **Manual late API** | `payroll/interface/http/payroll.controller.ts` (64–72), `payroll.service.ts` (247–314) | `POST /payroll/cycles/:id/late-deduction` |
| **OT → payroll item** | `attendance.service.ts` (OT approval handler), `workflow-resolved.handler.ts` (86–91) | Creates `itemType: 'ot'`, `sourceRefType: 'overtime'` |
| **Meal allowance eligibility** | `payroll/application/meal-eligible-days.service.ts` | Counts days with `checkInAt`; excludes sick/emergency/unpaid leave |
| **Integration tests** | `backend/test/integration/payroll-late-deduction.integration.spec.ts`, `payroll-build.integration.spec.ts`, `payroll-meal-allowance.integration.spec.ts` | Cover late + meal paths |

**Gap:** No path from absence → payroll. `absencePenalties` settings exist but are never read at runtime.

---

## A.5 Existing Telegram notifications

| File | Attendance-related behavior |
|------|----------------------------|
| `backend/src/modules/telegram/application/telegram-bot.service.ts` | Check-in/out/break confirmations; team attendance dashboard (`team:attendance`, `team:not_in`); OT approval inline |
| `backend/src/modules/telegram/domain/telegram-report.formatter.ts` | `formatPersonalDailyReport`, `formatTeamAttendanceDashboard`, `formatPayslip` (aggregate gross/deductions only — no line-item breakdown) |
| `backend/src/modules/telegram/application/brief.service.ts` | Scheduled owner briefs: check-in rate, missing checkout, absent count KPI |
| `backend/src/modules/telegram/domain/entities/telegram-session.types.ts` | FSM states for attendance flows |
| `backend/src/modules/workflow/application/approval-notification.service.ts` | Approval hooks — logs only; no Telegram send for absence |

**Gap:** No absence-flag, absence-confirm, or absence-deduction Telegram messages.

---

## A.6 Leave module — approved leave detection (relevant to absence exclusion)

| File | Role |
|------|------|
| `backend/src/modules/leave/application/leave.service.ts` (457–476) | `onWorkflowResolved` → `status: approved` |
| `backend/src/modules/leave/infrastructure/persistence/leave.prisma.repository.ts` (42–83) | `listApprovedRequestsByEmployee`, `hasApprovedDateOverlap` |
| `backend/src/modules/leave/domain/services/leave-type-classification.ts` (6–14) | `isOffDayLeaveType()` — off-day types |
| `backend/src/modules/payroll/application/used-off-days.service.ts` | Approved off-day counting for leave bonus |
| `backend/src/modules/payroll/application/meal-eligible-days.service.ts` (50–84) | Approved leave exclusions |

**Gap:** No query path that asks “does this date have approved leave?” for absence detection — logic must be added.

---

## A.7 Workflow module — absence approval

| File | Role |
|------|------|
| `backend/src/modules/workflow/domain/types/approval.types.ts` (93–99) | Leave type → workflow mapping |
| `backend/src/modules/workflow/domain/approval-defaults.ts` | Default approver matrices |
| `backend/src/common/outbox/workflow-resolved.handler.ts` | Routes `attendance_correction`, `overtime`, `leave` |

**Gap:** No `absence` entity type or `absence_confirm` workflow. POL-003 uses **direct manager/HR confirm** on `AbsenceRecord` (not a multi-step workflow) to avoid scope creep. Optional phase 2: workflow-backed absence approval.

---

## A.8 Settings — absence penalties (configured, unwired)

| File | Content |
|------|---------|
| `backend/src/modules/settings/domain/leave-settings.types.ts` (14–18, 80–84) | `absencePenalties: { employee: 1000, subLeader: 2000, bigLeader: 3000 }` |
| `backend/src/modules/settings/application/leave-settings.service.ts` | `getRules(companyId)` |
| `web/src/pages/settings/LeaveSettingsPage.tsx` (255–257) | Admin UI |
| `LEAVE_SETTINGS.md` (line 70) | Marked **“Not wired”** |

---

## A.9 Gap summary

| # | Gap | Impact |
|---|-----|--------|
| G1 | No `AbsenceRecord` table or service | Cannot store approved absences |
| G2 | No absence detection job | Manual-only today |
| G3 | No `absence_deduction` payroll item | Penalties never deducted |
| G4 | `absencePenalties` settings unwired | Rates ignored |
| G5 | Meal allowance ignores absence | PAY-001f not enforced |
| G6 | No absence queue UI | No manager review path |
| G7 | No absence Telegram flow | No employee/manager alerts — **Phase 3c** |
| G8 | Payslip breakdown lacks absence line | **Phase 3b/3c** |
| G9 | **ABS-009** — Secretary/Owner penalty undefined | Approve-with-penalty blocked; policy gap explicit |

---

# Part B — Implementation Design

Policy rules ABS-001–ABS-005 are fixed. Design below implements enforcement only.

## B.1 Absence detection

**Service:** `AbsenceDetectionService` (pure, new)  
**Location:** `backend/src/modules/attendance/domain/services/absence-detection.service.ts`

**Candidate day** (auto-flag only — not yet a penalty):

```
isCandidate(employee, company, workDate) =
  NOT hasApprovedLeaveOnDate(employee, company, workDate)   // any leave type incl. off-day
  AND NOT hasCheckInOnDate(employee, company, workDate)
  AND employee.isActiveOnDate(workDate)
```

**Data sources:**

- Approved leave: `leave.prisma.repository.ts` overlap query (reuse pattern from `hasApprovedDateOverlap`)
- Check-in: `AttendanceRecord.checkInAt IS NOT NULL` for `workDate`
- Role: `EmployeeAssignment.roleLevel` at `workDate` (for penalty tier at approval)

**Job:** `AbsenceFlagJob` — daily cron, creates `AbsenceRecord` with `status = flagged`.

**Manual trigger:** `POST /attendance/absences/run-flag` for backfill or same-day admin run.

**Important:** Criterion ABS-001(4) “cannot be contacted” is **not automatable**. Auto-flag satisfies criteria 1–3 only. Penalty applies only after human approval (§B.2).

---

## B.2 Absence penalty generation

**Service:** `AbsencePenaltyService` (pure, new)  
**Location:** `backend/src/modules/attendance/domain/services/absence-penalty.service.ts`

### B.2.1 Policy gap ABS-009 — Secretary and Owner

**Authority:** `WORKHQ_MASTER_POLICY_V1.md` §6 — ABS-009.

| Position (EMP-003) | Policy status | Implementation rule |
|--------------------|---------------|---------------------|
| Employee | ABS-002 | Map via `roleLevel = employee` |
| Sub Leader | ABS-003 | Map via `roleLevel = sub_leader` |
| Big Leader | ABS-004 | Map via `roleLevel = big_leader` |
| **Secretary** | **ABS-009 open** | **No penalty rate.** Do **not** map to Big Leader or any other tier. |
| **Owner** | **ABS-009 open** | **No penalty rate.** Do **not** map to Big Leader or any other tier. |

**Detection (Phase 3a):** Compare normalized `employee.position` against EMP-003 values `Secretary` / `Owner` (case-insensitive). `roleLevel` alone is insufficient — a Secretary may carry `roleLevel = employee` on assignment.

**Approve behavior when ABS-009 applies:**

- `POST /attendance/absences/:id/approve` → **422** `AbsencePenaltyUndefinedError` (rule id `ABS-009` in error body)
- Record remains `flagged` (or may be `waived` without penalty)
- UI shows Thai message: `ยังไม่มีอัตราค่าปรับขาดงานสำหรับตำแหน่งนี้ (ABS-009) — รอการตัดสินใจจากเจ้าของ`
- **No** `penalty_amount` snapshot; **no** payroll item linkage (Phase 3b)

**When ABS-009 is resolved by policy owner:** add `secretary` and `owner` keys to `leave.rules.absencePenalties`, extend `AbsencePenaltiesByRole`, update master policy ABS-009 → confirmed rates, then enable approval path. Until then, enforcement is intentionally partial.

### B.2.2 Penalty resolution (ABS-002–004 only)

At **approval** time (when ABS-009 does not apply):

1. Read `LeaveSettingsService.getRules(companyId).absencePenalties`
2. If `employee.position` is Secretary or Owner → throw `AbsencePenaltyUndefinedError` (ABS-009)
3. Resolve `roleLevel` from primary assignment: `'employee' | 'sub_leader' | 'big_leader'`
4. Map to settings key: `employee` → `absencePenalties.employee`, `subLeader`, `bigLeader` — **no fallback**
5. Set `penalty_amount = dailyRate` (1 day per absence record)
6. Snapshot `role_level_snapshot`, `position_snapshot`, and `penalty_amount` on record (immutable after approval)

**Approval actor:** Manager with `attendance:write` + company scope (Big Leader / Sub Leader / HR).  
**Required attestation fields:** `contact_attempted_at`, `contact_notes` (min 10 chars) — proves ABS-001(4).

**Status flow:**

```
flagged → approved   (penalty locked in)
flagged → waived     (no penalty)
approved → waived    (only if not yet in locked payroll cycle)
approved → disputed  (employee challenge; blocks payroll until resolved)
disputed → approved|waived  (HR resolution)
```

**Naming:** Use `approved` (not `confirmed`) to align with user goal “approved absence records.”

---

## B.3 Payroll item creation (automatic) — **Phase 3b**

> **Deferred to Phase 3b.** Phase 3a stores approved records with `penalty_amount` but does **not** create payroll items.

Mirror the proven `late_deduction` pipeline.

**Aggregator:** `AbsenceDeductionAggregatorService`  
**Location:** `backend/src/modules/payroll/application/absence-deduction-aggregator.service.ts`

```
aggregateForPeriod(employeeId, companyId, periodStart, periodEnd):
  SELECT absence_records
  WHERE status = 'approved'
    AND work_date IN [periodStart, periodEnd]
    AND (payroll_item_id IS NULL OR item.cycle_id = currentCycle)
  RETURN { totalDeduction, sources[] }
```

**Builder integration** — `PayrollBuilderService.computeEmployee()`:

1. Call aggregator alongside late deduction (lines ~313–318 pattern)
2. Add `absenceDeduction` to preview row
3. In `upsertBuilderItems()`: if `absenceDeduction > 0`, upsert:

| Field | Value |
|-------|-------|
| `itemType` | `absence_deduction` |
| `amount` | `-totalDeduction` |
| `quantity` | count of approved absence days |
| `sourceRefType` | `absence_record` |
| `sourceRefId` | first record id |
| `note` | `payroll_builder \| Absence deduction (N days) \| 2026-06-02:฿1000[id] \| ...` |

4. Batch-update `absence_records.payroll_item_id` after item create

**Idempotency:** Rebuild updates existing builder-managed item (same as late deduction).

**Manual endpoint (parity):** `POST /payroll/cycles/:id/absence-deduction` — body `{ employeeId }`.

**Meal allowance (PAY-001f):** `MealEligibleDaysService` excludes dates with `approved` absence records.

---

## B.4 Payslip display — **Phase 3b / 3c**

> **Phase 3b:** backend breakdown key. **Phase 3c:** Telegram payslip line.

**Backend:** Payslip `breakdown` is keyed by `itemType` (`payroll.service.ts` lines 466–474). Adding `absence_deduction` to payroll items automatically includes it in `breakdown.absence_deduction`.

**Telegram payslip:** Extend `formatPayslip` / payslip fetch to show line items when breakdown available:

```
➖ หักสาย: ฿500
➖ หักขาดงาน: ฿2,000 (2 วัน)
```

**Web:** Employee payslip view (if exposed) and payroll cycle detail show absence line.

**Thai label:** `หักค่าขาดงาน` — add to `docs/design-system/thai-labels.json` and `web/src/i18n/th-labels.ts`.

---

## B.5 Audit trail

| Event | Stored where |
|-------|--------------|
| Auto-flag | `absence_records.created_at`, `flagged_reason` |
| Approval | `approved_by`, `approved_at`, `contact_attempted_at`, `contact_notes`, role/amount snapshot |
| Waiver | `waived_by`, `waived_at`, `waive_reason` |
| Dispute | `disputed_at`, `dispute_reason`, `resolved_by`, `resolved_at` |
| Payroll link | `payroll_item_id` on absence record |
| System audit | `AuditService.record()` — actions: `approve_absence`, `waive_absence`, `create_absence_deduction` |

All mutations require actor context. Locked-cycle guard: cannot waive approved absence linked to locked/paid payroll item.

---

## B.6 Telegram notification — **Phase 3c**

> **Deferred to Phase 3c.** Phase 3a has no Telegram sends.

**Notifier:** `AbsenceTelegramNotifier` (new)  
**Location:** `backend/src/modules/attendance/infrastructure/notifications/absence-telegram.notifier.ts`  
**Gateway:** Existing `TelegramGatewayService.sendMessage()`

| Trigger | Recipient | Thai template |
|---------|-----------|---------------|
| Record flagged | Employee | `⚠️ วันที่ {date}: ไม่พบการลงเวลาและไม่มีการลาที่อนุมัติ กรุณาติดต่อหัวหน้างาน/HR` |
| Flagged digest | Big Leader (company) | `📋 ขาดงานรอตรวจสอบ {date}: {count} คน` |
| Record approved | Employee | `❌ การขาดงานวันที่ {date} ได้รับการอนุมัติ ค่าปรับ ฿{amount} จะหักในรอบเงินเดือน` |
| Record waived | Employee | `✅ ยกเลิกการขาดงานวันที่ {date}: {reason}` |
| Deduction posted | Employee | `💰 หักค่าขาดงาน ฿{total} ({n} วัน) รอบ {cycleLabel}` |
| Dispute opened | Manager/HR | `⚠️ พนักงาน {name} โต้แย้งการขาดงานวันที่ {date}` |

**Approval interaction:** No Telegram approval required for POL-003 (web-only manager review). Employee may reply `dispute` inline button on approval message → sets `disputed`, notifies manager.

---

# Part C — Database Changes

Minimal schema — only what enforcement requires.

## C.1 New enums (schema `attendance`)

```prisma
enum AbsenceRecordStatus {
  flagged
  approved
  waived
  disputed
}

enum AbsenceRoleLevel {
  employee
  sub_leader
  big_leader
}
```

## C.2 New table (schema `attendance`)

```prisma
model AbsenceRecord {
  id                  String               @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  employeeId          String               @map("employee_id") @db.Uuid
  companyId           String               @map("company_id") @db.Uuid
  workDate            DateTime             @map("work_date") @db.Date
  status              AbsenceRecordStatus  @default(flagged)
  roleLevelSnapshot   AbsenceRoleLevel?    @map("role_level_snapshot")
  positionSnapshot    String?              @map("position_snapshot")  // EMP-003 at approval; used for ABS-009 check
  penaltyAmount       Decimal?             @map("penalty_amount") @db.Decimal(14, 2)
  contactAttemptedAt  DateTime?            @map("contact_attempted_at") @db.Timestamptz()
  contactNotes        String?              @map("contact_notes")
  approvedBy          String?              @map("approved_by") @db.Uuid
  approvedAt          DateTime?            @map("approved_at") @db.Timestamptz()
  waivedBy            String?              @map("waived_by") @db.Uuid
  waivedAt            DateTime?            @map("waived_at") @db.Timestamptz()
  waiveReason         String?              @map("waive_reason")
  disputeReason       String?              @map("dispute_reason")
  disputedAt          DateTime?            @map("disputed_at") @db.Timestamptz()
  resolvedBy          String?              @map("resolved_by") @db.Uuid
  resolvedAt          DateTime?            @map("resolved_at") @db.Timestamptz()
  payrollItemId       String?              @map("payroll_item_id") @db.Uuid
  flaggedReason       String               @map("flagged_reason")
  createdAt           DateTime             @default(now()) @map("created_at") @db.Timestamptz()
  updatedAt           DateTime             @default(now()) @updatedAt @map("updated_at") @db.Timestamptz()
  deletedAt           DateTime?            @map("deleted_at") @db.Timestamptz()
  deletedBy           String?              @map("deleted_by") @db.Uuid

  @@unique([employeeId, companyId, workDate], map: "absence_records_employee_company_date_uq")
  @@index([companyId, workDate, status])
  @@map("absence_records")
  @@schema("attendance")
}
```

## C.3 Extend payroll enums (schema `payroll`) — **Phase 3b only**

> Phase 3a migration does **not** extend payroll enums. `payroll_item_id` column on `AbsenceRecord` is nullable and unused until 3b.

```prisma
// PayrollItemType — add (Phase 3b):
absence_deduction

// PayrollSourceRefType — add (Phase 3b):
absence_record
```

## C.4 Not changing (avoid unnecessary schema)

| Artifact | Reason |
|----------|--------|
| `AttendanceRecord` columns | Absence is separate entity; optionally set `status = absent` on approve for UI only (app-level, not required) |
| `AttendanceReminder` | Unrelated |
| New workflow tables | Direct approve on absence record |
| Settings schema | `absencePenalties` already in JSON settings |

---

# Part D — API Changes

Base: `/api/v1`

## D.1 New endpoints

### List absence records

```
GET /attendance/absences?companyId={uuid}&status=flagged&from=2026-06-01&to=2026-06-30&employeeId={uuid}
Permission: attendance:read
```

**Response 200:**

```json
{
  "items": [
    {
      "id": "a1b2c3d4-...",
      "employeeId": "emp-uuid",
      "employeeName": "สมชาย ใจดี",
      "companyId": "co-uuid",
      "workDate": "2026-06-15",
      "status": "flagged",
      "roleLevelSnapshot": null,
      "positionSnapshot": "Employee",
      "penaltyAmount": null,
      "contactAttemptedAt": null,
      "contactNotes": null,
      "approvedAt": null,
      "payrollItemId": null,
      "flaggedReason": "no_checkin_no_leave"
    }
  ],
  "total": 1
}
```

### Get absence record

```
GET /attendance/absences/:id
Permission: attendance:read
```

### Approve absence (creates penalty snapshot)

```
POST /attendance/absences/:id/approve
Permission: attendance:write
```

**Request:**

```json
{
  "contactAttemptedAt": "2026-06-16T09:30:00+07:00",
  "contactNotes": "โทร 3 ครั้ง ไม่รับสาย ส่ง LINE ไม่ตอบ"
}
```

**Response 200:**

```json
{
  "id": "a1b2c3d4-...",
  "status": "approved",
  "roleLevelSnapshot": "employee",
  "penaltyAmount": 1000,
  "approvedAt": "2026-06-16T10:00:00+07:00",
  "approvedBy": "user-uuid"
}
```

### Waive absence

```
POST /attendance/absences/:id/waive
Permission: attendance:write
```

**Request:**

```json
{ "reason": "พนักงานลาป่วยฉุกเฉิน อนุมัติย้อนหลังแล้ว" }
```

### Dispute absence (employee self or HR)

```
POST /attendance/absences/:id/dispute
Permission: employee:self (own record) | attendance:write
```

**Request:**

```json
{ "reason": "ลาป่วยแล้วแต่ระบบยังไม่อนุมัติ" }
```

### Run flag job manually

```
POST /attendance/absences/run-flag
Permission: attendance:write
```

**Request:**

```json
{ "companyId": "co-uuid", "workDate": "2026-06-15" }
```

**Response 200:**

```json
{ "flaggedCount": 3, "skippedCount": 12 }
```

### Post absence deduction to payroll cycle — **Phase 3b**

```
POST /payroll/cycles/:id/absence-deduction
Permission: payroll:write
```

**Request:**

```json
{ "employeeId": "emp-uuid" }
```

**Response 201:**

```json
{
  "id": "item-uuid",
  "totalDeduction": 2000,
  "sourceCount": 2,
  "sources": [
    { "absenceRecordId": "...", "workDate": "2026-06-02", "amount": 1000, "roleLevel": "employee" },
    { "absenceRecordId": "...", "workDate": "2026-06-05", "amount": 1000, "roleLevel": "employee" }
  ],
  "skipped": false
}
```

### Employee absence history (self-service)

```
GET /attendance/absences/me?from=2026-01-01&to=2026-06-30
Permission: employee:self
```

## D.2 Modified endpoints — **Phase 3b**

### Build preview / build cycle / payslip

Deferred — payroll module changes in Phase 3b.

## D.3 Error codes (new)

| Error | HTTP |
|-------|------|
| `AbsenceRecordNotFoundError` | 404 |
| `AbsenceAlreadyApprovedError` | 409 |
| `AbsenceContactNotesRequiredError` | 400 |
| `AbsenceLinkedToLockedPayrollError` | 409 |
| `AbsenceDeductionAlreadyExistsError` | 409 | **Phase 3b** |
| `AbsencePenaltyUndefinedError` | 422 | ABS-009 — Secretary/Owner position; body includes `{ ruleId: "ABS-009" }` |

---

# Part E — UI Changes

**Phase 3a:** E.2 (absence queue), E.4 (daily page badge), partial E.1 labels.  
**Phase 3b:** E.3 payroll visibility.  
**Phase 3c:** E.1 Telegram/payslip lines.

Follow **UX-01 WorkHQ Design System** (`docs/design-system/UX-01-design-system.md`): Thai-first, card-based, warm neutrals, `WorkHQCard` / `WorkHQBadge` / `WorkHQButton` components.

Labels from `docs/design-system/thai-labels.json` + `web/src/i18n/th-labels.ts`.

## E.1 Employee — Attendance history & absence penalties

### New section: Employee self view (Telegram primary; web secondary)

**Telegram:** Existing `report:today` / personal report extended with absence status for recent dates.

**Web (phase 2 minimal):** Route `/me/attendance` or tab on employee dashboard

| Element | Thai label | Design |
|---------|------------|--------|
| Page title | ประวัติการเข้างาน | `WorkHQPageHeader` |
| Status badge flagged | รอตรวจสอบ | `WorkHQBadge` warning |
| Status badge approved | ขาดงาน (อนุมัติ) | `WorkHQBadge` danger |
| Status badge waived | ยกเลิก | `WorkHQBadge` success |
| Penalty column | ค่าปรับ | `formatMoney` THB |
| Dispute button | โต้แย้ง | `WorkHQButton` secondary |

### Payslip line (Telegram + web)

Show `หักค่าขาดงาน: ฿{amount}` when `breakdown.absence_deduction` present.

## E.2 Manager — Absence review (**Phase 3a**)

### New page: `/attendance/absences`

**File:** `web/src/pages/attendance/AbsenceReviewPage.tsx`  
**Nav:** `web/src/layout/nav-config.ts` — add under การเข้างาน:

```typescript
{ label: 'ตรวจสอบขาดงาน', path: '/attendance/absences', icon: '🚫', permissions: ['attendance:write'] }
```

| Element | Description |
|---------|-------------|
| Filters | บริษัท, ช่วงวันที่, สถานะ (รอตรวจสอบ / อนุมัติแล้ว / ยกเลิก / โต้แย้ง) |
| Table | พนักงาน, วันที่, สถานะ, ตำแหน่ง, ค่าปรับ, หมายเหตุการติดต่อ |
| Approve modal | วันที่ติดต่อ + หมายเหตุ (required, min 10 ตัวอักษร) |
| Approve blocked (ABS-009) | Inline error: `ยังไม่มีอัตราค่าปรับขาดงานสำหรับตำแหน่ง Secretary/Owner` — Approve button disabled when position is Secretary/Owner |
| Waive modal | เหตุผล (required) |
| Resolve dispute | อนุมัติ / ยกเลิก |

**Design tokens:** Warning card for flagged rows (`--whq-state-warning-bg`), danger for approved penalties.

## E.3 Payroll — Penalty visibility — **Phase 3b**

### Update: `web/src/pages/payroll/PayrollCycleDetailPage.tsx`

| Change | Thai label |
|--------|------------|
| New preview column | หักขาดงาน |
| New stat card | รวมหักขาดงาน |
| Employee row expand (optional) | รายละเอียดวันที่ขาดงาน |

### Update: `web/src/api/payroll.ts`

Add `absenceDeduction: number` to `PayrollBuilderPreviewEmployee`.

## E.4 Update: `web/src/pages/attendance/AttendanceDailyPage.tsx`

- Badge **อาจขาดงาน** on rows: no check-in + no approved leave + no absence record yet
- Link to absence review pre-filtered by date

## E.5 Update: `web/src/pages/settings/LeaveSettingsPage.tsx`

Relabel absence penalty section: **ค่าปรับขาดงาน (ใช้งานแล้ว — POL-003)** with help text referencing ABS-002–004.

## E.6 Update: `web/src/pages/hr/EmployeeDetailPage.tsx` (phase 2)

Tab **ประวัติขาดงาน** — list approved/waived absence records for HR view.

---

# Part F — Telegram Flow

```
┌──────────────┐    23:00 cron     ┌─────────────┐
│ No check-in  │ ───────────────► │ flagged     │
│ No leave     │                  │ AbsenceRecord│
└──────────────┘                  └──────┬──────┘
                                         │ notify employee + leader digest
                                         ▼
                                  ┌─────────────┐
                                  │ Manager web │
                                  │ approve     │
                                  └──────┬──────┘
                                         │ notify employee
                                         ▼
                                  ┌─────────────┐
                                  │ approved    │
                                  │ penalty set │
                                  └──────┬──────┘
                                         │ payroll build
                                         ▼
                                  ┌─────────────┐
                                  │ absence_    │
                                  │ deduction   │
                                  └──────┬──────┘
                                         │ notify employee
                                         ▼
                                  ┌─────────────┐
                                  │ payslip     │
                                  │ breakdown   │
                                  └─────────────┘
```

## F.1 Employee notification

1. **Flagged** — same day or next morning after job runs
2. **Approved** — immediately on manager approve (amount + effective cycle)
3. **Waived** — immediately with reason
4. **Deduction posted** — on payroll build or manual post
5. **Payslip available** — existing payslip flow includes absence line

## F.2 Manager notification

1. **Daily digest** — count of flagged records for their company (Big Leader)
2. **Dispute opened** — when employee disputes approved absence

No Telegram approve action in POL-003 — managers use web `/attendance/absences`.

## F.3 Payroll notification

Payroll team does not need a separate Telegram channel. Visibility is via:

- Web payroll cycle detail (preview column + stat card)
- Existing owner brief (`brief.service.ts`) — optional extension: add `absenceDeductionsTotal` to evening brief

## F.4 Approval interaction

| Channel | Action |
|---------|--------|
| Web | Manager approves/waives (required path) |
| Telegram | Employee inline button **โต้แย้ง** on approval message → `POST /attendance/absences/:id/dispute` |
| Telegram | No manager inline approve (keeps audit trail on web) |

---

# Part G — Test Plan

## G.1 Unit tests

| File | Cases |
|------|-------|
| `absence-detection.service.unit.spec.ts` | Approved leave excludes; check-in excludes; flags when neither; inactive employee skipped |
| `absence-penalty.service.unit.spec.ts` | employee→1000, sub_leader→2000, big_leader→3000; **Secretary→AbsencePenaltyUndefinedError**; **Owner→AbsencePenaltyUndefinedError**; no big_leader fallback |
| `absence-record.service.unit.spec.ts` | Approve requires contact notes; waive blocked on locked payroll; status transitions |
| `absence-deduction.service.unit.spec.ts` | Summarize N days; format note string |
| `meal-eligible-days.service.unit.spec.ts` | Approved absence day excluded from meal count |

## G.2 Integration tests

| File | Scenario |
|------|----------|
| `absence-record.integration.spec.ts` | Flag → approve → list; waive; permissions 403 |
| `payroll-absence-deduction.integration.spec.ts` | 2 approved absences (employee) → ฿2,000 item; sources linked; idempotent rebuild |
| `payroll-build.integration.spec.ts` | **Extend:** preview includes `absenceDeduction`; builder creates item |
| `payroll-meal-allowance.integration.spec.ts` | **Extend:** absence day excluded |
| `telegram-absence.integration.spec.ts` | Approve triggers Thai message to linked Telegram identity |

**Fixture helper** (`backend/test/helpers/fixtures.ts`):

```typescript
createApprovedAbsence(prisma, { employeeId, companyId, workDate, roleLevel })
```

## G.3 UAT checklist

| # | Step | Expected |
|---|------|----------|
| 1 | Employee no check-in, no leave on work day | Next-day flagged record |
| 2 | Employee receives Telegram flagged message | Thai warning received |
| 3 | Manager opens `/attendance/absences` | Flagged row visible |
| 4 | Manager approves with contact notes | Status `approved`, penalty ฿1,000 (employee) |
| 5 | Employee receives Telegram approval message | Shows ฿1,000 |
| 6 | Secretary flagged — manager attempts approve | **422 ABS-009**; record stays flagged |
| 7 | Owner flagged — manager attempts approve | **422 ABS-009**; no ฿3,000 fallback |
| 8 | Secretary/Owner flagged — manager waives | Status `waived`, no penalty |
| 9 | Payroll build executes | `absence_deduction` item created |
| 10 | Payslip generated | Breakdown includes `absence_deduction` |
| 11 | Telegram payslip | Shows หักค่าขาดงาน line |
| 12 | Waive before build | No deduction in preview |
| 13 | Approved leave on same day | No flag created |
| 14 | Employee disputes via Telegram | Status `disputed`, manager notified |
| 15 | Meal allowance for cycle | Absence days excluded |
| 16 | Settings penalty changed to 1500 | New approvals use 1500; existing snapshots unchanged |
| 17 | Rebuild payroll cycle | Idempotent — no duplicate items |
| 18 | Locked cycle + waive attempt | Error 409 |

---

# Output Summary

## 1. Current state

- Attendance tracks check-in/out and late deductions; `absent` enum value unused.
- Leave approval works; no absence overlap check exists.
- Payroll auto-deducts late attendance; no absence deduction path.
- `absencePenalties` (1000/2000/3000) stored in settings, marked unwired.
- Telegram handles check-in/out and team dashboards; no absence notifications.
- No absence review UI.

## 2. Gap analysis

See **Part A** — 8 gaps (G1–G8). Primary: no `AbsenceRecord`, no `absence_deduction`, settings unwired.

## 3. Implementation design

See **Part B** — detection job → manager approve → automatic payroll conversion mirroring `late_deduction`. Policy ABS-001(4) enforced via contact attestation at approval.

## 4. Files affected

### New files

```
prisma/migrations/*_absence_penalty_enforcement/migration.sql
backend/src/modules/attendance/domain/entities/absence-record.entity.ts
backend/src/modules/attendance/domain/services/absence-detection.service.ts
backend/src/modules/attendance/domain/services/absence-penalty.service.ts
backend/src/modules/attendance/domain/services/absence-record.service.ts
backend/src/modules/attendance/domain/errors/absence.errors.ts
backend/src/modules/attendance/domain/repositories/absence-record.repository.ts
backend/src/modules/attendance/infrastructure/persistence/absence-record.prisma.repository.ts
backend/src/modules/attendance/infrastructure/notifications/absence-telegram.notifier.ts
backend/src/modules/attendance/application/absence.service.ts
backend/src/modules/attendance/application/absence-flag.job.ts
backend/src/modules/attendance/application/dto/absence.dto.ts
backend/src/modules/attendance/interface/http/absence.controller.ts
backend/src/modules/payroll/domain/services/absence-deduction.service.ts
backend/src/modules/payroll/application/absence-deduction-aggregator.service.ts
backend/test/integration/absence-record.integration.spec.ts
backend/test/integration/payroll-absence-deduction.integration.spec.ts
backend/test/integration/telegram-absence.integration.spec.ts
web/src/pages/attendance/AbsenceReviewPage.tsx
web/src/api/absence.ts
```

### Modified files

```
prisma/schema.prisma
LEAVE_SETTINGS.md
backend/src/modules/payroll/domain/payroll-builder.constants.ts
backend/src/modules/payroll/application/payroll-builder.service.ts
backend/src/modules/payroll/application/payroll.service.ts
backend/src/modules/payroll/application/dto/payroll-builder.dto.ts
backend/src/modules/payroll/application/dto/payroll.dto.ts
backend/src/modules/payroll/application/meal-eligible-days.service.ts
backend/src/modules/payroll/interface/http/payroll.controller.ts
backend/src/modules/payroll/payroll.module.ts
backend/src/modules/attendance/attendance.module.ts
backend/src/modules/telegram/domain/telegram-report.formatter.ts
web/src/pages/payroll/PayrollCycleDetailPage.tsx
web/src/pages/attendance/AttendanceDailyPage.tsx
web/src/pages/settings/LeaveSettingsPage.tsx
web/src/api/payroll.ts
web/src/App.tsx
web/src/layout/nav-config.ts
web/src/i18n/th-labels.ts
docs/design-system/thai-labels.json
WORKHQ_POLICY_IMPLEMENTATION_MATRIX.md  (post-implementation: ABS-002–004 → wired)
```

## 5. Migration requirements

| Change | Phase | Migration |
|--------|-------|-----------|
| `attendance.absence_records` table | **3a** | Required |
| `AbsenceRecordStatus`, `AbsenceRoleLevel` enums | **3a** | Required |
| `PayrollItemType.absence_deduction` | **3b** | Required |
| `PayrollSourceRefType.absence_record` | **3b** | Required |
| Seed / backfill | **3a** | Optional one-time `run-flag` per company |

No changes to existing tables except enum extensions (additive, safe).

## 6. Test plan

See **Part G** — 5 unit spec files, 5 integration spec files, 18-step UAT checklist.

---

## Rollout sequence

| Phase | Deliverable | Excluded |
|-------|-------------|----------|
| **3a** | `absence_records` migration · domain services · absence API · flag job · **`/attendance/absences` queue UI** · ABS-009 approve block | Payroll enums, builder, meal exclusion |
| **3b** | Payroll `absence_deduction` item · aggregator · builder · manual endpoint · cycle detail UI · meal PAY-001f | — |
| **3c** | Telegram notifier · payslip line · dispute inline button · UAT items 2, 5, 8–11, 14 | — |

---

# Part H — Phase 3a Implementation Plan

**Goal:** Managers can see flagged absences, approve (with penalty snapshot for Employee/Sub Leader/Big Leader), waive, or dispute — with **ABS-009 blocking** Secretary/Owner approvals. No payroll posting. No Telegram.

## H.1 Prerequisites

- Design review complete (this document, ABS-009 registered)
- No code changes to `leave.rules.absencePenalties` schema in 3a (still 3 keys only)

## H.2 Task sequence

| Step | Task | Owner layer | Deliverable |
|------|------|-------------|-------------|
| **1** | Prisma migration: `AbsenceRecordStatus`, `AbsenceRoleLevel`, `absence_records` table (incl. `position_snapshot`, nullable `payroll_item_id`) | DB | `prisma/migrations/*_absence_records_3a/` |
| **2** | Domain entity + repository interface | Domain | `absence-record.entity.ts`, `absence-record.repository.ts` |
| **3** | `AbsenceDetectionService` — pure candidate-day logic | Domain | Unit tests: leave excludes, check-in excludes, inactive skipped |
| **4** | `AbsencePenaltyService` — tier resolution + **ABS-009 guard** | Domain | Unit tests: 1k/2k/3k tiers; Secretary/Owner → `AbsencePenaltyUndefinedError` |
| **5** | `AbsenceRecordService` — status transitions, contact attestation validation | Domain | Unit tests: approve requires notes; waive; dispute |
| **6** | Domain errors | Domain | `AbsencePenaltyUndefinedError`, `AbsenceContactNotesRequiredError`, etc. |
| **7** | Prisma repository | Infra | `absence-record.prisma.repository.ts` |
| **8** | `AbsenceService` application orchestration | Application | Wire settings, employee position, assignment roleLevel |
| **9** | `AbsenceFlagJob` + manual `run-flag` | Application | Daily cron module registration |
| **10** | HTTP controller + DTOs + module wiring | Interface | `absence.controller.ts`, extend `attendance.module.ts` |
| **11** | Integration tests: flag → approve → list; ABS-009 422; permissions | Test | `absence-record.integration.spec.ts` |
| **12** | Web API client | Web | `web/src/api/absence.ts` |
| **13** | `AbsenceReviewPage.tsx` — queue table, filters, approve/waive/dispute modals | Web | Route `/attendance/absences` |
| **14** | Nav + routing + Thai labels | Web | `nav-config.ts`, `App.tsx`, `th-labels.ts` |
| **15** | `AttendanceDailyPage` — optional “อาจขาดงาน” badge + link | Web | Cross-link to queue |
| **16** | `LEAVE_SETTINGS.md` + settings help text — note ABS-002–004 wired for queue; ABS-009 open | Docs | Settings page help only (no schema change) |

## H.3 Phase 3a — files to create

```
prisma/migrations/*_absence_records_3a/migration.sql
backend/src/modules/attendance/domain/entities/absence-record.entity.ts
backend/src/modules/attendance/domain/services/absence-detection.service.ts
backend/src/modules/attendance/domain/services/absence-penalty.service.ts
backend/src/modules/attendance/domain/services/absence-record.service.ts
backend/src/modules/attendance/domain/errors/absence.errors.ts
backend/src/modules/attendance/domain/repositories/absence-record.repository.ts
backend/src/modules/attendance/infrastructure/persistence/absence-record.prisma.repository.ts
backend/src/modules/attendance/application/absence.service.ts
backend/src/modules/attendance/application/absence-flag.job.ts
backend/src/modules/attendance/application/dto/absence.dto.ts
backend/src/modules/attendance/interface/http/absence.controller.ts
backend/src/modules/attendance/domain/services/absence-detection.service.unit.spec.ts
backend/src/modules/attendance/domain/services/absence-penalty.service.unit.spec.ts
backend/src/modules/attendance/domain/services/absence-record.service.unit.spec.ts
backend/test/integration/absence-record.integration.spec.ts
web/src/pages/attendance/AbsenceReviewPage.tsx
web/src/api/absence.ts
```

## H.4 Phase 3a — files to modify

```
prisma/schema.prisma
backend/src/modules/attendance/attendance.module.ts
web/src/App.tsx
web/src/layout/nav-config.ts
web/src/i18n/th-labels.ts
web/src/pages/attendance/AttendanceDailyPage.tsx  (badge + link)
web/src/pages/settings/LeaveSettingsPage.tsx      (help text only)
LEAVE_SETTINGS.md
WORKHQ_MASTER_POLICY_V1.md                       (ABS-009 — done)
WORKHQ_POLICY_IMPLEMENTATION_MATRIX.md             (ABS-009 row — done)
```

## H.5 Explicitly deferred (not Phase 3a)

| Item | Phase |
|------|-------|
| `PayrollItemType.absence_deduction` migration | 3b |
| `AbsenceDeductionAggregatorService` | 3b |
| `PayrollBuilderService` absence line | 3b |
| `POST /payroll/cycles/:id/absence-deduction` | 3b |
| `MealEligibleDaysService` absence exclusion | 3b |
| `PayrollCycleDetailPage` absence column | 3b |
| `AbsenceTelegramNotifier` | 3c |
| `telegram-absence.integration.spec.ts` | 3c |
| `payroll-absence-deduction.integration.spec.ts` | 3b |

## H.6 Phase 3a acceptance criteria

| # | Criterion |
|---|-----------|
| AC-1 | Flag job creates `flagged` record when no check-in + no approved leave on work day |
| AC-2 | Approved leave on same day prevents flag |
| AC-3 | `GET /attendance/absences` returns filtered queue with employee name |
| AC-4 | Manager approves employee-tier absence → `approved`, `penalty_amount = 1000`, snapshots set |
| AC-5 | Sub leader → 2000; big leader → 3000 |
| AC-6 | Secretary position → approve returns **422** `AbsencePenaltyUndefinedError` / rule `ABS-009` |
| AC-7 | Owner position → same 422 (no Big Leader fallback) |
| AC-8 | Secretary/Owner flagged record can be **waived** |
| AC-9 | Approve without contact notes → 400 |
| AC-10 | Web queue shows flagged rows; approve/waive modals work; ABS-009 shows blocked state |
| AC-11 | No payroll items created; `payroll_item_id` remains null |
| AC-12 | No Telegram messages sent |

## H.7 Phase 3a test matrix

| Layer | File | Cases |
|-------|------|-------|
| Unit | `absence-penalty.service.unit.spec.ts` | Tier mapping; ABS-009 Secretary; ABS-009 Owner; no big_leader fallback for secretary |
| Unit | `absence-detection.service.unit.spec.ts` | Leave overlap; check-in; active employee |
| Unit | `absence-record.service.unit.spec.ts` | Status machine; contact notes min length |
| Integration | `absence-record.integration.spec.ts` | Full flag→approve; ABS-009 422; waive; 403 without permission |

---

*End of POL-003 Implementation Design — Phase 3a ready for implementation.*
