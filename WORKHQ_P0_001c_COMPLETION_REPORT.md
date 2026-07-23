# P0-001c — Configurable Onboarding Invite Permissions — Completion Report

**Date:** 2026-06-29  
**Status:** Complete

---

## 1. Scope completed

Configurable permission keys + default role bundles + backend enforcement + frontend UX + settings/override support + audit enrichment.

---

## 2. Files created

| File | Purpose |
|------|---------|
| `backend/.../onboarding-invite-permissions.ts` | Permission key constants + Thai labels |
| `backend/.../onboarding-invite-access.service.ts` | Scope-aware authorization |
| `backend/.../onboarding-invite-access.service.unit.spec.ts` | Unit tests |
| `web/src/constants/onboarding-invite-permissions.ts` | Frontend mirror + label helper |
| `web/src/hooks/useOnboardingInvitePermissions.ts` | UI permission hook |
| `web/src/hooks/useOnboardingInvitePermissions.test.ts` | Frontend tests |

---

## 3. Files updated

Backend: `business-role-bundles.ts`, `access-control-validation.service.ts`, `prisma/seed.ts`, `employee-onboarding.controller.ts`, `employee-telegram-invite.service.ts`, `employee-onboarding.module.ts`

Frontend: `InvitationCodePage.tsx`, `EmployeesPage.tsx`, `EmployeeDetailPage.tsx`, `GlobalQuickCreate.tsx`, `EmployeeAccessControlSection.tsx`, `PermissionsSettingsPage.tsx`

Docs: `BUSINESS_ROLE_PERMISSIONS.md`, `WORKHQ_POLICY_IMPLEMENTATION_MATRIX.md`, `WORKHQ_UAT_CHECKLIST.md`

---

## 4. APIs changed

All invite endpoints now require granular permissions (not `employee:write`):

- `POST /employee-telegram-invites`, `POST /employees/:id/telegram-invite`, `POST /employees/:id/telegram-link`
- `GET /employee-telegram-invites`, `GET /employee-telegram-invites/:id`, `GET /employees/:id/telegram-invites`
- `POST /employee-telegram-invites/:id/regenerate`, `POST /employee-telegram-invites/:id/cancel`
- `POST /employee-telegram-invites/bulk-create`, `POST /employees/:id/telegram-link/regenerate`

---

## 5. DB / migration changes

None. New permission rows upserted via seed (`EXTRA_PERMISSIONS` + `ensurePermission` with category `Employee Onboarding`).

**Deploy:** `cd backend && npx prisma db seed` after deploy to register keys in existing DBs.

---

## 6. Permission keys added

`employee:onboarding:invite:view|create|manage|cancel|regenerate|link-existing|new-employee`

---

## 7. Default role bundle changes

| Role | Invite permissions |
|------|-------------------|
| Owner | All 7 |
| Secretary | All 7 |
| Big Leader | All except `cancel` |
| Sub Leader, Admin Manager, Admin, Employee | None (manual grant) |

---

## 8. Scope enforcement

- `PermissionService.authorize` + `OnboardingInviteAccessService`
- List filtered by company scope or team scope (`buildListScopeWhere`)
- Create new: `companyId` + optional `teamId` in request
- Link existing: `subjectEmployeeId` + `companyId`
- Detail/regenerate/cancel: resolved from invite `companyId` / preset `teamId` / employee assignment

---

## 9. Settings UI changes

- Role templates list permissions with Thai labels (`PermissionsSettingsPage`)
- User override dropdown includes all invite keys (`EmployeeAccessControlSection`)
- Overrides validated in `AccessControlValidationService.ALLOWED_OVERRIDE_PERMISSIONS`

---

## 10. Audit events

`new_employee_invite_created`, `existing_employee_link_created`, `invite_regenerated`, `invite_cancelled`, `invite_viewed` — each includes `actorId`, `actorRole`, `actorScope`, `invitationId`, `companyId`, `teamId`, `targetEmployeeId`.

---

## 11. Tests

| Suite | Result |
|-------|--------|
| `onboarding-invite-access.service.unit.spec.ts` | 6 passed |
| `useOnboardingInvitePermissions.test.ts` | 6 passed |
| Backend build | pass |
| Frontend build | pass |

---

## 12. Manual UAT

See `WORKHQ_UAT_CHECKLIST.md` rows **P0-001c Owner/Big Leader/Admin/Admin override**.

---

## 13. Known gaps

- Integration tests with real DB + role fixtures not run in CI shell
- Existing environments need seed run to pick up new permission rows
- `employee:write` no longer grants invite access — roles relying only on generic write must be updated or granted overrides

---

## 14. Rollback impact

Revert app deploy. Permission rows remain in DB (harmless). Old code using `employee:write` on invite endpoints would restore prior behavior if rolled back.

---

*P0-001c — WorkHQ HR Platform*
