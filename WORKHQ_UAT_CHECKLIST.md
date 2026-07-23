# WorkHQ UAT Checklist

Use this checklist during real-user testing. Mark Pass/Fail and add notes per row.

## Owner

| Test Case | Preconditions | Steps | Expected Result | Actual Result | Pass/Fail | Notes |
|-----------|---------------|-------|-----------------|---------------|-----------|-------|
| Morning Brief | Owner Telegram linked | Open Telegram → Morning Brief or wait 08:00 | Thai summary with counts and action buttons | | | |
| Approval Inbox | Pending requests exist | Tap 📥 งานรออนุมัติ | List of pending items with ✅/❌ | | | |
| Payroll Overview | Payroll cycle open | Web payroll + Telegram 💰 | Summary visible, no unauthorized data | | | |
| Salary Review | Review pending | Approve via Telegram/Web | Status updated, audit logged | | | |
| Exit Approval | Exit case pending | Approve via Telegram | Case advances, requester notified | | | |
| Announcement Publish | Owner role | Publish announcement | Employees receive Telegram | | | |
| AI Manager | Owner role | 🤖 AI Manager menu | Brief + urgent list loads | | | |
| Knowledge Graph | Owner role | HR Graph Query → ask question | Scoped company results | | | |

## Secretary

| Test Case | Preconditions | Steps | Expected Result | Actual Result | Pass/Fail | Notes |
|-----------|---------------|-------|-----------------|---------------|-----------|-------|
| Employee Management | Secretary role | Web employees list | CRUD within company scope | | | |
| Documents | Sample documents | Document center | Upload/list scoped to company | | | |
| **Telegram Invite** | HR creates minimal employee | Employee detail → ส่งลิงก์เชิญ Telegram → employee taps link | Telegram linked; self-onboarding starts | | | |
| **Self-Onboarding Submit** | Employee completes Telegram form | Submit at summary screen | HR notified; status = submitted | | | |
| **Self-Onboarding Approve** | Submission pending | Web `/hr/self-onboarding` or Telegram ✅ | Profile + bank + documents updated | | | |
| **Self-Onboarding Reject** | Submission pending | Reject with reason on Web | Employee notified; can resubmit | | | |
| **P0-001b Invite management** | HR role | `/hr/invitation-codes` → view table, regenerate, cancel, detail | Actions work; copy only after create/regenerate | | | |
| **P0-001b Approval Center onboarding** | Submitted invite-first onboarding | Approvals → รับพนักงานใหม่ card | Preview shows name/team/role; approve/reject works | | | |
| **P0-001b Double approve** | Onboarding already approved | Re-click approve on same request | No duplicate employee/assignment/Telegram link | | | |
| **P0-001b Employee timeline** | Approved new employee | Employee detail → Timeline | Thai onboarding events (ไม่แสดง raw event key) | | | |
| **P0-001c Owner invite perms** | Owner login | `/hr/invitation` | Create new + link existing; regenerate/cancel; view all history | | | |
| **P0-001c Big Leader scope** | Big Leader scoped to SB | Create invite for SB team only | Cannot create for other company; cancel denied by default | | | |
| **P0-001c Admin default** | Admin login | Employee list + detail | No invite button; API returns 403 | | | |
| **P0-001c Admin override** | Owner grants Admin `invite:create` + `new-employee` for SB | Create invite for SB | Cannot create for other company | | | |
| **P0-002 Open payroll cycle** | Owner + `payroll:write` | `/payroll/cycles` → เปิดรอบ | New cycle appears; navigate to detail | | | |
| **P0-002 Build & lock** | Open cycle | Cycle detail → build preview → build → lock | Items created; export unlocked after lock | | | |
| **P0-002 Overview & export** | Locked cycle | Overview + bank export XLSX/CSV | Totals match; download works | | | |
| **P0-002 Employee payroll tab** | Employee with history | Employee detail → เงินเดือน | Summary + history + detail modal + compensation | | | |
| **P0-002 Manual item** | Open cycle | Cycle detail → manual adjustment | Item added; preview updates | | | |
| **P0-002 Payslip** | Locked/paid cycle | Employee detail modal → generate payslip | Payslip amounts shown | | | |
| **P0-003 Secretary payroll write** | Secretary login | `/payroll/cycles` → open, build, lock, paid, export, payslip | All actions succeed (no Owner required) | | | |
| **P0-003 Manual item builder** | Open cycle + employee UUID | Cycle detail → manual item form | Thai categories; one-time/recurring; effective dates; note | | | |
| **P0-003 Recurring manual item** | Recurring definition effective | Build payroll cycle | Scheduled item applied once per cycle | | | |
| **P0-003 Summary PDF** | Cycle with items | Cycle detail → ดาวน์โหลดสรุป PDF | PDF downloads with employee totals | | | |
| **P0-003 Payslip PDF** | Generated payslip | Overview employee modal → ดาวน์โหลดสลิป PDF | PDF downloads with breakdown | | | |
| **P0-003b Thai PDF fonts** | Cycle with Thai employee names | Download summary + payslip PDF | Thai text renders correctly (Sarabun) | | | |
| **P0-003b Employee search** | Open cycle | Manual item form → search employee by name/code | Select from list; no UUID typing | | | |
| **P0-004 New employee invite** | HR creates invite | Telegram /start invite_* → self-onboarding → submit | Approval Center shows employee_onboarding request | | | |
| **P0-004 Existing employee link** | HR sends link to active employee | Employee taps link | Telegram ACTIVE immediately; main menu works | | | |
| **P0-004 Approval approve** | in_review onboarding request | Approval Center → approve | Identity ACTIVE, invite used, employee detail shows linked | | | |
| **P0-004 Approval reject** | in_review onboarding request | Approval Center → reject with reason | Identity revoked, status rejected | | | |
| **P0-004 /status command** | User at each onboarding stage | Telegram /status | Message matches Web employee Telegram status | | | |
| **P0-004 Telegram HR quick approve** | Submitted self-onboarding | Telegram ✅ button | Full onboarding approval (not profile-only) | | | |
| **P0-005 Check-in shift** | Employee with shift assignment | Telegram 🟢 เข้างาน | Shows time, shift name, shift window, on-time/late status | | | |
| **P0-005 Check-out OT prompt** | Checked in employee | Telegram 🔴 เลิกงาน | Prompts มี OT / ไม่มี OT; pending OT if yes | | | |
| **P0-005 Monthly off** | Employee | Telegram 🗓 แจ้งวันหยุด | Submits dates; approval workflow; not counted as leave | | | |
| **P0-005 Team calendar monthly off** | Approved/pending monthly off | Telegram 📅 ตารางทีม | Monthly off dates visible per employee | | | |
| **P0-005 Late deduction** | Late check-in > grace | Run payroll | CEIL(late hours)×2× hourly rate deducted | | | |
| **P0-005 Employee menu** | Active Telegram employee | Open main menu | 8 task-first items only (no KPI/AI/training) | | | |
| **P0-005b Schedule future shift** | Secretary, shifts exist | Employment tab → กำหนดกะล่วงหน้า | Assignment created; current unchanged until effectiveFrom | | | |
| **P0-005b Overlap rejected** | Existing assignment Jul–open | Schedule Jun–Aug | API returns conflict; no overlap | | | |
| **P0-005b Attendance recalc flag** | Check-in exists on scheduled dates | Schedule shift over those dates | `needsRecalculation=true`; late not auto-updated | | | |
| **WDE Command center** | Secretary/owner, active employees | Web `/attendance/command-center` | Widget counts from WorkDayService; click shows employee list | | | |
| **WDE Exception center** | Employees with missing punch / pending OT | Exception Center tab | Grouped exceptions; link to employee + approvals | | | |
| **WDE Employee card** | HR viewer | Employee detail top card | Today state, shift, punches, payroll preview, timeline | | | |
| **WDE Telegram state UI** | Employee at each state | Telegram home | Primary button matches state; secondary menu de-emphasized | | | |
| **WDE Payroll preview** | Approved + pending OT | API or employee card | Approved OT in; pending out; recalc warning if flagged | | | |
| **WDE Company calendar** | Month with leave/off/shift | GET company-calendar | Event list returned | | | |
| **Pilot Employee Today menu** | Active employee | Telegram home | Status card + state primary + ≤4 secondary only | | | |
| **Pilot Employee menu excluded** | Active employee | Telegram home | No KPI/AI/Training/Competency/Succession on main | | | |
| **Pilot Manager ops menu** | Secretary/owner | Telegram home | Ops/risk/approval menu shown | | | |
| **Business role edit (Owner)** | Owner on employee detail | Employment tab → change บทบาท → บันทึกบทบาท | Role saved; audit logged; Telegram /start shows new menu | | | |
| **Business role edit (Secretary)** | Secretary on employee detail | Assign secretary/big_leader (not owner) | Saves; cannot assign owner | | | |
| **Business role Telegram refresh** | Role changed to employee | Target user /start in Telegram | Employee Today menu (not ops) | | | |
| **Business role Telegram ops** | Role changed to owner/secretary/big_leader | Target user /start | Manager operations menu | | | |
| **Pilot Workforce risk** | Staffing rule + leave/off | Command center risk card | GREEN/YELLOW/ORANGE/RED with reasons | | | |
| **Pilot Morning brief risk** | Team below minimum | 08:00 brief method | Risk lines included | | | |
| Payroll Export | Open cycle | Export payroll | File generated, permission guarded | | | |
| Requests Dashboard | Open requests | Web requests dashboard | Company-scoped counts | | | |
| Final Settlement | Settlement pending | Process settlement | Approval flow completes | | | |
| Announcement Tracking | Published announcement | Track acknowledgements | Dashboard updates | | | |
| Training Assignment | Course exists | Assign training | Employee sees in 📚 การเรียนรู้ | | | |

## Big Leader

| Test Case | Preconditions | Steps | Expected Result | Actual Result | Pass/Fail | Notes |
|-----------|---------------|-------|-----------------|---------------|-----------|-------|
| Team Calendar | Team members | 📅 ปฏิทินทีม | Leave/off-day visible | | | |
| Leave Approval | Pending leave | Approve via Telegram | Leave approved, calendar updated | | | |
| OT Approval | Pending OT | Approve via Telegram | OT record + payroll source | | | |
| Time Correction | Pending correction | Approve | Attendance corrected | | | |
| KPI Team View | Active cycle | 🏆 KPI ทีม | Team performance summary | | | |
| Performance Review | Review open | Submit scores | Weighted score calculated | | | |
| Attendance Alerts | Missing check-ins | 🚨 Attendance Alerts | Alert list in Thai | | | |

## Sub Leader

| Test Case | Preconditions | Steps | Expected Result | Actual Result | Pass/Fail | Notes |
|-----------|---------------|-------|-----------------|---------------|-----------|-------|
| Team leave approval | Sub leader role | Approve team leave via Telegram | Approved within team scope | | | |
| Own payslip only | Sub leader | View payroll | Cannot see other salaries | | | |
| Team calendar | Team assigned | View calendar | Team events only | | | |

## Employee

| Test Case | Preconditions | Steps | Expected Result | Actual Result | Pass/Fail | Notes |
|-----------|---------------|-------|-----------------|---------------|-----------|-------|
| Check In/Out | Active employee | ⏰ เวลาเข้างาน | Record saved, audit logged | | | |
| Break Start/End | Checked in | Break buttons | Break times recorded | | | |
| Leave Request | Balance available | 📅 วันลา → submit | Workflow started | | | |
| UX-001 Leave buttons | Employee | 📅 วันลา → pick type/dates/duration | No free-text except reason | | | |
| UX-001 Request platform | Employee | 📋 คำร้อง → OT/advance/doc | Button pickers + summary confirm | | | |
| OT Request | After checkout with OT | Request OT | Approval workflow | | | |
| Advance Pay | Policy allows | 📋 คำร้อง | Owner approval required | | | |
| Document Request | Template exists | Request document | PDF in document center | | | |
| Payslip | Closed cycle | 💰 เงินเดือน | Own payslip only | | | |
| Announcement Ack | Announcement sent | Open + acknowledge | Status tracked | | | |
| Referral | Program active | Submit referral | Status tracked through probation | | | |
| KPI / Training / Competency | Data seeded | 🏆 / 📚 / 🎯 menus | Own data only | | | |
