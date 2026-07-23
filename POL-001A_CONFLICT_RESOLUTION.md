# POL-001A — Policy Conflict Resolution

**Document ID:** POL-001A  
**Version:** 1.0  
**Date:** 2026-06-23  
**Predecessor:** POL-001 (`WORKHQ_MASTER_POLICY_V1.md`, `WORKHQ_POLICY_IMPLEMENTATION_MATRIX.md`)  
**Status:** Conflict resolution record — no code changes in this sprint  
**Authority:** Confirmed business decisions from HR-11 settings migrations, official settings docs, published KB policy articles, and HR Roadmap configuration principle

---

## Resolution principles applied

| Principle | Source | Effect |
|-----------|--------|--------|
| **Policy wins over code** | POL-001 mandate | Where KB/settings define behavior and code differs, policy is final; code must change |
| **Settings Engine authoritative for wired numeric rules** | HR-11B/C/D docs, HR Roadmap L122 | Wired `*.rules` values supersede handbook numeric statements for enforcement |
| **Reserved settings are not active policy** | `LEAVE_SETTINGS.md` wired/reserved table | Defaults in Admin UI that are not wired do not override published handbook rules |
| **KB articles authoritative for procedural rules** | `company-policy-articles.ts` (official policy seed) | Approval chains and business procedures in KB stand until explicitly revised |
| **HR-11 sprint scope decisions** | HR-11B/C/D migration notes | Documented deferrals (e.g. admin commission config split) are intentional until a later unification sprint |

---

## 1. Resolved conflicts

### C-001 — OT compensation rate

| Field | Detail |
|-------|--------|
| **Conflict** | Handbook: OT at 1.5× weekday/weekend hourly wage, 2× holiday. Settings: flat `otHourlyRate` ฿50/hr |
| **Current policy (sources)** | Handbook (`handbook-attendance-punctuality`) states multiplier-based OT. `ATTENDANCE_SETTINGS.md` (HR-11B official doc) states flat `otHourlyRate` default ฿50, wired to checkout OT calculation |
| **Current implementation** | `AttendanceRulesService.computeOvertime()` uses `otHourlyRate` from `attendance.rules`. No day-type multiplier. OT workflow approval wired |
| **Confirmed decision** | **HR-11B (2026):** Attendance numeric rules migrated to Settings Engine; defaults preserve pre-migration flat-rate behavior. **HR Roadmap:** KB is advisory for runtime; wired DB config is enforcement source |
| **Recommended final policy** | **OT amount = completed OT hours × `attendance.rules.otHourlyRate`** (default ฿50/hr, per-company configurable). OT still requires manager approval before payout. Handbook multiplier language is **retired for payroll** and replaced with: *"OT compensation is calculated per company attendance settings (`otHourlyRate`). Admin may configure rate via Settings → Attendance."* Day-type multipliers (1.5×/2×) may be added as a future settings enhancement — not current policy |
| **Files to update (policy/docs — no code yet)** | `company-policy-articles.ts` (`handbook-attendance-punctuality` OT section) · `WORKHQ_MASTER_POLICY_V1.md` (ATT-008, ATT-E1 → resolved) · `ATTENDANCE_SETTINGS.md` (add note: supersedes handbook OT rates) · `WORKHQ_POLICY_IMPLEMENTATION_MATRIX.md` (C-001 closed) |

---

### C-004 — Referral tenure threshold ("3 months" vs 90 days)

| Field | Detail |
|-------|--------|
| **Conflict** | KB: qualify via `three_months` (3 months employed). Settings: `requiredEmploymentDays = 90` calendar days (~2.96 months, down from legacy ~91.32 days) |
| **Current policy (sources)** | KB (`referral-eligibility-conditions`) lists `three_months` condition. `REFERRAL_SETTINGS.md` (HR-11D official doc) documents **90 whole calendar days** as the sprint default with explicit migration note |
| **Current implementation** | `QualificationService.assess()` uses `requiredEmploymentMs(config.requiredEmploymentDays)` from `referral.rules`. Dual path: `probation_pass` OR tenure threshold. Condition code remains `three_months` internally |
| **Confirmed decision** | **HR-11D (2026):** `requiredEmploymentDays = 90` is the documented and seeded default. Legacy `3 × 30.44` days explicitly replaced |
| **Recommended final policy** | **Referral qualifies via `probation_pass` OR employed ≥ `referral.rules.requiredEmploymentDays` calendar days (system default 90).** The condition label `three_months` is a legacy identifier only — policy text must read *"employed at least [N] calendar days (default 90)"*. Companies may override N per company settings |
| **Files to update (policy/docs — no code yet)** | `company-policy-articles.ts` (`referral-eligibility-conditions` — replace "3 months" with configurable days) · `REFERRAL_SETTINGS.md` (already correct; add cross-ref to master policy) · `WORKHQ_MASTER_POLICY_V1.md` (RF-005, RF-E1 → resolved) · `WORKHQ_POLICY_IMPLEMENTATION_MATRIX.md` (C-004 closed) |

---

### C-005 — `monthlyOffDays` dual configuration stores

| Field | Detail |
|-------|--------|
| **Conflict** | `leave.rules.monthlyOffDays` (default 4) vs `admin_commission.normalLeaveAllowanceDays` in RuleConfig (default 4) — same value, two stores |
| **Current policy (sources)** | `leave.rules` governs unused off-day bonus. RuleConfig governs admin commission leave allowance/penalties. `LEAVE_SETTINGS.md` L54: *"Admin commission calc still uses separate hardcoded constant"*; HR-11C migration note: admin commission **out of scope** for leave settings unification |
| **Current implementation** | `leave-bonus.service.ts` reads `leave.rules.monthlyOffDays`. `admin-commission-calculation.service.ts` reads RuleConfig `normalLeaveAllowanceDays`. Both default to 4 independently |
| **Confirmed decision** | **HR-11C scope boundary:** Leave settings migration did not absorb admin commission leave allowance. Dual stores are **intentional interim architecture** until explicit unification |
| **Recommended final policy** | **Interim (confirmed):** `leave.rules.monthlyOffDays` is authoritative for **leave bonus / off-day entitlement display**. `admin_commission.normalLeaveAllowanceDays` is authoritative for **admin commission penalty calculation**. Both must maintain the **same numeric value** per company; owner/settings admin is responsible for keeping them synchronized. **Target state (future POL-015):** single source in `leave.rules`, admin commission reads from leave settings |
| **Files to update (policy/docs — no code yet)** | `LEAVE_SETTINGS.md` (clarify sync requirement) · `AdminCommissionSettingsPage` / admin commission settings doc (add note: must match leave monthly off days) · `WORKHQ_MASTER_POLICY_V1.md` (LV-E2 → resolved as interim dual-store) · `WORKHQ_POLICY_IMPLEMENTATION_MATRIX.md` (C-005 closed as interim) |

---

### C-002 — Leave reschedule forward-date rule

| Field | Detail |
|-------|--------|
| **Conflict** | KB: `new_start_date` must be after `original_end_date`. Validator: `new_start > original_start_date` |
| **Current policy (sources)** | `leave-reschedule-policy` KB article (official): *"new_start_date หลัง original_end_date"* |
| **Current implementation** | `leave-reschedule-policy.service.ts` L111–116: compares `newStart` to `originalStart` only |
| **Confirmed decision** | **POL-001 mandate: policy wins over code.** KB is the sole published business rule; no sprint doc overrides KB on this point |
| **Recommended final policy** | **Rescheduled leave must start strictly after the original leave end date** (`new_start_date > original_end_date`). Same-duration rule unchanged. Example: original Mar 10–12 → earliest new start Mar 13 |
| **Files to update (policy/docs — no code yet)** | `leave-reschedule-policy.service.ts` (change comparison to `originalEndDate`) · `leave-reschedule-policy.service.unit.spec.ts` (add edge case: new start after original start but before original end → reject) · `WORKHQ_MASTER_POLICY_V1.md` (LR-004, LR-E1 → resolved) · `WORKHQ_POLICY_IMPLEMENTATION_MATRIX.md` (C-002 closed) |

---

### C-006 — Leave reschedule approver chain

| Field | Detail |
|-------|--------|
| **Conflict** | KB procedure: manager + HR approval. No `leave_reschedule` entry in `DEFAULT_MATRICES`; test fixtures use `owner` only |
| **Current policy (sources)** | `leave-reschedule-procedure` KB step 4: *"ส่ง workflow ให้หัวหน้างานและ HR อนุมัติ"*. `leave-reschedule-eligibility`: emergency reschedule requires HR approval |
| **Current implementation** | Workflow entity `leave_reschedule` exists. `approval-defaults.ts` has no default matrix. Integration test fixtures seed `approverRule: 'owner'`. Telegram supports `approvals:leave_reschedule` but leader menu hides entry (UAT-004) |
| **Confirmed decision** | **KB procedure is authoritative** for approval chain. POL-001: policy wins over test fixtures and missing seed |
| **Recommended final policy** | **Leave reschedule requires 2 approvals:** (1) **Big Leader** (direct manager / หัวหน้างาน) → (2) **Secretary** (HR). `minApprovalCount = 2`. Emergency reschedule (`is_emergency=true`) uses same chain; notice-day rule waived, not approver chain. **Leave shift swap:** partner consent → same 2-step chain (Big Leader → Secretary) |
| **Files to update (policy/docs — no code yet)** | `approval-defaults.ts` (add `leave_reschedule` and `leave_shift_swap` matrices) · `backend/prisma/seed.ts` (seed default matrices) · `backend/test/helpers/fixtures.ts` (replace owner-only fixture) · `telegram-bot.service.ts` / leader menu (expose reschedule approval — UAT-004) · `company-policy-articles.ts` (optional: specify Big Leader + Secretary by role name in procedure article) · `WORKHQ_MASTER_POLICY_V1.md` (LR-E2, AM-002 → resolved) · `WORKHQ_POLICY_IMPLEMENTATION_MATRIX.md` (C-006 closed) |

---

### C-003 — Personal leave notice period (partial resolution)

| Field | Detail |
|-------|--------|
| **Conflict** | Handbook: personal leave ≥1 business day notice. Settings: `defaultLeaveNoticeDays = 7` (reserved, not wired) |
| **Current policy (sources)** | `handbook-leave-benefits`: personal leave 3 days/year, **≥1 business day notice**. `LEAVE_SETTINGS.md` L56: *"Leave requests do not validate notice yet"* for `defaultLeaveNoticeDays` |
| **Current implementation** | No notice validation on `POST /leave/employees/:id/requests` |
| **Confirmed decision** | **Reserved settings are not active policy** (LEAVE_SETTINGS wired/reserved table). Handbook is the only **active** rule for personal leave notice until enforcement ships. The `7`-day default is an **unconfirmed placeholder** for future general leave types |
| **Recommended final policy (resolved scope)** | **Personal leave (`personal` / annual-type): advance notice ≥ 1 business day** (handbook). **General/off-day/sick/unpaid leave notice: `CONFLICT_REQUIRES_DECISION` — see Section 2 below** |
| **Files to update (policy/docs — no code yet)** | `WORKHQ_MASTER_POLICY_V1.md` (split LV-002 resolved; add LV-013 unresolved for general leave) · `leave-settings.types.ts` doc comment (mark `defaultLeaveNoticeDays` as draft pending owner sign-off) · When enforcement ships: add leave-type-specific notice keys or confirm `defaultLeaveNoticeDays=7` |

---

## 2. Remaining conflicts requiring owner decision

These cannot be closed from existing sprint documentation or published KB alone.

### C-003-R — General leave advance notice (remaining)

| Field | Detail |
|-------|--------|
| **Question** | When notice enforcement is enabled for **off-day, sick, and unpaid leave**, what is the required advance notice? |
| **Options** | A) **7 days** (current settings placeholder) · B) **1 day** (align with personal leave) · C) **Leave-type-specific** (e.g. off-day 7d, sick 0d with certificate, unpaid 7d) |
| **Impact** | Leave request validation, Telegram leave FSM, employee handbook alignment |
| **Blocks** | POL-007 (enforce leave notice), handbook update for non-personal leave types |
| **Owner decision required** | Select option and confirm `defaultLeaveNoticeDays` default before wiring |

---

### C-001-R — OT day-type multipliers (future enhancement — optional)

| Field | Detail |
|-------|--------|
| **Status** | **Not a blocking conflict** after C-001 resolution (flat rate is final for now) |
| **Question** | Should future settings support handbook-style 1.5×/2× multipliers by day type (weekday/weekend/holiday)? |
| **Impact** | Schema design for `attendance.rules` — new fields vs formula mode |
| **Owner decision required** | Only if business wants to restore multiplier-based OT instead of flat configurable rate |

---

## 3. Updated P0 backlog (after conflict resolution)

P0 items re-ranked after closing C-001, C-002, C-004, C-005, C-006, and partial C-003. Removed or downgraded items that are now **policy-resolved** (implementation-only).

| ID | Priority | Backlog item | Policy basis | Status vs POL-001 | Implementation scope |
|----|----------|--------------|--------------|-------------------|----------------------|
| **POL-002** | ~~P0~~ → **P1** | Align handbook KB OT text to flat `otHourlyRate` policy | C-001 resolved | Policy decided; doc update only | Update KB article + master policy appendix. **No calculation change** |
| **POL-003** | **P0** | Wire absence and consecutive leave penalties to payroll | MFW-002, LV-012 | Unchanged | Payroll deduction engine |
| **POL-004** | **P0** | Deposit refund exit orchestration | DP-006–008, RS-003 | Unchanged | Exit + finance workflow |
| **POL-005** | **P0** | Constructive resignation / missing-from-work procedure | MFW-001, RS-001 | Unchanged | HR case + handbook procedure doc |
| **POL-006** | ~~P0~~ → **P1** | Update referral KB to 90 calendar days wording | C-004 resolved | Policy decided | KB + master policy doc. **Qualification logic already correct** |
| **POL-007** | **P1** | Enforce personal leave 1-day notice | C-003 partial | Personal leave only — can proceed | Leave request validator for personal type |
| **POL-007b** | **P1** | Enforce general leave notice (blocked) | C-003-R | **Blocked on owner** | After owner selects C-003-R option |
| **POL-010** | ~~P1~~ → **P0** | Fix reschedule validator: `new_start > original_end` | C-002 resolved | Policy decided; **code must change** | `leave-reschedule-policy.service.ts` + tests |
| **POL-011** | ~~P1~~ → **P0** | Seed reschedule/swap approval matrix: Big Leader → Secretary | C-006 resolved | Policy decided; **seed + defaults must change** | `approval-defaults.ts`, seed, fixtures |
| **POL-015** | **P2** | Unify `monthlyOffDays` single source (target state) | C-005 interim | Deferred from P1 — interim dual-store confirmed | Admin commission reads leave settings |

### P0 summary (3 items — execute first)

| Order | Item | Why P0 |
|-------|------|--------|
| 1 | **POL-010** — Reschedule date validator fix | Policy/code mismatch causes wrong leave dates today |
| 2 | **POL-011** — Reschedule/swap approval matrix | Wrong approvers (owner fixture); requests stall in production |
| 3 | **POL-003** — Absence penalties to payroll | Money risk — penalties configured but not deducted |

POL-004 (deposit exit) and POL-005 (constructive resignation) remain **P0** from POL-001 — not conflict-related, unchanged.

### Descoped / downgraded from P0

| Former item | New priority | Reason |
|-------------|--------------|--------|
| POL-002 (OT rate conflict) | P1 doc-only | C-001 resolved: settings already correct; update handbook KB only |
| POL-006 (referral qualification) | P1 doc-only | C-004 resolved: 90-day logic already implemented |
| G-001 OT conflict | Closed | — |
| G-005 Referral threshold | Closed | — |
| G-010 Reschedule date | Closed → POL-010 P0 | — |
| G-011 Approval matrix | Closed → POL-011 P0 | — |
| G-015 monthlyOffDays | Closed (interim) | POL-015 moved to P2 |

---

## 4. Master policy amendments (summary)

Apply these updates to `WORKHQ_MASTER_POLICY_V1.md` when POL-001A is accepted:

| Rule ID | Change |
|---------|--------|
| ATT-008 | OT = `otHourlyRate` × hours (settings); handbook multipliers retired |
| ATT-E1 | **Removed** — resolved per C-001 |
| LR-004 | Clarify: `new_start_date > original_end_date` |
| LR-E1 | **Removed** — resolved per C-002 |
| LR-E2 | **Removed** — resolved per C-006 |
| LV-002 | Personal leave: 1 business day (handbook, active) |
| LV-013 (new) | General leave notice: `CONFLICT_REQUIRES_DECISION` (C-003-R) |
| LV-E1 | **Removed** — split into LV-002 (resolved) + LV-013 (open) |
| LV-E2 | **Removed** — resolved per C-005 interim |
| RF-005 | Tenure = `requiredEmploymentDays` (default 90 calendar days) |
| RF-E1 | **Removed** — resolved per C-004 |
| AM-002 | Add default: leave_reschedule + leave_shift_swap → Big Leader → Secretary |
| Appendix A | Remove C-001, C-002, C-004, C-005, C-006; retain C-003-R only |

---

## 5. Sign-off

| Role | Action |
|------|--------|
| **Owner / HR Director** | Confirm C-003-R (general leave notice) — only remaining blocker |
| **Owner / HR Director** | Optional: confirm C-001-R (future OT multiplier settings) |
| **Engineering** | Execute POL-010, POL-011 (P0 code) after sign-off on this document |
| **HR / Ops** | Execute POL-002, POL-006 (P1 doc updates) in parallel — no code |

---

*End of POL-001A*
