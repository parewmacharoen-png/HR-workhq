# UX-001 — Practical Screen Specifications

**WorkHQ Practical UX Reset** · Key screens — รายละเอียดสำหรับ implement / QA  
อัปเดต 2026-06-25 · อ้างอิง code ใน `web/src/pages/`

---

## Conventions

| Element | Component | Notes |
|---------|-----------|-------|
| Page shell | `WorkHQPage shell` | ใช้กับ hub/detail ที่มี breadcrumb |
| Header | `WorkHQPageHeader` | title + subtitle + actions (ขวา) |
| Breadcrumb | `WorkHQBreadcrumb` | เริ่มจาก `ภาพรวม` เสมอ (ยกเว้น Dashboard) |
| Tabs | `WorkHQTabNav` | route-based active state |
| Stats | `WorkHQStatCard` | icon, value, label, trend, tone |
| Tasks | `.whq-task-list` | priority dot + link + badge |

---

## 1. Dashboard — `/dashboard`

**File:** `web/src/pages/DashboardPage.tsx`  
**Roles:** ทุก role (content ตาม permission)

### Layout zones

1. **Welcome row** — greeting + mascot
2. **Company warning** — ถ้ายังไม่เลือก company
3. **Cheer banner** — `WorkHQCheerBanner`
4. **PracticalDashboardTasks** — งานด่วนวันนี้ (UX-001 Phase 1)
5. **Employee home summary** — ถ้ามี `employeeId` (พนักงาน)
6. **Role-specific widgets** — tenure, stats, onboarding, calendar, docs, attendance alerts, probation, awards, exit, recognition
7. **Action required grid** — quick links ตาม permission

### Primary actions

| Action | Target | Role |
|--------|--------|------|
| ทำงานด่วน | จาก task list → deep link | Leader+, Secretary |
| ดูงานของฉันทั้งหมด | `/my-work` | จาก PracticalDashboardTasks |
| อนุมัติ | `/approvals` | `workflow:act` |
| เชิญพนักงาน | `/hr/invitation` | `employee:write` |

### Stat cards (default row)

| Column | Label (TH) | Source |
|--------|------------|--------|
| 1 | พนักงานที่ active | `activeEmployees` |
| 2 | ลาวันนี้ | `onLeaveToday` |
| 3 | รออนุมัติ | `pendingLeave` |
| 4 | เชื่อม Telegram | `telegramLinked` + % |

### Dashboard tasks logic (`todayTasks`)

| Task ID | Condition | Path |
|---------|-----------|------|
| leave-approve | pending leave + `workflow:act` | `/approvals` |
| onboarding | pendingReview + `employee:write` | `/hr/self-onboarding` |
| docs | missingRequired docs | `/documents/my` |
| invite | notConnected + `employee:write` | `/hr/invitation` |
| attendance | missing check-in/out | `/attendance/daily` |
| birthday | birthdays this month | `/hr/employees` |

### Role hints

| `roleHint` | Subtitle focus |
|------------|----------------|
| `owner` | อนุมัติ · เงินเดือน · ความเสี่ยง · วันเกิด/ครบรอบ |
| `secretary` | งานวันนี้ · เชิญพนักงาน · เอกสารขาด · payroll |

### Filters

ไม่มี global filter — permission-based visibility

---

## 2. My Work — `/my-work`

**File:** `web/src/pages/my-work/MyWorkPage.tsx`  
**Roles:** `workflow:read`+ (Leader, Secretary, Employee with tasks)

### Header

| Field | Value |
|-------|-------|
| Title | 📌 งานของฉัน |
| Subtitle | งานที่รอคุณวันนี้ — เรียงตามความสำคัญ |
| Actions | รีเฟรช (secondary) |

### Tab filters (inline buttons)

| Tab ID | Label | Filter logic |
|--------|-------|--------------|
| `today` | งานวันนี้ | `kind=today` OR `priority=urgent` |
| `waiting` | รอฉัน | `kind=waiting` |
| `overdue` | เกินกำหนด | `kind=overdue` |
| `drafts` | แบบร่าง | `kind=drafts` |

### Task list columns (list item)

| Part | Content |
|------|---------|
| Priority dot | urgent / normal / low |
| Title | Link + count |
| Subtitle | muted description |
| Badge | ด่วน / ปกติ |

### Task sources

| Source API | Task |
|------------|------|
| `getRequestDashboard` | อนุมัติคำขอ, เกินกำหนด |
| `getDocumentDashboard` | เอกสารขาด |
| `getOnboardingDashboardStats` | onboarding review, telegram invite |
| `home-summary` | คำขอของฉัน |

### Secondary — ทางลัด

| Button | Route |
|--------|-------|
| + สร้างคำขอ | `/requests/create` |
| อนุมัติ | `/approvals` |
| + เพิ่มพนักงาน | `/hr/employees/new` |
| เชิญพนักงาน | `/hr/invitation` |

---

## 3. Requests Hub — `/requests`, `/requests/mine`, `/requests/templates`

**File:** `web/src/pages/requests/RequestsHubPage.tsx`  
**Permission:** `workflow:read`

### Header

| Field | Value |
|-------|-------|
| Title | 📋 คำขอ |
| Subtitle | สร้าง ติดตาม และจัดการคำขอ — ไม่ใช่หน้าตั้งค่า Workflow |
| Primary action | + สร้างคำขอ → `/requests/create` |

### Tabs (`WorkHQTabNav`)

| Tab | Path | Badge |
|-----|------|-------|
| สร้างคำขอ | `/requests/create` | — |
| คำขอทั้งหมด | `/requests` | pendingApproval |
| คำขอของฉัน | `/requests/mine` | — |
| Template คำขอ | `/requests/templates` | — |

### Stat row (tab = all only)

| Stat | Label |
|------|-------|
| submittedToday | ส่งวันนี้ |
| pendingApproval | รออนุมัติ |
| overdue | เกินกำหนด |
| myPendingApprovals | รอฉันอนุมัติ |

### Filters (query params)

| Filter | Param | Options |
|--------|-------|---------|
| Status | `?status=` | pending, approved, rejected, overdue, (empty=all) |
| Type | dropdown | จาก `listRequestTypes` |

### Table columns (list)

| Column | Field |
|--------|-------|
| รหัส / ประเภท | request type name |
| ผู้ยื่น | submitter |
| สถานะ | StatusBadge |
| วันที่ | submittedAt |
| Actions | เปิด detail |

---

## 4. Create Request — `/requests/create`

**File:** `web/src/pages/requests/CreateRequestPage.tsx`

### Header

| Title | 📋 สร้างคำขอ |
| Breadcrumb | ภาพรวม › คำขอ › สร้างคำขอ |

### Form fields

| Field | Type | Notes |
|-------|------|-------|
| Mode | radio | self / employee / hr_manual |
| Employee | select | เมื่อ mode ≠ self |
| Request type | select | จาก `listRequestTypes`; prefill `?typeId=` |
| Reason | textarea | optional บาง type |
| Event date | date | optional |

### Primary action

**สร้างแบบร่าง** → POST draft → redirect `/requests/:id`

### Secondary

| Action | Behavior |
|--------|----------|
| ยกเลิก | กลับ `/requests` |
| Deep link OT | `/requests/create?type=ot` จาก Attendance hub |

---

## 5. Approvals — `/approvals`

**File:** `web/src/pages/approvals/ApprovalsPage.tsx`  
**Permission:** `workflow:act`

### Header

| Title | ✅ อนุมัติ (จาก i18n `th.approvals`) |
| Subtitle | Inbox รวม workflow, request, salary review, exit |

### Tabs

| Tab | Content |
|-----|---------|
| pending | Inbox รออนุมัติ |
| history | ประวัติที่ทำแล้ว |
| delegation | มอบหมายการอนุมัติ |

### Pending list columns

| Column | Notes |
|--------|-------|
| ประเภท | request / workflow type |
| ผู้ยื่น | employee name |
| วันที่ | submitted |
| ช่องทาง | web / telegram / system |
| สถานะ | pending |
| Actions | อนุมัติ / ปฏิเสธ |

### Filters (history tab)

| Filter | Field |
|--------|-------|
| Status | pending / approved / rejected |

### Primary actions

| Action | API |
|--------|-----|
| อนุมัติ | `actOnWorkflow` |
| ปฏิเสธ | modal + reason |
| มอบหมาย | createDelegation |

### Detail panel

- Approval timeline (`ApprovalTimeline`)
- Selected item metadata

---

## 6. Employees List — `/hr/employees`

**File:** `web/src/pages/hr/EmployeesPage.tsx`  
**Permission:** `employee:read`

### Header

| Title | 👥 พนักงาน |
| Subtitle | จำนวน total + company name |
| Primary | + เพิ่มพนักงาน (`employee:write`) |
| Secondary | เชิญพนักงาน → `/hr/invitation`, Export |

### Filters (`WorkHQFilterToolbar`)

| Filter | Type | Options |
|--------|------|---------|
| Search | text | ชื่อ, globalId |
| Status | select | all, probation, active, suspended, terminated |
| Company | select | multi-company users |

### List display

**Card grid** — `WorkHQEmployeeCard` per employee

| Card field | Content |
|------------|---------|
| Avatar | initials |
| Name | first + last |
| Meta | globalId, department, position |
| Status badge | employment status |
| Telegram | linked indicator |
| Link | `/hr/employees/:id` |

### Empty / error

- No company: legacy `EmptyState`
- Loading: `LoadingState`
- Error: `ErrorState` (migrate to WorkHQPracticalErrorState — Phase 2)

---

## 7. Invitation Code — `/hr/invitation`

**File:** `web/src/pages/hr/InvitationCodePage.tsx`  
**Permission:** `employee:write` (create), read for view

### Header

| Title | 📱 เชิญพนักงาน / Invitation Code |
| Breadcrumb | ภาพรวม › พนักงาน › เชิญ Telegram |

### Primary flow

1. Select employee (dropdown — ไม่มี Telegram yet)
2. **สร้างลิงก์เชิญ** → `createTelegramInvite`
3. Copy link `https://t.me/<BOT>?start=invite_<token>`
4. แสดง expiry (7 วัน)

### History table (per employee)

| Column | Field |
|--------|-------|
| สถานะ | status (pending/used/expired) |
| สร้างเมื่อ | createdAt |
| หมดอายุ | expiresAt |
| Token preview | masked |

### Secondary actions

| Action | Route |
|--------|-------|
| ไป Self-onboarding review | `/hr/self-onboarding` |
| กลับรายชื่อพนักงาน | `/hr/employees` |

### Business rules (EMP-001b)

- One-time token, SHA-256 hash server-side
- ไม่ใช้ employee code ใน flow ปกติ
- Secretary/Owner เท่านั้นที่สร้าง invite

---

## 8. Employee Profile — `/hr/employees/:id`

**File:** `web/src/pages/hr/EmployeeDetailPage.tsx`  
**Phase 2:** migrate to `WorkHQTabNav` tabs (ปัจจุบัน = stacked sections)

### Planned tabs (Phase 2)

| Tab ID | Label (TH) | Content section |
|--------|------------|-----------------|
| overview | ภาพรวม | Profile header, status, tenure, probation |
| personal | ข้อมูลส่วนตัว | Contact, emergency, bank (post-approval) |
| documents | เอกสาร | `EmployeeDocumentsSection` |
| telegram | Telegram | `EmployeeTelegramInviteSection`, onboarding status |
| leave | การลา | `EmployeeLeaveCalendarSection` |
| attendance | เวลาเข้างาน | Reporting / attendance summary |
| compensation | เงินเดือน | `EmployeeCompensationSection` (salary visibility) |
| kpi | KPI | `EmployeeKpiSection` |
| performance | ประเมินผล | `EmployeePerformanceReviewSection` |
| history | ประวัติ | Recognitions, exit history, disciplinary link |

### Header (all tabs)

| Element | Content |
|---------|---------|
| Avatar | `WorkHQAvatar` |
| Name | first + last |
| Meta | globalId · status dot · department · position |
| Actions | Edit, Deposit, Disciplinary, Exit (permission-gated) |

### Sub-routes (deep links)

| Route | Purpose |
|-------|---------|
| `/hr/employees/:id/deposit` | เงินประกัน |
| `/hr/employees/:id/disciplinary` | วินัย |

---

## 9. Settings Hub — `/settings`

**File:** `web/src/pages/settings/SettingsHubPage.tsx`  
**Permission:** `settings:read` OR `security:read` OR `workflow:write`

### Header

| Title | ⚙️ ตั้งค่า |
| Subtitle | Workflow / Formula / Request Type อยู่ที่นี่ ไม่ใช่เมนูหลัก |

### Sections

**การตั้งค่าทั่วไป** — card grid, `whq-settings-card`  
**ขั้นสูง / ผู้ดูแลระบบ** — `whq-settings-card advanced`

### Card anatomy

| Part | Content |
|------|---------|
| Title | section label |
| Description | one-line Thai + English term |
| Link | `path` |

### Permission denied

`WorkHQEmptyState` — ไม่มีสิทธิ์ตั้งค่า → ติดต่อ Owner/HR

---

## 10. Cross-screen Patterns

### Breadcrumb examples

```
ภาพรวม › งานของฉัน
ภาพรวม › คำขอ
ภาพรวม › คำขอ › สร้างคำขอ
ภาพรวม › เวลาเข้างาน
ภาพรวม › ตั้งค่า
```

### Permission gates

| Screen | Gate component |
|--------|----------------|
| Requests | `WorkHQEmptyState` 🔒 |
| Settings | `WorkHQEmptyState` 🔒 |
| My Work | company required empty state |

---

## 11. QA Checklist (Key Screens)

- [ ] Dashboard แสดง tasks เฉพาะเมื่อมี companyId
- [ ] My Work filter tabs ไม่ crash เมื่อ empty
- [ ] Requests hub badge อัปเดตหลัง approve
- [ ] Create request redirect ไป detail พร้อม draft id
- [ ] Approvals reject ต้องมี reason
- [ ] Invitation copy-to-clipboard ทำงาน
- [ ] Settings ซ่อน marketing cards ใน HR mode
