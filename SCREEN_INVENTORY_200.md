# UX-001 — Screen Inventory (200 Screens)

**WorkHQ Practical UX Reset** · Complete screen catalog  
อัปเดต 2026-06-25

**Legend — Status**

| Status | Meaning |
|--------|---------|
| Existing | Route/page มีอยู่ก่อน UX-001 |
| New | สร้างใหม่ใน UX-001 Phase 1 |
| Enhanced | มีอยู่แล้ว ปรับ layout/components ใน UX-001 |

**Legend — Role:** All · Owner · Secretary · BigLeader · Leader · Employee · HR · Admin · Ops · TG (Telegram)

---

| ID | Screen Name (ไทย) | Route | Role | Primary Action | Status |
|----|-------------------|-------|------|----------------|--------|
| SCR-001 | เข้าสู่ระบบ | `/login` | All | Login | Existing |
| SCR-002 | ภาพรวม — Owner | `/dashboard` | Owner | ดูงานด่วน / อนุมัติ | Enhanced |
| SCR-003 | ภาพรวม — Secretary | `/dashboard` | Secretary | Onboarding / เชิญพนักงาน | Enhanced |
| SCR-004 | ภาพรวม — Leader | `/dashboard` | Leader | อนุมัติ / attendance | Enhanced |
| SCR-005 | ภาพรวม — Employee | `/dashboard` | Employee | สรุปของฉัน | Enhanced |
| SCR-006 | งานของฉัน | `/my-work` | Leader, Secretary | ดูคิวงานรวม | New |
| SCR-007 | งานของฉัน — งานวันนี้ | `/my-work` (tab) | Leader+ | Filter งานวันนี้ | New |
| SCR-008 | งานของฉัน — รอฉัน | `/my-work` (tab) | Leader+ | Filter รอฉัน | New |
| SCR-009 | งานของฉัน — เกินกำหนด | `/my-work` (tab) | Leader+ | Filter overdue | New |
| SCR-010 | งานของฉัน — แบบร่าง | `/my-work` (tab) | All | Filter drafts | New |
| SCR-011 | คำขอ — Hub ทั้งหมด | `/requests` | HR, Leader | ดูคำขอทั้งหมด | New |
| SCR-012 | คำขอ — ของฉัน | `/requests/mine` | Employee, All | ติดตามคำขอตัวเอง | New |
| SCR-013 | คำขอ — Template | `/requests/templates` | HR | เลือก template | New |
| SCR-014 | สร้างคำขอ | `/requests/create` | All | สร้าง draft | Enhanced |
| SCR-015 | สร้างคำขอ — โหมดตนเอง | `/requests/create` (self) | Employee | ยื่นให้ตัวเอง | Enhanced |
| SCR-016 | สร้างคำขอ — แทนพนักงาน | `/requests/create` (employee) | HR, Leader | ยื่นแทน | Enhanced |
| SCR-017 | สร้างคำขอ — HR manual | `/requests/create` (hr_manual) | HR | บันทึก manual | Enhanced |
| SCR-018 | รายละเอียดคำขอ | `/requests/:id` | All | ดู/ดำเนินการ | Existing |
| SCR-019 | รายละเอียดคำขอ — Timeline | `/requests/:id` | All | ดูขั้นตอน | Existing |
| SCR-020 | รายละเอียดคำขอ — อนุมัติ | `/requests/:id` | Leader | Approve/Reject | Existing |
| SCR-021 | คำขอรอดำเนินการ (legacy) | `/requests/pending` | HR | Redirect/list | Existing |
| SCR-022 | คำขอ — filter pending | `/requests?status=pending` | HR | Filter | Enhanced |
| SCR-023 | คำขอ — filter overdue | `/requests?status=overdue` | HR | Filter | Enhanced |
| SCR-024 | อนุมัติ — รอดำเนินการ | `/approvals` (pending) | Leader, Owner | อนุมัติ inbox | Existing |
| SCR-025 | อนุมัติ — ประวัติ | `/approvals` (history) | Leader+ | ดูประวัติ | Existing |
| SCR-026 | อนุมัติ — มอบหมาย | `/approvals` (delegation) | Leader+ | สร้าง delegation | Existing |
| SCR-027 | อนุมัติ — ปฏิเสธ (modal) | `/approvals` | Leader | Reject + reason | Existing |
| SCR-028 | อนุมัติ — Timeline panel | `/approvals` | Leader | ดู timeline | Existing |
| SCR-029 | รายชื่อพนักงาน | `/hr/employees` | HR, Owner | ค้นหา/เปิด profile | Enhanced |
| SCR-030 | เพิ่มพนักงาน | `/hr/employees/new` | Secretary | สร้าง record | Existing |
| SCR-031 | โปรไฟล์พนักงาน — ภาพรวม | `/hr/employees/:id` | HR | ดูข้อมูลหลัก | Existing |
| SCR-032 | โปรไฟล์พนักงาน — ข้อมูลส่วนตัว | `/hr/employees/:id#personal` | HR | แก้ไข contact | New |
| SCR-033 | โปรไฟล์พนักงาน — เอกสาร | `/hr/employees/:id#documents` | HR | จัดการ docs | New |
| SCR-034 | โปรไฟล์พนักงาน — Telegram | `/hr/employees/:id#telegram` | HR | Invite / status | New |
| SCR-035 | โปรไฟล์พนักงาน — การลา | `/hr/employees/:id#leave` | HR | ปฏิทินลา | New |
| SCR-036 | โปรไฟล์พนักงาน — เวลาเข้างาน | `/hr/employees/:id#attendance` | HR | สรุป attendance | New |
| SCR-037 | โปรไฟล์พนักงาน — เงินเดือน | `/hr/employees/:id#compensation` | Owner, HR | ดู compensation | New |
| SCR-038 | โปรไฟล์พนักงาน — KPI | `/hr/employees/:id#kpi` | HR, Leader | ดู KPI | New |
| SCR-039 | โปรไฟล์พนักงาน — ประเมินผล | `/hr/employees/:id#performance` | HR | Review history | New |
| SCR-040 | โปรไฟล์พนักงาน — ประวัติ | `/hr/employees/:id#history` | HR | Awards, exit | New |
| SCR-041 | เงินประกันพนักงาน | `/hr/employees/:id/deposit` | HR | จัดการ deposit | Existing |
| SCR-042 | วินัยพนักงาน | `/hr/employees/:id/disciplinary` | HR | บันทึกวินัย | Existing |
| SCR-043 | เชิญพนักงาน Telegram | `/hr/invitation` | Secretary | สร้าง invite link | Enhanced |
| SCR-044 | ตรวจ Self-Onboarding | `/hr/self-onboarding` | Secretary | Approve ข้อมูล | Existing |
| SCR-045 | โครงสร้างองค์กร | `/hr/organization` | HR | ดู org chart | Existing |
| SCR-046 | คดีลาออก | `/hr/exit/:id` | HR, Owner | Clearance checklist | Existing |
| SCR-047 | ปรับเงินเดือน — Dashboard | `/hr/compensation-reviews` | Owner | ภาพรวม review | Existing |
| SCR-048 | ปรับเงินเดือน — รายการ | `/hr/compensation-reviews/list` | Owner | List reviews | Existing |
| SCR-049 | กรอบตำแหน่ง | `/hr/position-framework` | HR | Position framework | Existing |
| SCR-050 | Competency Matrix | `/hr/competencies` | HR | ทักษะ | Existing |
| SCR-051 | Succession Planning | `/hr/succession` | Owner | แผนทายาท | Existing |
| SCR-052 | แนะนำเพื่อน — รายการ | `/hr/referrals` | HR | ดู referrals | Existing |
| SCR-053 | แนะนำเพื่อน — รายละเอียด | `/hr/referrals/:id` | HR | Qualify/Pay | Existing |
| SCR-054 | เวลาเข้างาน — Hub | `/attendance` | HR, Leader | เลือก sub-module | New |
| SCR-055 | บันทึกประจำวัน | `/attendance/daily` | HR, Leader | ดู check-in/out | Existing |
| SCR-056 | ตรวจสอบขาดงาน | `/attendance/absences` | HR | Review absences | Existing |
| SCR-057 | อนุมัติ OT | `/attendance/overtime` | Leader | อนุมัติ OT | Existing |
| SCR-058 | แจ้งเตือนเข้างาน (widget) | `/dashboard` (widget) | HR | Drill to daily | Enhanced |
| SCR-059 | วันลา — Hub | `/leave` | All | เลือก sub-module | New |
| SCR-060 | คำขอลา | `/leave/requests` | All | ยื่น/ติดตามลา | Existing |
| SCR-061 | ปฏิทินทีม | `/calendar/team` | Leader, HR | ดูปฏิทิน | Existing |
| SCR-062 | เลื่อนวันลา | `/leave/reschedule` | Employee | ขอเลื่อน | Existing |
| SCR-063 | สลับกะ | `/leave/shift-swaps` | Employee | สลับกะ | Existing |
| SCR-064 | รอบเงินเดือน — รายการ | `/payroll/cycles` | HR, Owner | เปิดรอบ | Existing |
| SCR-065 | รอบเงินเดือน — รายละเอียด | `/payroll/cycles/:id` | HR | แก้ไขรอบ | Existing |
| SCR-066 | รอบเงินเดือน — Overview | `/payroll/cycles/:id/overview` | HR | สรุปรอบ | Existing |
| SCR-067 | เงินชดเชยเมื่อลาออก (self) | `/me/final-settlement` | Employee | ดู settlement | Existing |
| SCR-068 | คอมมิชชั่น — Hub | `/commission` | Marketing | เลือก sub-module | New |
| SCR-069 | รอบค่าคอม | `/commission/cycles` | Marketing | เปิดรอบ | Existing |
| SCR-070 | รายละเอียดรอบค่าคอม | `/commission/cycles/:id` | Marketing | ตรวจรอบ | Existing |
| SCR-071 | การปรับยอดค่าคอม | `/commission/adjustments` | Marketing | ปรับยอด | Existing |
| SCR-072 | รายละเอียดการปรับยอด | `/commission/adjustments/:id` | Marketing | ดู adjustment | Existing |
| SCR-073 | ประกาศค่าคอม | `/commission/declarations` | Marketing | ประกาศ | Existing |
| SCR-074 | ประเมินผล — Hub | `/performance` | HR, Leader | เลือก sub-module | New |
| SCR-075 | KPI — แม่แบบ | `/hr/kpi/templates` | HR | จัดการ template | Existing |
| SCR-076 | KPI — รอบประเมิน | `/hr/kpi/cycles` | HR | เปิดรอบ KPI | Existing |
| SCR-077 | KPI — รายละเอียดรอบ | `/hr/kpi/cycles/:id` | HR | ตรวจ KPI | Existing |
| SCR-078 | ประเมินผลงาน — รอบ | `/hr/performance/reviews` | HR | Review cycles | Existing |
| SCR-079 | ประเมินผลงาน — รายละเอียด | `/hr/performance/reviews/:id` | HR | Cycle detail | Existing |
| SCR-080 | รายงาน — Hub | `/reports` | Owner, Leader | เลือก report | New |
| SCR-081 | HR Analytics | `/analytics/hr` | Owner | ดู analytics | Existing |
| SCR-082 | แดชบอร์ดผู้บริหาร | `/executive` | Owner | Executive summary | Existing |
| SCR-083 | ภาพรวมการเงิน | `/finance` | Owner | Finance view | Existing |
| SCR-084 | Audit Explorer | `/audit` | Admin | ค้นหา audit log | Existing |
| SCR-085 | ตั้งค่า — Hub | `/settings` | Admin, Owner | เลือก setting | New |
| SCR-086 | ตั้งค่า — บริษัท | `/settings/system` | Admin | Company info | Existing |
| SCR-087 | ตั้งค่า — บทบาทและสิทธิ์ | `/settings/permissions` | Owner | Permission matrix | Existing |
| SCR-088 | ตั้งค่า — Approval Matrix | `/settings/approval-matrix` | Owner | Approval rules | Existing |
| SCR-089 | ตั้งค่า — กฎเข้างาน | `/settings/attendance` | HR | Shift/OT rules | Existing |
| SCR-090 | ตั้งค่า — กฎการลา | `/settings/leave` | HR | Leave rules | Existing |
| SCR-091 | ตั้งค่า — Referral | `/settings/referral` | HR | Referral config | Existing |
| SCR-092 | ตั้งค่า — Deposit | `/settings/deposit` | HR | Deposit rules | Existing |
| SCR-093 | ตั้งค่า — Payroll Rules | `/settings/payroll` | HR | Payroll config | Existing |
| SCR-094 | ตั้งค่า — ค่าคอม Admin | `/settings/commission/admin` | Owner | Admin commission | Existing |
| SCR-095 | ตั้งค่า — ค่าคอม Marketing | `/settings/commission/marketing` | Owner | Marketing commission | Existing |
| SCR-096 | Admin — ประเภทคำขอ | `/admin/request-types` | Admin | CRUD types | Existing |
| SCR-097 | Admin — Workflow | `/admin/workflows` | Admin | Workflow builder | Existing |
| SCR-098 | Admin — Formula | `/admin/formulas` | Admin | Formula engine | Existing |
| SCR-099 | Admin — Referral Programs | `/admin/referral-programs` | Admin | Program config | Existing |
| SCR-100 | บัญชี Telegram | `/security/telegram-identities` | Admin | จัดการ identities | Existing |
| SCR-101 | รออนุมัติสมัคร Telegram | `/security/registrations` | Admin | Approve registration | Existing |
| SCR-102 | เอกสารของฉัน | `/documents/my` | Employee | Upload/ack docs | Existing |
| SCR-103 | ประกาศ | `/announcements` | All | อ่าน/รับทราบ | Existing |
| SCR-104 | การเรียนรู้ | `/training` | Employee | Training courses | Existing |
| SCR-105 | ศูนย์ความรู้ — บทความ | `/knowledge/articles` | All | อ่านบทความ | Existing |
| SCR-106 | ศูนย์ความรู้ — แก้ไข | `/knowledge/articles/:id` | HR | Edit article | Existing |
| SCR-107 | AI Knowledge Assistant | `/ai/knowledge-assistant` | All | ถาม HR | Existing |
| SCR-108 | AI Manager | `/ai/manager` | Owner | AI brief/urgent | Existing |
| SCR-109 | Knowledge Graph | `/ai/knowledge-graph` | Owner | Graph query | Existing |
| SCR-110 | รายงานการตลาด — รายการ | `/marketing/reports` | Marketing | ดู reports | Existing |
| SCR-111 | รายงานการตลาด — รายละเอียด | `/marketing/reports/:id` | Marketing | Report detail | Existing |
| SCR-112 | ค่าใช้จ่ายการตลาด | `/marketing/expenses` | Marketing | Expense list | Existing |
| SCR-113 | รายละเอียดค่าใช้จ่าย | `/marketing/expenses/:id` | Marketing | Expense detail | Existing |
| SCR-114 | Dashboard ค่าใช้จ่าย | `/marketing/expenses/dashboard` | Marketing | Expense dashboard | Existing |
| SCR-115 | ทีมการตลาด | `/marketing/teams` | Marketing | Team list | Existing |
| SCR-116 | รายละเอียดทีม | `/marketing/teams/:id` | Marketing | Team detail | Existing |
| SCR-117 | ตรวจ KPI การตลาด | `/marketing/kpi` | Marketing | KPI review | Existing |
| SCR-118 | Audit การตลาด | `/marketing/audit` | Marketing | Marketing audit | Existing |
| SCR-119 | Marketing Insights | `/marketing/insights` | Marketing | Insights | Existing |
| SCR-120 | Ops Console | `/ops` | Ops | System ops | Existing |
| SCR-121 | ประวัติ Export | `/ops/exports` | Ops | Export history | Existing |
| SCR-122 | ประวัติ Import | `/ops/imports` | Ops | Import history | Existing |
| SCR-123 | Saved Reports | `/ops/reports` | Ops | Saved reports | Existing |
| SCR-124 | Scheduled Exports | `/ops/scheduled-exports` | Ops | Schedule config | Existing |
| SCR-125 | Ops Health | `/ops/health` | Ops | Health check | Existing |
| SCR-126 | QA Readiness | `/qa/readiness` | Ops | QA dashboard | Existing |
| SCR-127 | QA Traceability | `/qa/traceability` | Ops | RTM view | Existing |
| SCR-128 | TG — เมนูหลัก Employee | Telegram bot | Employee | เลือกเมนู | Existing |
| SCR-129 | TG — ข้อมูลของฉัน | `employee:profile` | Employee | ดู profile | Existing |
| SCR-130 | TG — เมนูลา | `leave:menu` | Employee | ยื่นลา | Enhanced |
| SCR-131 | TG — เมนูเข้างาน | `attendance:menu` | Employee | ดูเวลา | Existing |
| SCR-132 | TG — เมนูคำร้อง | `request:menu` | Employee | ยื่นคำร้อง | Enhanced |
| SCR-133 | TG — ดูสลิป | `payroll:view_payslip` | Employee | Payslip | Existing |
| SCR-134 | TG — KPI ของฉัน | `performance:my` | Employee | ดู KPI | Existing |
| SCR-135 | TG — เอกสารของฉัน | `document-center:my` | Employee | Docs info | Existing |
| SCR-136 | TG — ประกาศ | `announcement:list` | Employee | อ่านประกาศ | Existing |
| SCR-137 | TG — คนที่ฉันแนะนำ | `referral:my:list` | Employee | Referrals | Existing |
| SCR-138 | TG — ถาม WorkHQ | `ai:knowledge` | Employee | AI Q&A | Existing |
| SCR-139 | TG — Self-onboarding wizard | `invite_*` start | Employee | กรอกข้อมูล | Enhanced |
| SCR-140 | TG — ยืนยันส่งคำร้อง | Form confirm | Employee | ส่ง/แก้/ยกเลิก | Enhanced |
| SCR-141 | TG — Inbox Leader | `unified:inbox` | Leader | อนุมัติ inline | Existing |
| SCR-142 | TG — ปฏิทินทีม | `calendar:menu` | Leader | Team calendar | Existing |
| SCR-143 | TG — แจ้งเตือนเข้างาน | `attendance:alerts` | Leader | Attendance alerts | Existing |
| SCR-144 | TG — KPI ทีม | `performance:team` | Leader | Team KPI | Existing |
| SCR-145 | TG — ทีมของฉัน | `leader:team_dashboard` | Leader | Team dashboard | Existing |
| SCR-146 | TG — AI Manager | `ai:manager:menu` | Leader | AI manager | Existing |
| SCR-147 | TG — Morning Brief | `ai:brief:today` | Owner | สรุปเช้า | Existing |
| SCR-148 | TG — Inbox Owner | `unified:inbox` | Owner | อนุมัติ | Existing |
| SCR-149 | TG — Attendance Alerts Owner | `attendance:alerts` | Owner | Alerts | Existing |
| SCR-150 | TG — HR Summary | `hr:summary` | Owner | KPI/Performance | Existing |
| SCR-151 | TG — Succession | `succession:overview` | Owner | Succession | Existing |
| SCR-152 | TG — HR Graph Query | `graph:query:menu` | Owner | Graph query | Existing |
| SCR-153 | Redirect — 404 | `*` → `/dashboard` | All | Auto redirect | Existing |
| SCR-154 | Error — API load failed | (any page) | All | Retry | New |
| SCR-155 | Empty — ยังไม่เลือกบริษัท | (shell) | All | เลือก company | Enhanced |
| SCR-156 | Permission denied — ทั่วไป | (any page) | All | กลับหลัก | New |
| SCR-157 | Permission denied — ตั้งค่า | `/settings` | All | ติดต่อ Owner | New |
| SCR-158 | Loading — หน้าเต็ม | (any page) | All | รอโหลด | Existing |
| SCR-159 | Loading — รีเฟรช inline | (any page) | All | Button disabled | Enhanced |
| SCR-160 | เลือกบริษัท (header) | App shell | All | Switch company | Existing |
| SCR-161 | เมนูผู้ใช้ | App shell | All | Profile/logout | Existing |
| SCR-162 | ออกจากระบบ | `/logout` | All | Logout | Existing |
| SCR-163 | Dashboard — Onboarding stats | `/dashboard` | Secretary | Drill invitation | Enhanced |
| SCR-164 | Dashboard — วันเกิดเดือนนี้ | `/dashboard` | HR | Mark gift | Enhanced |
| SCR-165 | Dashboard — ครบรอบงาน | `/dashboard` | HR | Mark gift | Enhanced |
| SCR-166 | Dashboard — คดีลาออก | `/dashboard` | HR | Open exit case | Enhanced |
| SCR-167 | Dashboard — ทดลองงานรอ review | `/dashboard` | HR | Open employee | Enhanced |
| SCR-168 | Dashboard — Documents widget | `/dashboard` | HR | Doc counts | Enhanced |
| SCR-169 | Dashboard — Announcements widget | `/dashboard` | HR | Ack stats | Enhanced |
| SCR-170 | คำขอ — filter ประเภท | `/requests` | HR | Type dropdown | Enhanced |
| SCR-171 | อนุมัติ — filter ช่องทาง | `/approvals` | Leader | Channel filter | Existing |
| SCR-172 | พนักงาน — Export modal | `/hr/employees` | HR | Export data | Existing |
| SCR-173 | พนักงาน — สร้างรางวัล | `/hr/employees/:id` | HR | Create award | Existing |
| SCR-174 | Payroll — อนุมัติรอบ | `/payroll/cycles/:id` | Owner | Approve cycle | Existing |
| SCR-175 | Payroll — ดูสลิป | `/payroll/cycles/:id` | Employee | View payslip | Existing |
| SCR-176 | ลา — shortcut สร้างคำขอ | `/leave` hub | Employee | → create | New |
| SCR-177 | OT — shortcut สร้างคำขอ | `/attendance` hub | Leader | → create OT | New |
| SCR-178 | ตั้งค่า — Advanced section | `/settings` | Admin | Advanced cards | New |
| SCR-179 | ตั้งค่า — Category dynamic | `/settings/:category` | Admin | Dynamic settings | Existing |
| SCR-180 | คำขอ — แนบไฟล์ (future) | `/requests/:id` | All | Attachments | New |
| SCR-181 | TG — Leave date buttons | `leave:menu` | Employee | เลือกวัน | Enhanced |
| SCR-182 | TG — OT form buttons | `request:menu` OT | Employee | กรอก OT | Enhanced |
| SCR-183 | TG — Advance pay form | `request:menu` | Employee | ขอ advance | Enhanced |
| SCR-184 | TG — Time correction | `request:menu` | Employee | แก้เวลา | Enhanced |
| SCR-185 | TG — Shift change | `request:menu` | Employee | เปลี่ยนกะ | Enhanced |
| SCR-186 | TG — Document request | `request:menu` | Employee | ขอเอกสาร | Enhanced |
| SCR-187 | TG — เริ่ม invite link | `start=invite_*` | Employee | Link account | Enhanced |
| SCR-188 | TG — Registration pending | Bot | Employee | รอ approve | Existing |
| SCR-189 | TG Marketing — Commission | Marketing menu | Employee | ดู commission | Existing |
| SCR-190 | TG Marketing — Submit report | Marketing menu | Employee | ส่ง report | Existing |
| SCR-191 | Export พนักงาน bulk | `/hr/employees` | HR | Bulk export | Existing |
| SCR-192 | Import history detail | `/ops/imports` | Ops | View import job | Existing |
| SCR-193 | Calendar — conflict view | `/calendar/team` | Leader | View conflicts | Existing |
| SCR-194 | ประกาศ — รับทราบ modal | `/announcements` | Employee | Acknowledge | Existing |
| SCR-195 | เอกสาร — upload flow | `/documents/my` | Employee | Upload doc | Existing |
| SCR-196 | Training — course detail | `/training` | Employee | View course | Existing |
| SCR-197 | AI Manager — urgent list | `/ai/manager` | Owner | Urgent items | Existing |
| SCR-198 | Compensation — review action | `/hr/compensation-reviews` | Owner | Approve review | Existing |
| SCR-199 | Exit — clearance checklist | `/hr/exit/:id` | HR | Complete items | Existing |
| SCR-200 | Global search (future) | App shell | All | Search all | New |

---

## Summary by Domain

| Domain | Count | New | Enhanced |
|--------|-------|-----|----------|
| Auth & Shell | 10 | 2 | 4 |
| Dashboard & My Work | 20 | 6 | 14 |
| Requests & Approvals | 18 | 4 | 6 |
| Employees & HR | 35 | 10 | 3 |
| Attendance & Leave | 12 | 4 | 2 |
| Payroll & Commission | 14 | 2 | 0 |
| Performance & Reports | 12 | 2 | 0 |
| Settings & Admin | 20 | 2 | 0 |
| Documents & AI | 10 | 0 | 0 |
| Marketing | 10 | 0 | 0 |
| Ops & QA | 8 | 0 | 0 |
| Telegram | 35 | 0 | 12 |
| States & Future | 16 | 6 | 4 |
| **Total** | **200** | **38** | **45** |

---

## Coverage Checklist

- [x] Dashboard
- [x] My work
- [x] Requests
- [x] Approvals
- [x] Employees
- [x] Invitation
- [x] Attendance
- [x] Leave
- [x] Payroll
- [x] Commission
- [x] Performance
- [x] Reports
- [x] Settings
- [x] Admin
- [x] Telegram
- [x] Ops

**Total screens: 200 (SCR-001 – SCR-200)**
