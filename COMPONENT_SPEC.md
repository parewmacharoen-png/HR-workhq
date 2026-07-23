# UX-001 — WorkHQ Component Specification

**WorkHQ Practical UX Reset** · Design system components  
อัปเดต 2026-06-25 · Source: `web/src/components/ui/`

---

## 1. Overview

WorkHQ UI ใช้ชุด component ที่ขึ้นต้นด้วย `WorkHQ*` บน CSS classes ใน `web/src/design-system/workhq.css`  
UX-001 เพิ่ม navigation, state และ layout components สำหรับ **task-first** experience

### Export barrel

```typescript
// web/src/components/ui/index.ts
WorkHQAppLayout, WorkHQPage, WorkHQPageHeader, WorkHQCard,
WorkHQButton, WorkHQField, WorkHQInput, WorkHQSelect, WorkHQBadge,
WorkHQEmptyState, WorkHQStatCard, WorkHQEmployeeCard, WorkHQSectionTitle,
WorkHQAlert, WorkHQAvatar, WorkHQFilterToolbar, WorkHQCheerBanner,
WorkHQTabNav, WorkHQBreadcrumb, WorkHQPracticalErrorState, WorkHQPermissionDenied
```

---

## 2. Layout Components

### 2.1 `WorkHQAppLayout`

**File:** `WorkHQAppLayout.tsx`  
**Usage:** App shell — sidebar + header + `<Outlet />`

| Part | Class | Behavior |
|------|-------|----------|
| Brand | `whq-brand` | Logo 🌱 + WorkHQ tagline |
| Nav groups | `whq-nav-group` | จาก `filterNavGroups(permissions)` |
| Nav link | `whq-nav-link` | Active via path + `matchPrefix` |
| Company selector | header | multi-company switch |
| User menu | header | displayName, role, logout |

**Props:** none (uses `useAuth`, `useLocation`)

---

### 2.2 `WorkHQPage`

**File:** `WorkHQPage.tsx`  
**Props:** `shell?: boolean`, `children`

| Mode | Behavior |
|------|----------|
| `shell={true}` | Standard padded content area with max-width |
| default | Full-bleed (Dashboard) |

---

### 2.3 `WorkHQPageHeader`

**File:** `WorkHQPageHeader.tsx`

```tsx
interface WorkHQPageHeaderProps {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;  // ปุ่มขวา — whq-btn-group
}
```

**CSS:** `whq-page-header`, `whq-page-title`, `whq-page-subtitle`

**Guidelines:**
- Title ใส่ emoji ได้สำหรับ hub pages (📋 คำขอ)
- Actions: primary ขวาสุด, secondary ถัดมา
- ไม่ใช้ header ซ้ำกับ welcome row บน Dashboard

---

## 3. Navigation Components (UX-001 New)

### 3.1 `WorkHQTabNav`

**File:** `WorkHQTabNav.tsx`  
**Purpose:** Route-based tabs สำหรับ hubs และ profile (Phase 2)

```tsx
export interface WorkHQTabItem {
  id: string;
  label: string;
  path: string;
  badge?: number;
}

interface WorkHQTabNavProps {
  tabs: WorkHQTabItem[];
  activeId?: string;  // override path matching
}
```

**CSS:** `whq-tab-nav`, `whq-tab-nav-item`, `whq-tab-badge`

**Active logic:**
1. ถ้ามี `activeId` → match by id
2. Else → `pathname === tab.path` OR `pathname.startsWith(tab.path + '/')`
3. Exception: `/requests` ไม่ match child ของ tab อื่น

**Usage examples:**

| Page | Tabs |
|------|------|
| RequestsHub | create, all, mine, templates |
| AttendanceHub | daily, absences, overtime |
| LeaveHub | requests, calendar, reschedule, shift-swaps |
| Employee Profile (Phase 2) | overview, documents, telegram, … |

**Accessibility:** `aria-label="แท็บ"`, active class `active`

---

### 3.2 `WorkHQBreadcrumb`

**File:** `WorkHQBreadcrumb.tsx`

```tsx
export interface BreadcrumbItem {
  label: string;
  path?: string;
}

interface WorkHQBreadcrumbProps {
  items: BreadcrumbItem[];
}
```

**CSS:** `whq-breadcrumb`, `whq-breadcrumb-item`, `whq-breadcrumb-sep` (›)

**Rules:**
- Item สุดท้ายไม่มี link → `aria-current="page"`
- เริ่มจาก `ภาพรวม` → `/dashboard` เสมอ (ยกเว้น Dashboard)
- ไม่เกิน 4 ระดับ — ถ้า deeper ใช้ tab แทน

---

## 4. State Components (UX-001 New)

### 4.1 `WorkHQEmptyState`

**File:** `WorkHQEmptyState.tsx`

```tsx
interface WorkHQEmptyStateProps {
  icon?: string;      // default 🌸
  title: string;
  description?: string;
  action?: ReactNode;
}
```

**CSS:** `whq-empty`, `whq-empty-icon`

**When to use:**
- List ว่าง (ไม่ใช่ error)
- No company selected
- Filter ไม่มีผลลัพธ์
- Permission denied แบบ soft (บางหน้า)

**When NOT to use:**
- API failure → ใช้ `WorkHQPracticalErrorState`
- Hard permission block → ใช้ `WorkHQPermissionDenied`

---

### 4.2 `WorkHQPracticalErrorState`

**File:** `WorkHQPracticalErrorState.tsx`

```tsx
interface WorkHQPracticalErrorStateProps {
  error: unknown;
  onRetry?: () => void;
  referenceCode?: string;
}
```

**Behavior:**
- Extract message จาก `ApiError` หรือ `Error`
- แสดง `requestId` เป็นรหัสอ้างอิง
- Actions: ลองอีกครั้ง · กลับหน้าหลัก · แจ้งผู้ดูแลระบบ

**CSS:** `whq-state-panel`, `whq-error-panel`, `whq-ref-code`

---

### 4.3 `WorkHQPermissionDenied`

**File:** `WorkHQPermissionDenied.tsx`

```tsx
interface WorkHQPermissionDeniedProps {
  title?: string;       // default: ไม่มีสิทธิ์เข้าถึง
  description?: string; // default: ติดต่อ Owner หรือ HR
}
```

**Implementation:** wraps `WorkHQEmptyState` icon 🔒 + primary CTA กลับหน้าหลัก

---

## 5. Data Display Components

### 5.1 `WorkHQStatCard`

**File:** `WorkHQStatCard.tsx`

```tsx
interface WorkHQStatCardProps {
  icon: string;
  value: string | number;
  label: string;
  trend?: string;
  tone?: 'green' | 'cool' | 'warm' | 'lavender';
}
```

**CSS:** `whq-stat-card`, `whq-stat-icon-{tone}`, `whq-stat-value`, `whq-stat-label`, `whq-stat-trend`

**Usage:**
- Dashboard stat row
- Requests hub dashboard
- Onboarding telegram stats
- Employee home summary grid

---

### 5.2 Task List Pattern

**Not a separate component** — CSS classes + markup convention

**Component:** `PracticalDashboardTasks.tsx`, `MyWorkPage.tsx`

```html
<ul class="whq-task-list">
  <li class="whq-task-item">
    <span class="whq-task-priority urgent|normal|low" />
    <Link>...</Link>
    <WorkHQButton>ทำเลย</WorkHQButton>  <!-- optional -->
  </li>
</ul>
```

| Class | Purpose |
|-------|---------|
| `whq-task-list` | Vertical list, gap |
| `whq-task-item` | Flex row, align center |
| `whq-task-priority` | Colored dot — urgent=red, normal=gray |

**Dashboard tasks interface:**

```tsx
export interface DashboardTask {
  id: string;
  title: string;
  count?: number;
  path: string;
  urgent?: boolean;
}
```

---

### 5.3 `WorkHQCard`

**Props:** `title`, `className`, `children`  
**Variants:** `whq-detail-card`, `whq-detail-card--wide`

---

### 5.4 `WorkHQEmployeeCard`

**Usage:** Employees list grid  
**Fields:** avatar, name, meta, status, telegram indicator

---

### 5.5 `WorkHQFilterToolbar`

**Usage:** Employees, Approvals history  
**Contains:** search, selects, refresh

---

## 6. Form & Action Components

| Component | Usage |
|-----------|-------|
| `WorkHQButton` | variants: primary, secondary, ghost; supports `to` for Link |
| `WorkHQField` | label + hint wrapper |
| `WorkHQInput` | text, date |
| `WorkHQSelect` | dropdown |
| `WorkHQBadge` | status pills |
| `WorkHQAlert` | inline warnings (company not selected) |
| `WorkHQCheerBanner` | motivational banner on dashboard |

---

## 7. Settings Grid Pattern

**CSS:** `whq-settings-grid`, `whq-settings-card`, `whq-settings-card.advanced`

**Used in:** SettingsHub, AttendanceHub, LeaveHub, ReportsHub, CommissionHub

```tsx
<Link to={path} className="whq-settings-card">
  <strong>{label}</strong>
  <span>{description}</span>
</Link>
```

---

## 8. Component Selection Guide

| Scenario | Component |
|----------|-----------|
| Hub page sub-navigation | `WorkHQTabNav` |
| Wayfinding | `WorkHQBreadcrumb` |
| Page title + CTA | `WorkHQPageHeader` |
| KPI numbers | `WorkHQStatCard` |
| Action queue | `whq-task-list` |
| No data | `WorkHQEmptyState` |
| API error | `WorkHQPracticalErrorState` |
| 403 / no permission | `WorkHQPermissionDenied` |
| Module shortcuts | settings-card grid |

---

## 9. Migration Notes (Legacy → WorkHQ)

| Legacy | Replace with |
|--------|--------------|
| `EmptyState` | `WorkHQEmptyState` |
| `ErrorState` | `WorkHQPracticalErrorState` |
| Inline tab buttons (My Work) | `WorkHQTabNav` (Phase 2) |
| Module sidebar groups | `nav-config.ts` 12 items |

---

## 10. CSS Tokens (reference)

| Token class | Purpose |
|-------------|---------|
| `whq-app-shell` | Layout grid |
| `whq-sidebar` | Fixed nav |
| `whq-main-content` | Scroll area |
| `whq-action-grid` | Dashboard quick links |
| `whq-quick-actions` | Button row footer |
| `whq-muted` | Secondary text |
| `whq-section-title` | H2 section headers |

Full tokens: `web/src/design-system/workhq.css`

---

## 11. Future Components (Phase 2–4)

| Component | Phase | Purpose |
|-----------|-------|---------|
| `WorkHQProfileTabs` | 2 | Employee detail tab wrapper |
| `WorkHQRequestTimeline` | 3 | Request detail enhancement |
| `WorkHQRoleDashboard` | 4 | Split dashboard by persona |
| `WorkHQLoadingSkeleton` | 2 | Replace generic LoadingState |
