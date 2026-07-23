# WORKHQ P0-004 — Completion Report

**Telegram Live UAT (Code Audit + Production Fixes)**  
**Date:** 2026-06-29

---

## Summary

Performed end-to-end audit of Telegram onboarding production flows and fixed six wiring bugs that would fail live UAT. No UI redesign. Approval Center (`employee_onboarding`) remains the canonical HR path; parallel approve shortcuts now delegate to the full onboarding approval service.

---

## UAT Results

| # | Flow | Audit Result | Post-Fix Expected |
|---|------|--------------|-------------------|
| 1 | **New employee invitation** | Invite → consume → self-onboarding → bridge creates `employee_onboarding` request | Pass |
| 2 | **Existing employee linking** | **FAIL** — showed success but identity stayed `PENDING`, no menu access | **Fixed** — auto-completes link via approval service |
| 3 | **Approval Center request creation** | Bridge creates `employee_onboarding` in `in_review` on submit | Pass |
| 4 | **Approve / reject** | Approval Center path complete; Telegram/Web shortcuts incomplete | **Fixed** — shortcuts use full approval |
| 5 | **Employee Detail Telegram status** | **FAIL** — `employee_onboarding` requests ignored in status resolver | **Fixed** — both request types queried |
| 6 | **`/status` command** | Uses same resolver as Employee Detail | **Fixed** via status resolver |
| 7 | **Telegram HR quick approve** | Approved profile only, not Telegram link | **Fixed** |
| 8 | **Telegram HR quick reject** | Asked for reason but never processed | **Fixed** — reason capture + full reject |

**Note:** Live Telegram + database integration UAT requires deployed environment with `DATABASE_URL` and bot token. This sprint validated flows via code audit, typecheck, and targeted unit tests.

---

## Bugs Fixed

| Bug | Root Cause | Fix |
|-----|------------|-----|
| Status stuck at wrong value after new onboarding requests | `resolveTelegramConnectionStatus` only queried `telegram_registration_review` | Query both `employee_onboarding` and legacy type |
| Existing employee invite claimed success but blocked | Identity left `PENDING`; no promotion or approval request | `completeExistingEmployeeInviteLink()` on skip-self-onboarding path |
| Misleading “linked” message for existing employees | Handler showed main menu before identity was ACTIVE | Promote identity before menu; updated Thai success copy |
| Self-onboarding web approve incomplete | `EmployeeSelfOnboardingService.approve()` only — no Telegram promotion | Default approve → `approveFromSubmission()` |
| Telegram HR ✅ incomplete | Same as above | `approveFromSubmission()` |
| Telegram HR ❌ broken | Reject reason never submitted | Session `custom:rejecting` + `handleRejectText()` → `rejectFromSubmission()` |

---

## Remaining Bugs / Gaps

| Gap | Severity | Notes |
|-----|----------|-------|
| Live Telegram UAT not executed in CI | Medium | Requires manual test with real bot + HR accounts |
| Partial field approval on web | Low | `approvedFields` / `approvedDocumentIds` still use profile-only `approve()` by design |
| Invite link copy after create | Low | Hash-only storage; regenerate required (documented P0-001b) |
| Manual verification fallback (`employee code + phone`) | Low | Separate legacy path; bridge still works |
| Side-by-side diff review UI | Out of scope | Not built per EMP-001 spec |

---

## Files Changed

### Created
| File | Purpose |
|------|---------|
| `backend/src/modules/employee-onboarding/domain/telegram-connection-status.util.unit.spec.ts` | Status resolver tests (employee_onboarding requests) |

### Updated
| File | Change |
|------|--------|
| `backend/src/modules/employee-onboarding/domain/telegram-connection-status.util.ts` | Query both onboarding request type keys |
| `backend/src/modules/employee-onboarding/application/employee-onboarding-approval.service.ts` | `approveFromSubmission`, `rejectFromSubmission`, `completeExistingEmployeeInviteLink` |
| `backend/src/modules/employee-onboarding/application/telegram-invite-link.handler.ts` | Complete existing-employee links; inject approval service |
| `backend/src/modules/employee-onboarding/application/telegram-self-onboarding-hr.handler.ts` | Full approve/reject + reject reason capture |
| `backend/src/modules/employee-onboarding/interface/http/employee-onboarding.controller.ts` | Web approve/reject → full onboarding approval |
| `backend/src/modules/telegram/application/telegram-bot.service.ts` | Pass saveSession to HR handler; route reject text |
| `WORKHQ_UAT_CHECKLIST.md` | P0-004 UAT rows |

---

## API Changes

| Endpoint | Change |
|----------|--------|
| `POST /self-onboarding/submissions/:id/approve` | Default (no partial fields) now runs full onboarding approval (Telegram ACTIVE + invite used) |
| `POST /self-onboarding/submissions/:id/reject` | Now runs full onboarding rejection (identity revoke + invite cancel) |
| All other endpoints | Unchanged |

No new endpoints. Approval Center `POST /requests/:id/approve|reject` unchanged (already correct).

---

## DB Changes

None — no migrations.

---

## Tests

| Suite | Result |
|-------|--------|
| `backend` `npx tsc --noEmit` | Pass |
| `telegram-connection-status.util.unit.spec.ts` | Added (4 cases) |
| Full Jest unit suite | OOM in local environment (pre-existing); targeted tests added |

---

## Recommended Live UAT Script

1. **Owner/Secretary:** Create new-employee invite at `/hr/invitation` → open Telegram link → complete self-onboarding → verify Approval Center card → approve → `/status` shows linked.
2. **HR:** Send link to existing active employee → tap link → immediate main menu → Employee Detail shows **linked**.
3. **Reject path:** Submit onboarding → reject from Approval Center with reason → `/status` shows rejected.
4. **Telegram HR buttons:** Approve/reject from Telegram notification → same outcomes as Approval Center.

---

## Deploy

No migration. Redeploy backend only. Existing in-flight `employee_onboarding` requests benefit immediately from status resolver fix.
