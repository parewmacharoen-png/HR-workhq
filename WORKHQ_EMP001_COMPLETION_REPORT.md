# EMP-001b / EMP-001c — Completion Report

**Sprint:** Telegram Invite Link + Employee Self-Onboarding  
**Date:** 2026-06-24  
**Status:** Implemented — pending full E2E UAT with live Telegram + DATABASE_URL integration run

---

## 1. Completion Report

Replaced employee-code-first Telegram onboarding with **secure one-time invite links** and a **multi-step Telegram self-onboarding form**. HR creates minimal employee records, sends invite links, employees link Telegram automatically, fill personal info + documents, and submit for HR/Secretary review. **Approved data only** updates employee profile, bank accounts, and Document Center.

| Acceptance Criterion | Status |
|---------------------|--------|
| HR creates Telegram invite from employee detail | ✅ |
| Employee taps invite link → auto link | ✅ |
| Bot guides personal info + document upload | ✅ |
| Submitted data goes to HR review queue | ✅ |
| HR approve/reject | ✅ Web + Telegram (approve); reject via Web |
| Only approved data updates profile | ✅ |
| Employee code not required in normal flow | ✅ (manual code fallback retained) |

---

## 2. Files Changed

### Backend — New Module `employee-onboarding/`

| File | Purpose |
|------|---------|
| `application/employee-telegram-invite.service.ts` | Invite CRUD, SHA-256 token hash, 7-day expiry, one-time use |
| `application/employee-self-onboarding.service.ts` | Draft/submit/approve/reject, HR-only field sanitization |
| `application/employee-onboarding-dashboard.service.ts` | Dashboard statistics |
| `application/telegram-invite-link.handler.ts` | `/start invite_<token>` flow |
| `application/telegram-self-onboarding.handler.ts` | 17-step Telegram form |
| `application/telegram-self-onboarding-hr.handler.ts` | HR Telegram approve callbacks |
| `application/employee-telegram-invite.service.unit.spec.ts` | Unit tests |
| `domain/self-onboarding.types.ts` | Allowed fields, form steps, sanitization |
| `interface/http/employee-onboarding.controller.ts` | REST APIs |
| `employee-onboarding.module.ts` | Module wiring |

### Backend — Modified

| File | Change |
|------|--------|
| `prisma/schema.prisma` | New models + employee fields |
| `prisma/migrations/20260625120000_emp001_telegram_invite_self_onboarding/` | Migration SQL |
| `app.module.ts` | Register `EmployeeOnboardingModule` |
| `telegram/telegram.module.ts` | Import EmployeeModule, SelfOnboardingTelegramNotifier |
| `telegram/application/telegram-bot.service.ts` | Invite start, self-onboarding state, HR callbacks |
| `telegram/application/telegram-verification.service.ts` | Invite-first `/start` message |
| `telegram/application/self-onboarding.notifier.ts` | HR + employee Telegram notifications |
| `telegram/infrastructure/telegram-gateway.service.ts` | `getFile` / `downloadFile` |
| `security/application/telegram-identity.service.ts` | `linkViaInviteLink()` |
| `security/domain/telegram-identity.types.ts` | `invite_link` verification method |

### Web — New / Modified

| File | Purpose |
|------|---------|
| `web/src/api/employee-onboarding.ts` | API client |
| `web/src/components/hr/EmployeeTelegramInviteSection.tsx` | Invite button on employee detail |
| `web/src/pages/hr/SelfOnboardingPage.tsx` | HR review list `/hr/self-onboarding` |
| `web/src/pages/hr/EmployeeDetailPage.tsx` | Invite section + status |
| `web/src/pages/DashboardPage.tsx` | Onboarding dashboard widgets |
| `web/src/App.tsx`, `web/src/layout/nav-config.ts` | Route + nav |

### Tests

| File | Type |
|------|------|
| `backend/src/modules/employee-onboarding/application/employee-telegram-invite.service.unit.spec.ts` | Unit |
| `backend/test/integration/employee-telegram-invite.integration.spec.ts` | Integration |

### Documentation

| File | Update |
|------|--------|
| `WORKHQ_EMP001_COMPLETION_REPORT.md` | This report |
| `WORKHQ_MASTER_POLICY_V1.md` | EMP-001b/c policy section |
| `WORKHQ_POLICY_IMPLEMENTATION_MATRIX.md` | Implementation rows |
| `HR_ROADMAP.md` | Sprint status |
| `WORKHQ_UAT_CHECKLIST.md` | UAT scenarios |
| `WORKHQ_TELEGRAM_AUDIT.md` | Telegram flow audit |

---

## 3. Database Changes

### New Enums

- `EmployeeTelegramInviteStatus`: pending, used, expired, cancelled
- `EmployeeSelfOnboardingStatus`: draft, submitted, approved, rejected, cancelled
- `SelfOnboardingDocumentType`: id_card, bank_book, house_registration, profile_photo, other
- `SelfOnboardingDocumentStatus`: uploaded, approved, rejected

### New Models

- `EmployeeTelegramInvite` — tokenHash, tokenPreview, expiry, usage tracking
- `EmployeeSelfOnboardingSubmission` — submittedDataJson, approvedDataJson, review metadata
- `EmployeeSelfOnboardingDocument` — staged uploads before HR approval

### Employee Fields Added

- `lineId`, `address`, `emergencyContactName`, `emergencyContactRelationship`, `emergencyContactPhone`

### Extended

- `TelegramVerificationMethod`: added `invite_link`

---

## 4. Migrations

```
prisma/migrations/20260625120000_emp001_telegram_invite_self_onboarding/migration.sql
```

Deploy:

```bash
cd backend && npx prisma migrate deploy --schema ../prisma/schema.prisma
npx prisma generate --schema ../prisma/schema.prisma
```

---

## 5. APIs Added/Changed

| Method | Path | Permission | Description |
|--------|------|------------|-------------|
| POST | `/employees/:id/telegram-invite` | employee:write | Create invite (201) |
| GET | `/employees/:id/telegram-invites` | employee:read | Invite history |
| POST | `/employee-telegram-invites/bulk-create` | employee:write | Bulk invites |
| GET | `/employee-telegram-invites` | employee:read | List invites |
| POST | `/employee-telegram-invites/:id/cancel` | employee:write | Cancel invite |
| POST | `/employees/:id/telegram-unlink` | security:write | Unlink Telegram |
| GET | `/employees/:id/self-onboarding` | employee:read | Employee onboarding status |
| GET | `/self-onboarding/submissions` | employee:read | HR review list |
| GET | `/self-onboarding/submissions/:id` | employee:read | Submission detail |
| POST | `/self-onboarding/submissions/:id/approve` | employee:write | Approve (full/partial) |
| POST | `/self-onboarding/submissions/:id/reject` | employee:write | Reject with reason |
| POST | `/self-onboarding/submissions/:id/cancel` | employee:write | Cancel draft/submitted |
| GET | `/self-onboarding/dashboard-stats` | employee:read | Dashboard widgets |

---

## 6. Telegram Flow

### `/start` (no payload)

```
🔐 ยืนยันตัวตนพนักงาน
กรุณากดลิงก์เชิญจาก HR เพื่อเชื่อมบัญชี Telegram
```

Buttons: ติดต่อ HR | ใส่รหัสพนักงาน (fallback)

### `/start invite_<token>`

1. Parse token → SHA-256 hash lookup
2. Validate pending + not expired + employee active
3. Reject if Telegram already linked to another employee
4. Link via `TelegramIdentityService.linkViaInviteLink(method: invite_link)`
5. Mark invite used; cancel other pending invites
6. Welcome message → auto-start self-onboarding form

### Self-Onboarding Form (17 steps)

Text fields → photo uploads → summary → submit. Navigation: ถัดไป / ย้อนกลับ / ข้าม / ยกเลิก.

### After Submit

- Employee: confirmation message
- HR/Secretary: Telegram notification with เปิดตรวจสอบ / อนุมัติ / ไม่อนุมัติ buttons

---

## 7. Web UI Changes

| Location | Feature |
|----------|---------|
| `/hr/employees/:id` | "ส่งลิงก์เชิญ Telegram" button, invite link display, telegramStatus |
| `/hr/self-onboarding` | Filterable submission list, approve/reject actions |
| `/dashboard` | 6 onboarding stat cards (Owner/Secretary with employee:write) |
| Nav | Self-Onboarding Review entry |

**Not yet implemented:** Side-by-side diff review screen, field-level partial approval UI.

---

## 8. Permission Behavior

| Action | Owner | Secretary | Big Leader | Employee |
|--------|-------|-----------|------------|----------|
| Create invite | ✅ | ✅ | ❌ | ❌ |
| Bulk invite | ✅ | ✅ | ❌ | ❌ |
| Review/approve/reject | ✅ | ✅ | ❌ | ❌ |
| View own onboarding status | ❌* | ❌* | ❌* | ✅ (via Telegram) |
| Team connected status | — | — | ⚠️ Not wired to list | — |

*Web self-onboarding status uses `employee:read` on HR endpoints.

Unlink Telegram: `security:write`.

---

## 9. Security Behavior

| Control | Implementation |
|---------|----------------|
| Raw token never stored | SHA-256 hash only; raw shown once in API response |
| Crypto-secure token | `randomBytes(32).base64url` |
| One-time use | Status → `used` on consume |
| Expiry | 7 days default |
| Supersede pending | New invite cancels old pending |
| HR-only fields rejected | `sanitizeSubmittedData()` strips salary, company, role, etc. |
| Bank info pending | `EmployeeBankAccount` created only on approval |
| Documents staged | `EmployeeSelfOnboardingDocument` → `EmployeeDocument` on approval |
| Duplicate Telegram | Rejected at link time |
| Audit | All invite/submit/approve/reject actions logged |

---

## 10. Audit Behavior

| Event | Trigger |
|-------|---------|
| `telegram_invite_created` | POST invite |
| `telegram_invite_used` | Successful link |
| `telegram_invite_cancelled` | Cancel / supersede |
| `telegram_account_linked` | Identity activation |
| `telegram_account_unlinked` | Unlink API |
| `self_onboarding_submitted` | Employee submit |
| `self_onboarding_approved` | HR approve all |
| `self_onboarding_partially_approved` | Partial approve |
| `self_onboarding_rejected` | HR reject |
| `employee_profile_updated_from_self_onboarding` | applyToEmployee |
| `employee_document_uploaded_from_self_onboarding` | applyDocuments |

**Partial:** `self_onboarding_started`, `self_onboarding_field_saved` — not individually audited per field save.

---

## 11. Tests Run

| Test | Result |
|------|--------|
| `employee-telegram-invite.service.unit.spec.ts` | ✅ PASS (2 tests) |
| TypeScript compile (onboarding modules) | ✅ No errors |
| `employee-telegram-invite.integration.spec.ts` | ⏭ Skipped (no DATABASE_URL in CI shell) |

Recommended local run:

```bash
DATABASE_URL=postgresql://... npm run test:integration -- --testPathPattern=employee-telegram-invite
```

---

## 12. Remaining Gaps

1. **Side-by-side review UI** — Web list only; no diff view or field-level approve UI
2. **Telegram HR reject with reason** — Prompts for text but no session handler to capture reason
3. **Big Leader team visibility** — Connected/not-connected per team not on employee list
4. **Employee list columns** — telegramStatus / selfOnboardingStatus on list view
5. **Resubmit flow after rejection** — Backend supports draft recreation; Telegram re-entry not fully tested
6. **Partial approval from Telegram** — Approve-all only via Telegram button
7. **Integration tests** — Need DATABASE_URL + seeded owner role
8. **Live Telegram UAT** — Photo upload requires valid bot token + file API

---

## 13. Deployment Steps

1. Deploy migration: `npx prisma migrate deploy`
2. Regenerate Prisma client: `npx prisma generate`
3. Set env vars:
   - `TELEGRAM_BOT_USERNAME` — for invite deep links
   - `WEB_APP_BASE_URL` — for "เปิดตรวจสอบ" button in HR Telegram notification
4. Restart backend (loads `EmployeeOnboardingModule`)
5. Verify webhook receives `/start invite_*` payloads
6. HR UAT: create employee → send invite → complete form → approve → verify profile + documents

---

## 14. Breaking Changes

| Change | Impact |
|--------|--------|
| Primary onboarding path | Invite link replaces employee-code as recommended path; manual code remains fallback |
| New DB tables | Migration required before deploy |
| Employee model fields | New optional columns; no data loss |
| `TelegramVerificationMethod` enum | Added `invite_link` value |

**Non-breaking:** Existing linked Telegram accounts unaffected. Existing employee-code verification still works.

---

## Environment Variables

| Variable | Required | Purpose |
|----------|----------|---------|
| `TELEGRAM_BOT_USERNAME` | Yes | Deep link generation |
| `WEB_APP_BASE_URL` | Recommended | HR review link in Telegram |
| `DATABASE_URL` | Yes | Migration + runtime |

---

*Generated: EMP-001b/c sprint — WorkHQ HR Platform*
