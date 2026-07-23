# UX-001 — Empty / Loading / Error / Permission State Specification

**WorkHQ Practical UX Reset** · Standard UX patterns  
อัปเดต 2026-06-25

---

## 1. Principles

| Principle | Description |
|-----------|-------------|
| **Actionable** | ทุก state ต้องบอก user ว่าทำอะไรต่อได้ |
| **Thai-first** | ข้อความหลักเป็นภาษาไทย; คำ tech (API, Workflow) ใช้ English ในวงเล็บได้ |
| **No dead ends** | มีอย่างน้อย 1 CTA: retry, กลับหน้าหลัก, หรือเปลี่ยน filter |
| **Reference on error** | API error แสดง requestId สำหรับ support |
| **Permission ≠ empty** | ไม่มีสิทธิ์ ไม่ใช่ "ไม่มีข้อมูล" |

---

## 2. State Matrix

| State | Component | Icon | Primary CTA | Secondary CTA |
|-------|-----------|------|-------------|---------------|
| Empty (no data) | `WorkHQEmptyState` | contextual | action-specific | กลับหน้าหลัก |
| Empty (filtered) | `WorkHQEmptyState` | 🔍 | ล้าง filter | — |
| Loading (page) | `LoadingState` | spinner | — | — |
| Loading (inline) | button disabled / skeleton | — | — | — |
| Error (API) | `WorkHQPracticalErrorState` | 😵 | ลองอีกครั้ง | กลับหน้าหลัก |
| Permission denied | `WorkHQPermissionDenied` | 🔒 | กลับหน้าหลัก | — |
| No company | `WorkHQEmptyState` | 🏢 | (เลือก company จาก header) | — |

---

## 3. Component API Quick Reference

### WorkHQEmptyState

```tsx
<WorkHQEmptyState
  icon="✨"
  title="ไม่มีข้อมูล"
  description="คำอธิบายสั้นๆ ว่าทำไมว่าง"
  action={<WorkHQButton to="/path" variant="primary">CTA</WorkHQButton>}
/>
```

### WorkHQPracticalErrorState

```tsx
<WorkHQPracticalErrorState error={error} onRetry={load} />
```

### WorkHQPermissionDenied

```tsx
<WorkHQPermissionDenied
  title="ไม่มีสิทธิ์ดูเงินเดือน"
  description="เฉพาะ Owner และ HR เท่านั้น"
/>
```

---

## 4. Screen-Specific Copy (Thai)

### 4.1 Global / Shell

| Scenario | Title | Description | Action |
|----------|-------|-------------|--------|
| No company | เลือกบริษัทก่อน | เลือกบริษัทจากด้านบนเพื่อใช้งาน | — |
| Generic load fail | โหลดข้อมูลไม่ได้ | {API message} | ลองอีกครั้ง |
| Generic permission | ไม่มีสิทธิ์เข้าถึง | ติดต่อ Owner หรือ HR | กลับหน้าหลัก |
| 404 | (redirect) | Navigate to `/dashboard` | — |

---

### 4.2 Dashboard — `/dashboard`

| Scenario | Title | Description |
|----------|-------|-------------|
| No company | (WorkHQAlert warning) | กรุณาเลือกบริษัทเพื่อดูข้อมูล |
| No tasks | ✨ ไม่มีงานด่วนตอนนี้ | ดีมาก! |
| No actions (permissions) | — | ยังไม่มีเมนูที่คุณเข้าถึงได้ — ติดต่อผู้ดูแลระบบ |
| Loading | กำลังโหลด... | `th.common.loading` |

---

### 4.3 My Work — `/my-work`

| Scenario | Title | Description | Action |
|----------|-------|-------------|--------|
| Empty — today | ไม่มีงานในหมวดนี้ | ยอดเยี่ยม! ลองดูแท็บอื่น | ไปภาพรวม |
| Empty — overdue | ไม่มีงานเกินกำหนด | — | ไปภาพรวม |
| Error | โหลดข้อมูลไม่ได้ | + requestId | ลองอีกครั้ง |
| No company | เลือกบริษัทก่อน | เลือกบริษัทจากด้านบน | — |

---

### 4.4 Requests — `/requests`

| Scenario | Title | Description | Action |
|----------|-------|-------------|--------|
| No permission | ไม่มีสิทธิ์ดูคำขอ | — | — |
| Empty list | ยังไม่มีคำขอ | สร้างคำขอแรกของคุณ | + สร้างคำขอ |
| Empty — mine | ไม่มีคำขอของคุณ | ยื่นคำขอผ่าน Telegram หรือ web | สร้างคำขอ |
| Empty — filter | ไม่พบคำขอตาม filter | ลองเปลี่ยนสถานะหรือประเภท | ล้าง filter |
| Error | โหลดข้อมูลไม่ได้ | — | ลองอีกครั้ง |

---

### 4.5 Approvals — `/approvals`

| Scenario | Title | Description | Action |
|----------|-------|-------------|--------|
| No permission | ไม่มีสิทธิ์อนุมัติ | ติดต่อ Leader หรือ Owner | กลับหน้าหลัก |
| Empty pending | ไม่มีรายการรออนุมัติ | ✨ Inbox ว่าง — ดีมาก! | ดูประวัติ |
| Empty history | ไม่มีประวัติ | ลองเปลี่ยน filter สถานะ | — |
| Error acting | ดำเนินการไม่สำเร็จ | {message} | ลองอีกครั้ง |

---

### 4.6 Employees — `/hr/employees`

| Scenario | Title | Description | Action |
|----------|-------|-------------|--------|
| Empty list | ยังไม่มีพนักงาน | เพิ่มพนักงานคนแรก | + เพิ่มพนักงาน |
| Empty search | ไม่พบพนักงาน | ลองค้นหาด้วยชื่อหรือรหัสอื่น | ล้างการค้นหา |
| No company | เลือกบริษัท | {th.employees.selectCompanyDesc} | — |
| Error | โหลดรายชื่อไม่ได้ | — | ลองอีกครั้ง |

---

### 4.7 Invitation — `/hr/invitation`

| Scenario | Title | Description | Action |
|----------|-------|-------------|--------|
| No permission | ไม่มีสิทธิ์สร้าง invite | เฉพาะ Owner/Secretary | กลับหน้าหลัก |
| All linked | พนักงานเชื่อม Telegram ครบแล้ว | ✨ | ดู Self-onboarding |
| Empty history | ยังไม่เคยสร้าง invite | เลือกพนักงานแล้วกดสร้างลิงก์ | — |
| Error generate | สร้างลิงก์ไม่สำเร็จ | ลองใหม่อีกครั้ง | retry |

---

### 4.8 Attendance — `/attendance/*`

| Scenario | Title | Description |
|----------|-------|-------------|
| Empty daily | ไม่มีข้อมูลเข้างานวันนี้ | อาจเป็นวันหยุดหรือยังไม่มีการบันทึก |
| Empty absences | ไม่มีรายการขาดงาน | ทีมเข้างานครบ ✨ |
| Empty OT | ไม่มีคำขอ OT รออนุมัติ | — |
| Error alerts | โหลดแจ้งเตือนไม่ได้ | ลองอีกครั้ง |

---

### 4.9 Leave — `/leave/*`

| Scenario | Title | Description | Action |
|----------|-------|-------------|--------|
| Empty requests | ไม่มีคำขอลา | ยื่นผ่าน Telegram 🏖️ | สร้างคำขอ |
| Empty calendar | ไม่มีใครลา | ทีมทำงานเต็มที่ | — |
| Empty reschedule | ไม่มีคำขอเลื่อนวันลา | — | — |
| Empty shift swap | ไม่มีคำขอสลับกะ | — | — |

---

### 4.10 Payroll — `/payroll/*`

| Scenario | Title | Description |
|----------|-------|-------------|
| Empty cycles | ยังไม่มีรอบเงินเดือน | ตั้งค่ารอบที่ Settings → Payroll Rules |
| Permission | ไม่มีสิทธิ์ดูเงินเดือน | ติดต่อ Owner/HR |
| Empty cycle detail | ไม่มีพนักงานในรอบ | ตรวจสอบ active employees |

---

### 4.11 Settings — `/settings`

| Scenario | Title | Description |
|----------|-------|-------------|
| No permission | ไม่มีสิทธิ์ตั้งค่า | ติดต่อ Owner หรือ HR |
| Empty advanced | (hide section) | ไม่แสดง advanced cards ถ้าไม่มีสิทธิ์ |

---

### 4.12 Telegram Bot (conceptual)

| Scenario | Message (TH) |
|----------|--------------|
| Not linked | กรุณาใช้ลิงก์เชิญจาก HR เพื่อเชื่อมบัญชี |
| Invite expired | ลิงก์หมดอายุแล้ว ติดต่อ HR ขอลิงก์ใหม่ |
| Onboarding pending | ข้อมูลของคุณรอ HR ตรวจสอบ |
| Form cancelled | ยกเลิกคำร้องแล้ว — กดเมนูเพื่อเริ่มใหม่ |
| Unknown command | ไม่เข้าใจคำสั่ง — กด /menu เพื่อดูเมนูหลัก |

---

## 5. Loading Patterns

### Page-level

```tsx
if (loading) return <LoadingState label={th.common.loading} />;
```

**Label:** `กำลังโหลด...`

### Inline refresh

- ปุ่ม "รีเฟรช" → `disabled` + opacity ขณะ loading
- ไม่ block ทั้งหน้า

### Dashboard

- แสดง welcome + company warning ทันที
- Stat cards แสดงหลัง load — ใช้ `LoadingState` กลางหน้า

### Future (Phase 2): Skeleton

| Area | Skeleton |
|------|----------|
| Stat row | 4 placeholder cards |
| Task list | 3 shimmer rows |
| Table | header + 5 rows |

---

## 6. Error Handling Rules

### ApiError

```tsx
// จาก WorkHQPracticalErrorState
const requestId = error instanceof ApiError ? error.requestId : undefined;
const message = error instanceof ApiError ? error.message : 'เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ';
```

### HTTP status mapping (user-facing)

| Status | Title | Description |
|--------|-------|-------------|
| 403 | ไม่มีสิทธิ์เข้าถึง | ใช้ WorkHQPermissionDenied |
| 404 | ไม่พบข้อมูล | กลับรายการ หรือ กลับหน้าหลัก |
| 409 | ไม่สามารถดำเนินการ | {business message} |
| 500+ | โหลดข้อมูลไม่ได้ | ลองอีกครั้ง + รหัสอ้างอิง |

### Retry policy

- กด "ลองอีกครั้ง" → เรียก `load()` เดิม
- ไม่ auto-retry เกิน 1 ครั้ง (user-initiated only)

---

## 7. Permission vs Empty Decision Tree

```
User opens page
  ├── Has permission?
  │     NO → WorkHQPermissionDenied
  │     YES → Fetch data
  │           ├── API error → WorkHQPracticalErrorState
  │           ├── Success + 0 rows
  │           │     ├── Filters active? → Empty "ไม่พบตาม filter"
  │           │     └── No filters → Empty "ยังไม่มีข้อมูล" + create CTA
  │           └── Success + rows → Render list
  └── No companyId?
        → WorkHQEmptyState 🏢
```

---

## 8. Implementation Checklist

| Page | Empty | Error | Permission | Loading |
|------|-------|-------|------------|---------|
| Dashboard | ✅ partial | ⚠️ partial | N/A | ✅ |
| My Work | ✅ WorkHQ | ✅ WorkHQ | N/A | ✅ |
| Requests Hub | ✅ WorkHQ | ✅ WorkHQ | ✅ WorkHQ | ✅ |
| Approvals | ✅ WorkHQ | ⚠️ legacy ErrorState | ⚠️ implicit | ✅ |
| Employees | ✅ legacy | ⚠️ legacy | N/A | ✅ |
| Invitation | ✅ WorkHQ | ✅ WorkHQ | ⚠️ | ✅ |
| Settings Hub | ✅ WorkHQ | — | ✅ WorkHQ | — |
| Hubs (attendance/leave/…) | N/A static | — | N/A | — |

**Phase 2:** migrate Employees + Approvals ไป WorkHQ error/empty components

---

## 9. Copy Tone Guide

| Do | Don't |
|----|-------|
| ใช้ "คุณ" / "ทีม" | ภาษาราชการเกินไป |
| ชมเมื่อ inbox ว่าง ✨ | "Error: no data" |
| บอก next step ชัด | แค่ "ไม่มีข้อมูล" |
| ใส่ requestId ใน error | แสดง stack trace |

---

## 10. Related Files

| File | Role |
|------|------|
| `WorkHQEmptyState.tsx` | Empty pattern |
| `WorkHQPracticalErrorState.tsx` | Error pattern |
| `WorkHQPermissionDenied.tsx` | 403 pattern |
| `LoadingState.tsx` | Legacy loader |
| `web/src/i18n/th-labels.ts` | Shared Thai strings |
