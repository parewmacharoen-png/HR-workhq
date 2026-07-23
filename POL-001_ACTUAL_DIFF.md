# POL-001 — Actual Diff (Full Modified Sections)

Reconstructed from transcript edit operations. No summarization.


---

# WORKHQ_MASTER_POLICY_V1.md


## Pass A — POL-000 enhancement (ops 2–5)

### Change 1 (`replace`)

**REMOVED / REPLACED:**

```markdown
**Scope:** WorkHQ HR product — all companies on the platform
```

**ADDED / REPLACED WITH:**

```markdown
**Scope:** WorkHQ HR product — all companies on the platform  
**Predecessor:** POL-000 Discovery (complete)

---

## POL-000 discovery baseline

POL-000 catalogued all policy sources and mapped implementation without inferring rules from code.

| Discovery area | Canonical source | Articles / keys |
|----------------|------------------|-----------------|
| Employee handbook | `company-policy-articles.ts` | 5 slugs (`handbook-*`) |
| Marketing commission | KB + RuleConfig | 6 slugs (`marketing-commission-*`), COM-MKT-001–012 |
| Admin commission | KB + RuleConfig | 5 slugs (`admin-commission-*`), COM-ADM-001–011 |
| Referral reward | KB + `referral.rules` | 4 slugs (`referral-*`) |
| Leave reschedule | KB + `leave.rules` | 3 slugs (`leave-reschedule-*`) |
| Attendance | `ATTENDANCE_SETTINGS.md` + `attendance.rules` | 16 fields (6 reserved) |
| Leave | `LEAVE_SETTINGS.md` + `leave.rules` | 14 wired, 18 reserved |
| Payroll / meal | `payroll.rules` | `mealAllowancePerDay` |
| Deposit | `DEPOSIT_SETTINGS.md` + `deposit.rules` | 5 wired, 3 reserved |
| Approval | `approval-defaults.ts` | 12 default workflow matrices |
| Access / salary | `BUSINESS_ROLE_PERMISSIONS.md` + salary matrix | 7 business roles |
| Telegram access | `TELEGRAM_IDENTITY_SECURITY.md` | Identity FSM |
| HR product boundary | `HR_PRODUCT_BOUNDARY.md` | HR mode vs MarketingOS |

**Discovery decisions (this consolidation):**

1. **Policy is source of truth.** Code gaps are tracked in the implementation matrix; they do not redefine policy.
2. **KB articles are authoritative for business intent** where no settings key exists.
3. **Settings Engine values are authoritative for numeric enforcement** where wired (`LEAVE_SETTINGS.md` wired/reserved table).
4. **RuleConfig is authoritative for commission calculation** (marketing + admin).
5. **Approval defaults are authoritative** for workflow routing unless company matrix overrides.
6. **Six conflicts remain unresolved** — see Appendix A (`CONFLICT_REQUIRES_DECISION`). No discovery decision has settled these yet.
7. **Deprecated KB slugs** (`commission-payout-policy`, `leave-personal-policy`, `ot-policy`) are superseded; not included in this policy.
8. **HR mode:** Marketing commission *calculation* is out of product scope; KB rules remain valid for manual commission entry and future MarketingOS.
```

### Change 2 (`replace`)

**REMOVED / REPLACED:**

```markdown
| EL-002 | Eligibility: employee must have **completed probation** | — | `emergency-leave-entitlement.service.ts` |
```

**ADDED / REPLACED WITH:**

```markdown
| EL-002 | Eligibility: employee must have **completed probation** | — | `leave.rules` + entitlement policy |
```

### Change 3 (`replace`)

**REMOVED / REPLACED:**

```markdown
### Business rules
```

**ADDED / REPLACED WITH:**

```markdown
### Business rules — hiring pipeline
```

### Change 4 (`replace`)

**REMOVED / REPLACED:**

```markdown
### Examples

- `POLICY_NOT_DOCUMENTED`

### Exceptions

- Referral program (Section 14 referral / separate referral policy) is distinct from recruitment pipeline policy.

### Owner override rules

- `POLICY_NOT_DOCUMENTED`
```

**ADDED / REPLACED WITH:**

```markdown
### Business rules — referral reward program

| Rule ID | Rule | Default | Source |
|---------|------|---------|--------|
| RF-001 | Employee receives Referral Reward when referred candidate **qualifies** | — | `referral-program-overview` KB |
| RF-002 | One referral reward per referred employee (no duplicate rewards) | — | KB + DB unique index |
| RF-003 | Self-referral prohibited | — | KB |
| RF-004 | Qualify via **probation_pass**: `employmentStatus = active` and `probationEndDate` reached | — | `referral-eligibility-conditions` KB |
| RF-005 | Qualify via **three_months**: employed ≥ `requiredEmploymentDays` (even if still on probation) | 90 days | KB + `referral.rules` |
| RF-006 | Terminated referred employees cannot qualify | — | KB |
| RF-007 | Reward amount fixed at registration | ฿2,000 | `referral-reward-amount` KB + `referral.rules` |
| RF-008 | Lifecycle: pending → qualified → paid \| rejected | — | KB |
| RF-009 | Duplicate check (phone / national ID / bank) before qualify | enabled | `referral.rules` |
| RF-010 | Qualified referrals paid in **next payroll cycle** via payroll item | — | `referral-duplicate-and-payment` KB |
| RF-011 | Mark paid only after payroll item created | — | KB |
| RF-012 | `payoutMode` | `one_time` only | `referral.rules` (reserved validation) |

### Examples

- Referred employee passes probation Mar 1 → qualifies `probation_pass` → ฿2,000 paid next cycle.
- Referred employee still on probation but hired 91+ days ago → qualifies `three_months` at 90-day threshold.

### Exceptions

| Rule ID | Exception | Source |
|---------|-----------|--------|
| RF-E1 | `CONFLICT_REQUIRES_DECISION`: KB says "3 months"; settings default is **90 calendar days** (~2.96 months). Documented migration from ~91.32 calendar days. | `REFERRAL_SETTINGS.md`, C-004 |
| RF-E2 | `allowMultipleReferrals` setting reserved; DB still enforces one reward per referred employee | `REFERRAL_SETTINGS.md` |

### Owner override rules

- HR/Owner may override duplicate block: `overrideDuplicateBlock=true`.
- Reward amount and employment days configurable via `referral.rules` per company.
```

### Change 5 (`replace`)

**REMOVED / REPLACED:**

```markdown
| C-004 | Referral qualification | KB: probation_pass OR three_months | Settings: 90 calendar days | Confirm equivalence and dual-path support |
```

**ADDED / REPLACED WITH:**

```markdown
| C-004 | Referral tenure threshold | KB: "3 months" (`three_months` condition) | Settings: 90 calendar days (not 91.32 legacy) | Confirm 90 days is the authoritative "3 months" definition |
```



## Pass B — POL-001A Discovery Delta (op 6 full rewrite)

### Change 1 (`replace`)

**REMOVED / REPLACED:**

```markdown
**Version:** 1.0  
```

**ADDED / REPLACED WITH:**

```markdown
**Version:** 1.1  
```

### Change 2 (`replace`)

**REMOVED / REPLACED:**

```markdown
**Predecessor:** POL-000 Discovery (complete)

---

## POL-000 discovery baseline

POL-000 catalogued all policy sources and mapped implementation without inferring rules from code.

| Discovery area | Canonical source | Articles / keys |
|----------------|------------------|-----------------|
| Employee handbook | `company-policy-articles.ts` | 5 slugs (`handbook-*`) |
| Marketing commission | KB + RuleConfig | 6 slugs (`marketing-commission-*`), COM-MKT-001–012 |
| Admin commission | KB + RuleConfig | 5 slugs (`admin-commission-*`), COM-ADM-001–011 |
| Referral reward | KB + `referral.rules` | 4 slugs (`referral-*`) |
| Leave reschedule | KB + `leave.rules` | 3 slugs (`leave-reschedule-*`) |
| Attendance | `ATTENDANCE_SETTINGS.md` + `attendance.rules` | 16 fields (6 reserved) |
| Leave | `LEAVE_SETTINGS.md` + `leave.rules` | 14 wired, 18 reserved |
| Payroll / meal | `payroll.rules` | `mealAllowancePerDay` |
| Deposit | `DEPOSIT_SETTINGS.md` + `deposit.rules` | 5 wired, 3 reserved |
| Approval | `approval-defaults.ts` | 12 default workflow matrices |
| Access / salary | `BUSINESS_ROLE_PERMISSIONS.md` + salary matrix | 7 business roles |
| Telegram access | `TELEGRAM_IDENTITY_SECURITY.md` | Identity FSM |
| HR product boundary | `HR_PRODUCT_BOUNDARY.md` | HR mode vs MarketingOS |

**Discovery decisions (this consolidation):**

1. **Policy is source of truth.** Code gaps are tracked in the implementation matrix; they do not redefine policy.
2. **KB articles are authoritative for business intent** where no settings key exists.
3. **Settings Engine values are authoritative for numeric enforcement** where wired (`LEAVE_SETTINGS.md` wired/reserved table).
4. **RuleConfig is authoritative for commission calculation** (marketing + admin).
5. **Approval defaults are authoritative** for workflow routing unless company matrix overrides.
6. **Six conflicts remain unresolved** — see Appendix A (`CONFLICT_REQUIRES_DECISION`). No discovery decision has settled these yet.
7. **Deprecated KB slugs** (`commission-payout-policy`, `leave-personal-policy`, `ot-policy`) are superseded; not included in this policy.
8. **HR mode:** Marketing commission *calculation* is out of product scope; KB rules remain valid for manual commission entry and future MarketingOS.
```

**ADDED / REPLACED WITH:**

```markdown
**Predecessor:** POL-000 Discovery (complete)  
**Amendment:** POL-001A Discovery Delta Consolidation (confirmed business decisions merged)

---

## POL-000 / POL-001A discovery baseline

POL-000 catalogued policy sources. POL-001A merged **confirmed owner business decisions** (ORG-001, EMP-001, PAY-001–005, ATT-001–002, EMP-002, REF-001, DISC-001–002, WF-001–005, ASSET-001, HOL-001).

| Discovery area | Canonical source |
|----------------|------------------|
| Employee handbook | `company-policy-articles.ts` (5 `handbook-*` slugs) |
| Commission | KB + RuleConfig (COM-MKT / COM-ADM) |
| Referral | **REF-001** (confirmed) + `referral.rules` |
| Leave / reschedule | KB + `leave.rules` + **HOL-001**, **PAY-002** |
| Attendance / absence | `attendance.rules` + **ABS-001**, **ABS-002**, **PAY-003** |
| Payroll / meal / deposit / advance | **PAY-001–005** + settings schemas |
| Organization / employee model | **ORG-001**, **EMP-001**, **EMP-002** |
| Disciplinary / termination | **DISC-001–002** + handbook |
| Workflow / approvals | **WF-001–005** + `approval-defaults.ts` |
| Assets | **ASSET-001** |
| Access / Telegram | `BUSINESS_ROLE_PERMISSIONS.md`, `TELEGRAM_IDENTITY_SECURITY.md` |

**Consolidation principles:**

1. **Confirmed POL-001A decisions override** prior handbook/KB text where they conflict.
2. **Policy is source of truth.** Implementation gaps tracked in `WORKHQ_POLICY_IMPLEMENTATION_MATRIX.md`.
3. **Settings Engine** holds configurable numeric defaults aligned to confirmed decisions.
4. **Deprecated KB slugs** excluded: `commission-payout-policy`, `leave-personal-policy`, `ot-policy`.
5. **HR mode:** Marketing commission calculation out of scope; payment via manual payroll entry.
```

### Change 3 (`replace`)

**REMOVED / REPLACED:**

```markdown
| Primary sources | Employee handbook KB (`company-policy-articles.ts`), commission/referral/leave KB articles, `ATTENDANCE_SETTINGS.md`, `LEAVE_SETTINGS.md`, `DEPOSIT_SETTINGS.md`, `REFERRAL_SETTINGS.md`, `BUSINESS_ROLE_PERMISSIONS.md`, `TELEGRAM_IDENTITY_SECURITY.md`, settings schemas, `approval-defaults.ts`, `rule-config.defaults.ts` |
| Advisory only | Knowledge base articles are published guidance; **runtime enforcement** follows Settings Engine + RuleConfig values where wired |
| Conflict marker | `CONFLICT_REQUIRES_DECISION` — unresolved disagreement between sources |
| Missing marker | `POLICY_NOT_DOCUMENTED` — no confirmed business rule in source materials |

### Source hierarchy (when sources agree)

1. Published KB handbook / policy articles (`company-policy-articles.ts`)
2. Settings schema defaults + wired settings documentation
3. RuleConfig defaults (commission)
4. Approval matrix defaults (`approval-defaults.ts`)
5. Access / security policy docs (`BUSINESS_ROLE_PERMISSIONS.md`, `TELEGRAM_IDENTITY_SECURITY.md`)

**Rule:** Do not infer policy from implementation code. Where code and policy conflict, policy wins and the gap is tracked in `WORKHQ_POLICY_IMPLEMENTATION_MATRIX.md`.
```

**ADDED / REPLACED WITH:**

```markdown
| Conflict marker | `CONFLICT_REQUIRES_DECISION` — only items without confirmed decision |
| Missing marker | `POLICY_NOT_DOCUMENTED` — no confirmed rule |
| Confirmed decision marker | Rule IDs matching POL-001A register (ORG-001, EMP-001, PAY-00x, etc.) |

**Rule:** Where code conflicts with this document, **policy wins**.
```

### Change 4 (`replace`)

**REMOVED / REPLACED:**

```markdown
### Business rules

| Rule ID | Rule | Source |
|---------|------|--------|
| ORG-001 | WorkHQ supports **multiple companies**; each employee belongs to a company | Organization module, HR product boundary |
| ORG-002 | Each company may have **teams** with optional parent team hierarchy and optional `bigLeaderEmployeeId` | `team.entity.ts` |
| ORG-003 | Employee assignment carries a **role level**: `employee`, `sub_leader`, or `big_leader` — distinct from business role | `EmployeeAssignment.roleLevel`, `BUSINESS_ROLE_PERMISSIONS.md` |
| ORG-004 | Marketing teams (when MarketingOS enabled) are a separate structure from HR org teams | `HR_PRODUCT_BOUNDARY.md`, `PRODUCT_SPLIT_PLAN.md` |
| ORG-005 | Employee handbook is the official reference for culture and conduct | `handbook-welcome-culture` |

### Examples

- Company **SB** has teams; an employee assigned to SB with `roleLevel = sub_leader` leads their HR team.
- Owner user may hold scope `all` across companies KW, MB, VB.

### Exceptions

- `POLICY_NOT_DOCUMENTED`: Formal org chart naming (departments, functions), reporting lines beyond team/big leader, and multi-company ownership structure.

### Owner override rules

- Owner may create/update companies and teams via organization APIs.
- Owner assigns business roles and scopes (see Section 3).

---

## 2. Business Roles

### Business rules
```

**ADDED / REPLACED WITH:**

```markdown
### Business rules — ORG-001 (confirmed)

| Rule ID | Rule |
|---------|------|
| ORG-001 | Company structure under **Owner** comprises two departments: **Admin Department** and **Marketing Department** |
| ORG-002 | **Admin Department** hierarchy: **Secretary** (highest authority of Admin Dept) → Admin, HR, Finance functions |
| ORG-003 | **Marketing Department** hierarchy: **Big Leader** (highest authority of Marketing Dept) → Sub Leader → Employee |
| ORG-004 | Secretary is the highest authority of the Admin Department |
| ORG-005 | Big Leader is the highest authority of the Marketing Department |
| ORG-006 | WorkHQ supports **multiple companies**; a single employee may have assignments in **multiple companies** |
| ORG-007 | Each company may have teams with optional parent hierarchy (`team.entity.ts`) |
| ORG-008 | Employee handbook remains official reference for culture and conduct (`handbook-welcome-culture`) |

### Org chart (authoritative)

```
OWNER
├── Admin Department
│   SECRETARY (highest authority — Admin)
│   ├── Admin
│   ├── HR
│   └── Finance
└── Marketing Department
    BIG LEADER (highest authority — Marketing)
    ├── Sub Leader
    └── Employee
```

### Examples

- Secretary approves Admin Department salary adjustments (WF-001) before Owner.
- Big Leader approves Marketing Department commission adjustments (WF-002) before Owner.
- Employee assigned to companies KW and MB has separate assignment records per company.

### Exceptions

- Marketing teams (MarketingOS) remain a separate technical structure when MarketingOS enabled; policy hierarchy above governs authority.

### Owner override rules

- Owner may create/update companies and teams.
- Owner assigns business roles, departments, positions, and scopes (see Section 2).

---

## 2. Business Roles & Employee Model

### Business rules — EMP-001 (confirmed)

| Rule ID | Rule |
|---------|------|
| EMP-001 | **Employee category:** `OFFICE` or `WFH` |
| EMP-002 | **Department:** Marketing, Admin, HR, Finance |
| EMP-003 | **Position:** Employee, Sub Leader, Big Leader, Secretary, Owner |
| EMP-004 | A single employee may have assignments in **multiple companies** |
| EMP-005 | Employee category `OFFICE` vs `WFH` determines meal allowance eligibility (PAY-001) |

### Business rules — system access roles (HR-12)
```

### Change 5 (`replace`)

**REMOVED / REPLACED:**

```markdown
| BR-001 | `owner` | — | all | Full HR access, all companies |
| BR-002 | `secretary` | HR Manager, Payroll Operator | all | Broad read all companies; limited safe writes |
| BR-003 | `big_leader` | — | company | Company leadership |
| BR-004 | `sub_leader` | — | team | Team leadership |
```

**ADDED / REPLACED WITH:**

```markdown
| BR-001 | `owner` | Owner (position) | all | Full HR access, all companies |
| BR-002 | `secretary` | Secretary (position), HR Manager, Payroll Operator | all | Admin Department highest authority |
| BR-003 | `big_leader` | Big Leader (position) | company | Marketing Department highest authority |
| BR-004 | `sub_leader` | Sub Leader (position) | team | Marketing team leadership |
```

### Change 6 (`replace`)

**REMOVED / REPLACED:**

```markdown
| BR-006 | `admin` | — | company | Company admin read/write |
| BR-007 | `employee` | — | self | Self-service only |

| Rule ID | Rule | Source |
|---------|------|--------|
| BR-008 | Secretary, HR Manager, and Payroll Operator are the **same** business role (`secretary`) | `BUSINESS_ROLE_PERMISSIONS.md` |
| BR-009 | Business roles are **not** the same as `EmployeeAssignment.roleLevel` unless explicitly mapped by HR admin | `BUSINESS_ROLE_PERMISSIONS.md` |
| BR-010 | Effective access resolves: **role bundle → scope grants → user overrides** (audited) | `BUSINESS_ROLE_PERMISSIONS.md` |

### Examples

- Admin with company scopes KW + MB: employee/attendance/referral read within those companies; own payslip only unless owner adds salary override.
- Big leader scoped to SB: may view salaries for all SB employees, not MB.

### Exceptions

- `POLICY_NOT_DOCUMENTED`: "Company Manager" as a first-class role (UAT notes no `company_manager` code; use custom role + company scope).

### Owner override rules

- Only users with `permission:write` (typically owner) may assign roles, scopes, and overrides.
- Admin Manager and Admin salary access requires explicit `UserPermissionOverride` (`salary:read` and/or `payroll:read`, effect `allow`).
```

**ADDED / REPLACED WITH:**

```markdown
| BR-006 | `admin` | Admin (function) | company | Company admin read/write |
| BR-007 | `employee` | Employee (position) | self | Self-service only |

| Rule ID | Rule |
|---------|------|
| BR-008 | Secretary, HR Manager, and Payroll Operator map to business role `secretary` |
| BR-009 | **Position** (EMP-003) and **business role** (BR-001–007) are related but not automatically equivalent; HR admin maps explicitly |
| BR-010 | Effective access: **role bundle → scope grants → user overrides** (audited) |
| BR-011 | **Department** (EMP-002) determines which workflow approver chain applies (WF-001–005) |

### Examples

- Marketing Sub Leader with `sub_leader` position: salary adjustment chain Big Leader → Owner (WF-001).
- Admin Department HR staff under Secretary: personal data change approved by Secretary (WF-005).
- WFH employee (`EMP-001`): no meal allowance (PAY-001).

### Exceptions

- Finance and HR are Admin Department functions; employees in those functions follow Admin Department workflow rules.

### Owner override rules

- Only users with `permission:write` (Owner) assign roles, scopes, overrides.
- Admin Manager / Admin salary visibility requires `UserPermissionOverride` per salary matrix.
```

### Change 7 (`replace`)

**REMOVED / REPLACED:**

```markdown
| Rule ID | Rule | Source |
|---------|------|--------|
| AC-001 | Salary visibility is **deny-by-default** for viewing other employees' salaries | `salary-visibility-matrix.ts`, `BUSINESS_ROLE_PERMISSIONS.md` |
| AC-002 | Owner and Secretary: all employees, all companies | Salary matrix |
| AC-003 | Big Leader: all employees in viewer's scoped company/companies (company-level, not team) | Salary matrix |
| AC-004 | Sub Leader, Employee: own salary only; no override path | Salary matrix |
| AC-005 | Admin Manager, Admin: own salary only; other employees only via UserPermissionOverride | Salary matrix |
| AC-006 | Own salary is **always** visible to the linked employee | Salary matrix |
| AC-007 | Telegram HR self-service requires **verified identity** (`TelegramIdentity.status = ACTIVE`) | `TELEGRAM_IDENTITY_SECURITY.md` |
| AC-008 | Unverified / pending / revoked Telegram users cannot access HR menus or AI self-service tools | `TELEGRAM_IDENTITY_SECURITY.md` |
| AC-009 | Verification: employee code (`globalId`) + registered phone → auto-approve on match; mismatch → pending registration | `TELEGRAM_IDENTITY_SECURITY.md` |
| AC-010 | Alternate path: invite code + phone (same match rules) | `TELEGRAM_IDENTITY_SECURITY.md` |
| AC-011 | Blocked when: employee inactive/terminated, identity revoked, registration pending, employee deleted | `TELEGRAM_IDENTITY_SECURITY.md` |
| AC-012 | HR admin identity actions require `security:write` | `TELEGRAM_IDENTITY_SECURITY.md` |

### Examples

- Employee opens Telegram → must complete `/start` verification before check-in or leave menus appear.
- Owner grants admin manager payroll duty via `POST /permissions/users/:id/overrides` with `salary:read`.

### Exceptions

- Users with no business role (e.g. legacy `super_admin` only): self salary only unless override.

### Owner override rules

- Owner may reset/revoke/reactivate Telegram identity bindings.
- Owner may grant salary/payroll overrides to Admin and Admin Manager only (per matrix policy).
```

**ADDED / REPLACED WITH:**

```markdown
| Rule ID | Rule |
|---------|------|
| AC-001 | Salary visibility **deny-by-default** |
| AC-002 | Owner and Secretary: all employees, all companies |
| AC-003 | Big Leader: all employees in scoped company/companies (company-level) |
| AC-004 | Sub Leader, Employee: own salary only |
| AC-005 | Admin Manager, Admin: own salary only unless UserPermissionOverride |
| AC-006 | Own salary always visible to linked employee |
| AC-007 | Telegram HR self-service requires `TelegramIdentity.status = ACTIVE` |
| AC-008 | Unverified / pending / revoked: no HR menus or AI self-service |
| AC-009 | Verification: employee code + phone → auto-approve on match |
| AC-010 | Alternate: invite code + phone |
| AC-011 | Blocked when inactive/terminated/revoked/pending/deleted |
| AC-012 | Identity admin actions require `security:write` |

### Examples

- Big Leader SB views all SB salaries; not MB.
- Gross misconduct termination flags `LEGAL_REVIEW_REQUIRED` (DISC-002) — access revoked on completion.

### Exceptions

- Unlisted roles: self salary only unless override.

### Owner override rules

- Owner resets/revokes/reactivates Telegram identities.
- Owner grants salary overrides to Admin / Admin Manager only.
```

### Change 8 (`insert`)

**ADDED / REPLACED WITH:**

```markdown
### Business rules — check-in / late / break

| Rule ID | Rule | Default | Wired |
|---------|------|---------|-------|
| ATT-001 | Employees check in/out via WorkHQ every working day | — | Partial |
| ATT-002 | Grace period before late penalty | 15 min | Yes |
| ATT-003 | Late penalty multiplier × hourly rate × late minutes | 2× | Yes |
| ATT-004 | Unpaid break deducted from worked minutes | 60 min | Yes |
| ATT-005 | Default shift window | 09:00–21:00 | Yes |
| ATT-006 | OT detection gated by `overtimeEnabled` | true | Yes |
| ATT-007 | OT gate: shift end + delay, minimum minutes past shift end | 30 min / 60 min | Yes |
| ATT-008 | Missing check-in/out handling | disallowed | Reserved |
| ATT-009 | Half-day / full-day absence classification | 4h / 6h | Reserved |

### Business rules — PAY-003 OT (confirmed)

| Rule ID | Rule | Default |
|---------|------|---------|
| PAY-003 | **Approved OT:** ฿50 per hour | ฿50/hr |
| PAY-003a | **Missed meal/break due to workload:** ฿50 per hour | ฿50/hr |
| PAY-003b | **Overrides** all handbook references to 1.5× or 2× OT multipliers | — |
| PAY-003c | OT requires manager approval before payout | — |

### Examples

- Approved OT 3 hours → 3 × ฿50 = ฿150 on payslip.
- Missed break due to workload 2 hours → 2 × ฿50 = ฿100 compensation item.
- Check-in 09:20, grace 15 min → 5 late minutes × (hourly/60) × 2.

### Exceptions

- Public holidays do not exist (HOL-001); OT on Dec 31 / Jan 1 follows company special holiday rules if scheduled to work.

### Owner override rules

- Owner / settings admin changes `attendance.rules` including `otHourlyRate`.
- OT approval chain configurable; default Direct Manager.

---

## 5. Work Shifts

```

### Change 9 (`replace`)

**REMOVED / REPLACED:**

```markdown
| Rule ID | Rule | Default | Wired | Source |
|---------|------|---------|-------|--------|
| ATT-001 | Employees must check in/out via WorkHQ every working day | — | Partial (Telegram + API) | `handbook-attendance-punctuality` |
| ATT-002 | Grace period: no late penalty within grace minutes after shift start | 15 min | Yes | `attendance.rules` |
| ATT-003 | Late penalty multiplier applied to hourly rate × late minutes | 2× | Yes | `attendance.rules` |
| ATT-004 | Fixed unpaid break deducted from worked minutes | 60 min | Yes | `attendance.rules` |
| ATT-005 | Default shift window | 09:00–21:00 | Yes | `attendance.rules` |
| ATT-006 | OT detection gated by `overtimeEnabled` | true | Yes | `attendance.rules` |
| ATT-007 | OT starts after shift end + `otStartDelayMinutes`, minimum `minimumOvertimeMinutes` past shift end | 30 min delay, 60 min minimum | Yes | `attendance.rules` |
| ATT-008 | OT amount uses flat `otHourlyRate` per completed hour | ฿50/hr | Yes | `attendance.rules` |
| ATT-009 | OT requires manager approval before payout | — | Yes (workflow) | `handbook-attendance-punctuality`, workflow |
| ATT-010 | Lateness >15 minutes without prior notice **may** be recorded as disciplinary offense | — | Not automated | Handbook (advisory) |
| ATT-011 | Missing check-in/out handling | disallowed (`missingCheckInAllowed=false`, `missingCheckOutAllowed=false`) | **Reserved** — not enforced | `ATTENDANCE_SETTINGS.md` |
| ATT-012 | Half-day / full-day absence classification thresholds | 4h / 6h | **Reserved** | `ATTENDANCE_SETTINGS.md` |

### Examples

- Check-in at 09:20 with grace 15 min → 5 late minutes → deduction = 5 × (hourlyRate/60) × 2.
- Check-out at 22:30 with shift end 21:00, OT delay 30 min → OT gate opens 21:30; if ≥60 min past shift end, whole hours at ฿50/hr.

### Exceptions

| Rule ID | Exception | Source |
|---------|-----------|--------|
| ATT-E1 | `CONFLICT_REQUIRES_DECISION`: Handbook OT rates (1.5× weekday/weekend, 2× holiday on hourly wage) vs settings flat ฿50/hr | Handbook vs `attendance.rules` |
| ATT-E2 | Break overage penalty (threshold 2h) — reserved, not enforced | `ATTENDANCE_SETTINGS.md` |

### Owner override rules

- Owner / settings admin may change `attendance.rules` per company via Settings Engine (versioned audit).
- OT approval chain configurable via approval matrix (default: Direct Manager).

---

## 5. Work Shifts
```

**ADDED / REPLACED WITH:**

```markdown
| Rule ID | Rule |
|---------|------|
| SH-001 | Standard shift from `shiftStartMinutes` / `shiftEndMinutes` (default 09:00–21:00) |
| SH-002 | Admin commission may segment Day / Night shift per cycle |
| SH-003 | Leave shift swap: approved equal-duration leave between same-company employees |
| SH-004 | No general shift roster beyond default attendance shift times |

### Examples

- Admin Day+Night in one cycle → commission per segment; penalties redistribute within shift.

### Exceptions

- HOL-001: employees work every day; monthly off-days substitute for public holidays.

### Owner override rules

- Shift times configurable per company in attendance settings.

---

## 6. Missing From Work & Absence

### Business rules — ABS-001 Absence (confirmed decision ID: ATT-001)

| Rule ID | Rule |
|---------|------|
| ABS-001 | **Absence** means ALL of: (1) not a scheduled off-day, (2) employee does not report to work, (3) no prior approval, (4) cannot be contacted |
| ABS-002 | Absence penalty **Employee:** ฿1,000/day |
| ABS-003 | Absence penalty **Sub Leader:** ฿2,000/day |
| ABS-004 | Absence penalty **Big Leader:** ฿3,000/day |
| ABS-005 | Unauthorized absence without approved leave may be treated as **constructive resignation** (handbook) |

### Business rules — ABS-002 Missing from work (confirmed decision ID: ATT-002)

| Rule ID | Rule |
|---------|------|
| ABS-006 | Employee disappears from work **>15 minutes** without notifying manager |
| ABS-007 | Penalty: **2 labor units per hour**, round up partial hours |
| ABS-008 | Missing punch rules (`missingCheckInAllowed`, `autoCloseMissingCheckOut`) — reserved in settings, not yet enforced |

### Examples

- Employee no-call no-show on working day (not off-day) → absence; ฿1,000 deduction if Employee position.
- Employee leaves desk 40 minutes without notice → 1 hour × 2 labor units (rounded up).

### Exceptions

- Approved leave (including monthly off-day) is not absence.
- Emergency leave with approval is not absence.

### Owner override rules

- Owner adjusts penalty amounts via `leave.rules.absencePenalties` when wired.
- Constructive resignation / absconding determination: management judgment; absconding → no deposit refund (PAY-004).

---

## 7. Leave Policy

### Business rules — HOL-001 Holiday (confirmed)

| Rule ID | Rule |
|---------|------|
| HOL-001 | **No public holiday system** |
| HOL-002 | Employees work **every day** |
| HOL-003 | **Monthly off-days** used instead of public holidays |
| HOL-004 | **Special company holidays:** 31 December, 1 January |
| HOL-005 | Special company holidays treated per company schedule (off-day or worked with OT per PAY-003 if applicable) |

### Business rules — monthly off-days & personal leave

| Rule ID | Rule | Default |
|---------|------|---------|
| LV-001 | Personal leave entitlement | 3 days/year (handbook) |
| LV-002 | Personal leave advance notice | ≥1 business day (handbook) |
| LV-003 | Personal leave >3 days: manager + HR approval | — |
| LV-004 | **Monthly off-day entitlement** | **4 days/month** (PAY-002) |
| LV-005 | **Expected minimum off-day usage** | **2 days/month** (PAY-002) |
| LV-006 | Sick leave certificate after | 1 day (settings; not enforced) |
| LV-007 | Sick leave adjacent to off-day requires certificate | true (not enforced) |
| LV-008 | Unpaid leave notice | 7 days (reserved; not enforced) |
| LV-009 | Split full-day leave | not allowed |
| LV-010 | Consecutive leave penalty | base 2 days + 5 labor units (not implemented) |

### Business rules — PAY-002 Leave bonus (confirmed)

| Rule ID | Rule | Default |
|---------|------|---------|
| PAY-002 | **Unused leave bonus rate** | ฿600 per eligible day |
| PAY-002a | **Normal maximum** | ฿1,200/month |
| PAY-002b | **Formula:** `eligibleBonusDays = max(0, min(2, 4 - usedOffDays))` | — |
| PAY-002c | **Bonus amount:** `eligibleBonusDays × 600` | — |
| PAY-002d | **Owner override allowed** (may exceed normal cap) | — |

### Examples

- Employee uses 2 off-days → eligibleBonusDays = min(2, 4−2) = 2 → ฿1,200.
- Employee uses 0 off-days → eligibleBonusDays = min(2, 4−0) = 2 → ฿1,200 (not 4 × 600; cap is 2 eligible days).
- Employee uses 4 off-days → eligibleBonusDays = 0 → ฿0.
- No public holiday calendar; employee schedules Dec 31 off-day or works per company instruction.

### Exceptions

- Meal allowance on approved off-day: eligible for OFFICE only (PAY-001).
- Sick / emergency / unpaid leave: not eligible for meal allowance.

### Owner override rules

- Owner approves leave bonus above ฿1,200 cap via payroll API (`overrideApproved=true`).
- Leave rules editable via Settings Engine.

---

## 8. Emergency Leave
```

### Change 10 (`replace`)

**REMOVED / REPLACED:**

```markdown
| Rule ID | Rule | Source |
|---------|------|--------|
| SH-001 | Standard work shift defined by `shiftStartMinutes` and `shiftEndMinutes` in attendance rules | `attendance.rules` |
| SH-002 | Admin commission may segment work by **Day** and **Night** shift within a cycle | `admin-commission-shift-transfer` KB, `AdminCommissionShiftSegment` |
| SH-003 | Leave **shift swap** exchanges approved off-day leave between two employees (same company, same duration) | Leave reschedule KB + validator |
| SH-004 | `POLICY_NOT_DOCUMENTED`: General employee shift roster / schedule assignment beyond default attendance shift times | — |

### Examples

- Default shift 09:00–21:00 applies to late and OT calculations for all office employees.
- Admin works Day and Night in one cycle → commission calculated per shift segment; penalties redistribute within same shift only.

### Exceptions

- No standalone shift scheduling module documented.

### Owner override rules

- Attendance shift times configurable per company in attendance settings.
- Admin commission shift segments derived from operational data at calculation time.

---

## 6. Missing From Work
```

**ADDED / REPLACED WITH:**

```markdown
| Rule ID | Rule | Default |
|---------|------|---------|
| EL-001 | Emergency leave enabled | true |
| EL-002 | Eligibility: completed probation (manager evaluation per EMP-002) | — |
| EL-003 | Entitlement per half-year (Jan–Jun / Jul–Dec) | 4 days |
| EL-004 | New hire in half-year: ≥3 months remain → 2 days; else → 1 day |
| EL-005 | Requests validated against half-year balance | — |
| EL-006 | Emergency leave approval default: Any Owner | — |
| EL-007 | Emergency reschedule may skip 7-day notice; requires HR approval | — |

### Examples

- Probation not passed (no manager evaluation) → not eligible for emergency leave.

### Exceptions

- Terminated/suspended: not eligible.

### Owner override rules

- Owner approves emergency leave; may disable per company.

---

## 9. Leave Reschedule
```

### Change 11 (`replace`)

**REMOVED / REPLACED:**

```markdown
| Rule ID | Rule | Source |
|---------|------|--------|
| MFW-001 | Unauthorized absence (missing work without approved leave) is treated as **constructive resignation** (ลาออกโดยมิชอบ) | `handbook-attendance-punctuality` |
| MFW-002 | Absence penalty amounts by role (employee ฿1,000 / sub_leader ฿2,000 / big_leader ฿3,000) defined in leave settings | `leave.rules` `absencePenalties` |
| MFW-003 | Absence penalty settings are **stored but not wired** to payroll/attendance enforcement | `LEAVE_SETTINGS.md` |
| MFW-004 | Missing punch rules (`missingCheckInAllowed`, `autoCloseMissingCheckOut`) — **reserved**, not enforced | `ATTENDANCE_SETTINGS.md` |

### Examples

- Employee absent 3 consecutive days without approved leave → handbook states may be treated as constructive resignation (HR process, not automated).

### Exceptions

- `POLICY_NOT_DOCUMENTED`: Formal missing-from-work investigation steps, notification timelines, and return-to-work procedures.

### Owner override rules

- Owner may adjust absence penalty config in leave settings (future enforcement).
- Constructive resignation determination remains management/HR judgment per handbook.

---

## 7. Leave Policy
```

**ADDED / REPLACED WITH:**

```markdown
| Rule ID | Rule | Default |
|---------|------|---------|
| LR-001 | Max reschedules per approved leave request | 1 |
| LR-002 | Notice before original leave date | 7 days |
| LR-003 | Must keep same duration | true |
| LR-004 | **New start date must be after original end date** (`new_start > original_end`) | true |
| LR-005 | Reason minimum length | 10 characters |
| LR-006 | Approved leave only | — |
| LR-007 | Workflow: pending → approved \| rejected; dates update on approve | — |
| LR-008 | Emergency exception skips notice when `isEmergency=true` | true |
| LR-009 | Approver chain: **Big Leader → Secretary** (2 steps) | WF-005 pattern |

### Examples

- Original Mar 10–12 → earliest new start Mar 13.
- Mar 11 start rejected (before original end Mar 12).

### Exceptions

- Emergency reschedule: notice waived; approver chain unchanged.

### Owner override rules

- Owner adjusts notice/max reschedules via leave settings.
- Owner edits approval matrix.

---

## 10. Leave Swap
```

### Change 12 (`replace`)

**REMOVED / REPLACED:**

```markdown
| Rule ID | Rule | Default | Wired | Source |
|---------|------|---------|-------|--------|
| LV-001 | Personal leave entitlement | 3 days/year | Partial (DB balances) | `handbook-leave-benefits` |
| LV-002 | Personal leave advance notice | ≥1 business day | **Not enforced** at request time | Handbook vs `defaultLeaveNoticeDays=7` reserved |
| LV-003 | Personal leave >3 days requires manager + HR approval | — | Via workflow | Handbook |
| LV-004 | Monthly off days (admin context) | 4 days/month | Partial (leave bonus calc; admin commission uses separate RuleConfig) | `leave.rules`, `CONFLICT_REQUIRES_DECISION` |
| LV-005 | Minimum recommended off days | 2 | Handbook/advisory only | `leave.rules` |
| LV-006 | Unused off-day bonus rate | ฿600/day | Yes (payroll leave bonus) | `leave.rules` |
| LV-007 | Unused off-day bonus cap | ฿1,200/month (2 days × rate) | Yes | `leave.rules` |
| LV-008 | Sick leave medical certificate required after | 1 day | **Not enforced** | `leave.rules` |
| LV-009 | Sick leave adjacent to off-day requires certificate | true | **Not enforced** | `leave.rules` |
| LV-010 | Unpaid leave notice days | 7 | **Not enforced** | `leave.rules` |
| LV-011 | Split full-day leave | not allowed (`allowSplitFullDayLeave=false`) | No feature | `leave.rules` |
| LV-012 | Consecutive leave penalty | enabled, base 2 days + 5 labor units | **Not implemented** | `leave.rules` |

### Examples

- Employee with 4 monthly off days uses 2 → eligible unused off-day bonus = min(2 unused, cap 2 days) × ฿600 = ฿1,200.
- Personal leave request for 5 days → requires Big Leader approval (default matrix) plus handbook HR involvement.

### Exceptions

| Rule ID | Exception | Source |
|---------|-----------|--------|
| LV-E1 | `CONFLICT_REQUIRES_DECISION`: Handbook personal leave notice 1 day vs settings default 7 days (neither enforced on standard leave requests today) | Handbook vs `leave.rules` |
| LV-E2 | `CONFLICT_REQUIRES_DECISION`: `monthlyOffDays` in leave.rules (4) vs admin commission `normalLeaveAllowanceDays` in RuleConfig (4) — same value but separate config stores | Settings docs |

### Owner override rules

- Owner may approve leave bonus above cap via payroll API (`overrideApproved=true` on leave bonus).
- Leave rules editable per company via Settings Engine.

---

## 8. Emergency Leave
```

**ADDED / REPLACED WITH:**

```markdown
| Rule ID | Rule | Default |
|---------|------|---------|
| LS-001 | Swap approved equal-duration leave between two employees | — |
| LS-002 | Same company required | — |
| LS-003 | Cannot swap with self | — |
| LS-004 | Notice before earliest leave date | 7 days |
| LS-005 | Partner consent required | true |
| LS-006 | Management approval required | true |
| LS-007 | Workflow: partner agree → **Big Leader → Secretary** | — |

### Examples

- Employee A Mar 5 ↔ Employee B Mar 12, both 1-day, submitted Feb 25 → valid.

### Exceptions

- `POLICY_NOT_DOCUMENTED`: cross-department swap restrictions beyond same company.

### Owner override rules

- Notice days configurable via `shiftSwapNoticeDays`.

---

## 11. Payroll
```

### Change 13 (`replace`)

**REMOVED / REPLACED:**

```markdown
| Rule ID | Rule | Default | Source |
|---------|------|---------|--------|
| EL-001 | Emergency leave enabled | true | `leave.rules` |
| EL-002 | Eligibility: employee must have **completed probation** | — | `leave.rules` + entitlement policy |
| EL-003 | Entitlement per half-year (Jan–Jun / Jul–Dec) | 4 days | `leave.rules` |
| EL-004 | New hire hired within current half-year: if ≥3 months remain in period → 2 days; else → 1 day | — | `leave.rules` `newEmployeeEmergencyLeave` |
| EL-005 | Emergency leave requests validated against half-year balance | — | `LeaveService.validateEmergencyLeaveRequest` |
| EL-006 | Emergency leave approval default: **Any Owner** | — | `approval-defaults.ts` |
| EL-007 | Emergency reschedule (`is_emergency=true`) may skip 7-day notice but requires HR approval | — | `leave-reschedule-eligibility` KB |

### Examples

- Employee on probation until July 1 requests emergency leave June 15 → not eligible.
- Employee hired April 1 in H1 with 3+ months remaining → entitled 2 emergency days for that half-year.

### Exceptions

- Terminated/suspended employees not eligible.

### Owner override rules

- Owner approves emergency leave via default workflow (`any_owner` strategy).
- Owner may disable emergency leave globally per company (`emergencyLeaveEnabled=false`).

---

## 9. Leave Reschedule

### Business rules

| Rule ID | Rule | Default | Source |
|---------|------|---------|--------|
| LR-001 | Max reschedules per approved leave request | 1 | `leave-reschedule-policy` KB, `leave.rules` |
| LR-002 | Notice before original leave date | 7 days | `leave.rules` |
| LR-003 | Must keep same duration (`new_days = original_days`) | true | KB + validator |
| LR-004 | New leave date must be **after** original leave | true | KB + validator |
| LR-005 | Reason minimum length | 10 characters | `leave.rules` |
| LR-006 | Only **approved** leave requests may be rescheduled | — | KB |
| LR-007 | Reschedule workflow: pending → approved \| rejected; on approve system updates dates | — | KB procedure |
| LR-008 | Emergency reschedule exception skips notice when `isEmergency=true` and `emergencyRescheduleExceptionAllowed=true` | true | `leave.rules` |

### Examples

- Approved leave Mar 10–12 (3 days) rescheduled to Mar 20–22 with reason ≥10 chars, submitted Mar 1 → valid (7+ days notice).
- Second reschedule attempt on same request → rejected (max 1).

### Exceptions

| Rule ID | Exception | Source |
|---------|-----------|--------|
| LR-E1 | `CONFLICT_REQUIRES_DECISION`: KB states `new_start_date` must be after `original_end_date`; runtime validator requires `new_start > original_start_date` | KB vs `leave-reschedule-policy.service.ts` |
| LR-E2 | Emergency reschedule: KB requires HR approval; default approval matrix for `leave_reschedule` not in `approval-defaults.ts` (test fixtures use owner) | KB vs workflow seed |

### Owner override rules

- Owner may adjust notice days, max reschedules, reason length via leave settings.
- Approver configurable via approval authority matrix.

---

## 10. Leave Swap

### Business rules

| Rule ID | Rule | Default | Source |
|---------|------|---------|--------|
| LS-001 | Shift swap between two employees' **approved** leave of **equal duration** | — | Validator + KB implied |
| LS-002 | Both employees same company | — | Validator |
| LS-003 | Cannot swap with self | — | Validator |
| LS-004 | Notice before earliest leave date | 7 days | `leave.rules` `shiftSwapNoticeDays` |
| LS-005 | Partner consent required | true | Workflow (always) |
| LS-006 | Management approval required | true | Workflow (always) |
| LS-007 | Workflow: partner agree → management approval | — | `LeaveService` |

### Examples

- Employee A (off Mar 5) swaps with Employee B (off Mar 12), both 1-day approved leaves, submitted Feb 25 → valid notice.

### Exceptions

- `POLICY_NOT_DOCUMENTED`: Detailed swap eligibility (leave types allowed, cross-team rules beyond same company).

### Owner override rules

- Notice days configurable via `shiftSwapNoticeDays` in leave settings.
- Approval matrix configurable for `leave_shift_swap` entity type.

---

## 11. Payroll

### Business rules

| Rule ID | Rule | Source |
|---------|------|--------|
| PR-001 | Payroll cycle window: **25th to 24th** of following month | `handbook-leave-benefits`, commission KB |
| PR-002 | Employees view payslip via WorkHQ Payroll menu / Telegram | Handbook |
| PR-003 | Payroll cycle lifecycle: open → items → lock → payslip generate | Payroll module |
| PR-004 | Salary proration supported for partial periods | `prorate.service.ts` |
| PR-005 | Payroll builder aggregates: salary, meal allowance, late deduction, leave bonus, deposit, commission | `payroll-builder.constants.ts` |
| PR-006 | Late deductions aggregated from attendance records for cycle | `late-deduction.service.ts` |
| PR-007 | Manual commission entry for externally calculated amounts (HR mode) | `HR_PRODUCT_BOUNDARY.md` |
| PR-008 | Manual commission types: `marketing_manual`, `sales_manual`, `other_manual` | HR product boundary |
| PR-009 | Manual commission requires: employeeId, companyId, payrollCycleId, amount, commissionType, reason | HR product boundary |
| PR-010 | `POLICY_NOT_DOCUMENTED`: Official pay day, currency display, payroll adjustment business rules beyond approval matrix | HR roadmap planned |

### Examples

- Cycle Apr 25–May 24 locked → payslip shows salary + meal ฿100×eligible days − late deductions − deposit ฿500.

### Exceptions

- Marketing commission **calculation** is outside WorkHQ HR scope in HR mode; entered manually.

### Owner override rules

- Owner approves payroll/salary adjustments (Secretary then Any Owner, min 2 approvals).
- Owner may lock/paid payroll cycles.
```

**ADDED / REPLACED WITH:**

```markdown
| Rule ID | Rule |
|---------|------|
| PR-001 | Payroll cycle: **25th to 24th** of following month |
| PR-002 | Payslip via WorkHQ Payroll menu / Telegram (self-only) |
| PR-003 | Cycle lifecycle: open → items → lock → payslip |
| PR-004 | Salary proration for partial periods |
| PR-005 | Builder aggregates: salary, meal (PAY-001), OT (PAY-003), missed meal/break (PAY-003a), late deduction, leave bonus (PAY-002), deposit (PAY-004), commission, deductions (WF-004), advance recovery (PAY-005) |
| PR-006 | Late deductions from attendance records |
| PR-007 | Manual commission entry (HR mode): `marketing_manual`, `sales_manual`, `other_manual` |
| PR-008 | Manual commission requires employeeId, companyId, payrollCycleId, amount, commissionType, reason |
| PR-009 | **Advance pay recovery:** automatically deducted from **next payroll cycle** (PAY-005) |

### Business rules — PAY-005 Advance pay (confirmed)

| Rule ID | Rule |
|---------|------|
| PAY-005 | Advance pay requests **approver: Owner** |
| PAY-005a | Recovery: automatic deduction next payroll cycle |

### Examples

- Owner-approved advance ฿5,000 in April cycle → deducted automatically in May cycle.

### Exceptions

- Marketing commission calculation outside WorkHQ HR scope in HR mode.

### Owner override rules

- Owner locks/paid cycles; approves advances.
```

### Change 14 (`replace`)

**REMOVED / REPLACED:**

```markdown
### Business rules

| Rule ID | Rule | Default | Source |
|---------|------|---------|--------|
| MA-001 | Meal allowance rate | ฿100/day | `payroll.rules` |
| MA-002 | Eligible employees: `workCategory = office` only; WFH → 0 | — | `meal-eligible-days.service.ts` |
| MA-003 | Eligible days = working days (check-in days) + capped off-day leave days (max 4) | — | `meal-eligible-days.service.ts` |
| MA-004 | Sick, emergency, unpaid leave days disqualify meal for that date | — | `leave-type-classification.ts` |
| MA-005 | Amount = eligibleDays × ratePerDay | — | `meal-allowance.service.ts` |

### Examples

- Office employee: 20 check-in days + 2 approved off-day leaves in cycle → 22 eligible days × ฿100 = ฿2,200.

### Exceptions

- WFH employees receive no meal allowance regardless of attendance.

### Owner override rules

- Rate configurable via `payroll.rules` (`mealAllowancePerDay`) per company.
```

**ADDED / REPLACED WITH:**

```markdown
### Business rules — PAY-001 (confirmed)

| Rule ID | Rule | Default |
|---------|------|---------|
| PAY-001 | **Rate:** ฿100 per day | ฿100 |
| PAY-001a | **Eligible:** working day (check-in) | — |
| PAY-001b | **Eligible:** approved **monthly off-day** | — |
| PAY-001c | **Not eligible:** sick leave | — |
| PAY-001d | **Not eligible:** emergency leave | — |
| PAY-001e | **Not eligible:** unpaid leave | — |
| PAY-001f | **Not eligible:** absence (ABS-001) | — |
| PAY-001g | **OFFICE** (`EMP-001`): eligible | — |
| PAY-001h | **WFH** (`EMP-001`): **not eligible** | — |
| PAY-001i | **Amount:** eligibleDays × rate | — |

### Examples

- OFFICE employee: 20 check-in days + 2 approved off-days → 22 × ฿100 = ฿2,200.
- WFH employee: ฿0 regardless of attendance.
- Sick leave day: excluded even if check-in attempted.

### Exceptions

- None.

### Owner override rules

- Rate configurable via `payroll.rules.mealAllowancePerDay`.
```

### Change 15 (`replace`)

**REMOVED / REPLACED:**

```markdown
### Business rules

| Rule ID | Rule | Default | Wired | Source |
|---------|------|---------|-------|--------|
| DP-001 | Employee deposit program enabled | true | Yes | `deposit.rules` |
| DP-002 | Monthly deduction | ฿500 | Yes | `deposit.rules` |
| DP-003 | Maximum accumulated balance | ฿3,000 | Yes | `deposit.rules` |
| DP-004 | Deduction stops when cap reached (`DepositCapExceededError`) | — | Yes | `DEPOSIT_SETTINGS.md` |
| DP-005 | Payroll item type for deduction | `deposit` | Yes | `deposit.rules` |
| DP-006 | Refund on proper resignation | true | **Reserved** | `deposit.rules` |
| DP-007 | Partial refund allowed | true | **Reserved** (finance refund API exists separately) | `deposit.rules` |
| DP-008 | Refund requires approval | true | **Reserved** | `deposit.rules` |

### Examples

- New employee: 6 months × ฿500 = ฿3,000 cap reached → month 7 no deduction.

### Exceptions

- Finance deposit refund workflow exists but not fully wired to deposit settings refund flags.

### Owner override rules

- Owner/settings admin may change amounts, cap, or disable deposit via deposit settings.
```

**ADDED / REPLACED WITH:**

```markdown
### Business rules — PAY-004 (confirmed)

| Rule ID | Rule | Default |
|---------|------|---------|
| PAY-004 | **Monthly deduction** | ฿500 |
| PAY-004a | **Maximum balance** | ฿3,000 |
| PAY-004b | Deduction may be **delayed to a later month** if employee worked too few days and payroll would become too small | — |
| PAY-004c | **Deposit may be used for:** property damage, lost equipment, cash shortage, other company losses | — |
| PAY-004d | **Resignation per company process:** return **full deposit** | — |
| PAY-004e | **Absconding:** **no deposit refund** | — |
| PAY-004f | **Gross misconduct (DISC-002):** **no deposit refund** | — |
| PAY-004g | Deduction stops at cap | — |

### Examples

- 6 months × ฿500 = cap ฿3,000 → month 7 no deduction.
- Proper resignation with asset return → full ฿3,000 refund.
- Absconding after ฿2,500 collected → ฿0 refund.
- Short month: only 3 worked days, net pay would be below threshold → deposit deferred to next month.

### Exceptions

- Performance-failure termination (DISC-001): deposit **refunded**.

### Owner override rules

- Owner/settings admin changes amounts, cap, enabled flag.
- Owner authorizes deposit retention for documented losses (PAY-004c).
```

### Change 16 (`replace`)

**REMOVED / REPLACED:**

```markdown
### 14A Marketing Commission (KB policy — calculation archived in HR mode)

| Rule ID | Rule | Source |
|---------|------|--------|
| COM-MKT-001 | Team Pool = 10% of Net Profit | KB + RuleConfig default |
| COM-MKT-002 | Net Profit = Gross Profit − salary − marketing − line − telesales − promotion (if GP > 500k) − Company Head 40% | KB + RuleConfig |
| COM-MKT-004/005 | New hire ramp: M1 0%, M2–3 20%, M4 30%, M5 40%, M6+ 100%; shortfall redistributed to ramp-complete members | KB + RuleConfig |
| COM-MKT-006 | KPI target: 24 candidates per cycle to qualify | KB + RuleConfig |
| COM-MKT-007 | Big Leader KPI exempt | KB |
| COM-MKT-012 | Big Leader Bonus = 5% of Leader Base (Net Profit after Team Pool) | KB + RuleConfig |
| COM-MKT-CF | Carry forward max 1 month; expired carry redistributed to KPI-qualified members | KB + RuleConfig |
| COM-MKT-HOLD | Status `hold` blocks payout until HR release | KB |
| COM-MKT-PAY | Payroll cycle 25th–24th; `pending_pay` paid next cycle | KB |

**HR mode note:** Marketing commission calculation surfaces hidden; payment via manual payroll entry (`HR_PRODUCT_BOUNDARY.md`).
```

**ADDED / REPLACED WITH:**

```markdown
### 14A Marketing Commission

| Rule ID | Rule |
|---------|------|
| COM-MKT-001 | Team Pool = 10% Net Profit |
| COM-MKT-002 | Net Profit formula per KB |
| COM-MKT-004/005 | Ramp schedule M1 0% … M6+ 100% |
| COM-MKT-006 | KPI 24 candidates |
| COM-MKT-007 | Big Leader KPI exempt |
| COM-MKT-012 | Big Leader Bonus 5% Leader Base |
| COM-MKT-CF | Carry forward max 1 month |
| COM-MKT-HOLD | Hold blocks payout until HR release |
| COM-MKT-PAY | Cycle 25th–24th |

**HR mode:** calculation hidden; manual payroll entry.
```

### Change 17 (`replace`)

**REMOVED / REPLACED:**

```markdown
| Rule ID | Rule | Source |
|---------|------|--------|
| COM-ADM-001 | Admin Pool = 2% Net Profit (Pool A 1% + Pool B 1%) | KB + RuleConfig |
| COM-ADM-002 | Pool A ÷ all Admin (Front + Back); Pool B ÷ Front Office only | KB |
| COM-ADM-008 | Normal leave allowance | 4 days/cycle |
| COM-ADM-009 | Extra leave penalty tiers (nearest lower tier): 2→30%, 3→40%, 6→50%, 7→60%, 8→70%, 9→80%, 10+→100% | KB + RuleConfig |
| COM-ADM-010 | Day/Night shift segments; penalty redistribution within same shift | KB |
| COM-ADM-011 | Resigned before payout → zero commission; base prorated by days worked | KB |

### Examples

- Admin with 6 extra leave days in cycle → 50% commission deduction on affected shift segment.
- Marketing member month 2 at 20% ramp → receives 20% of pool share; 80% redistributed.

### Exceptions

- HR mode: marketing commission rules advisory; admin commission calculation remains in codebase.

### Owner override rules

- HR may override marketing ramp percentage (KB: "HR สามารถ override ramp").
- RuleConfig editable via `/settings/rule-config/marketing` and `/admin`.
- Commission adjustments: Secretary + Any Owner approval (min 2).

---

## 15. Recruitment

### Business rules — hiring pipeline

| Rule ID | Rule | Source |
|---------|------|--------|
| RC-001 | `POLICY_NOT_DOCUMENTED`: Formal recruitment policy (sourcing, interview stages, offer approval) | — |
| RC-002 | System supports candidate pipeline, interviews, offers, analytics (implementation exists) | HR product boundary |

### Business rules — referral reward program

| Rule ID | Rule | Default | Source |
|---------|------|---------|--------|
| RF-001 | Employee receives Referral Reward when referred candidate **qualifies** | — | `referral-program-overview` KB |
| RF-002 | One referral reward per referred employee (no duplicate rewards) | — | KB + DB unique index |
| RF-003 | Self-referral prohibited | — | KB |
| RF-004 | Qualify via **probation_pass**: `employmentStatus = active` and `probationEndDate` reached | — | `referral-eligibility-conditions` KB |
| RF-005 | Qualify via **three_months**: employed ≥ `requiredEmploymentDays` (even if still on probation) | 90 days | KB + `referral.rules` |
| RF-006 | Terminated referred employees cannot qualify | — | KB |
| RF-007 | Reward amount fixed at registration | ฿2,000 | `referral-reward-amount` KB + `referral.rules` |
| RF-008 | Lifecycle: pending → qualified → paid \| rejected | — | KB |
| RF-009 | Duplicate check (phone / national ID / bank) before qualify | enabled | `referral.rules` |
| RF-010 | Qualified referrals paid in **next payroll cycle** via payroll item | — | `referral-duplicate-and-payment` KB |
| RF-011 | Mark paid only after payroll item created | — | KB |
| RF-012 | `payoutMode` | `one_time` only | `referral.rules` (reserved validation) |

### Examples

- Referred employee passes probation Mar 1 → qualifies `probation_pass` → ฿2,000 paid next cycle.
- Referred employee still on probation but hired 91+ days ago → qualifies `three_months` at 90-day threshold.

### Exceptions

| Rule ID | Exception | Source |
|---------|-----------|--------|
| RF-E1 | `CONFLICT_REQUIRES_DECISION`: KB says "3 months"; settings default is **90 calendar days** (~2.96 months). Documented migration from ~91.32 calendar days. | `REFERRAL_SETTINGS.md`, C-004 |
| RF-E2 | `allowMultipleReferrals` setting reserved; DB still enforces one reward per referred employee | `REFERRAL_SETTINGS.md` |

### Owner override rules

- HR/Owner may override duplicate block: `overrideDuplicateBlock=true`.
- Reward amount and employment days configurable via `referral.rules` per company.
```

**ADDED / REPLACED WITH:**

```markdown
| Rule ID | Rule |
|---------|------|
| COM-ADM-001 | Pool 2% Net Profit (A 1% + B 1%) |
| COM-ADM-002 | Pool A all Admin; Pool B Front Office only |
| COM-ADM-008 | Normal leave allowance 4 days/cycle |
| COM-ADM-009 | Extra leave penalty tiers |
| COM-ADM-010 | Day/Night shift segments |
| COM-ADM-011 | Resigned before payout → zero; prorate by days worked |

### Business rules — commission & probation (EMP-002)

| Rule ID | Rule |
|---------|------|
| EMP-002 | Passing probation requires **manager evaluation** — **not automatic** |
| EMP-002a | During probation: **full salary** |
| EMP-002b | During probation: **monthly off-days** apply |
| EMP-002c | During probation: **commission eligibility depends on department rules** |

### Examples

- Marketing employee on probation: commission per marketing department rules if manager evaluation passed.
- Performance-failure termination: eligible commission paid (DISC-001).

### Exceptions

- Gross misconduct: no commission (DISC-002).

### Owner override rules

- HR override marketing ramp.
- Commission adjustment: Big Leader → Owner (Marketing) or Secretary → Owner (Admin) per WF-002.

---

## 15. Recruitment & Referral

### Hiring pipeline

| Rule ID | Rule |
|---------|------|
| RC-001 | `POLICY_NOT_DOCUMENTED`: formal sourcing, interview, offer standards |
| RC-002 | System supports pipeline, interviews, offers, analytics (API) |

### Business rules — REF-001 Referral (confirmed)

| Rule ID | Rule |
|---------|------|
| REF-001 | **Referral reward:** ฿2,000 |
| REF-001a | **Condition:** referred employee must complete **3 months of employment** |
| REF-001b | **Payment subject to KPI and management discretion** |
| REF-001c | One reward per referred employee; no self-referral |
| REF-001d | Duplicate check before qualify |
| REF-001e | Lifecycle: pending → qualified → paid \| rejected |
| REF-001f | Paid in next payroll cycle after qualification and approval |

### Examples

- Referred employee completes 3 months → qualifies; Big Leader / management confirms KPI → ฿2,000 in next cycle.
- Referred employee terminated at 2 months → does not qualify.

### Exceptions

- Management may withhold payment despite tenure if KPI/discretion not met (REF-001b).

### Owner override rules

- Owner/HR may override duplicate block.
- Reward amount configurable via `referral.rules`.
```

### Change 18 (`replace`)

**REMOVED / REPLACED:**

```markdown
### Business rules

| Rule ID | Rule | Default | Source |
|---------|------|---------|--------|
| PF-001 | Grade thresholds: A≥90, B≥75, C≥60, D≥50, F<50 | — | `DEFAULT_SCORING_CONFIG` (HR roadmap: migrate to settings) |
| PF-002 | Min months in role for promotion readiness | 12 | Scoring config |
| PF-003 | Suggested salary increase: Grade A 10%, Grade B 5% | — | Scoring config |
| PF-004 | Review dimensions: attendance, recruitment, discipline, manager_review, owner_review | — | Scoring service |
| PF-005 | Review types planned: self, peer, manager, 360 | — | `HR_ROADMAP.md` HR-17 (planning, not policy KB) |
| PF-006 | `POLICY_NOT_DOCUMENTED`: Official review cycle frequency, weighting policy, employee notification rules | — | — |

### Examples

- Total score 82 → Grade B → salary review action "increase" at 5% (recommendation only).

### Exceptions

- Scoring thresholds in code defaults — **not yet** in HR settings policy doc.

### Owner override rules

- Owner finalizes performance cycles; workflow entity type `performance_review` exists.
```

**ADDED / REPLACED WITH:**

```markdown
| Rule ID | Rule | Default |
|---------|------|---------|
| PF-001 | Grade thresholds A≥90 B≥75 C≥60 D≥50 F<50 | scoring config |
| PF-002 | Min months for promotion readiness | 12 |
| PF-003 | Suggested salary increase A 10%, B 5% | — |
| PF-004 | Dimensions: attendance, recruitment, discipline, manager_review, owner_review | — |
| PF-005 | Probation pass requires manager evaluation (EMP-002) — linked to performance/probation review | — |
| PF-006 | `POLICY_NOT_DOCUMENTED`: review cycle frequency, weights, notifications | — |

### Examples

- Probation end: manager evaluation required before `active` status and full referral/emergency leave eligibility.

### Exceptions

- Scoring thresholds not yet in HR settings.

### Owner override rules

- Owner finalizes performance cycles.
```

### Change 19 (`replace`)

**REMOVED / REPLACED:**

```markdown
### Business rules

| Rule ID | Rule | Source |
|---------|------|--------|
| DP-001 | Employees must not disclose confidential company/customer information | `handbook-code-of-conduct` |
| DP-002 | Prohibited: misuse of company assets, harassment, discrimination | Handbook |
| DP-003 | Violations may result in: verbal warning, written warning, salary reduction, termination — per severity and history | Handbook |
| DP-004 | `POLICY_NOT_DOCUMENTED`: Formal investigation procedure, evidence standards, appeal beyond grievance process | — |

### Examples

- Repeated lateness without notice → written warning per handbook escalation (manual HR process).

### Exceptions

- Grievance process (Section 18 related): 14-day investigation, 7-day appeal window — see handbook grievance.

### Owner override rules

- `POLICY_NOT_DOCUMENTED`: Documented owner sign-off on termination for cause.
```

**ADDED / REPLACED WITH:**

```markdown
### Business rules — handbook conduct

| Rule ID | Rule |
|---------|------|
| DISC-003 | No disclosure of confidential company/customer information |
| DISC-004 | Prohibited: asset misuse, harassment, discrimination |
| DISC-005 | Escalation: verbal → written → salary reduction → termination |

### Business rules — DISC-001 Performance failure termination (confirmed)

| Rule ID | Rule |
|---------|------|
| DISC-001 | **Performance failure termination:** |
| DISC-001a | Salary paid based on **days worked** |
| DISC-001b | **Eligible commission paid** |
| DISC-001c | **Leave bonus paid** (if eligible per PAY-002) |
| DISC-001d | **Deposit refunded** (PAY-004d) |

### Business rules — DISC-002 Gross misconduct (confirmed)

| Rule ID | Rule |
|---------|------|
| DISC-002 | **Gross misconduct examples:** fraud, theft, document forgery, working for competitors, drug use, serious company damage, confidentiality breach |
| DISC-002a | **No salary payment** |
| DISC-002b | **No commission payment** |
| DISC-002c | **No deposit refund** |
| DISC-002d | **Flag:** `LEGAL_REVIEW_REQUIRED` |

### Examples

- Performance failure after probation → prorated salary, commission owed, leave bonus if formula yields amount, deposit returned.
- Theft confirmed → zero salary/commission/deposit; case flagged LEGAL_REVIEW_REQUIRED.

### Exceptions

- Grievance: 14-day investigation, 7-day appeal (handbook).

### Owner override rules

- Owner sign-off on gross misconduct termination and LEGAL_REVIEW_REQUIRED cases.
```

### Change 20 (`replace`)

**REMOVED / REPLACED:**

```markdown
### Business rules

| Rule ID | Rule | Source |
|---------|------|--------|
| WS-001 | Handbook defines verbal → written → salary reduction → termination escalation | `handbook-code-of-conduct` |
| WS-002 | Planned system: Warning 1 / 2 / 3 with attachments, acknowledgement | `HR_ROADMAP.md` HR-14 (not policy KB) |
| WS-003 | `POLICY_NOT_DOCUMENTED`: Warning level definitions, expiry, automatic escalation triggers | — |

### Examples

- `POLICY_NOT_DOCUMENTED` for formal Warning 1/2/3 criteria.

### Exceptions

- Admin commission leave penalties are **financial**, not HR warning records.

### Owner override rules

- Planned: configurable escalation policy via HR-11 settings (not documented).

---

## 19. Resignation

### Business rules

| Rule ID | Rule | Source |
|---------|------|--------|
| RS-001 | Unauthorized absence may be treated as constructive resignation | Handbook attendance |
| RS-002 | Admin commission: resigned/terminated before payout date → no commission | `admin-commission-payout-rules` |
| RS-003 | Deposit refund on proper resignation flagged `refundOnProperResignation=true` | `deposit.rules` (reserved) |
| RS-004 | Planned exit checklist: return assets, clear debt, deposit settlement, final payroll, payslip, access revoke | `HR_ROADMAP.md` HR-16 (planning) |
| RS-005 | `POST /employees/:id/terminate` exists; full exit workflow `POLICY_NOT_DOCUMENTED` | — |

### Examples

- Admin terminates employment May 20; payout date May 25 → `resignedBeforePayout` → zero admin commission.

### Exceptions

- `POLICY_NOT_DOCUMENTED`: Notice period, resignation letter requirements, final pay timing.

### Owner override rules

- Owner initiates termination via employee API; deposit refund via finance workflow when implemented.
```

**ADDED / REPLACED WITH:**

```markdown
| Rule ID | Rule |
|---------|------|
| WS-001 | Handbook escalation: verbal → written → salary reduction → termination |
| WS-002 | Planned Warning 1/2/3 system (HR-14) — not yet policy-complete |
| WS-003 | `POLICY_NOT_DOCUMENTED`: warning level definitions, expiry, auto-escalation |

### Examples

- Absence ABS-001 may trigger written warning before termination.

### Exceptions

- Commission leave penalties are financial, not warning records.

### Owner override rules

- Planned configurable escalation via settings (HR-14).

---

## 19. Resignation & Exit

| Rule ID | Rule |
|---------|------|
| RS-001 | Unauthorized absence may be constructive resignation / absconding |
| RS-002 | Resigned before commission payout date → no admin commission |
| RS-003 | **Proper resignation (company process):** full deposit refund (PAY-004d) |
| RS-004 | **Absconding:** no deposit refund (PAY-004e) |
| RS-005 | **Gross misconduct exit:** no deposit refund (DISC-002) |
| RS-006 | Exit checklist: return assets (ASSET-001), clear debt, deposit settlement, final payroll, access revoke |
| RS-007 | Performance failure exit: DISC-001 settlement rules |

### Business rules — ASSET-001 (confirmed)

| Rule ID | Rule |
|---------|------|
| ASSET-001 | Track company assets assigned to employees |
| ASSET-001a | Asset types: notebook, phone, SIM, access card, keys |
| ASSET-001b | Maintain **employee asset list** and **company asset register** |
| ASSET-001c | Used during **resignation** and **deposit review** (PAY-004c) |

### Examples

- Resignation: all assets returned → deposit review → full refund if no damage claims.
- Lost notebook at exit → deposit applied toward loss per PAY-004c.

### Exceptions

- `POLICY_NOT_DOCUMENTED`: notice period, resignation letter format.

### Owner override rules

- Owner initiates termination; orchestrates exit checklist.
```

### Change 21 (`replace`)

**REMOVED / REPLACED:**

```markdown
### Business rules (defaults — `approval-defaults.ts`)

| Workflow | Min approvals | Default approver chain |
|----------|---------------|------------------------|
| Off day leave | 1 | Big Leader |
| Sick leave | 1 | Any Owner |
| Emergency leave | 1 | Any Owner |
| Unpaid leave | 1 | Any Owner |
| General leave request | 1 | Big Leader |
| OT request | 1 | Direct Manager |
| Payroll adjustment | 2 | Secretary → Any Owner |
| Salary adjustment | 2 | Secretary → Any Owner |
| Commission adjustment | 2 | Secretary → Any Owner |
| Advance payment | 2 | Direct Manager → Any Owner |
| Employee data change | 1 | Secretary |
| Custom workflow | 1 | Any Owner |

| Rule ID | Rule | Source |
|---------|------|--------|
| AM-001 | Admin hierarchy requester override: Admin/Admin Manager requests → Secretary approves; Secretary requests → Any Owner | `approval-defaults.ts` |
| AM-002 | Leave reschedule / shift swap: entity types exist; **not in DEFAULT_MATRICES** — company matrix or test fixtures (owner) | Workflow schema |
| AM-003 | Matrix editable via `/workflow/approval-matrix` | Workflow module |
| AM-004 | Delegation supported | Workflow module |

### Examples

- Employee submits sick leave → routes to Any Owner for single approval.
- Payroll adjustment → Secretary approve then Owner approve.

### Exceptions

- Production seed may not include all workflow definitions (HR roadmap gap).

### Owner override rules

- Owner edits approval authority matrix per company.
- Owner may use workflow `override` action where permitted.
```

**ADDED / REPLACED WITH:**

```markdown
### Business rules — WF-001 to WF-005 (confirmed)

| Rule ID | Workflow | Created by | Approver chain | Min approvals |
|---------|----------|------------|----------------|---------------|
| WF-001 | **Salary adjustment — Marketing** | — | **Big Leader → Owner** | 2 |
| WF-001a | **Salary adjustment — Admin Dept** | — | **Secretary → Owner** | 2 |
| WF-002 | **Commission adjustment — Marketing** | — | **Big Leader → Owner** | 2 |
| WF-002a | **Commission adjustment — Admin Dept** | — | **Secretary → Owner** | 2 |
| WF-003 | **Special bonus** | Big Leader, Secretary | **Owner** | 1 |
| WF-004 | **Deduction items** | Big Leader, Secretary | **None** (no approval workflow) | 0 |
| WF-005 | **Personal data change** | Employee | **Highest manager of department:** Marketing → Big Leader; Admin → Secretary | 1 |

| Rule ID | Workflow | Approver chain | Notes |
|---------|----------|----------------|-------|
| WF-L01 | Off day / general leave | Big Leader | 1 |
| WF-L02 | Sick / emergency / unpaid leave | Any Owner | 1 |
| WF-L03 | Leave reschedule / shift swap | Big Leader → Secretary | 2 |
| WF-L04 | OT request | Direct Manager | 1 |
| WF-P01 | **Advance payment (PAY-005)** | **Owner** | 1 |
| WF-P02 | Payroll adjustment (legacy) | Secretary → Owner | 2 — align to department rules |

| Rule ID | Rule |
|---------|------|
| AM-001 | Admin hierarchy override: Admin/Admin Manager requests → Secretary; Secretary → Owner |
| AM-002 | Matrix editable via `/workflow/approval-matrix` |
| AM-003 | Delegation supported |

### Examples

- Marketing employee salary change: Big Leader approves → Owner approves.
- Admin employee bank change: Secretary approves (WF-005).
- Big Leader creates deduction for team member: no workflow (WF-004).
- Secretary creates special bonus: Owner approves (WF-003).

### Exceptions

- Production seed may not yet reflect WF-001–005; policy is authoritative.

### Owner override rules

- Owner edits matrix; may use workflow override action.
```

### Change 22 (`replace`)

**REMOVED / REPLACED:**

```markdown
### Business rules

| Rule ID | Rule | Source |
|---------|------|--------|
| TG-001 | Active identity required for all HR self-service | `TELEGRAM_IDENTITY_SECURITY.md` |
| TG-002 | Employee menu: attendance, leave, payslip, commission summary, referral, AI assistant | `telegram-bot.service.ts` |
| TG-003 | Leave menu: new leave request, reschedule (shift swap **not** in menu) | Bot service + UAT-003 |
| TG-004 | Leader menu: approve leave, approve OT, team dashboard, marketing KPI/expenses (when marketing enabled) | Bot service |
| TG-005 | Leader menu **excludes** reschedule approval entry (hidden path `approvals:leave_reschedule`) | UAT-004 |
| TG-006 | Big leader: company marketing overview (requires root team `bigLeaderEmployeeId` assignment) | UAT-006 |
| TG-007 | Owner: owner dashboard | Bot service |
| TG-008 | Attendance: check-in/out with confirmation step | Bot service |
| TG-009 | Payslip: self-only per salary visibility policy | Salary matrix |
| TG-010 | AI assistant: read-only; tools permission-gated | HR roadmap HR-19 |
| TG-011 | Marketing menus hidden when `MARKETING_ENABLED=false` | `HR_PRODUCT_BOUNDARY.md` |

### Examples

- Verified employee taps 🌴 การลา → ขอลาใหม่ or 🔄 เลื่อนวันลา.
- Sub leader approves pending leave via ✅ อนุมัติการลา.

### Exceptions

- Onboarded employees may lack permissions for AI payslip/commission tools (UAT-002 — implementation gap, not policy).

### Owner override rules

- Owner uses 👑 แดชบอร์ดเจ้าของ for cross-company actions when marketing enabled.
- HR revokes/resets Telegram identity from employee detail.
```

**ADDED / REPLACED WITH:**

```markdown
| Rule ID | Rule |
|---------|------|
| TG-001 | Active identity required |
| TG-002 | Employee menu: attendance, leave, payslip, commission, referral, AI |
| TG-003 | Leave: new request, reschedule (shift swap not in menu) |
| TG-004 | Leader menu: approve leave, OT, team dashboard |
| TG-005 | Reschedule approval path hidden from leader menu (implementation gap) |
| TG-006 | Big Leader marketing overview requires root team assignment |
| TG-007 | Owner dashboard |
| TG-008 | Attendance confirm step |
| TG-009 | Payslip self-only |
| TG-010 | AI read-only, permission-gated |
| TG-011 | Marketing menus hidden when `MARKETING_ENABLED=false` |

### Examples

- Verified employee requests off-day leave → Big Leader approval (WF-L01).

### Exceptions

- AI permission gaps post-onboarding (implementation).

### Owner override rules

- HR revokes/resets Telegram identity.
```

### Change 23 (`replace`)

**REMOVED / REPLACED:**

```markdown
### Business rules

| Rule ID | Rule | Source |
|---------|------|--------|
| FN-001 | Marketing Net Profit formula (for commission base) — see COM-MKT-002 | KB |
| FN-002 | Promotion expense deducted only when Gross Profit > 500,000 THB | KB + RuleConfig |
| FN-003 | Company Head deduction: 40% of profit after expenses | RuleConfig |
| FN-004 | Admin commission pool: 2% of Net Profit | KB |
| FN-005 | Referral rewards paid through payroll cycle | Referral KB |
| FN-006 | Advance payment workflow: Direct Manager → Any Owner | Approval defaults |
| FN-007 | Deposit refunds: finance module `POST /finance/deposit-refunds` | Implementation |
| FN-008 | `POLICY_NOT_DOCUMENTED`: Company P&L reporting policy, expense approval authority for non-marketing finance | — |

### Examples

- Gross Profit ฿600,000 → promotion expense included in Net Profit deduction.
- Gross Profit ฿400,000 → promotion expense **not** deducted.

### Exceptions

- HR mode: marketing P&L inputs entered externally; not calculated in WorkHQ HR UI.

### Owner override rules

- Owner approves advances and commission adjustments.
- Owner configures commission RuleConfig thresholds.
```

**ADDED / REPLACED WITH:**

```markdown
| Rule ID | Rule |
|---------|------|
| FN-001 | Marketing Net Profit formula (COM-MKT-002) |
| FN-002 | Promotion expense if GP > 500,000 |
| FN-003 | Company Head deduction 40% |
| FN-004 | Admin commission 2% Net Profit |
| FN-005 | Referral via payroll (REF-001) |
| FN-006 | Advance: Owner approval; next-cycle recovery (PAY-005) |
| FN-007 | Deposit refunds via finance module; tied to PAY-004d/e/f |
| FN-008 | Deposit claims for losses (PAY-004c) |
| FN-009 | `POLICY_NOT_DOCUMENTED`: non-marketing expense approval |

### Examples

- Advance ฿10,000 approved → recovery line item next cycle.

### Exceptions

- HR mode: marketing P&L external.

### Owner override rules

- Owner approves advances, special bonuses, commission adjustments.
```

### Change 24 (`replace`)

**REMOVED / REPLACED:**

```markdown
### Business rules

| Rule ID | Rule | Source |
|---------|------|--------|
| CR-001 | Company handbook is official reference; all employees must study and comply | `handbook-welcome-culture` |
| CR-002 | Company investigates grievances within 14 business days; appeal to HR Director within 7 days | `handbook-grievance-process` |
| CR-003 | Company reserves confidentiality of complainant in grievance process | Handbook grievance |
| CR-004 | HR may override marketing commission ramp percentages | Marketing ramp KB |
| CR-005 | HR/Owner may override referral duplicate block (`overrideDuplicateBlock=true`) | Referral KB |
| CR-006 | Business rules must be configuration-driven; admin may change wired settings without code deploy | `HR_ROADMAP.md` principle |
| CR-007 | `POLICY_NOT_DOCUMENTED`: General "management reserves right to amend policy" clause, legal jurisdiction, data retention | — |

### Examples

- HR rejects duplicate referral but owner overrides with documented reason → referral may qualify.

### Exceptions

- Knowledge base advisory; runtime follows Settings Engine where wired.

### Owner override rules

- Owner has full settings write, permission write, and approval override capabilities within audit trail.
```

**ADDED / REPLACED WITH:**

```markdown
| Rule ID | Rule |
|---------|------|
| CR-001 | Handbook compliance required |
| CR-002 | Grievance: 14 business days investigation; 7-day appeal |
| CR-003 | Complainant confidentiality |
| CR-004 | HR may override marketing commission ramp |
| CR-005 | HR/Owner may override referral duplicate block |
| CR-006 | Business rules configuration-driven via Settings Engine |
| CR-007 | Management discretion on referral payment (REF-001b) |
| CR-008 | Deposit retention for documented losses (PAY-004c) |
| CR-009 | `LEGAL_REVIEW_REQUIRED` on gross misconduct (DISC-002) |
| CR-010 | `POLICY_NOT_DOCUMENTED`: legal jurisdiction, policy amendment clause |

### Examples

- Owner withholds referral payment despite 3 months tenure per KPI discretion (REF-001b).

### Exceptions

- KB advisory where superseded by POL-001A confirmed decisions.

### Owner override rules

- Owner: settings write, permission write, approval override, LEGAL_REVIEW_REQUIRED sign-off.
```

### Change 25 (`replace`)

**REMOVED / REPLACED:**

```markdown
| ID | Topic | Source A | Source B | Decision needed |
|----|-------|----------|----------|-----------------|
| C-001 | OT compensation rate | Handbook: 1.5×/2× hourly wage by day type | Settings: flat ฿50/hr | Which is authoritative for payroll? |
| C-002 | Leave reschedule forward date | KB: new start after original **end** date | Validator: new start after original **start** date | Align KB or validator |
| C-003 | Personal leave notice | Handbook: 1 day | Settings default: 7 days (unenforced) | Confirm and enforce one value |
| C-004 | Referral tenure threshold | KB: "3 months" (`three_months` condition) | Settings: 90 calendar days (not 91.32 legacy) | Confirm 90 days is the authoritative "3 months" definition |
| C-005 | monthlyOffDays config stores | `leave.rules.monthlyOffDays` | `admin_commission.normalLeaveAllowanceDays` | Single source of truth? |
| C-006 | Leave reschedule approver | KB: manager + HR | No default matrix entry | Define default approval chain |
```

**ADDED / REPLACED WITH:**

```markdown
| ID | Topic | Status |
|----|-------|--------|
| ~~C-001~~ | OT rate handbook vs flat ฿50 | **RESOLVED** — PAY-003 |
| ~~C-002~~ | Reschedule forward date | **RESOLVED** — LR-004 (`original_end`) |
| ~~C-004~~ | Referral 3 months vs 90 days | **RESOLVED** — REF-001 (3 months employment) |
| ~~C-005~~ | monthlyOffDays dual store | **RESOLVED interim** — LV-004 + COM-ADM-008 (sync required; unify later) |
| ~~C-006~~ | Reschedule approver | **RESOLVED** — LR-009 / WF-L03 |
| C-003 | General leave notice when enforcement ships | **OPEN** — personal leave 1 day confirmed (LV-002); off-day/sick/unpaid TBD |
```

### Change 26 (`replace`)

**REMOVED / REPLACED:**

```markdown
| Organization | Department structure, formal reporting hierarchy |
| Recruitment | Interview, offer, sourcing standards |
| Performance | Review cycle calendar, dimension weights as policy |
| Warnings | Warning 1/2/3 formal definitions and triggers |
| Resignation | Notice period, final pay rules, exit interview |
| Missing from work | Investigation and return-to-work procedure |
| Work shifts | Employee shift roster assignment (non-default) |
| Finance | Non-marketing expense approval policy |
| Legal | Jurisdiction, policy amendment process |
```

**ADDED / REPLACED WITH:**

```markdown
| Recruitment | RC-001 formal hiring stages |
| Performance | PF-006 review calendar/weights |
| Warnings | WS-003 Warning 1/2/3 definitions |
| Resignation | Notice period, resignation letter |
| Legal | CR-010 jurisdiction, amendment clause |
| Finance | FN-009 non-marketing expense approval |

---

## Appendix C — POL-001A confirmed decision register

| Decision ID | Title | Master policy rule IDs |
|-------------|-------|------------------------|
| ORG-001 | Organization structure | ORG-001–ORG-008 |
| EMP-001 | Employee model | EMP-001–EMP-005, BR-011 |
| EMP-002 | Probation | EMP-002, EMP-002a–c, PF-005, EL-002 |
| PAY-001 | Meal allowance | PAY-001–PAY-001i |
| PAY-002 | Leave bonus | PAY-002–PAY-002d, LV-004, LV-005 |
| PAY-003 | OT & missed meal/break | PAY-003–PAY-003c, ATT-006–007 |
| PAY-004 | Deposit | PAY-004–PAY-004g, RS-003–RS-005 |
| PAY-005 | Advance pay | PAY-005, PAY-005a, PR-009, WF-P01 |
| ATT-001 | Absence | ABS-001–ABS-005 |
| ATT-002 | Missing from work >15 min | ABS-006–ABS-007 |
| REF-001 | Referral program | REF-001–REF-001f |
| DISC-001 | Performance failure termination | DISC-001–DISC-001d, RS-007 |
| DISC-002 | Gross misconduct | DISC-002–DISC-002d, CR-009 |
| WF-001 | Salary adjustment | WF-001, WF-001a |
| WF-002 | Commission adjustment | WF-002, WF-002a |
| WF-003 | Special bonus | WF-003 |
| WF-004 | Deduction items | WF-004 |
| WF-005 | Personal data change | WF-005 |
| ASSET-001 | Asset register | ASSET-001–ASSET-001c |
| HOL-001 | Holiday policy | HOL-001–HOL-005 |
```



---

# WORKHQ_POLICY_IMPLEMENTATION_MATRIX.md


## Pass A — POL-000 enhancement (ops 2–5)

### Change 1 (`insert`)

**ADDED / REPLACED WITH:**

```markdown
**Predecessor:** POL-000 Discovery (complete)  
```

### Change 2 (`insert`)

**ADDED / REPLACED WITH:**

```markdown

---

## POL-000 discovery summary

Codebase analysis performed against canonical sources only. Key findings informing this matrix:

| Finding | Implication for policy |
|---------|------------------------|
| 23 KB articles in `company-policy-articles.ts` | Handbook + commission + referral + leave reschedule policy |
| Settings wired vs reserved (`LEAVE_SETTINGS.md`, etc.) | Matrix enforcement column reflects **wired** status only |
| No warning/disciplinary DB models | Sections 17–18: policy handbook-only |
| Shift swap API complete, Telegram handlers missing | Section 10: Partial Telegram |
| Emergency leave entitlement enforced on request | Section 8: Fully enforced (settings define rules) |
| Referral dual-path qualification in KB | Section 15 RF-004/RF-005: Complete policy |
| 6 unresolved policy conflicts | Appendix A in master policy; matrix notes reference C-00x |
| HR mode hides marketing surfaces | Commission marketing rows: Partial enforcement |

**Principle:** Where implementation conflicts with documented policy, policy wins. Gaps are backlog items POL-002+.
```

### Change 3 (`replace`)

**REMOVED / REPLACED:**

```markdown
### 15. Recruitment
```

**ADDED / REPLACED WITH:**

```markdown
### 15. Recruitment & Referral
```

### Change 4 (`replace`)

**REMOVED / REPLACED:**

```markdown
| RC-002 Pipeline system | Missing | Complete | Complete | Missing | Partial | Partial | Partially enforced | API-only; owner report read |
```

**ADDED / REPLACED WITH:**

```markdown
| RC-002 Pipeline system | Missing | Complete | Complete | Missing | Partial | Partial | Partially enforced | API-only |
| RF-001 Referral on qualify | Complete | Complete | Complete | Partial | Complete | Complete | Fully enforced | |
| RF-002 One reward per referred | Complete | Complete | Complete | Partial | Complete | Complete | Fully enforced | DB unique index |
| RF-003 No self-referral | Complete | Complete | Complete | Partial | Complete | Complete | Fully enforced | |
| RF-004 probation_pass path | Complete | Complete | Complete | Partial | Partial | Complete | Fully enforced | |
| RF-005 three_months path | Partial | Complete | Complete | Partial | Partial | Complete | Fully enforced | **C-004** 90 vs "3 months" label |
| RF-006 Terminated ineligible | Complete | Complete | Complete | Partial | Partial | Complete | Fully enforced | |
| RF-007 Reward ฿2,000 | Complete | Complete | Complete | Complete | Partial | Complete | Fully enforced | `referral.rules` |
| RF-008 Lifecycle states | Complete | Complete | Complete | Partial | Partial | Complete | Fully enforced | |
| RF-009 Duplicate check | Complete | Complete | Complete | Partial | Partial | Complete | Fully enforced | |
| RF-010 Payroll payout | Complete | Complete | Complete | Partial | Partial | Complete | Fully enforced | Next cycle |
| RF-011 Mark paid after item | Complete | Complete | Complete | Partial | N/A | Complete | Fully enforced | |
| RF-012 payoutMode one_time | Complete | Complete | Complete | Partial | N/A | Partial | Fully enforced | Only mode supported |
| RF override duplicate block | Complete | Complete | Complete | Partial | Partial | Complete | Fully enforced | Owner/HR flag |
```

### Change 5 (`replace`)

**REMOVED / REPLACED:**

```markdown
| Referral reward & qualification (settings path) | Referral KB + REF settings |
```

**ADDED / REPLACED WITH:**

```markdown
| Referral reward & qualification | RF-001–RF-011 | Settings + KB aligned |
```

### Change 6 (`replace`)

**REMOVED / REPLACED:**

```markdown
| **P0** | G-005 | Referral qualification dual-path vs 90-day | C-004 | Incorrect referral payouts |
```

**ADDED / REPLACED WITH:**

```markdown
| **P0** | G-005 | Referral 90-day vs "3 months" label | C-004, RF-E1 | Minor payout timing ambiguity |
```



## Pass B — POL-001A Discovery Delta (op 6 full rewrite)

### Change 1 (`replace`)

**REMOVED / REPLACED:**

```markdown
**Version:** 1.0  
```

**ADDED / REPLACED WITH:**

```markdown
**Version:** 1.1  
```

### Change 2 (`replace`)

**REMOVED / REPLACED:**

```markdown
**Predecessor:** POL-000 Discovery (complete)  
```

**ADDED / REPLACED WITH:**

```markdown
**Amendment:** POL-001A Discovery Delta Consolidation  
```

### Change 3 (`replace`)

**REMOVED / REPLACED:**

```markdown
## POL-000 discovery summary

Codebase analysis performed against canonical sources only. Key findings informing this matrix:

| Finding | Implication for policy |
|---------|------------------------|
| 23 KB articles in `company-policy-articles.ts` | Handbook + commission + referral + leave reschedule policy |
| Settings wired vs reserved (`LEAVE_SETTINGS.md`, etc.) | Matrix enforcement column reflects **wired** status only |
| No warning/disciplinary DB models | Sections 17–18: policy handbook-only |
| Shift swap API complete, Telegram handlers missing | Section 10: Partial Telegram |
| Emergency leave entitlement enforced on request | Section 8: Fully enforced (settings define rules) |
| Referral dual-path qualification in KB | Section 15 RF-004/RF-005: Complete policy |
| 6 unresolved policy conflicts | Appendix A in master policy; matrix notes reference C-00x |
| HR mode hides marketing surfaces | Commission marketing rows: Partial enforcement |

**Principle:** Where implementation conflicts with documented policy, policy wins. Gaps are backlog items POL-002+.
```

**ADDED / REPLACED WITH:**

```markdown
## POL-001A delta summary

Confirmed business decisions merged from POL-001A. Conflicts C-001, C-002, C-004, C-005 (interim), C-006 **closed**. C-003 partially open.

| Decision ID | Policy status after merge | Primary implementation gap |
|-------------|---------------------------|----------------------------|
| ORG-001 | Complete | No org chart UI; department/position not in employee schema |
| EMP-001 | Complete | `workCategory` exists; department enum missing |
| EMP-002 | Complete | Probation not gated on manager evaluation |
| PAY-001 | Complete | Meal logic mostly wired; absence exclusion missing |
| PAY-002 | Partial | Formula in code differs from `min(2, 4-used)` — verify `leave-bonus.service.ts` |
| PAY-003 | Complete | OT flat rate wired; missed meal/break item **missing** |
| PAY-004 | Partial | Deduction wired; deferral, loss claims, refund rules **missing** |
| PAY-005 | Partial | Advance API exists; Owner-only approver + auto-recovery **partial** |
| ABS-001 (ATT-001) | Complete | Penalties in settings; **not wired** to payroll |
| ABS-002 (ATT-002) | Complete | Labor-unit penalty **not implemented** |
| REF-001 | Complete | 3-month + discretion **partial** — code uses 90 days + dual path |
| DISC-001/002 | Complete | Termination settlement rules **not implemented** |
| WF-001–005 | Complete | Department-specific chains **not in** `approval-defaults.ts` |
| ASSET-001 | Partial | Backend API exists; no UI; not in exit checklist |
| HOL-001 | Complete | No public holiday system in code (correct); special dates **not configured** |
```

### Change 4 (`replace`)

**REMOVED / REPLACED:**

```markdown
| Policy Status | **Complete** = rule documented and intended behavior clear · **Partial** = documented but gaps/conflicts · **Missing** = not documented |
```

**ADDED / REPLACED WITH:**

```markdown
| Policy Status | **Complete** · **Partial** · **Missing** |
```

### Change 5 (`replace`)

**REMOVED / REPLACED:**

```markdown
### 1. Organization Structure

| Policy Rule | Policy Status | DB | API | UI | Telegram | Tests | Enforcement | Notes |
| ----------- | ------------- | -- | --- | -- | -------- | ----- | ----------- | ----- |
| ORG-001 Multi-company | Partial | Complete | Complete | Partial | N/A | Partial | Partially enforced | Company CRUD; no org chart UI |
| ORG-002 Team hierarchy | Partial | Complete | Complete | Missing | N/A | Partial | Partially enforced | Teams API only |
| ORG-003 roleLevel assignment | Partial | Complete | Complete | Partial | N/A | Partial | Partially enforced | Employee detail; not policy-governed |
| ORG-004 Marketing teams separate | Complete | Complete | Complete | Hidden | Hidden | Partial | Partially enforced | Hidden in HR mode |
| ORG-005 Handbook culture | Complete | Complete | Complete | Complete | Partial | Complete | Partially enforced | KB + RAG; advisory only |

---

### 2. Business Roles

| Policy Rule | Policy Status | DB | API | UI | Telegram | Tests | Enforcement | Notes |
| ----------- | ------------- | -- | --- | -- | -------- | ----- | ----------- | ----- |
| BR-001–007 Seven roles | Complete | Complete | Complete | Complete | Partial | Complete | Fully enforced | `/settings/permissions` |
| BR-008 Secretary aliases | Complete | Complete | Complete | Complete | N/A | Complete | Fully enforced | Documented |
| BR-009 roleLevel ≠ business role | Complete | Complete | Complete | Partial | Partial | Partial | Partially enforced | Telegram leader menu uses UserRole not roleLevel (UAT-005) |
| BR-010 Resolution order | Complete | Complete | Complete | Complete | Partial | Complete | Fully enforced | Audited overrides |
```

**ADDED / REPLACED WITH:**

```markdown
### 1. Organization Structure (ORG-001)

| Policy Rule | Policy Status | DB | API | UI | Telegram | Tests | Enforcement | Notes |
| ----------- | ------------- | -- | --- | -- | -------- | ----- | ----------- | ----- |
| ORG-001 Owner / two departments | Complete | Partial | Partial | Missing | N/A | Partial | Not enforced | No department entity |
| ORG-002 Admin: Secretary → Admin/HR/Finance | Complete | Missing | Missing | Missing | N/A | Missing | Not enforced | Policy only |
| ORG-003 Marketing: Big Leader → Sub Leader → Employee | Complete | Partial | Partial | Partial | Partial | Partial | Partially enforced | Teams + marketing teams |
| ORG-004 Secretary highest Admin authority | Complete | Partial | Partial | Partial | N/A | Partial | Partially enforced | Business role `secretary` |
| ORG-005 Big Leader highest Marketing authority | Complete | Partial | Partial | Partial | Partial | Partial | Partially enforced | |
| ORG-006 Multi-company assignments | Complete | Complete | Complete | Partial | N/A | Partial | Fully enforced | |
| ORG-007 Team hierarchy | Partial | Complete | Complete | Missing | N/A | Partial | Partially enforced | |
| ORG-008 Handbook culture | Complete | Complete | Complete | Complete | Partial | Complete | Partially enforced | KB advisory |

---

### 2. Business Roles & Employee Model (EMP-001, EMP-002)

| Policy Rule | Policy Status | DB | API | UI | Telegram | Tests | Enforcement | Notes |
| ----------- | ------------- | -- | --- | -- | -------- | ----- | ----------- | ----- |
| EMP-001 OFFICE / WFH category | Complete | Complete | Complete | Partial | Partial | Complete | Fully enforced | `workCategory` |
| EMP-002 Department enum | Complete | Missing | Missing | Missing | N/A | Missing | Not enforced | Marketing/Admin/HR/Finance |
| EMP-003 Position enum | Complete | Partial | Partial | Partial | Partial | Partial | Partially enforced | Maps to roleLevel + business role |
| EMP-004 Multi-company assignments | Complete | Complete | Complete | Partial | N/A | Partial | Fully enforced | |
| EMP-005 Category → meal eligibility | Complete | Complete | Complete | Partial | Partial | Complete | Fully enforced | PAY-001 |
| EMP-002 Probation manager evaluation | Complete | Partial | Partial | Partial | N/A | Partial | Not enforced | Not automatic; status transition manual |
| EMP-002a Full salary during probation | Complete | Complete | Complete | Complete | N/A | Complete | Fully enforced | |
| EMP-002b Off-days during probation | Complete | Complete | Complete | Partial | N/A | Partial | Partially enforced | |
| EMP-002c Commission during probation | Complete | Partial | Partial | Partial | N/A | Partial | Partially enforced | Department rules |
| BR-001–011 Access roles & department routing | Complete | Complete | Complete | Complete | Partial | Complete | Partially enforced | WF routing not wired |
```

### Change 6 (`replace`)

**REMOVED / REPLACED:**

```markdown
| AC-001 Deny-by-default salary | Complete | Complete | Complete | Complete | Complete | Complete | Fully enforced | `SalaryVisibilityPolicy` |
| AC-002–006 Salary matrix rows | Complete | Complete | Complete | Complete | Complete | Complete | Fully enforced | 403 on violation |
| AC-007–012 Telegram identity | Complete | Complete | Complete | Complete | Complete | Partial | Fully enforced | Guard on bot + AI tools |
| AC-010 Invite code path | Complete | Complete | Complete | Partial | Complete | Partial | Fully enforced | Optional flow |

---

### 4. Attendance
```

**ADDED / REPLACED WITH:**

```markdown
| AC-001–AC-012 | Complete | Complete | Complete | Complete | Complete | Complete | Fully enforced | Unchanged from v1.0 |
| AC-013 LEGAL_REVIEW_REQUIRED flag (DISC-002) | Complete | Missing | Missing | Missing | Missing | Missing | Not enforced | New |

---

### 4. Attendance & OT (PAY-003)
```

### Change 7 (`replace`)

**REMOVED / REPLACED:**

```markdown
| ATT-002 Grace 15 min | Complete | Complete | Complete | Complete | Complete | Complete | Fully enforced | `attendance.rules` |
| ATT-003 Late multiplier 2× | Complete | Complete | Complete | Complete | Complete | Complete | Fully enforced | |
| ATT-004 Break 60 min | Complete | Complete | Complete | Complete | Complete | Complete | Fully enforced | |
| ATT-005 Shift 09:00–21:00 | Complete | Complete | Complete | Complete | Complete | Complete | Fully enforced | |
| ATT-006–008 OT settings | Partial | Complete | Complete | Complete | Complete | Complete | Fully enforced | **CONFLICT C-001** with handbook OT rates |
| ATT-009 OT approval | Complete | Complete | Complete | Complete | Complete | Complete | Fully enforced | Workflow + Telegram |
| ATT-010 Disciplinary lateness | Complete | Missing | Missing | Missing | Missing | Missing | Not enforced | Handbook advisory only |
| ATT-011 Missing punch rules | Partial | Complete | Missing | Partial | Missing | Missing | Not enforced | Reserved settings |
| ATT-012 Absence thresholds | Partial | Complete | Missing | Partial | Missing | Missing | Not enforced | Reserved settings |
| Attendance correction workflow | Partial | Complete | Missing | Missing | Missing | Partial | Not enforced | DB + resolver; no create API |
```

**ADDED / REPLACED WITH:**

```markdown
| ATT-002–005 Late/break/shift | Complete | Complete | Complete | Complete | Complete | Complete | Fully enforced | |
| PAY-003 Approved OT ฿50/hr | Complete | Complete | Complete | Complete | Complete | Complete | Fully enforced | C-001 resolved |
| PAY-003a Missed meal/break ฿50/hr | Complete | Missing | Missing | Missing | Missing | Missing | Not enforced | **New item type needed** |
| PAY-003b Overrides handbook 1.5×/2× | Complete | Complete | Complete | Partial | N/A | Complete | Fully enforced | Policy doc |
| PAY-003c OT approval required | Complete | Complete | Complete | Complete | Complete | Complete | Fully enforced | |
| ATT-008–009 Missing punch / absence class | Partial | Complete | Missing | Partial | Missing | Missing | Not enforced | Reserved |
```

### Change 8 (`replace`)

**REMOVED / REPLACED:**

```markdown
| SH-001 Default shift times | Complete | Complete | Complete | Complete | Complete | Complete | Fully enforced | Via attendance rules |
| SH-002 Admin commission shift segments | Complete | Complete | Complete | Partial | Missing | Complete | Fully enforced | Day/Night in admin commission |
| SH-003 Leave shift swap | Partial | Complete | Complete | Complete | Missing | Missing | Partially enforced | API+web only; no Telegram |
| SH-004 Shift roster | Missing | Missing | Missing | Missing | Missing | Missing | Not enforced | POLICY_NOT_DOCUMENTED |

---

### 6. Missing From Work

| Policy Rule | Policy Status | DB | API | UI | Telegram | Tests | Enforcement | Notes |
| ----------- | ------------- | -- | --- | -- | -------- | ----- | ----------- | ----- |
| MFW-001 Constructive resignation | Complete | Missing | Missing | Missing | Missing | Missing | Not enforced | Handbook only |
| MFW-002 Absence penalties config | Partial | Complete | Missing | Partial | Missing | Missing | Not enforced | Stored in leave.rules |
| MFW-003 Penalties not wired | Partial | Complete | Missing | Partial | Missing | Missing | Not enforced | LEAVE_SETTINGS.md |
| MFW-004 Missing punch reserved | Partial | Complete | Missing | Partial | Missing | Missing | Not enforced | |

---

### 7. Leave Policy

| Policy Rule | Policy Status | DB | API | UI | Telegram | Tests | Enforcement | Notes |
| ----------- | ------------- | -- | --- | -- | -------- | ----- | ----------- | ----- |
| LV-001 Personal leave 3 days/yr | Complete | Complete | Complete | Complete | Complete | Complete | Partially enforced | Balances seeded; types vary by deploy |
| LV-002 Personal leave notice 1 day | Partial | Complete | Partial | Complete | Partial | Missing | Not enforced | **CONFLICT C-003** |
| LV-003 >3 days approval | Complete | Complete | Complete | Complete | Complete | Complete | Partially enforced | Workflow only |
| LV-004 Monthly off days 4 | Partial | Complete | Partial | Partial | N/A | Partial | Partially enforced | Leave bonus wired; admin commission separate config |
| LV-005 Min recommended off 2 | Complete | Complete | Missing | Partial | N/A | Missing | Not enforced | Advisory |
| LV-006–007 Unused off-day bonus | Complete | Complete | Complete | Complete | N/A | Complete | Fully enforced | Payroll leave bonus |
| LV-008–009 Sick certificate rules | Partial | Complete | Missing | Partial | Missing | Missing | Not enforced | Reserved |
| LV-010 Unpaid notice 7 days | Partial | Complete | Missing | Partial | Missing | Missing | Not enforced | Reserved |
| LV-011 No split full-day | Complete | Complete | Missing | Partial | Missing | Missing | Not enforced | No feature |
| LV-012 Consecutive leave penalty | Partial | Complete | Missing | Partial | Missing | Missing | Not enforced | Reserved |
```

**ADDED / REPLACED WITH:**

```markdown
| SH-001–SH-003 | Complete | Complete | Partial | Partial | Partial | Partial | Partially enforced | Unchanged |
| SH-004 HOL-001 no shift roster | Complete | N/A | N/A | N/A | N/A | N/A | Fully enforced | Work every day policy |

---

### 6. Missing From Work & Absence (ABS-001, ABS-002)

| Policy Rule | Policy Status | DB | API | UI | Telegram | Tests | Enforcement | Notes |
| ----------- | ------------- | -- | --- | -- | -------- | ----- | ----------- | ----- |
| ABS-001 Absence definition | Complete | Missing | Missing | Missing | Missing | Missing | Not enforced | Four-criteria rule |
| ABS-002–004 Role penalties 1k/2k/3k | Complete | Complete | Missing | Partial | Missing | Missing | Not enforced | In leave.rules; not wired |
| ABS-005 Constructive resignation | Complete | Missing | Missing | Missing | Missing | Missing | Not enforced | |
| ABS-006 Missing >15 min | Complete | Missing | Missing | Missing | Missing | Missing | Not enforced | **New rule** |
| ABS-007 2 labor units/hr round up | Complete | Missing | Missing | Missing | Missing | Missing | Not enforced | **New rule** |
| ABS-008 Missing punch reserved | Partial | Complete | Missing | Partial | Missing | Missing | Not enforced | |

---

### 7. Leave Policy (HOL-001, PAY-002)

| Policy Rule | Policy Status | DB | API | UI | Telegram | Tests | Enforcement | Notes |
| ----------- | ------------- | -- | --- | -- | -------- | ----- | ----------- | ----- |
| HOL-001 No public holiday system | Complete | Complete | Complete | Partial | N/A | Partial | Fully enforced | No holiday calendar |
| HOL-002 Work every day | Complete | Partial | Partial | Partial | N/A | Partial | Partially enforced | Policy |
| HOL-003 Monthly off-days substitute | Complete | Complete | Complete | Partial | Complete | Partial | Partially enforced | |
| HOL-004 Special holidays Dec 31 / Jan 1 | Complete | Missing | Missing | Missing | N/A | Missing | Not enforced | Not in system |
| HOL-005 Special holiday handling | Partial | Missing | Missing | Missing | N/A | Missing | Not enforced | |
| LV-001–LV-003 Personal leave | Complete | Complete | Complete | Complete | Complete | Partial | Partially enforced | |
| LV-002 Personal notice 1 day | Complete | Complete | Partial | Complete | Partial | Missing | Not enforced | C-003 partial |
| LV-004 Monthly off-days 4 | Complete | Complete | Partial | Partial | N/A | Partial | Partially enforced | PAY-002 |
| LV-005 Min usage 2 days | Complete | Complete | Missing | Partial | N/A | Missing | Not enforced | Advisory |
| PAY-002 Formula min(2, 4-used)×600 | Complete | Complete | Complete | Complete | N/A | Complete | Fully enforced | Verify cap logic |
| PAY-002d Owner override bonus | Complete | Complete | Complete | Complete | N/A | Complete | Fully enforced | |
| LV-006–LV-010 Sick/unpaid/consecutive | Partial | Complete | Partial | Partial | Partial | Partial | Not enforced | Reserved |
```

### Change 9 (`replace`)

**REMOVED / REPLACED:**

```markdown
| EL-001 Enabled flag | Complete | Complete | Complete | Complete | Partial | Complete | Fully enforced | |
| EL-002 Probation gate | Complete | Complete | Complete | Partial | Partial | Complete | Fully enforced | `validateEmergencyLeaveRequest` |
| EL-003 4 days/half-year | Complete | Complete | Complete | Partial | Partial | Complete | Fully enforced | Balance ensure |
| EL-004 New hire proration | Complete | Complete | Complete | Partial | Partial | Complete | Fully enforced | |
| EL-005 Balance validation | Complete | Complete | Complete | Partial | Partial | Complete | Fully enforced | |
| EL-006 Any Owner approval | Complete | Complete | Complete | Partial | Partial | Complete | Fully enforced | Default matrix |
| EL-007 Emergency reschedule HR | Partial | Complete | Complete | Partial | Complete | Partial | Partially enforced | isEmergency flag; approver matrix gap |
```

**ADDED / REPLACED WITH:**

```markdown
| EL-001–EL-007 | Complete | Complete | Complete | Partial | Partial | Complete | Fully enforced | EL-002 linked EMP-002 |
```

### Change 10 (`replace`)

**REMOVED / REPLACED:**

```markdown
| LR-001 Max 1 reschedule | Complete | Complete | Complete | Complete | Complete | Complete | Fully enforced | |
| LR-002 7-day notice | Complete | Complete | Complete | Complete | Complete | Complete | Fully enforced | |
| LR-003 Same duration | Complete | Complete | Complete | Complete | Complete | Complete | Fully enforced | |
| LR-004 Move forward | Partial | Complete | Complete | Complete | Complete | Complete | Fully enforced | **CONFLICT C-002** start vs end |
| LR-005 Reason ≥10 chars | Complete | Complete | Complete | Complete | Complete | Complete | Fully enforced | |
| LR-006 Approved only | Complete | Complete | Complete | Complete | Complete | Complete | Fully enforced | |
| LR-007 Auto-update on approve | Complete | Complete | Complete | Complete | Partial | Complete | Fully enforced | |
| LR-008 Emergency exception | Complete | Complete | Complete | Complete | Complete | Partial | Fully enforced | |
| Reschedule approval UX | Partial | Complete | Complete | Complete | Partial | Complete | Partially enforced | Telegram approver path hidden from menu (UAT-004) |
```

**ADDED / REPLACED WITH:**

```markdown
| LR-001–LR-008 | Complete | Complete | Complete | Complete | Complete | Complete | Fully enforced | |
| LR-004 new_start > original_end | Complete | Complete | Partial | Complete | Complete | Partial | Partially enforced | **Code uses original_start — fix POL-010** |
| LR-009 Big Leader → Secretary | Complete | Complete | Partial | Complete | Partial | Partial | Not enforced | **Not in DEFAULT_MATRICES — POL-011** |
```

### Change 11 (`replace`)

**REMOVED / REPLACED:**

```markdown
| LS-001 Equal duration swap | Complete | Complete | Complete | Complete | Missing | Missing | Partially enforced | |
| LS-002 Same company | Complete | Complete | Complete | Complete | Missing | Missing | Fully enforced | Validator |
| LS-003 No self-swap | Complete | Complete | Complete | Complete | Missing | Missing | Fully enforced | |
| LS-004 7-day notice | Complete | Complete | Complete | Complete | Missing | Missing | Fully enforced | |
| LS-005 Partner consent | Complete | Complete | Complete | Complete | Missing | Missing | Fully enforced | Partner agree API |
| LS-006 Management approval | Complete | Complete | Complete | Complete | Missing | Missing | Fully enforced | Workflow |
| LS-007 Workflow sequence | Complete | Complete | Complete | Complete | Missing | Missing | Partially enforced | No integration test (UAT-020) |

---

### 11. Payroll

| Policy Rule | Policy Status | DB | API | UI | Telegram | Tests | Enforcement | Notes |
| ----------- | ------------- | -- | --- | -- | -------- | ----- | ----------- | ----- |
| PR-001 Cycle 25th–24th | Complete | Complete | Complete | Complete | Partial | Complete | Fully enforced | |
| PR-002 Payslip self-service | Complete | Complete | Complete | Complete | Complete | Complete | Fully enforced | Salary policy guarded |
| PR-003 Cycle lifecycle | Complete | Complete | Complete | Complete | N/A | Complete | Fully enforced | |
| PR-004 Salary proration | Complete | Complete | Complete | Complete | N/A | Complete | Fully enforced | |
| PR-005 Payroll builder | Complete | Complete | Complete | Complete | N/A | Complete | Fully enforced | |
| PR-006 Late deductions | Complete | Complete | Complete | Complete | N/A | Complete | Fully enforced | |
| PR-007–009 Manual commission | Complete | Complete | Complete | Partial | Partial | Complete | Fully enforced | HR mode path |
| PR-010 Pay day / currency | Missing | Missing | Missing | Missing | Missing | Missing | Not enforced | POLICY_NOT_DOCUMENTED |

---

### 12. Meal Allowance

| Policy Rule | Policy Status | DB | API | UI | Telegram | Tests | Enforcement | Notes |
| ----------- | ------------- | -- | --- | -- | -------- | ----- | ----------- | ----- |
| MA-001 Rate ฿100/day | Complete | Complete | Complete | Partial | Partial | Complete | Fully enforced | Generic payroll settings |
| MA-002 Office only | Complete | Complete | Complete | Partial | Partial | Complete | Fully enforced | workCategory |
| MA-003 Eligible days formula | Complete | Complete | Complete | Partial | Partial | Complete | Fully enforced | Cap 4 off-days |
| MA-004 Ineligible leave types | Complete | Complete | Complete | Partial | Partial | Complete | Fully enforced | sick/emergency/unpaid |
| MA-005 Calculation | Complete | Complete | Complete | Partial | Partial | Complete | Fully enforced | |

---

### 13. Deposit

| Policy Rule | Policy Status | DB | API | UI | Telegram | Tests | Enforcement | Notes |
| ----------- | ------------- | -- | --- | -- | -------- | ----- | ----------- | ----- |
| DP-001 Enabled | Complete | Complete | Complete | Complete | Missing | Complete | Fully enforced | |
| DP-002 ฿500/month | Complete | Complete | Complete | Complete | Missing | Complete | Fully enforced | |
| DP-003 Cap ฿3,000 | Complete | Complete | Complete | Complete | Missing | Complete | Fully enforced | |
| DP-004 Cap enforcement | Complete | Complete | Complete | Complete | Missing | Partial | Fully enforced | |
| DP-005 Item type deposit | Complete | Complete | Complete | Complete | Missing | Complete | Fully enforced | |
| DP-006 Refund on resignation | Partial | Complete | Partial | Partial | Missing | Missing | Not enforced | Reserved setting |
| DP-007 Partial refund | Partial | Complete | Partial | Partial | Missing | Missing | Partially enforced | Finance API separate |
| DP-008 Refund approval | Partial | Complete | Partial | Partial | Missing | Missing | Partially enforced | Workflow exists; not wired to settings |
```

**ADDED / REPLACED WITH:**

```markdown
| LS-001–LS-007 | Complete | Complete | Complete | Complete | Missing | Missing | Partially enforced | WF-L03 approval gap |

---

### 11. Payroll (PAY-005)

| Policy Rule | Policy Status | DB | API | UI | Telegram | Tests | Enforcement | Notes |
| ----------- | ------------- | -- | --- | -- | -------- | ----- | ----------- | ----- |
| PR-001–PR-008 | Complete | Complete | Complete | Complete | Partial | Complete | Fully enforced | |
| PAY-005 Advance Owner approver | Complete | Complete | Partial | Partial | Missing | Partial | Partially enforced | Default matrix: DM→Owner |
| PAY-005a Auto recovery next cycle | Complete | Partial | Partial | Partial | Missing | Partial | Partially enforced | |

---

### 12. Meal Allowance (PAY-001)

| Policy Rule | Policy Status | DB | API | UI | Telegram | Tests | Enforcement | Notes |
| ----------- | ------------- | -- | --- | -- | -------- | ----- | ----------- | ----- |
| PAY-001 Rate ฿100/day | Complete | Complete | Complete | Partial | Partial | Complete | Fully enforced | |
| PAY-001a Working day eligible | Complete | Complete | Complete | Partial | Partial | Complete | Fully enforced | |
| PAY-001b Approved off-day eligible | Complete | Complete | Complete | Partial | Partial | Complete | Fully enforced | |
| PAY-001c–e Sick/emergency/unpaid ineligible | Complete | Complete | Complete | Partial | Partial | Complete | Fully enforced | |
| PAY-001f Absence ineligible | Complete | Complete | Missing | Partial | Missing | Missing | Not enforced | **Gap** |
| PAY-001g OFFICE eligible | Complete | Complete | Complete | Partial | Partial | Complete | Fully enforced | |
| PAY-001h WFH ineligible | Complete | Complete | Complete | Partial | Partial | Complete | Fully enforced | |

---

### 13. Deposit (PAY-004)

| Policy Rule | Policy Status | DB | API | UI | Telegram | Tests | Enforcement | Notes |
| ----------- | ------------- | -- | --- | -- | -------- | ----- | ----------- | ----- |
| PAY-004 ฿500/month cap ฿3,000 | Complete | Complete | Complete | Complete | Missing | Complete | Fully enforced | |
| PAY-004b Defer if payroll too small | Complete | Missing | Missing | Missing | Missing | Missing | Not enforced | **New rule** |
| PAY-004c Deposit for losses | Complete | Partial | Partial | Partial | Missing | Missing | Not enforced | Finance partial |
| PAY-004d Proper resignation full refund | Complete | Complete | Partial | Partial | Missing | Missing | Not enforced | |
| PAY-004e Absconding no refund | Complete | Missing | Missing | Missing | Missing | Missing | Not enforced | |
| PAY-004f Gross misconduct no refund | Complete | Missing | Missing | Missing | Missing | Missing | Not enforced | DISC-002 |
```

### Change 12 (`replace`)

**REMOVED / REPLACED:**

```markdown
| COM-MKT-001–012 Marketing rules | Complete | Complete | Complete | Hidden | Partial | Complete | Partially enforced | Hidden in HR mode; calc exists |
| COM-MKT-HOLD Hold status | Complete | Complete | Complete | Hidden | Partial | Complete | Fully enforced | |
| COM-MKT-CF Carry forward | Complete | Complete | Complete | Hidden | N/A | Complete | Fully enforced | |
| COM-ADM-001–011 Admin rules | Complete | Complete | Complete | Complete | Partial | Complete | Fully enforced | Admin commission active in HR |
| HR ramp override | Complete | Complete | Complete | Complete | N/A | Partial | Partially enforced | KB policy; UI in rule config |
| Manual commission (HR mode) | Complete | Complete | Complete | Partial | Partial | Complete | Fully enforced | Primary HR payment path |

---

### 15. Recruitment & Referral

| Policy Rule | Policy Status | DB | API | UI | Telegram | Tests | Enforcement | Notes |
| ----------- | ------------- | -- | --- | -- | -------- | ----- | ----------- | ----- |
| RC-001 Recruitment policy | Missing | N/A | N/A | N/A | N/A | N/A | Not enforced | POLICY_NOT_DOCUMENTED |
| RC-002 Pipeline system | Missing | Complete | Complete | Missing | Partial | Partial | Partially enforced | API-only |
| RF-001 Referral on qualify | Complete | Complete | Complete | Partial | Complete | Complete | Fully enforced | |
| RF-002 One reward per referred | Complete | Complete | Complete | Partial | Complete | Complete | Fully enforced | DB unique index |
| RF-003 No self-referral | Complete | Complete | Complete | Partial | Complete | Complete | Fully enforced | |
| RF-004 probation_pass path | Complete | Complete | Complete | Partial | Partial | Complete | Fully enforced | |
| RF-005 three_months path | Partial | Complete | Complete | Partial | Partial | Complete | Fully enforced | **C-004** 90 vs "3 months" label |
| RF-006 Terminated ineligible | Complete | Complete | Complete | Partial | Partial | Complete | Fully enforced | |
| RF-007 Reward ฿2,000 | Complete | Complete | Complete | Complete | Partial | Complete | Fully enforced | `referral.rules` |
| RF-008 Lifecycle states | Complete | Complete | Complete | Partial | Partial | Complete | Fully enforced | |
| RF-009 Duplicate check | Complete | Complete | Complete | Partial | Partial | Complete | Fully enforced | |
| RF-010 Payroll payout | Complete | Complete | Complete | Partial | Partial | Complete | Fully enforced | Next cycle |
| RF-011 Mark paid after item | Complete | Complete | Complete | Partial | N/A | Complete | Fully enforced | |
| RF-012 payoutMode one_time | Complete | Complete | Complete | Partial | N/A | Partial | Fully enforced | Only mode supported |
| RF override duplicate block | Complete | Complete | Complete | Partial | Partial | Complete | Fully enforced | Owner/HR flag |
```

**ADDED / REPLACED WITH:**

```markdown
| COM-MKT-* | Complete | Complete | Complete | Hidden | Partial | Complete | Partially enforced | HR mode |
| COM-ADM-* | Complete | Complete | Complete | Complete | Partial | Complete | Fully enforced | |
| EMP-002c Probation commission | Complete | Partial | Partial | Partial | N/A | Partial | Partially enforced | |

---

### 15. Recruitment & Referral (REF-001)

| Policy Rule | Policy Status | DB | API | UI | Telegram | Tests | Enforcement | Notes |
| ----------- | ------------- | -- | --- | -- | -------- | ----- | ----------- | ----- |
| RC-001 | Missing | N/A | N/A | N/A | N/A | N/A | Not enforced | |
| RC-002 | Missing | Complete | Complete | Missing | Partial | Partial | Partially enforced | |
| REF-001 Reward ฿2,000 | Complete | Complete | Complete | Partial | Complete | Complete | Fully enforced | |
| REF-001a 3 months employment | Complete | Complete | Partial | Partial | Partial | Complete | Partially enforced | Code: 90 days — **align POL-025** |
| REF-001b KPI/management discretion | Complete | Missing | Missing | Missing | Missing | Missing | Not enforced | **New gate needed** |
| REF-001c–f Lifecycle/duplicate/payout | Complete | Complete | Complete | Partial | Partial | Complete | Fully enforced | |
```

### Change 13 (`replace`)

**REMOVED / REPLACED:**

```markdown
| PF-001 Grade thresholds | Partial | Complete | Complete | Missing | Missing | Partial | Partially enforced | Hardcoded in scoring service |
| PF-002–004 Scoring dimensions | Partial | Complete | Complete | Missing | Missing | Partial | Partially enforced | API-only |
| PF-005 Review types 360 | Missing | Partial | Partial | Missing | Missing | Missing | Not enforced | HR-17 planned |
| PF-006 Review cycle policy | Missing | Missing | Missing | Missing | Missing | Missing | Not enforced | POLICY_NOT_DOCUMENTED |

---

### 17. Disciplinary Policy

| Policy Rule | Policy Status | DB | API | UI | Telegram | Tests | Enforcement | Notes |
| ----------- | ------------- | -- | --- | -- | -------- | ----- | ----------- | ----- |
| DP-001–003 Conduct rules | Complete | Complete | Partial | Partial | Partial | Missing | Not enforced | KB advisory |
| DP-004 Investigation procedure | Missing | Missing | Missing | Missing | Missing | Missing | Not enforced | POLICY_NOT_DOCUMENTED |
```

**ADDED / REPLACED WITH:**

```markdown
| PF-001–PF-004 | Partial | Complete | Complete | Missing | Missing | Partial | Partially enforced | |
| PF-005 Probation evaluation link | Complete | Partial | Partial | Missing | Missing | Partial | Not enforced | EMP-002 |
| PF-006 | Missing | Missing | Missing | Missing | Missing | Missing | Not enforced | |

---

### 17. Disciplinary (DISC-001, DISC-002)

| Policy Rule | Policy Status | DB | API | UI | Telegram | Tests | Enforcement | Notes |
| ----------- | ------------- | -- | --- | -- | -------- | ----- | ----------- | ----- |
| DISC-003–005 Conduct | Complete | Complete | Partial | Partial | Partial | Missing | Not enforced | Handbook |
| DISC-001 Performance failure settlement | Complete | Missing | Missing | Missing | Missing | Missing | Not enforced | **New termination type** |
| DISC-002 Gross misconduct | Complete | Missing | Missing | Missing | Missing | Missing | Not enforced | **New termination type** |
| DISC-002d LEGAL_REVIEW_REQUIRED | Complete | Missing | Missing | Missing | Missing | Missing | Not enforced | |
```

### Change 14 (`replace`)

**REMOVED / REPLACED:**

```markdown
| WS-001 Handbook escalation | Complete | Missing | Missing | Missing | Missing | Missing | Not enforced | Manual process |
| WS-002 Warning 1/2/3 system | Missing | Missing | Missing | Missing | Missing | Missing | Not enforced | HR-14 planned |
| WS-003 Escalation triggers | Missing | Missing | Missing | Missing | Missing | Missing | Not enforced | POLICY_NOT_DOCUMENTED |

---

### 19. Resignation

| Policy Rule | Policy Status | DB | API | UI | Telegram | Tests | Enforcement | Notes |
| ----------- | ------------- | -- | --- | -- | -------- | ----- | ----------- | ----- |
| RS-001 Constructive resignation | Complete | Missing | Missing | Missing | Missing | Missing | Not enforced | Handbook |
| RS-002 Commission forfeiture | Complete | Complete | Complete | Partial | Partial | Complete | Fully enforced | Admin commission calc |
| RS-003 Deposit refund on exit | Partial | Complete | Partial | Partial | Missing | Missing | Not enforced | Reserved |
| RS-004 Exit checklist | Missing | Partial | Partial | Missing | Missing | Missing | Not enforced | HR-16 planned |
| RS-005 Terminate API | Partial | Complete | Complete | Partial | Missing | Partial | Partially enforced | No orchestrated exit |

---

### 20. Approval Matrix

| Policy Rule | Policy Status | DB | API | UI | Telegram | Tests | Enforcement | Notes |
| ----------- | ------------- | -- | --- | -- | -------- | ----- | ----------- | ----- |
| AM leave/OT defaults | Complete | Complete | Complete | Complete | Complete | Complete | Fully enforced | |
| AM payroll/commission adj | Complete | Complete | Complete | Complete | Partial | Complete | Fully enforced | |
| AM admin requester override | Complete | Complete | Complete | Complete | Partial | Complete | Fully enforced | |
| AM leave_reschedule default | Partial | Complete | Complete | Complete | Partial | Complete | Partially enforced | Not in DEFAULT_MATRICES |
| AM leave_shift_swap default | Partial | Complete | Complete | Complete | Missing | Missing | Partially enforced | Fixture uses owner |
| AM delegation | Complete | Complete | Complete | Complete | Partial | Complete | Fully enforced | |

---

### 21. Telegram Self-Service

| Policy Rule | Policy Status | DB | API | UI | Telegram | Tests | Enforcement | Notes |
| ----------- | ------------- | -- | --- | -- | -------- | ----- | ----------- | ----- |
| TG-001 Identity gate | Complete | Complete | Complete | Complete | Complete | Partial | Fully enforced | |
| TG-002 Employee menu | Complete | N/A | Complete | N/A | Complete | Partial | Fully enforced | |
| TG-003 Leave + reschedule | Complete | N/A | Complete | N/A | Partial | Partial | Partially enforced | No shift swap |
| TG-004 Leader menu | Complete | N/A | Complete | N/A | Partial | Partial | Partially enforced | Missing reschedule approval entry |
| TG-005 Hidden reschedule approval | Partial | N/A | Complete | N/A | Partial | Partial | Partially enforced | UAT-004 |
| TG-006 Big leader menu | Partial | N/A | Complete | N/A | Partial | Partial | Partially enforced | Requires DB assignment |
| TG-007 Owner dashboard | Complete | N/A | Complete | N/A | Complete | Partial | Partially enforced | |
| TG-008 Attendance confirm | Complete | N/A | Complete | N/A | Complete | Missing | Fully enforced | |
| TG-009 Payslip self-only | Complete | N/A | Complete | N/A | Complete | Partial | Fully enforced | |
| TG-010 AI read-only | Complete | N/A | Complete | N/A | Complete | Partial | Partially enforced | Permission gaps UAT-002 |
| TG-011 HR mode marketing hidden | Complete | N/A | Complete | N/A | Complete | Partial | Fully enforced | Feature flag |

---

### 22. Finance & P&L

| Policy Rule | Policy Status | DB | API | UI | Telegram | Tests | Enforcement | Notes |
| ----------- | ------------- | -- | --- | -- | -------- | ----- | ----------- | ----- |
| FN-001–004 Commission P&L formula | Complete | Complete | Complete | Hidden | N/A | Complete | Partially enforced | Marketing calc hidden HR mode |
| FN-005 Referral payroll pay | Complete | Complete | Complete | Partial | Partial | Complete | Fully enforced | |
| FN-006 Advance approval | Complete | Complete | Partial | Partial | Missing | Partial | Partially enforced | |
| FN-007 Deposit refunds | Partial | Complete | Complete | Partial | Missing | Partial | Partially enforced | |
| FN-008 Non-marketing finance policy | Missing | Partial | Partial | Partial | Missing | Missing | Not enforced | POLICY_NOT_DOCUMENTED |

---

### 23. Company Reserved Rights

| Policy Rule | Policy Status | DB | API | UI | Telegram | Tests | Enforcement | Notes |
| ----------- | ------------- | -- | --- | -- | -------- | ----- | ----------- | ----- |
| CR-001 Handbook compliance | Complete | Complete | Complete | Complete | Partial | Complete | Partially enforced | Advisory KB |
| CR-002 Grievance 14/7 days | Complete | Missing | Missing | Partial | Partial | Missing | Not enforced | Handbook only |
| CR-003 Complainant confidentiality | Complete | Missing | Missing | Missing | Missing | Missing | Not enforced | Process not in system |
| CR-004 Ramp override | Complete | Complete | Complete | Complete | N/A | Partial | Partially enforced | Rule config |
| CR-005 Referral duplicate override | Complete | Complete | Complete | Partial | Partial | Complete | Fully enforced | API flag |
| CR-006 Config-driven rules | Partial | Complete | Complete | Complete | Partial | Complete | Partially enforced | Many reserved keys remain |
| CR-007 Legal/amendment clause | Missing | Missing | Missing | Missing | Missing | Missing | Not enforced | POLICY_NOT_DOCUMENTED |
```

**ADDED / REPLACED WITH:**

```markdown
| WS-001–WS-003 | Partial | Missing | Missing | Missing | Missing | Missing | Not enforced | Unchanged |

---

### 19. Resignation & Assets (ASSET-001)

| Policy Rule | Policy Status | DB | API | UI | Telegram | Tests | Enforcement | Notes |
| ----------- | ------------- | -- | --- | -- | -------- | ----- | ----------- | ----- |
| RS-001–RS-007 | Complete | Partial | Partial | Partial | Missing | Partial | Partially enforced | |
| ASSET-001 Asset register | Complete | Complete | Complete | Missing | Missing | Partial | Partially enforced | API only |
| ASSET-001a Types notebook/phone/SIM/card/keys | Complete | Partial | Partial | Missing | Missing | Partial | Partially enforced | |
| ASSET-001b Employee list + company register | Complete | Complete | Partial | Missing | Missing | Partial | Partially enforced | |
| ASSET-001c Used in resignation/deposit review | Complete | Partial | Partial | Missing | Missing | Missing | Not enforced | Exit checklist missing |

---

### 20. Approval Matrix (WF-001–005)

| Policy Rule | Policy Status | DB | API | UI | Telegram | Tests | Enforcement | Notes |
| ----------- | ------------- | -- | --- | -- | -------- | ----- | ----------- | ----- |
| WF-001 Marketing salary Big Leader→Owner | Complete | Complete | Partial | Complete | Partial | Partial | Not enforced | **Replace Secretary→Owner default** |
| WF-001a Admin salary Secretary→Owner | Complete | Complete | Partial | Complete | Partial | Partial | Partially enforced | Close to current |
| WF-002 Marketing commission Big Leader→Owner | Complete | Complete | Partial | Complete | Partial | Partial | Not enforced | |
| WF-002a Admin commission Secretary→Owner | Complete | Complete | Partial | Complete | Partial | Partial | Partially enforced | |
| WF-003 Special bonus → Owner | Complete | Partial | Partial | Missing | Missing | Missing | Not enforced | **New workflow type** |
| WF-004 Deduction no approval | Complete | Partial | Partial | Partial | Missing | Partial | Partially enforced | Manual payroll items |
| WF-005 Personal data dept manager | Complete | Complete | Partial | Complete | Partial | Partial | Partially enforced | Default Secretary only |
| WF-L03 Reschedule Big Leader→Secretary | Complete | Complete | Partial | Complete | Partial | Partial | Not enforced | POL-011 |
| WF-P01 Advance Owner only | Complete | Complete | Partial | Partial | Missing | Partial | Not enforced | **Replace DM→Owner** |
| AM-001–AM-003 | Complete | Complete | Complete | Complete | Partial | Complete | Partially enforced | |

---

### 21–23. Telegram, Finance, Reserved Rights

| Section | Policy Status | Primary gap |
|---------|---------------|-------------|
| Telegram (TG-001–011) | Partial | TG-005 reschedule menu; permission gaps |
| Finance (FN-001–FN-009) | Partial | PAY-004c losses; PAY-005 recovery |
| Reserved Rights (CR-001–CR-010) | Partial | CR-009 LEGAL_REVIEW flag; CR-007 referral discretion |
```

### Change 15 (`delete`)

**REMOVED / REPLACED:**

```markdown

Rules with policy documentation **Complete**, implementation **Complete or Partial across all required channels**, and **Fully enforced**:
```

### Change 16 (`replace`)

**REMOVED / REPLACED:**

```markdown
| Access control / salary visibility | AC-001–AC-012 |
| Meal allowance | MA-001–MA-005 |
| Emergency leave entitlement & validation | EL-001–EL-006 |
| Leave reschedule validation | LR-001–LR-003, LR-005–LR-008 |
| Deposit deduction (monthly/cap) | DP-001–DP-005 |
| Admin commission calculation | COM-ADM-001–011 |
| Referral reward & qualification | RF-001–RF-011 | Settings + KB aligned |
| Telegram identity gate | AC-007–AC-012, TG-001 |
| Core attendance check-in/out/break | ATT-001–ATT-005 |
| OT workflow approval | ATT-009 |
| Payroll cycle & payslip (core) | PR-001–PR-006 |
| Manual commission entry (HR mode) | PR-007–PR-009 |

---
```

**ADDED / REPLACED WITH:**

```markdown
| Access control | AC-001–AC-012 |
| OT flat rate (PAY-003) | PAY-003, PAY-003b, PAY-003c |
| Meal allowance core (PAY-001) | PAY-001, PAY-001a–e, PAY-001g–h |
| Leave bonus formula (PAY-002) | PAY-002, PAY-002a–c |
| Deposit deduction (PAY-004 base) | PAY-004, PAY-004g |
| Emergency leave | EL-001–EL-006 |
| Leave reschedule validation (except LR-004/LR-009) | LR-001–LR-003, LR-005–LR-008 |
| Admin commission | COM-ADM-* |
| Telegram identity | AC-007–012, TG-001 |
| Core attendance | ATT-001–005 |
| Payroll cycle | PR-001–PR-006 |
| OFFICE/WFH category | EMP-001, PAY-001g–h |
| No public holidays | HOL-001 |
```

### Change 17 (`replace`)

**REMOVED / REPLACED:**

```markdown
| Rule area | Gap summary |
|-----------|-------------|
| OT compensation rate | Settings enforce flat rate; handbook policy differs (C-001) |
| Personal leave notice | Documented 1 day; not validated on submit (C-003) |
| Leave swap | API + web complete; Telegram + tests missing |
| Leave reschedule approval UX | Backend complete; Telegram menu hides approver path |
| Sick/unpaid leave certificate rules | Settings exist; not enforced |
| Consecutive leave penalty | Settings exist; not implemented |
| Absence penalties | Settings exist; not wired to payroll |
| Missing punch / absence classification | Reserved attendance settings |
| Deposit refund on resignation | Settings reserved; exit workflow incomplete |
| Performance reviews | API + scoring exist; no UI, config not in settings |
| Recruitment | API exists; no policy doc, no UI |
| Telegram AI self-service permissions | Menus expose features; default permissions insufficient (UAT-002) |
| Leader detection on Telegram | UserRole vs marketing team mismatch (UAT-005) |
| Marketing commission (HR mode) | Full stack exists but hidden; manual entry is HR path |
| Grievance process timelines | Handbook only; no case management |
| Constructive resignation | Handbook only; no workflow |
| Approval matrix for reschedule/swap | Entity types exist; no production default seed |

---
```

**ADDED / REPLACED WITH:**

```markdown
| Rule area | Gap |
|-----------|-----|
| Organization ORG-001 | Policy complete; no department model |
| Employee department/position EMP-002 | Policy complete; schema partial |
| Probation evaluation EMP-002 | Not gated on manager sign-off |
| Missed meal/break PAY-003a | Policy complete; no payroll item |
| Absence ABS-001–004 | Policy complete; not wired to payroll |
| Missing >15 min ABS-006–007 | Policy complete; not implemented |
| Deposit deferral/refund rules PAY-004b–f | Policy complete; not implemented |
| Referral 3 months + discretion REF-001 | Code uses 90 days; no KPI gate |
| Termination types DISC-001/002 | Policy complete; no settlement engine |
| Workflow WF-001–005 | Policy complete; defaults wrong/missing |
| Reschedule LR-004/LR-009 | Validator + matrix gaps |
| Asset register ASSET-001 | API only; no exit integration |
| Special holidays HOL-004 | Not configured |
| Meal absence exclusion PAY-001f | Not enforced |
| Advance PAY-005 | Wrong approver chain |
```

### Change 18 (`replace`)

**REMOVED / REPLACED:**

```markdown
No confirmed business rule in authoritative sources:

| Domain | Items |
```

**ADDED / REPLACED WITH:**

```markdown
| Domain | Rules |
```

### Change 19 (`replace`)

**REMOVED / REPLACED:**

```markdown
| Recruitment | RC-001 formal hiring policy |
| Performance | PF-006 review calendar/weights as policy |
| Warnings | WS-003 formal Warning 1/2/3 definitions |
| Resignation | Notice period, final pay timing, exit interview |
| Missing from work | Investigation and RTW procedure |
| Work shifts | Employee shift roster (beyond default times) |
| Finance | Non-marketing expense approval standards |
| Legal | Jurisdiction, policy amendment clause |
| Organization | Formal org chart / department policy |

---
```

**ADDED / REPLACED WITH:**

```markdown
| Recruitment | RC-001 |
| Performance calendar | PF-006 |
| Warnings | WS-003 |
| Resignation notice | RS notice period |
| Legal | CR-010 |
| Finance expenses | FN-009 |
```

### Change 20 (`replace`)

**REMOVED / REPLACED:**

```markdown
| Rule | Implementation | Why not enforced |
|------|----------------|------------------|
| ATT-010 Disciplinary lateness | Handbook | No disciplinary module |
| ATT-011–012 Missing punch / absence class | Settings + schema | Reserved keys |
| MFW-001 Constructive resignation | Handbook | Manual HR only |
| MFW-002–003 Absence fines | leave.rules | Not wired to payroll |
| LV-002 Personal leave notice | Settings default | No request validator |
| LV-008–010 Sick/unpaid rules | leave.rules | Reserved |
| LV-011 Split leave | Setting false | No feature |
| LV-012 Consecutive penalty | leave.rules | Not implemented |
| WS-001–003 Warning system | Handbook / HR-14 plan | No WarningCase model |
| CR-002–003 Grievance SLA | Handbook | No grievance case API |
| DP-006–008 Deposit refund flags | deposit.rules | Reserved / partial finance |
| PF-001 Grades | scoring.service | Not connected to HR process |
| Attendance correction | DB + workflow resolver | No create API/UI |

---
```

**ADDED / REPLACED WITH:**

```markdown
| Rule | Why |
|------|-----|
| ABS-001–004 | Penalties not wired |
| ABS-006–007 | Labor units not implemented |
| REF-001b | No KPI/discretion gate |
| DISC-001/002 | No termination settlement |
| PAY-004b–f | Deferral/refund rules |
| PAY-003a | No missed break item |
| PAY-001f | Absence not excluded from meal |
| WF-001–003, WF-P01 | Wrong/missing approval defaults |
| LR-004 | Validator uses wrong date |
| HOL-004 | Special dates not in system |
```

### Change 21 (`replace`)

**REMOVED / REPLACED:**

```markdown
| Area | Implementation | Test gap |
|------|----------------|----------|
| Leave shift swap | Full API + workflow | Zero integration tests (UAT-020) |
| Recruitment | Full API | Unit only; no integration |
| Performance reviews | Full API | Unit scoring only |
| Telegram check-in/out | Bot handlers | Not in integration suite |
| Telegram shift swap | States declared | No handlers |
| Deposit refund workflow | Finance API | Limited integration |
| Attendance correction | Resolution handler | No create flow tests |
| Grievance / warnings / exit | N/A | No implementation |
| Leader menu permission alignment | Bot service | Manual UAT only |

---

## Part D — Priority Ranking

All gaps ranked by business risk. **P0** = Payroll / Legal / Money Risk.
```

**ADDED / REPLACED WITH:**

```markdown
| Area | Gap |
|------|-----|
| Shift swap | No integration tests |
| ABS-006–007 | No tests |
| DISC-001/002 settlement | No tests |
| WF department routing | No tests |
| PAY-003a missed break | No tests |
| REF-001b discretion | No tests |

---

## Part D — Priority Ranking (updated post POL-001A)
```

### Change 22 (`replace`)

**REMOVED / REPLACED:**

```markdown
| **P0** | G-001 | OT rate conflict (handbook vs settings) | ATT-006–008, C-001 | Direct payroll calculation / legal wage risk |
| **P0** | G-002 | Absence penalties not wired | MFW-002–003, LV-012 | Money deductions undefined at runtime |
| **P0** | G-003 | Deposit refund on resignation not orchestrated | DP-006–008, RS-003 | Employee money held; legal exposure |
| **P0** | G-004 | Constructive resignation not operationalized | MFW-001, RS-001 | Legal/employment status risk |
| **P0** | G-005 | Referral 90-day vs "3 months" label | C-004, RF-E1 | Minor payout timing ambiguity |
| **P0** | G-006 | Payroll adjustment policy incomplete | PR-010 | Ad-hoc payroll changes |
| **P1** | G-007 | Personal leave notice not enforced | LV-002, C-003 | Core leave operations |
| **P1** | G-008 | Sick certificate rules not enforced | LV-008–009 | Operational leave abuse |
| **P1** | G-009 | Missing punch / absence classification | ATT-011–012 | Attendance integrity |
| **P1** | G-010 | Leave reschedule date conflict | LR-004, C-002 | Wrong leave dates approved |
| **P1** | G-011 | Reschedule/swap approval matrix not seeded | AM-002, C-006 | Approval chain ambiguity |
| **P1** | G-012 | Shift swap Telegram + tests missing | LS-001–007, TG-003 | Core leave ops incomplete |
| **P1** | G-013 | Telegram reschedule approval hidden | TG-005 | Requests stall |
| **P1** | G-014 | Attendance correction create flow missing | ATT correction | Cannot fix bad punches |
| **P1** | G-015 | monthlyOffDays dual config | LV-004, C-005 | Inconsistent leave/commission |
| **P1** | G-016 | Exit checklist not implemented | RS-004–005 | Incomplete termination |
| **P2** | G-017 | Warning system missing | WS-001–003 | HR discipline experience |
| **P2** | G-018 | Grievance SLA not in system | CR-002–003 | Employee relations |
| **P2** | G-019 | Performance review UI + policy | PF-001–006 | HR cycle management |
| **P2** | G-020 | Recruitment policy + UI | RC-001–002 | Hiring consistency |
| **P2** | G-021 | Telegram AI permission gap | TG-010, UAT-002 | Self-service UX |
| **P2** | G-022 | Leader menu vs team assignment | TG-004, UAT-005 | Wrong approver exposure |
| **P2** | G-023 | Performance grades hardcoded | PF-001 | Config principle violation |
| **P3** | G-024 | Referral Telegram filter buttons non-functional | TG-002, UAT-007 | UX polish |
| **P3** | G-025 | Shift roster policy + system | SH-004 | Nice-to-have scheduling |
| **P3** | G-026 | Legal/amendment reserved rights doc | CR-007 | Compliance documentation |
| **P3** | G-027 | Org chart UI | ORG-002 | Visibility only |
| **P3** | G-028 | Web executive English-only | UAT-021 | i18n |

---

## Part E — Sprint Backlog

Each item closes one or more gaps above. Items trace to **policy rules** — no invented features.

---

### POL-002 — Resolve OT compensation policy conflict (C-001)

**Closes:** G-001  
**Policy rules:** ATT-006, ATT-008, ATT-E1  
**Scope:** Decision record + align `attendance.rules` schema/docs OR handbook KB to single authoritative OT formula; update enforcement consistently.  
**Acceptance:** One documented OT rule; payroll OT items match policy.

---

### POL-003 — Wire absence and consecutive leave penalties to payroll

**Closes:** G-002  
**Policy rules:** MFW-002, LV-012, LV-004  
**Scope:** Connect `leave.rules.absencePenalties` and consecutive leave settings to payroll deduction engine.  
**Acceptance:** Absence penalty produces payroll line item per role tier.

---

### POL-004 — Deposit refund exit orchestration

**Closes:** G-003  
**Policy rules:** DP-006, DP-007, DP-008, RS-003  
**Scope:** Wire `deposit.rules` refund flags to exit/resignation workflow and finance deposit refund approval.  
**Acceptance:** Proper resignation triggers refund path per settings.

---

### POL-005 — Constructive resignation and missing-from-work procedure

**Closes:** G-004  
**Policy rules:** MFW-001, RS-001, MFW-004  
**Scope:** Document and implement HR case for unauthorized absence → employment status change; wire missing punch settings when approved.  
**Acceptance:** Documented procedure + system audit trail for status change.

---

### POL-006 — Referral qualification policy alignment (C-004)

**Closes:** G-005  
**Policy rules:** Referral KB `probation_pass` / `three_months` vs `requiredEmploymentDays`  
**Scope:** Align qualification service with dual-path KB policy OR update KB to 90-day single path.  
**Acceptance:** Qualification outcomes match documented policy.

---

### POL-007 — Enforce personal and unpaid leave notice periods

**Closes:** G-007, C-003  
**Policy rules:** LV-002, LV-010  
**Scope:** Add leave request validator using `defaultLeaveNoticeDays` / `unpaidLeaveNoticeDays` from settings.  
**Acceptance:** Requests inside notice window rejected unless exempt leave type.

---

### POL-008 — Enforce sick leave certificate rules

**Closes:** G-008  
**Policy rules:** LV-008, LV-009  
**Scope:** Validate sick leave requests against certificate settings.  
**Acceptance:** >1 day sick leave requires certificate flag/document reference.

---

### POL-009 — Missing punch and absence classification enforcement

**Closes:** G-009  
**Policy rules:** ATT-011, ATT-012, MFW-004  
**Scope:** Implement missing check-in/out validation and half/full day absence using reserved attendance settings.  
**Acceptance:** Missing punch blocked or auto-closed per config.

---

### POL-010 — Align leave reschedule forward-date rule (C-002)

**Closes:** G-010  
**Policy rules:** LR-004  
**Scope:** Change validator to `new_start > original_end` OR update KB to match `original_start` rule; single behavior.  
**Acceptance:** KB and validator agree; tests cover edge case.

---

### POL-011 — Seed approval matrix for leave reschedule and shift swap (C-006)

**Closes:** G-011  
**Policy rules:** LR-007, LS-006, AM-002  
**Scope:** Add `leave_reschedule` and `leave_shift_swap` to `DEFAULT_MATRICES` matching KB (manager + HR).  
**Acceptance:** Production seed includes both workflows.

---

### POL-012 — Telegram shift swap self-service

**Closes:** G-012  
**Policy rules:** LS-001–LS-007, TG-003  
**Scope:** Implement `leave_shift_swap:*` handlers in Telegram bot (states already declared).  
**Acceptance:** Employee completes swap from 🌴 การลา menu.

---

### POL-013 — Telegram leave reschedule approval menu entry

**Closes:** G-013  
**Policy rules:** TG-005, LR-007  
**Scope:** Expose `approvals:leave_reschedule` on leader menu or unified approvals hub.  
**Acceptance:** Sub leader finds pending reschedule without hidden path.

---

### POL-014 — Attendance correction request flow

**Closes:** G-014  
**Policy rules:** ATT-001, ATT-011  
**Scope:** HTTP + UI (+ optional Telegram) to create `AttendanceCorrection` with workflow.  
**Acceptance:** Employee/manager submits correction; approver resolves.

---

### POL-015 — Unify monthly off-days configuration (C-005)

**Closes:** G-015  
**Policy rules:** LV-004, COM-ADM-008  
**Scope:** Single settings source for `monthlyOffDays` consumed by leave bonus and admin commission.  
**Acceptance:** Changing one setting updates both calculations.

---

### POL-016 — Exit management checklist (HR-16)

**Closes:** G-016  
**Policy rules:** RS-004, RS-005, CR-002  
**Scope:** `ExitCase` orchestration: assets, debt, deposit, final payroll, access revoke.  
**Acceptance:** Cannot complete exit until checklist green.

---

### POL-017 — Warning management system (HR-14)

**Closes:** G-017  
**Policy rules:** WS-001–WS-003, DP-003  
**Scope:** WarningCase model, issue/acknowledge, link to documents; document Warning 1/2/3 policy in KB.  
**Acceptance:** HR issues written warning; employee acknowledges via Telegram.

---

### POL-018 — Grievance case management

**Closes:** G-018  
**Policy rules:** CR-002, CR-003  
**Scope:** Case tracking with 14-day investigation and 7-day appeal SLA from handbook.  
**Acceptance:** Grievance submitted → SLA timers → appeal path logged.

---

### POL-019 — Performance review policy + UI (HR-17)

**Closes:** G-019, G-023  
**Policy rules:** PF-001–PF-006  
**Scope:** Publish performance policy KB; migrate grade thresholds to settings; web UI for cycles.  
**Acceptance:** Admin edits grade thresholds without deploy.

---

### POL-020 — Recruitment policy documentation + web UI

**Closes:** G-020  
**Policy rules:** RC-001, RC-002  
**Scope:** Author recruitment policy KB articles; add web pages for existing API.  
**Acceptance:** Documented stages; recruiters use web pipeline.

---

### POL-021 — Telegram employee permission bundle alignment

**Closes:** G-021  
**Policy rules:** TG-010, AC-001  
**Scope:** Grant default employee permissions matching Telegram menu (payroll:read, commission:read, etc.) on identity link.  
**Acceptance:** AI payslip query works post-verification.

---

### POL-022 — Align Telegram leader detection with team leadership

**Closes:** G-022  
**Policy rules:** TG-004, BR-009  
**Scope:** `showMainMenu()` uses same leader detection as AI `isMarketingLeader()` / roleLevel.  
**Acceptance:** Marketing sub-team leader sees approval menus without extra UserRole.

---

### POL-023 — Shift swap integration test suite

**Closes:** UAT-020 (supports G-012)  
**Policy rules:** LS-001–LS-007  
**Scope:** Integration tests for shift swap create, partner agree, workflow approve.  
**Acceptance:** CI covers full swap happy path.

---

### POL-024 — Company reserved rights and legal policy KB

**Closes:** G-026  
**Policy rules:** CR-007  
**Scope:** Publish KB articles for policy amendment, jurisdiction, data handling.  
**Acceptance:** CR-007 marked Complete in master policy.
```

**ADDED / REPLACED WITH:**

```markdown
| **P0** | G-101 | Absence penalties not wired | ABS-002–004 | Money risk — confirmed policy |
| **P0** | G-102 | Deposit refund/deferral/absconding rules | PAY-004b–f, RS-003–005 | Legal/money risk |
| **P0** | G-103 | Gross misconduct / performance termination settlement | DISC-001, DISC-002 | Legal/money risk |
| **P0** | G-104 | Reschedule validator wrong date | LR-004 | Wrong leave dates today |
| **P0** | G-105 | WF-001–005 / WF-P01 approval defaults | WF-001–005, WF-P01 | Wrong approvers |
| **P1** | G-106 | Missing >15 min labor penalty | ABS-006–007 | Operational attendance |
| **P1** | G-107 | Missed meal/break compensation | PAY-003a | Payroll completeness |
| **P1** | G-108 | Referral 3 months + KPI discretion | REF-001a–b | Payout control |
| **P1** | G-109 | Department/position on employee | EMP-002, ORG-002 | WF routing dependency |
| **P1** | G-110 | Probation manager evaluation gate | EMP-002 | Eligibility integrity |
| **P1** | G-111 | Shift swap Telegram + tests | LS-001–007 | Core ops |
| **P1** | G-112 | Asset register in exit flow | ASSET-001, RS-006 | Deposit review |
| **P1** | G-113 | Special holidays Dec 31/Jan 1 | HOL-004 | Scheduling |
| **P1** | G-114 | Meal allowance absence exclusion | PAY-001f | Payroll accuracy |
| **P1** | G-115 | Telegram reschedule approval menu | TG-005 | Ops UX |
| **P2** | G-116 | Special bonus workflow WF-003 | WF-003 | New workflow type |
| **P2** | G-117 | LEGAL_REVIEW_REQUIRED flag | DISC-002d, AC-013 | Compliance |
| **P2** | G-118 | Warning system | WS-001–003 | HR experience |
| **P2** | G-119 | Org chart UI | ORG-001 | Visibility |
| **P3** | G-120 | General leave notice C-003 | LV-002 open scope | Blocked partial |

**Closed gaps (POL-001A):** G-001 OT conflict, G-005 referral label, G-010 reschedule date (policy side), G-011 approver (policy side), G-015 monthlyOffDays (interim)

---

## Part E — Sprint Backlog (updated)

### POL-010 — Fix reschedule validator (LR-004) [P0]

**Policy:** `new_start_date > original_end_date`  
**Closes:** G-104  
**Files:** `leave-reschedule-policy.service.ts`, unit tests, `WORKHQ_MASTER_POLICY_V1.md` (done)

---

### POL-011 — Seed WF-L03 + department approval matrices [P0]

**Policy:** WF-001–002, WF-L03, WF-P01, LR-009  
**Closes:** G-105  
**Files:** `approval-defaults.ts`, `prisma/seed.ts`, `fixtures.ts`, workflow types

---

### POL-003 — Wire absence penalties to payroll [P0]

**Policy:** ABS-002–004  
**Closes:** G-101  
**Files:** payroll builder, leave settings consumer

---

### POL-004 — Deposit deferral, refund, forfeiture rules [P0]

**Policy:** PAY-004b–f, RS-003–005  
**Closes:** G-102  
**Files:** `payroll.service.ts`, exit workflow, `deposit-settings.types.ts`

---

### POL-025 — Termination settlement engine [P0]

**Policy:** DISC-001, DISC-002, DISC-002d  
**Closes:** G-103, G-117  
**Files:** employee terminate flow, payroll finalization, `LEGAL_REVIEW_REQUIRED` flag

---

### POL-026 — Missing-from-work labor penalty [P1]

**Policy:** ABS-006–007  
**Closes:** G-106  
**Files:** attendance service, payroll deduction, settings schema

---

### POL-027 — Missed meal/break payroll item [P1]

**Policy:** PAY-003a  
**Closes:** G-107  
**Files:** payroll builder, attendance linkage

---

### POL-028 — Referral 3 months + KPI discretion gate [P1]

**Policy:** REF-001a–b  
**Closes:** G-108  
**Files:** `qualification.service.ts`, referral service, KB article

---

### POL-029 — Employee department & position fields [P1]

**Policy:** EMP-002, ORG-002–003  
**Closes:** G-109  
**Files:** prisma schema, employee DTO, UI

---

### POL-030 — Probation manager evaluation gate [P1]

**Policy:** EMP-002, PF-005  
**Closes:** G-110  
**Files:** leave service, probation review API

---

### POL-012 — Telegram shift swap [P1]

**Policy:** LS-001–007  
**Closes:** G-111

---

### POL-031 — Asset register exit integration [P1]

**Policy:** ASSET-001, RS-006, PAY-004c  
**Closes:** G-112

---

### POL-032 — Special company holidays [P1]

**Policy:** HOL-004–005  
**Closes:** G-113

---

### POL-033 — Meal allowance absence exclusion [P1]

**Policy:** PAY-001f  
**Closes:** G-114

---

### POL-013 — Telegram reschedule approval menu [P1]

**Policy:** TG-005, LR-009  
**Closes:** G-115

---

### POL-034 — Special bonus workflow (WF-003) [P2]

**Policy:** WF-003  
**Closes:** G-116

---

### POL-016 — Exit checklist orchestration [P1]

**Policy:** RS-006, ASSET-001c  
**Closes:** G-112 (partial)
```

### Change 23 (`replace`)

**REMOVED / REPLACED:**

```markdown
| Sprint item | Priority | Gap(s) |
|-------------|----------|--------|
| POL-002 | P0 | G-001 |
| POL-003 | P0 | G-002 |
| POL-004 | P0 | G-003 |
| POL-005 | P0 | G-004 |
| POL-006 | P0 | G-005 |
| POL-007 | P1 | G-007 |
| POL-008 | P1 | G-008 |
| POL-009 | P1 | G-009 |
| POL-010 | P1 | G-010 |
| POL-011 | P1 | G-011 |
| POL-012 | P1 | G-012 |
| POL-013 | P1 | G-013 |
| POL-014 | P1 | G-014 |
| POL-015 | P1 | G-015 |
| POL-016 | P1 | G-016 |
| POL-017 | P2 | G-017 |
| POL-018 | P2 | G-018 |
| POL-019 | P2 | G-019, G-023 |
| POL-020 | P2 | G-020 |
| POL-021 | P2 | G-021 |
| POL-022 | P2 | G-022 |
| POL-023 | P1 | G-012 (test) |
| POL-024 | P3 | G-026 |
```

**ADDED / REPLACED WITH:**

```markdown
| Item | Priority | Closes | Policy rules |
|------|----------|--------|--------------|
| POL-010 | P0 | G-104 | LR-004 |
| POL-011 | P0 | G-105 | WF-001–002, WF-L03, WF-P01, LR-009 |
| POL-003 | P0 | G-101 | ABS-002–004 |
| POL-004 | P0 | G-102 | PAY-004b–f |
| POL-025 | P0 | G-103 | DISC-001, DISC-002 |
| POL-026 | P1 | G-106 | ABS-006–007 |
| POL-027 | P1 | G-107 | PAY-003a |
| POL-028 | P1 | G-108 | REF-001 |
| POL-029 | P1 | G-109 | EMP-002, ORG-002 |
| POL-030 | P1 | G-110 | EMP-002 |
| POL-012 | P1 | G-111 | LS-* |
| POL-031 | P1 | G-112 | ASSET-001 |
| POL-032 | P1 | G-113 | HOL-004 |
| POL-033 | P1 | G-114 | PAY-001f |
| POL-013 | P1 | G-115 | TG-005 |
| POL-034 | P2 | G-116 | WF-003 |
| POL-016 | P1 | G-112 | RS-006 |

**Retired/superseded from v1.0:** POL-002 (OT doc — merged PAY-003), POL-006 (referral — merged REF-001), POL-005 (partial — merged DISC/ABS), POL-007 (partial — LV-002 confirmed, general C-003 remains G-120)

---

## Appendix — Affected rule IDs (POL-001A delta)

### New confirmed rule IDs

ORG-001–ORG-008 · EMP-001–EMP-005 · EMP-002/EMP-002a–c · PAY-001–PAY-001i · PAY-002–PAY-002d · PAY-003–PAY-003c · PAY-004–PAY-004g · PAY-005/PAY-005a · ABS-001–ABS-008 · REF-001–REF-001f · DISC-001–DISC-005 · DISC-002a–d · WF-001–WF-005 · WF-001a · WF-002a · WF-L01–L04 · WF-P01 · ASSET-001–ASSET-001c · HOL-001–HOL-005 · AC-013 · CR-007–CR-009 · BR-011 · LR-009 · RS-004–RS-007

### Modified rule IDs

ATT-006–008 (→ PAY-003) · LV-004–LV-005 (→ PAY-002) · MA-* (→ PAY-001) · DP-* (→ PAY-004) · RF-* (→ REF-001) · AM-* (→ WF-*) · FN-006 (→ PAY-005) · EL-002 (→ EMP-002) · PF-005 (→ EMP-002)

### Resolved conflict IDs

C-001 · C-002 · C-004 · C-005 (interim) · C-006

### Remaining conflict

C-003 (partial) — general leave notice when enforcement ships (G-120)

### Affected backlog items

| Action | Items |
|--------|-------|
| **New** | POL-025, POL-026, POL-027, POL-028, POL-029, POL-030, POL-031, POL-032, POL-033, POL-034 |
| **Reprioritized P0** | POL-010, POL-011, POL-003, POL-004 |
| **Retired/merged** | POL-002, POL-006 |
| **Unchanged P1** | POL-012, POL-013, POL-016 |
| **Open P3** | G-120 / C-003 general leave notice |
```

