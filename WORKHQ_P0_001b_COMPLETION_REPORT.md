# P0-001b — Telegram Onboarding Production Hardening — Completion Report

**Date:** 2026-06-29  
**Status:** Complete (pending live Telegram + DATABASE_URL integration UAT)

---

## 1. Scope Completed

| # | Item | Status |
|---|------|--------|
| 1 | Full employee assignment on approval | ✅ |
| 2 | Idempotency / double-approve safety | ✅ |
| 3 | Invitation management view/actions | ✅ |
| 4 | Request type rename (`employee_onboarding`) | ✅ Option A |
| 5 | Approval Center preview + inline actions | ✅ |
| 6 | Onboarding timeline events | ✅ |

Out of scope (unchanged): Employee Detail UX redesign, Payroll, Dashboard, unrelated features.

---

## 2. Files Created

| File | Purpose |
|------|---------|
| `backend/src/modules/employee-onboarding/domain/employment-preset.util.ts` | Maps invitation preset → employee + assignment updates |
| `backend/src/modules/employee-onboarding/domain/employment-preset.util.unit.spec.ts` | Preset mapping unit tests |
| `WORKHQ_P0_001b_COMPLETION_REPORT.md` | This report |

---

## 3. Files Updated

### Backend

| File | Change |
|------|--------|
| `employee-onboarding-approval.service.ts` | Full preset apply, business role, probation bootstrap, reject idempotency |
| `employee-telegram-invite.service.ts` | List/detail enrichment, preset on placeholder employee, regenerate/cancel |
| `onboarding-preview.builder.ts` | Department name in preview |
| `employee-onboarding.constants.ts` | Timeline event keys + Thai labels |
| `employee-onboarding-timeline.service.ts` | Idempotent `recordIfNew` |
| `telegram-registration-request-bridge.service.ts` | New requests use `employee_onboarding` |
| `request-integration.service.ts` | Approve/reject both type keys |
| `request-seed.defaults.ts` | `employee_onboarding` type + workflow |
| `request-instance.service.ts` | Onboarding preview on list/detail |
| `telegram-registration-integration.service.ts` | Delegates to `EmployeeOnboardingApprovalService` |
| `employee-self-onboarding.service.ts` | Bridge for PENDING identity + started invite |
| `telegram-identity.service.ts` | PENDING identity on invite consume |
| `telegram-connection-status.util.ts` | Unified connection status |
| `employee-onboarding.controller.ts` | Invite list/detail/regenerate/cancel APIs |
| `employee-onboarding-approval.service.unit.spec.ts` | Approve/reject idempotency tests |

### Frontend

| File | Change |
|------|--------|
| `InvitationCodePage.tsx` | Management table, copy/regenerate/cancel/detail modal |
| `ApprovalsPage.tsx` | Onboarding preview + inline approve/reject |
| `RequestDetailPage.tsx` | Onboarding preview card + approve/reject with reason |
| `employee-onboarding.ts` | Invite management API client |
| `request-platform.ts` | `onboardingPreview` type |
| `employee-timeline` (labels) | Thai onboarding event labels |

### Documentation

| File | Change |
|------|--------|
| `WORKHQ_POLICY_IMPLEMENTATION_MATRIX.md` | P0-001b rows |
| `WORKHQ_UAT_CHECKLIST.md` | P0-001b UAT scenarios |

---

## 4. APIs Changed

| Method | Path | Notes |
|--------|------|-------|
| GET | `/employee-telegram-invites` | Enriched list (company, department, team, timestamps) |
| GET | `/employee-telegram-invites/:id` | Detail + submission preview + copy hint |
| POST | `/employee-telegram-invites/:id/regenerate` | Invalidates old token; returns raw link once |
| POST | `/employee-telegram-invites/:id/cancel` | Disables invite |
| GET | `/requests/pending-approval` | Includes `onboardingPreview` |
| GET | `/requests/:id` | Includes `onboardingPreview` |
| POST | `/requests/:id/approve` | Idempotent onboarding integration |
| POST | `/requests/:id/reject` | Reject with reason; idempotent |

---

## 5. DB / Migration Changes

Uses P0-001 migration `20260629120000_p0_telegram_invitation_onboarding`:

- `EmployeeTelegramInviteStatus.started`
- Nullable `employeeId` on invite
- `presetJson` on invite
- `submittedAt`, `startedAt`, `approvedAt`, `rejectedAt` timestamps

No additional P0-001b migration required.

---

## 6. Request Type Strategy

**Option A (implemented):** New request type `employee_onboarding` for all invite-first onboarding going forward.

- Thai label: **รับพนักงานใหม่**
- Legacy `telegram_registration_review` records still open, approve, and reject via the same integration handler
- Display mapping in Approval Center, request detail, and timeline uses employee-centric label

---

## 7. Idempotency Strategy

| Layer | Mechanism |
|-------|-----------|
| Request integration | Skip when `integrationStatus === 'completed'` |
| Approval service | `isAlreadyApproved()` — ACTIVE identity + approved submission + invite `used` |
| Reject | `isAlreadyRejected()` — rejected submission + REVOKED identity |
| Timeline | `recordIfNew()` keyed by `{eventKey}:{requestInstanceId\|invitationId}` |
| Business role | Skip if active `businessRoleAssignment` exists |
| Invite mark used | `updateMany` with status filter `pending\|started` |

**Remaining risk:** `promotePendingToActive()` runs inside `$transaction` but uses the identity service (separate client). Mitigated by `isAlreadyApproved()` pre-check; document if concurrent first-time approvals race.

---

## 8. Assignment Fields Applied on Approval

| Preset field | Applied to | Notes |
|--------------|------------|-------|
| `companyId` | Assignment scope | Primary company assignment |
| `departmentId` | `functionId` + `employee.department` | Maps to `Function` table |
| `teamId` | `employeeAssignment.teamId` | Primary team when set |
| `businessRole` | `roleLevel` + `AccessControlService.assignBusinessRole` | Skips if role already assigned |
| `employmentType` | `employee.employmentType` | |
| `position` | `employee.position` | |
| `startDate` | `employeeAssignment.effectiveFrom` | Creates assignment if missing |
| `workLocation` | `employee.workCategory` | office / field / wfh |
| Probation | `PerformanceService.bootstrapProbationReviewOnOnboarding` | When service available |

**Not applied (gaps):**

| Field / feature | Reason |
|-----------------|--------|
| `shiftId` | No Employee/Assignment column in schema |
| Default leave policy | No auto-assign service found |
| Default attendance policy | No auto-assign service found |
| Salary visibility baseline | No dedicated initializer found |

---

## 9. Approval Center Preview / Actions

**Preview fields:** full name, nickname, phone, company, department, team, business role, position, employment type, start date, Telegram username/id, submitted at.

**Actions:**

- List: inline Approve / Reject for `entityType === 'request'` onboarding items
- Detail (`RequestDetailPage`): same approve/reject endpoints; reject requires reason (min 3 chars)
- Both paths call `POST /requests/:id/approve|reject` → `request-integration.service`

---

## 10. Invitation Management Behavior

**Page:** `/hr/invitation-codes` (`InvitationCodePage.tsx`)

| Action | Behavior |
|--------|----------|
| Copy link | Only when raw token in session (create/regenerate); hash-only shows `ต้อง Regenerate เพื่อคัดลอกลิงก์ใหม่` |
| Regenerate | `POST .../regenerate` — invalidates prior active token |
| Disable/Cancel | `POST .../cancel` — blocks Telegram start |
| View details | State machine steps + formatted submission fields (Thai labels) |

---

## 11. Timeline Events Added

| eventKey | Thai label |
|----------|------------|
| `invitation_created` | สร้างลิงก์เชิญ |
| `invitation_started` | เริ่มลงทะเบียนผ่าน Telegram |
| `onboarding_submitted` | ส่งข้อมูลให้ HR ตรวจสอบ |
| `onboarding_approved` | HR อนุมัติการรับพนักงาน |
| `employee_created_from_invitation` | สร้างข้อมูลพนักงานจากลิงก์เชิญ |
| `telegram_link_approved` | เชื่อม Telegram สำเร็จ |
| `onboarding_rejected` | HR ปฏิเสธการรับพนักงาน |

Events attach to employee timeline after employee exists; UI shows Thai labels only.

---

## 12. Tests Added / Updated

| Test | Result |
|------|--------|
| `employment-preset.util.unit.spec.ts` | ✅ 4 passed |
| `employee-onboarding-approval.service.unit.spec.ts` | ✅ 4 passed |
| `employee-onboarding.constants.unit.spec.ts` | ✅ (existing) |
| Backend `npm run build` | ✅ |
| Frontend `npm run build` | ✅ |

**Not run in CI shell:** Full Jest suite (OOM), integration tests (no DATABASE_URL), repair script live run.

---

## 13. Manual UAT Steps

### UAT A — New Employee Approve

1. HR creates invite with company/team/role/startDate at `/hr/invitation-codes`
2. Employee opens Telegram link → submits onboarding
3. Approval Center shows **รับพนักงานใหม่** with preview
4. HR approves
5. Verify employee list + detail: company, team, role, employment type, start date, Telegram connected
6. Timeline shows Thai onboarding events
7. Re-click approve → no duplicate employee/assignment/link

### UAT B — Reject

1. Create invite → submit onboarding
2. HR rejects with reason
3. Employee not activated; Telegram shows rejection
4. Invitation detail shows cancelled/rejected state

### UAT C — Regenerate / Cancel

1. Create invite → regenerate → old link fails, new link works
2. Cancel invite → Telegram cannot start onboarding

---

## 14. Known Gaps

1. `shiftId` not persisted (no schema field)
2. Default leave/attendance policy auto-assign not implemented
3. Salary visibility baseline not initialized
4. `promotePendingToActive` outside transaction client (low race risk)
5. Full integration + repair script UAT needs DATABASE_URL
6. Side-by-side diff review UI still out of scope

---

## 15. Rollback Impact

- Revert application deploy only; migrations are additive (no destructive rollback)
- `employee_onboarding` request rows remain in DB; partial rollback may need handler mapping for both type keys
- Invites in `started` state from new flow require repair script if rolling back to pre-P0-001 behavior: `npm run repair:telegram-onboarding-requests`

---

*P0-001b — WorkHQ HR Platform*
