# WorkHQ UAT Findings

**Sprint:** UAT (findings only — no fixes applied)  
**Date:** 2026-06-21  
**Environment:** Staging-equivalent validation via integration test suite against PostgreSQL (`npm run test:int` — 66 passed, 2 skipped in prior verification run)  
**Scope:** Marketing, HR, AI, Telegram, permissions  
**Out of scope:** Schema changes, migrations, new features

---

## UAT execution summary

### Payroll + commission cycle (Definition of Done)

Full cycles were executed in the **integration test environment** (same application code and DB schema as staging):

| Cycle | Test file | Steps validated |
|-------|-----------|-----------------|
| **Payroll** | `backend/test/integration/payroll.integration.spec.ts` | Open cycle → salary item → bonus item → lock → generate payslip → fetch payslip |
| **Commission calculate + finalize** | `backend/test/integration/commission-finalization.integration.spec.ts` | Marketing calculate → preview → approve → finalize → lock → payroll items → lock blocks recalc |
| **Commission adjustment** | `backend/test/integration/commission-adjustment.integration.spec.ts` | Locked cycle → create adjustment → submit → approve → payroll adjustment item + audit |
| **Marketing KPI → commission input** | `backend/test/integration/marketing-daily-report.integration.spec.ts` | Submit daily report → KPI counts → approve/reject affects commission eligibility |

**Note:** Live staging with real Telegram users was not executed in this sprint. Findings below include blockers for real-user staging UAT.

### Areas exercised via automated tests (partial UAT)

| Area | Coverage | Gap |
|------|----------|-----|
| Marketing KPI / expenses | HTTP + AI integration tests | Telegram expense approval path not tested |
| Leave / reschedule | HTTP workflow tests | Shift swap has **no** integration test; Telegram reschedule approval UX not tested |
| Attendance | HTTP integration test | Telegram check-in/out not in integration suite |
| AI employee tools | Partial (`get_my_leave_balance`, etc.) | Full tool matrix per role not tested |
| AI marketing / executive | `marketing-insight.integration.spec.ts`, `executive-insight.integration.spec.ts` | Requires manual permission setup for leaders |
| Telegram menus | `telegram.integration.spec.ts`, `telegram-approver.integration.spec.ts` | Owner commission/adjustment menus not covered |

---

## Telegram menu audit (confusion / clicks)

| Observation | Severity | Details |
|-------------|----------|---------|
| Daily reports hidden behind `/report` command | Medium | Main menu does not link to `report:menu`; help text says “พิมพ์ /report” — easy to miss |
| Attendance requires confirm step | Low | Menu → confirm screen → action (2 taps minimum); reduces mis-clicks but adds friction |
| Owner commission actions are 3–4 taps deep | Medium | Owner dashboard → Commission cycles → pick cycle → Approve/Finalize/Lock |
| Leader cannot approve leave reschedule from main menu | **High** | Reschedule approvals only under `leader:approvals`, which is **not** on the leader menu (see UAT-004) |
| Referral filter buttons appear interactive but do nothing different | Medium | ⏳/✅/💵 buttons all reload the same summary (see UAT-007) |
| Unhandled callback → “🚧 ฟีเจอร์นี้กำลังพัฒนา” | Medium | Any stale or mistyped callback shows generic “under development” (see UAT-016) |

---

## Findings

### UAT-001 — No UAT persona matrix in seed data

| Field | Value |
|-------|-------|
| **Severity** | High |
| **Area** | Permissions / Staging setup |
| **Reproduction** | 1. Fresh deploy with `prisma/seed.ts` only.<br>2. Attempt to log in as Employee, Sub Leader, Big Leader, Company Manager, or Owner.<br>3. Only `admin` (super_admin, scope:all) exists with full permissions. |
| **Proposed fix** | Add `prisma/seed-uat.ts` or extend seed with documented test users per role, company scope, marketing team assignment, and Telegram-linked accounts. Document credentials in staging-only README (not committed). |

---

### UAT-002 — Telegram onboarding grants insufficient permissions for AI self-service

| Field | Value |
|-------|-------|
| **Severity** | High |
| **Area** | AI / Permissions |
| **Reproduction** | 1. Complete Telegram onboarding (`assignDefaultEmployeeRole`).<br>2. Open 🤖 ผู้ช่วย AI and ask “สลิปเงินเดือนล่าสุด” or “ค่าคอมของฉัน”.<br>3. `ToolRouter` filters tools by permission; onboarded user only receives `attendance`, `leave`, `ai:chat` keys — not `payroll:read`, `commission:read`, `marketing:read`, `referral:read`, `employee:read`. |
| **Evidence** | `EMPLOYEE_PERMISSION_KEYS` in `telegram-bot.service.ts` (lines 76–78); employee-tier AI tools in `tool-definitions.ts` require additional read permissions. |
| **Proposed fix** | Expand default employee role permissions to match Telegram menu surface (payroll, commission, marketing, referral read + marketing write) or grant permissions when linking Telegram account. |

---

### UAT-003 — Leave shift swap not available in Telegram

| Field | Value |
|-------|-------|
| **Severity** | High |
| **Area** | HR / Telegram |
| **Reproduction** | 1. As employee, open 🌴 การลา.<br>2. Observe options: “ขอลาใหม่” and “เลื่อนวันลา” only.<br>3. No “สลับกะ/สลับวันลา” despite HTTP API `POST /leave/employees/:id/shift-swaps` existing.<br>4. Session states `leave_shift_swap:*` exist in `telegram-session.types.ts` but have no handlers. |
| **Proposed fix** | Implement Telegram FSM for shift swap (select own leave → select partner → partner agree flow) or remove from HR UAT checklist until shipped. |

---

### UAT-004 — Leave reschedule approvals hidden from leader menu

| Field | Value |
|-------|-------|
| **Severity** | High |
| **Area** | HR / Telegram |
| **Reproduction** | 1. Log in as sub_leader (leader menu visible).<br>2. Main menu shows ✅ อนุมัติการลา and ⏰ อนุมัติ OT only.<br>3. Pending reschedule requests require `approvals:leave_reschedule`, reachable only via `leader:approvals` — **not exposed** in `MENU_ROOT_LEADER_TH`.<br>4. Reschedule requests stall unless approver knows hidden path. |
| **Proposed fix** | Add “🔄 อนุมัติเลื่อนวันลา” to `MENU_ROOT_LEADER_TH` or merge all approvals into one “✅ อนุมัติ” entry that opens `showApprovalsMenu`. |

---

### UAT-005 — Leader Telegram menu tied to UserRole, not marketing team leadership

| Field | Value |
|-------|-------|
| **Severity** | Medium |
| **Area** | Permissions / Telegram |
| **Reproduction** | 1. Assign employee as marketing sub-team leader in `MarketingTeamMember` only (no `sub_leader` UserRole).<br>2. Open Telegram main menu.<br>3. Leader items (KPI ทีม, อนุมัติการลา, etc.) are **missing** despite AI `ToolRouter` treating them as leader via `isMarketingLeader()`. |
| **Proposed fix** | Align `showMainMenu()` leader detection with `MarketingTeamService.leaderMarketingTeamId()` (same as AI tools), not only UserRole codes. |

---

### UAT-006 — Big Leader menu requires root team assignment, not role code alone

| Field | Value |
|-------|-------|
| **Severity** | Medium |
| **Area** | Marketing / Telegram |
| **Reproduction** | 1. Grant UserRole `big_leader` without setting `MarketingTeam.bigLeaderEmployeeId` on a root team.<br>2. Open Telegram menu.<br>3. “📊 ภาพรวมการตลาด” (`marketing:company_overview`) does not appear.<br>4. Menu checks DB: `marketingTeam.findFirst({ bigLeaderEmployeeId, level: 'root' })`. |
| **Proposed fix** | Document that Big Leader UAT requires both role **and** marketing team structure; or derive menu from `MarketingTeamMember.role = big_leader`. |

---

### UAT-007 — Referral status filter buttons are non-functional

| Field | Value |
|-------|-------|
| **Severity** | Medium |
| **Area** | Telegram |
| **Reproduction** | 1. Open 🤝 แนะนำเพื่อน.<br>2. Tap ⏳ รอดำเนินการ, ✅ ผ่านเกณฑ์, or 💵 จ่ายแล้ว.<br>3. All three callbacks invoke the same `sendReferralStatus()` — full summary is reshown; no filtered list. |
| **Proposed fix** | Either filter display by status on each callback or remove filter buttons to avoid false affordance. |

---

### UAT-008 — Marketing expense approval not available in Telegram

| Field | Value |
|-------|-------|
| **Severity** | Medium |
| **Area** | Marketing / Telegram |
| **Reproduction** | 1. Employee submits marketing expense via 💸 บันทึกรายจ่ายการตลาด (Telegram flow exists).<br>2. As leader/manager, search Telegram menus for expense approval.<br>3. No menu item; approval requires web API `POST /marketing/expenses/:id/approve` with `marketing:approve` permission. |
| **Proposed fix** | Add leader/owner Telegram approval queue for pending marketing expenses (mirror leave approvals pattern). |

---

### UAT-009 — Web back office has no login flow

| Field | Value |
|-------|-------|
| **Severity** | Medium |
| **Area** | Web |
| **Reproduction** | 1. Open web app (`/marketing/reports`, `/executive`, etc.).<br>2. No login page; API calls use `localStorage.workhq_token`.<br>3. Without manually POSTing to `/api/v1/auth/login` and setting token, all pages fail. |
| **Proposed fix** | Add login page or document staging setup script that sets JWT + company ID in localStorage before UAT. |

---

### UAT-010 — Web pages require manual Company UUID entry

| Field | Value |
|-------|-------|
| **Severity** | Medium |
| **Area** | Web / UX |
| **Reproduction** | 1. Open Marketing Insights, Executive Copilot, or Commission pages.<br>2. Each page shows raw “Company ID” text input.<br>3. UAT testers must copy UUID from database — error-prone and not company-operator friendly. |
| **Proposed fix** | Resolve company from JWT claims or user profile; show company name dropdown for multi-company owners. |

---

### UAT-011 — Web covers marketing/commission only; no HR self-service UI

| Field | Value |
|-------|-------|
| **Severity** | Medium |
| **Area** | Web |
| **Reproduction** | 1. Review `web/src/App.tsx` routes.<br>2. Pages exist for marketing reports, expenses, teams, KPI, commission cycles/adjustments, insights, executive.<br>3. No pages for leave, attendance, payroll, or payslip despite HR being in scope for UAT. |
| **Proposed fix** | Clarify in UAT scope that HR is Telegram-first; or add minimal HR web views for Company Manager role. |

---

### UAT-012 — “Company Manager” is not a first-class role

| Field | Value |
|-------|-------|
| **Severity** | Medium |
| **Area** | Permissions |
| **Reproduction** | 1. Attempt to assign “Company Manager” role in seed/admin.<br>2. No `company_manager` role code exists.<br>3. Access requires custom role + `scopeGrant.scopeType = 'company'` + domain permissions (payroll, reporting, etc.) — as in `company-isolation.integration.spec.ts`. |
| **Proposed fix** | Seed a `company_manager` system role with documented permission bundle and company scope template for UAT. |

---

### UAT-013 — Owner role not seeded (only super_admin)

| Field | Value |
|-------|-------|
| **Severity** | Medium |
| **Area** | Permissions / Telegram |
| **Reproduction** | 1. Fresh seed: only `super_admin` role is fully permissioned.<br>2. Telegram owner menu (`👑 แดชบอร์ดเจ้าของ`) checks UserRole `owner` or `super_admin`.<br>3. Real “owner” UAT persona requires manual role creation. |
| **Proposed fix** | Seed `owner` role with `reporting:owner`, `reporting:executive`, `commission:write`, etc., and a dedicated UAT owner user. |

---

### UAT-014 — Default credentials documented in seed

| Field | Value |
|-------|-------|
| **Severity** | Low (High for production) |
| **Area** | Security / UAT setup |
| **Reproduction** | 1. `prisma/seed.ts` creates `admin` / `password`.<br>2. `seed-employees.ts` uses password `1234` for all seeded employees. |
| **Proposed fix** | Force password change on first login in staging; use unique passwords per UAT persona outside of committed files. |

---

### UAT-015 — Telegram seed employees use placeholder IDs

| Field | Value |
|-------|-------|
| **Severity** | Low (blocks real Telegram UAT) |
| **Area** | Telegram |
| **Reproduction** | 1. Run `seed-employees.ts`.<br>2. Output shows `telegram placeholder: 0` or negative IDs.<br>3. Bot cannot deliver messages until real `telegram_user_id` is linked per user. |
| **Proposed fix** | UAT checklist step: HR links each tester’s Telegram account before menu walkthrough. |

---

### UAT-016 — Generic “under development” fallback on unknown callbacks

| Field | Value |
|-------|-------|
| **Severity** | Medium |
| **Area** | Telegram |
| **Reproduction** | 1. Trigger any unhandled `callback_data` (stale inline keyboard after deploy, or typo).<br>2. Bot responds “🚧 ฟีเจอร์นี้กำลังพัฒนา” with no diagnostic detail. |
| **Proposed fix** | Log callback + suggest `/start`; for known deprecated callbacks show “please refresh menu” instead of “under development”. |

---

### UAT-017 — AI Marketing Manager unavailable without marketing permissions on employee role

| Field | Value |
|-------|-------|
| **Severity** | Medium |
| **Area** | AI |
| **Reproduction** | 1. Assign user as marketing team leader (`MarketingTeamService.leaderMarketingTeamId` returns team).<br>2. Do **not** grant `marketing:read` on their role.<br>3. Open AI chat; marketing insight tools (`get_marketing_performance_insights`, etc.) are filtered out by `ToolRouter` despite leader tier eligibility. |
| **Proposed fix** | Grant `marketing:read` (and write where needed) to leader/sub_leader roles by default, or map leader tier to marketing permissions automatically. |

---

### UAT-018 — Executive Copilot inaccessible to Company Manager without manual grants

| Field | Value |
|-------|-------|
| **Severity** | Medium |
| **Area** | AI / Executive |
| **Reproduction** | 1. Create user with `scope:company` only (no marketing leader team, no `reporting:executive`).<br>2. Call `GET /api/v1/executive` or AI `get_executive_summary`.<br>3. Denied unless `reporting:executive` / `reporting:owner` and company scope are configured. |
| **Proposed fix** | Seed company manager with `reporting:executive`; document Executive UAT persona requirements in staging guide. |

---

### UAT-019 — Commission adjustment default workflow approver is Owner

| Field | Value |
|-------|-------|
| **Severity** | Low |
| **Area** | Marketing / Commission |
| **Reproduction** | 1. Create commission adjustment in test env without overriding workflow.<br>2. Default fixture seeds `commission_adjustment` workflow with approver role `owner`.<br>3. UAT testers acting as Company Manager may not see pending adjustment approvals. |
| **Proposed fix** | Document approver routing for UAT; consider HR/Finance approver role in production configuration. |

---

### UAT-020 — Shift swap has zero automated test coverage

| Field | Value |
|-------|-------|
| **Severity** | Medium |
| **Area** | HR |
| **Reproduction** | 1. Search `backend/test/integration` for shift-swap tests.<br>2. None exist (leave reschedule and leave workflow are tested; shift swap is not). |
| **Proposed fix** | Add integration test for `POST /leave/employees/:id/shift-swaps` and partner-agree flow before including in UAT sign-off. |

---

### UAT-021 — Web Executive / Insights pages are English-only

| Field | Value |
|-------|-------|
| **Severity** | Low |
| **Area** | Web / UX |
| **Reproduction** | 1. Open `/executive` or `/marketing/insights`.<br>2. All labels, errors, and section headers are English while Telegram and AI prompts are Thai-first. |
| **Proposed fix** | Align web copy with Thai-first product language or add i18n. |

---

## Permission matrix (UAT expected vs actual)

| Persona | Expected access | UAT status |
|---------|-----------------|------------|
| **Employee** | Self-service HR, marketing submit, AI my-* tools | ⚠️ Telegram menus work via direct service calls, but AI tools blocked after onboarding (UAT-002) |
| **Leader (sub_leader)** | Team KPI, leave/OT approval, team expenses | ⚠️ Requires UserRole not just team assignment (UAT-005); reschedule approval hidden (UAT-004) |
| **Big Leader** | Company marketing overview | ⚠️ Requires root team DB assignment (UAT-006) |
| **Company Manager** | Company-scoped HR, payroll, reporting | ❌ No seeded persona; manual scope + permissions (UAT-012) |
| **Owner** | All companies, commission finalize, executive brief | ⚠️ Only `super_admin` seeded; owner role manual (UAT-013) |

---

## AI UAT checklist results

| Scenario | Result | Finding |
|----------|--------|---------|
| Employee: “วันลาคงเหลือเท่าไร” | Partial | Works if `leave:read` granted; onboarding gap (UAT-002) |
| Employee: “สลิปเงินเดือน” | Fail after onboarding | Missing `payroll:read` (UAT-002) |
| Marketing leader: team ROI | Partial | Needs `marketing:read` + leader team (UAT-017) |
| Executive: “บริษัทวันนี้เป็นยังไง” | Pass as admin | Owner/company manager need role setup (UAT-013, UAT-018) |

---

## Recommended UAT exit criteria (next sprint)

1. Run `prisma/seed-uat.ts` (proposed) with 5 personas + linked Telegram accounts  
2. Re-run Telegram menu script with real users; tick every menu item  
3. Execute one payroll + commission cycle manually in staging (not only via Jest)  
4. Sign off when UAT-001 through UAT-004 are resolved or accepted as known limitations  

---

## Severity summary

| Severity | Count |
|----------|-------|
| High | 4 |
| Medium | 13 |
| Low | 4 |
| **Total** | **21** |

No code changes were made in this sprint per scope (“findings only”).
