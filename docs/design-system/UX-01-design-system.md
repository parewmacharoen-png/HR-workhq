# UX-01 — WorkHQ Design System

> **Status:** Design phase · Mockups approved before implementation  
> **Scope:** Global UI system + Thai-first copy · HR core screens  
> **Out of scope:** HR-15 (Asset Management) — do not implement yet

---

## Vision

WorkHQ is a **Company Operating System** — not corporate ERP.

It should feel like the warmth of **Headspace**, the clarity of **Linear**, the approachability of **Duolingo**, the content-first calm of **Notion**, and the trustworthy polish of **Mercury** — combined into one friendly Thai workspace.

| Attribute | Target |
|-----------|--------|
| Tone | สุภาพ · อ่านง่าย · เป็นมิตร · มืออาชีพ |
| Density | Spacious — large whitespace, card-based |
| Language | **Thai-only** for all user-facing UI |
| Avoid | AdminLTE · SAP tables · uppercase nav labels · dark navy sidebar |

---

## 1. Color Palette

### Warm Neutrals (Foundation)

| Token | Hex | Usage |
|-------|-----|-------|
| `--whq-bg` | `#F7F4EF` | Page background — warm cream |
| `--whq-bg-subtle` | `#FAF8F5` | Sidebar, secondary surfaces |
| `--whq-bg-elevated` | `#FFFFFF` | Cards, inputs, modals |
| `--whq-text` | `#2C2419` | Primary text — warm brown-black |
| `--whq-text-muted` | `#7A6F62` | Secondary labels, meta |
| `--whq-border` | `#EBE6DF` | Card borders, dividers |

### Brand & Accent

| Token | Hex | Usage |
|-------|-----|-------|
| `--whq-primary` | `#6B9B7A` | Primary actions, active nav, success-adjacent |
| `--whq-primary-subtle` | `#E8F0EA` | Primary backgrounds, badges |
| `--whq-secondary` | `#8B7355` | Secondary CTAs (HR actions) |
| `--whq-accent-warm` | `#E8A87C` | Highlights, illustrations, streaks |
| `--whq-accent-cool` | `#7EB8C9` | Info accents, charts |

### Semantic

| State | Background | Text |
|-------|------------|------|
| Success | `#E8F0EA` | `#2E4A36` |
| Warning | `#FDF6E8` | `#8A6520` |
| Danger | `#FDF0F0` | `#8A3D3D` |
| Info | `#EDF4FA` | `#3D5F7A` |

### Design shift from current

**Before:** Dark navy sidebar (`#0F2744`), blue primary (`#1565C0`), 10px card radius, dense topbar.  
**After:** Light warm sidebar, sage green primary, 16–20px radius, soft shadows, emoji-friendly icon slots.

---

## 2. Typography

### Font Stack

```css
font-family: 'IBM Plex Sans Thai', 'Noto Sans Thai', system-ui, sans-serif;
```

**Why IBM Plex Sans Thai:** Excellent Thai/Latin pairing, professional but human — similar spirit to Linear + Notion.

Load via Google Fonts:

```html
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Thai:wght@400;500;600;700&display=swap" rel="stylesheet">
```

### Scale

| Token | Size | Use |
|-------|------|-----|
| `--whq-text-xs` | 12px | Badges, meta |
| `--whq-text-sm` | 13px | Labels, table meta |
| `--whq-text-base` | **15px** | Body — comfortable Thai reading |
| `--whq-text-lg` | 17px | Card titles |
| `--whq-text-xl` | 20px | Section headers |
| `--whq-text-2xl` | 24px | Page titles |
| `--whq-text-3xl` | 30px | Dashboard greeting |

### Rules

- **No ALL CAPS** for nav or labels (current `.nav-group-label` uses uppercase — remove)
- Line height **1.55** for Thai body text
- Page titles: semibold, not bold-heavy
- Avoid robotic formal Thai (see §12)

---

## 3. Card Styles

### Base Card

```css
background: var(--whq-bg-elevated);
border-radius: var(--whq-radius-lg); /* 16px */
border: 1px solid var(--whq-border);
box-shadow: var(--whq-shadow-card);
padding: var(--whq-space-6);
```

### Page Shell Card (HR pages)

Warm tinted container wrapping page content:

```css
background: var(--whq-bg-subtle);
border-radius: var(--whq-radius-xl); /* 20px */
padding: var(--whq-space-8);
```

### Interactive Card (hover)

```css
transition: box-shadow var(--whq-duration-normal) var(--whq-ease),
            border-color var(--whq-duration-normal) var(--whq-ease);
&:hover {
  border-color: var(--whq-border-strong);
  box-shadow: var(--whq-shadow-card-hover);
}
```

### Card Variants

| Variant | Use |
|---------|-----|
| `surface` | Default white card |
| `warm` | `#FAF8F5` background — page wrapper |
| `accent` | Left border 3px `--whq-primary` — highlights |
| `stat` | Compact metric card on dashboard |
| `empty` | Centered illustration + copy |

---

## 4. Buttons

### Primary

```css
background: var(--whq-primary);
color: white;
border-radius: var(--whq-radius-md);
padding: 0.625rem 1.125rem;
font-weight: 600;
/* Label: เพิ่มพนักงาน, บันทึก */
```

### Secondary

```css
background: var(--whq-bg-elevated);
color: var(--whq-text);
border: 1px solid var(--whq-border);
/* Label: ยกเลิก, รีเฟรช */
```

### Ghost / Tertiary

Text-only with hover background — for low-priority actions.

### Destructive

```css
background: var(--whq-danger-bg);
color: var(--whq-danger);
border: 1px solid var(--whq-danger-border);
/* Label: ยกเลิกสิทธิ์, ลบ */
```

### Icon Button

40×40px, `--whq-radius-md`, for sidebar collapse, dismiss.

**Avoid:** Flat blue `#1565C0` buttons, gray `#607D8B` secondary — too enterprise.

---

## 5. Form Inputs

### Text Input / Select

```css
background: var(--whq-bg-elevated);
border: 1.5px solid var(--whq-border);
border-radius: var(--whq-radius-md);
padding: 0.625rem 0.875rem;
font-size: var(--whq-text-base);
&:focus {
  border-color: var(--whq-border-focus);
  outline: 3px solid var(--whq-primary-subtle);
}
```

### Label

Above field, `--whq-text-sm`, `--whq-text-muted`, **sentence case Thai** — not uppercase.

### Toolbar Pattern

Filters live in a white rounded toolbar card — not bare inline labels:

```
┌─────────────────────────────────────────────┐
│  🔍 ค้นหา          บริษัท ▾      สถานะ ▾   │
└─────────────────────────────────────────────┘
```

### Checkbox / Toggle

Use Radix Switch with Thai labels: เปิด / ปิด

---

## 6. Empty States

Structure:

```
┌─────────────────────────────────┐
│         [illustration]          │
│                                 │
│      ยังไม่มีพนักงาน             │
│   เริ่มต้นด้วยการเพิ่ม...        │
│                                 │
│      [ เพิ่มพนักงาน ]            │
└─────────────────────────────────┘
```

- Soft illustration or emoji icon (48px) in `--whq-accent-warm-subtle` circle
- Title: `--whq-text-xl`, semibold
- Description: `--whq-text-muted`, max 2 lines
- Single primary CTA when applicable

See `thai-labels.json → emptyStates` for copy.

---

## 7. Sidebar

### Layout shift

| Before | After |
|--------|-------|
| Dark navy 260px | Light warm 272px |
| Uppercase group labels | Thai sentence labels, muted |
| Text-only links | Icon + label |
| "Back Office" subtitle | "ระบบปฏิบัติการบริษัท" |

### Structure

```
┌──────────────────┐
│  WorkHQ          │
│  ระบบปฏิบัติการ   │
├──────────────────┤
│  🏠 หน้าหลัก      │  ← active: green subtle bg
│                  │
│  ทรัพยากรบุคคล     │  ← group label (muted, not caps)
│  👥 พนักงาน       │
│  🏢 โครงสร้าง...   │
│  ...             │
├──────────────────┤
│  [avatar] ชื่อ     │
│  ออกจากระบบ       │
└──────────────────┘
```

### Active state

```css
background: var(--whq-primary-subtle);
color: var(--whq-primary-text);
border-radius: var(--whq-radius-md);
font-weight: 600;
```

### Collapsed mode (future)

72px — icons only, tooltip on hover with Thai label.

---

## 8. Dashboard Widgets

Replace link-grid with **human-centered home**:

1. **Greeting header** — "สวัสดีตอนเช้า, คุณสมชาย 👋"
2. **Stat row** — 4 compact stat cards (not table-like)
3. **Quick actions** — 2×3 grid of illustrated shortcut cards
4. **Activity feed** — recent events in timeline cards
5. **Team pulse** — optional mini widget (leave today, pending approvals)

Stat card example:

```
┌─────────────────┐
│  👥             │
│  48             │
│  พนักงานที่      │
│  ทำงานอยู่       │
└─────────────────┘
```

---

## 9. Employee Cards

Grid: `minmax(280px, 1fr)`, gap 16px.

```
┌──────────────────────────────┐
│  WHQ-0042      [ทำงานอยู่]   │
│                              │
│  สมชาย ใจดี                   │
│  นักพัฒนาซอฟต์แวร์ · วิศวกรรม │
│                              │
│  @somchai · ✈️ เชื่อมแล้ว     │
└──────────────────────────────┘
```

- Avatar circle (initials or photo) — future
- Status badge top-right
- Meta row with icons, not raw English

---

## 10. Organization Tree Cards

Horizontal-friendly tree nodes with connector lines:

```
    ┌─ คุณวิชัย (ผู้บริหาร) ─┐
    │                        │
┌───┴───┐              ┌─────┴─────┐
│ สมหญิง │              │ สมชาย     │
│ ผจก.   │              │ หัvหน้าทีม │
└───┬───┘              └───────────┘
    │
  ┌─┴─┐
  │...│
  └───┘
```

Each node card:
- Name (link)
- Role badge in Thai
- `{n} คนในทีม` meta
- Expand/collapse chevron in soft pill button

---

## 11. Component Library Recommendations

### Recommended stack (implementation phase)

| Layer | Choice | Rationale |
|-------|--------|-----------|
| CSS | **Tailwind CSS v4** | Token mapping via `tailwind-theme.js` |
| Primitives | **Radix UI** | Accessible dialogs, selects, toggles |
| Components | **shadcn/ui** (customized) | Copy-paste, full theme control |
| Icons | **Lucide React** + emoji slots | Clean icons + playful emoji accents |
| Fonts | **IBM Plex Sans Thai** | Thai-first typography |
| Animation | **Framer Motion** (light) | Page transitions, card hover |

### WorkHQ component map

| Component | Priority | Notes |
|-----------|----------|-------|
| `AppShell` | P0 | New light sidebar + topbar |
| `SidebarNav` | P0 | Icon + Thai label |
| `PageHeader` | P0 | Title + subtitle + actions |
| `StatCard` | P0 | Dashboard metrics |
| `ActionCard` | P0 | Dashboard shortcuts |
| `EmployeeCard` | P0 | Grid item |
| `OrgTreeNode` | P0 | Hierarchy card |
| `EmptyState` | P0 | Illustration + Thai copy |
| `StatusBadge` | P0 | Thai status labels |
| `FilterToolbar` | P1 | Search + selects |
| `FlashMessage` | P1 | Thai success/error |
| `AccessControlPanel` | P1 | Extend existing HR-13 |
| `FormSection` | P1 | Grouped form cards |

### Do NOT adopt

- AdminLTE, Material Dashboard, Ant Design Pro defaults
- Dense data tables as primary UI — use cards + detail drawers

---

## 12. Thai Copywriting Guidelines

### Tone principles

| Do | Don't |
|----|-------|
| ใช้คำที่คนอ office ใช้จริง | แปลตรงจาก English แบบเคร่ง |
| สั้น กระชับ | ยาวเหมือนเอกสารราชการ |
| เป็นกันเองแต่สุภาพ | สแลงเกินไป / ภาษาตลกเกิน |
| ใช้ "คุณ" เมื่อทักผู้ใช้ | "ท่าน" / "ผู้ใช้งาน" |
| บอกว่าต้องทำอะไรต่อ | แค่บอกว่า error |

### Wording patterns

| Context | Pattern | Example |
|---------|---------|---------|
| Empty state | [สถานะ] + [ทำอย่างไรต่อ] | "ยังไม่มีพนักงาน — เริ่มด้วยการเพิ่มคนแรก" |
| Button | กริยา + คำนาม | "เพิ่มพนักงาน", "บันทึก", "ลองอีกครั้ง" |
| Validation | กรุณา + กริยา | "กรุณากรอกชื่อ", "กรุณาเลือกบริษัท" |
| Success | กริยา + "เรียบร้อยแล้ว" | "บันทึกเรียบร้อยแล้ว" |
| Error | อธิบาย + แนะนำ | "โหลดไม่สำเร็จ — ลองอีกครั้ง" |
| Count | ตัวเลข + คำไทย | "48 คน", "3 รายการ" |

### Status labels — always Thai

| API value | UI label |
|-----------|----------|
| `active` | ทำงานอยู่ |
| `probation` | ทดลองงาน |
| `suspended` | พักงาน |
| `terminated` | ลาออกแล้ว |
| `REVOKED` | ถูกยกเลิก |

---

## 13. Thai UI Label Dictionary

Full dictionary: [`thai-labels.json`](./thai-labels.json)

Implementation: import JSON in a `useLabels()` hook or `t('employees.title')` i18n helper. Even though UI is Thai-only, centralizing labels prevents English leakage.

---

## Validation & Error Examples

### Validation

| Field | Message |
|-------|---------|
| ชื่อ | กรุณากรอกชื่อ |
| อีเมล | รูปแบบอีเมลไม่ถูกต้อง |
| บริษัท | กรุณาเลือกบริษัท |
| รหัสพนักงาน | รหัสพนักงานนี้มีอยู่แล้ว |

### Errors

| Scenario | Message |
|----------|---------|
| Network | เชื่อมต่อไม่สำเร็จ ตรวจสอบอินเทอร์เน็ตแล้วลองใหม่ |
| 403 | คุณไม่มีสิทธิ์เข้าถึงหน้านี้ |
| 404 | ไม่พบข้อมูลที่ต้องการ |
| 500 | เซิร์ฟเวอร์มีปัญหา ลองอีกครั้งในอีกสักครู่ |

### Success

| Action | Message |
|--------|---------|
| Save | บันทึกเรียบร้อยแล้ว |
| Add employee | เพิ่มพนักงานเรียบร้อยแล้ว |
| Update access | อัปเดตสิทธิ์เรียบร้อยแล้ว |

---

## Layout System

### App Shell

```
┌──────────┬────────────────────────────────────────┐
│          │  Topbar (company select · user · logout)│
│ Sidebar  ├────────────────────────────────────────┤
│  272px   │                                        │
│          │  Page content (max 1280px, centered)   │
│          │  padding 32px                          │
│          │                                        │
└──────────┴────────────────────────────────────────┘
```

### Topbar

- White/light surface, no heavy border — subtle shadow only
- Company selector as pill dropdown
- User avatar + name + role in Thai
- "ออกจากระบบ" as ghost button

### Page anatomy

```
PageHeader (title + subtitle + actions)
  ↓
FilterToolbar (optional)
  ↓
Content (cards grid / tree / sections)
```

---

## Design Tokens

| File | Purpose |
|------|---------|
| [`tokens.css`](./tokens.css) | CSS custom properties |
| [`tailwind-theme.js`](./tailwind-theme.js) | Tailwind extension |
| [`thai-labels.json`](./thai-labels.json) | UI copy dictionary |

---

## Mockups

Interactive HTML mockups (open in browser):

**[`mockups/index.html`](./mockups/index.html)**

Screens included:
1. ภาพรวม (Dashboard)
2. Sidebar navigation
3. พนักงาน (Employees list)
4. รายละเอียดพนักงาน (Employee detail)
5. โครงสร้างองค์กร (Organization)

---

## Implementation Roadmap (after mockup approval)

| Phase | Task |
|-------|------|
| UX-01a | Add Tailwind + fonts + tokens to `web/` |
| UX-01b | Rebuild `AppShell` + sidebar (Thai nav) |
| UX-01c | Dashboard redesign |
| UX-01d | Employees + detail + organization pages |
| UX-01e | Shared components (`EmptyState`, `StatusBadge`, etc.) |
| UX-01f | Roll Thai labels across all pages |

**Not in scope:** HR-15 Asset Management UI

---

## Approval Checklist

- [ ] Color palette feels warm & cozy (not enterprise)
- [ ] All mockup text is Thai
- [ ] Sidebar is light, friendly, icon-enhanced
- [ ] Cards use 16–20px radius + soft shadows
- [ ] Empty states have human copy + CTA
- [ ] Typography readable for Thai at 15px base
- [ ] Ready to proceed to UX-01 implementation
