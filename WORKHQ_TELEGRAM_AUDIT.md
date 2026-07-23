# WorkHQ Telegram Audit

**Sprint:** QA-001 Production Stabilization  
**Generated:** 2026-06-25  
**Bot:** WorkHQ Telegram Bot · Webhook at `/api/v1/telegram/webhook/:secret`

## Executive Summary

| Check | Result | Notes |
|-------|--------|-------|
| Webhook endpoint | PASS | `@Public()` + secret token validation |
| Employee menu | PASS | 13 core items wired |
| Leader menu | PASS | 6 items + unified inbox |
| Owner/Secretary menu | PASS | 14 items + AI brief |
| Unified inbox | PARTIAL | 6 source types; OT uses legacy path |
| OT approve callback | **FIXED (QA-001)** | `approve:overtime:{id}` |
| Marketing menus | PASS | Hidden when `marketingEnabled=false` |
| Integration tests | PASS | 4 telegram specs + workflow matrix |

## Role-Based Menu Matrix

### Employee Menu (`MENU_ROOT_EMPLOYEE_TH`)

| # | Label | Callback State | Wired | Status |
|---|-------|----------------|-------|--------|
| 1 | 👤 ข้อมูลของฉัน | `employee:profile` | Yes | PASS |
| 2 | 📅 วันลา | `leave:menu` | Yes | PASS |
| 3 | ⏰ เวลาเข้างาน | `attendance:menu` | Yes | PASS |
| 4 | 📋 คำร้อง | `request:menu` | Yes | PASS |
| 5 | 💰 เงินเดือน | `payroll:view_payslip` | Yes | PASS |
| 6 | 🏆 KPI / ผลงาน | `performance:my` | Yes | PASS |
| 7 | 🎯 ทักษะของฉัน | `competency:my` | Yes | PASS |
| 8 | 📚 การเรียนรู้ | `training:menu` | Yes | PARTIAL |
| 9 | 📄 เอกสารของฉัน | `document-center:my` | Yes | PARTIAL (info-only) |
| 10 | 📚 ศูนย์ความรู้ | `document-center:knowledge` | Yes | PASS |
| 11 | 📢 ประกาศ | `announcement:list` | Yes | PASS |
| 12 | 👥 คนที่ฉันแนะนำ | `referral:my:list` | Yes | PASS |
| 13 | 🤖 ถาม WorkHQ | `ai:knowledge` | Yes | PASS |

### Leader Menu (`MENU_ROOT_LEADER_TH` — sub_leader / big_leader)

| # | Label | Callback State | Wired | Status |
|---|-------|----------------|-------|--------|
| 1 | 📥 งานรออนุมัติ | `unified:inbox` | Yes | PASS |
| 2 | 📅 ปฏิทินทีม | `calendar:menu` | Yes | PASS |
| 3 | 🚨 แจ้งเตือนเวลาเข้างาน | `attendance:alerts` | Yes | PASS |
| 4 | 🏆 KPI ทีม | `performance:team` | Yes | PASS |
| 5 | 👥 ทีมของฉัน | `leader:team_dashboard` | Yes | PASS |
| 6 | 🤖 AI Manager | `ai:manager:menu` | Yes | PASS |

### Owner / Secretary Menu (`MENU_ROOT_OWNER_TH`)

| # | Label | Callback State | Wired | Status |
|---|-------|----------------|-------|--------|
| 1 | 📥 งานรออนุมัติ | `unified:inbox` | Yes | PASS |
| 2 | 📊 Morning Brief | `ai:brief:today` | Yes | PASS |
| 3 | 🚨 Attendance Alerts | `attendance:alerts` | Yes | PASS |
| 4 | 📅 Team Calendar | `calendar:menu` | Yes | PASS |
| 5 | 👥 Employees | `owner:dashboard` | Yes | PASS |
| 6 | 🏆 KPI / Performance | `hr:summary` | Yes | PASS |
| 7 | 💰 Payroll Summary | `payroll:view_payslip` | Yes | PARTIAL |
| 8 | 📄 Documents | `document-center:my` | Yes | PARTIAL |
| 9 | 📢 Announcements | `announcement:list` | Yes | PASS |
| 10 | 🎓 Training | `training:menu` | Yes | PARTIAL |
| 11 | 🎯 Competencies | `competency:my` | Yes | PASS |
| 12 | 🧭 Succession | `succession:overview` | Yes | PASS (owner-only) |
| 13 | 🤖 AI Manager | `ai:manager:menu` | Yes | PASS |
| 14 | 🤖 HR Graph Query | `graph:query:menu` | Yes | PARTIAL (salary redaction) |

## Unified Inbox Coverage

| Source Type | Entity | Approve via Inbox | Status |
|-------------|--------|-------------------|--------|
| `request` | Request instances | Yes | PASS |
| `workflow` | Workflow instances (leave, OT, etc.) | Yes | PASS |
| `salary_review` | Compensation reviews | Yes (owner) | PASS |
| `promotion_review` | Promotion reviews | Yes (owner) | PASS |
| `exit_leader` | Exit leader review | Yes (leader+) | PASS |
| `exit_owner` | Exit owner review | Yes (owner) | PASS |

Inbox displays up to 5 items per view with approve/reject inline buttons (`unified:approve:*`, `unified:reject:*`).

## QA-001 OT Legacy Fix

| Item | Before | After |
|------|--------|-------|
| OT approve callback | Broken / wrong handler | `approve:overtime:{workflowInstanceId}` |
| OT reject callback | Missing | Wired to workflow action |
| Integration test | — | `ot-workflow.integration.spec.ts` PASS |

## Marketing Menus (Conditional)

Shown only when `marketingEnabled=true`:

| Role | Items | Status |
|------|-------|--------|
| Employee | Commission, submit report, KPI, expense, referral | PASS |
| Leader | Approvals menu, team KPI, team expenses | PASS |
| Big Leader | Company marketing overview | PASS |

## Webhook Security

| Control | Status |
|---------|--------|
| Path secret (`:secret` param) | PASS |
| Header `X-Telegram-Bot-Api-Secret-Token` | PASS |
| `@Public()` (no JWT from Telegram) | By design |
| Fire-and-forget processing (< 5s response) | PASS |
| Error alerting via AlertingService | PASS |

## Scheduler Integration

| Job | Telegram Delivery | Status |
|-----|-------------------|--------|
| AI Morning Brief (08:00 BKK) | Owner inbox link | PASS |
| Recognition awards | Direct message | PASS |
| Evening brief (23:59) | Owner | PARTIAL |

## Known Gaps

1. Document download on Telegram is info-only (no file attachment).
2. Training completion not fully actionable from bot.
3. Payroll summary on Telegram shows limited detail vs web.
4. HR Graph Query requires salary redaction enforcement (partial).
5. Secretary gets owner menu duplicate for inbox (intentional overlap).

## UX-001 Button-Based Forms (2026-06-24)

| Flow | Before | After |
|------|--------|-------|
| REQ-001 (OT/advance/correction/shift/off-day/document) | All fields free-text | Inline buttons for select/date/time/amount |
| REQ-001 confirm | Type "ส่งคำร้อง" | ✅ ส่งข้อมูล / ✏️ แก้ไข / ❌ ยกเลิก |
| Legacy leave menu | Date text entry | Quick date + duration buttons + summary |
| Form audit | None | `FormUxEvent` actions logged |

## EMP-001b / EMP-001c — Telegram Invite Link + Self-Onboarding (2026-06-24)

| Rule | Policy |
|------|--------|
| EMP-001b | HR creates minimal employee record; sends **one-time Telegram invite link** (7-day expiry, SHA-256 token hash) |
| EMP-001b | Employee links Telegram via `https://t.me/<BOT>?start=invite_<token>` — no employee code in normal flow |
| EMP-001c | Employee self-onboards via Telegram: personal info, emergency contact, bank info, documents |
| EMP-001c | Submitted data **must not** overwrite HR records until Owner/Secretary approval |
| EMP-001c | HR-only fields (salary, company, team, position, role, hire date, etc.) **rejected server-side** |
| EMP-001c | Bank info and documents promoted to payroll/Document Center **only on approval** |
| EMP-001c | Permissions: invite create/review = Owner + Secretary; employee views own status via Telegram |

See `WORKHQ_EMP001_COMPLETION_REPORT.md` for implementation details.

## Recommendations

1. Migrate remaining OT flows to unified inbox approve pattern.
2. Add Telegram integration test for `approve:overtime` callback path.
3. Document menu visibility rules per business role in UAT checklist.
4. Monitor webhook failure alerts in production ops dashboard.
