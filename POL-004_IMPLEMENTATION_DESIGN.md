# POL-004 — Deposit Exit Workflow Implementation Design

**Status:** Design approved · Phase 4a + 4b implemented (2026-06-23)  
**Policy authority:** `WORKHQ_MASTER_POLICY_V1.md` v1.1 — PAY-004b–l, RS-003–007, ASSET-001, DISC-001/002  
**Closes matrix gap:** G-102  
**Priority:** P0  

> Policy is approved. This document covers **enforcement design only** — it does not redefine confirmed policy rules.

---

## Design review outcome

| Area | Decision |
|------|----------|
| Exit reason taxonomy (proper / absconding / gross misconduct / performance failure) | ✅ Approved — maps to PAY-004d/e/f and DISC-001/002 |
| Deposit deferral (PAY-004b) | ✅ Approved — payroll-builder guard |
| Loss claims against deposit (PAY-004c) | ✅ Approved — owner-authorized retention |
| Exit checklist orchestration (RS-006) | ✅ Approved — workflow + UI checklist |
| Asset return gate (ASSET-001c) | ✅ Approved — blocks full refund until assets cleared or loss documented |
| Terminate → deposit settlement link | ✅ Approved — `EmployeeExitCase` aggregate |
| **Deposit balance model (PAY-004h–l)** | ✅ **Confirmed** — one balance per employee; ledger records collector company; refund from collector; rehire new cycle; no auto debt above balance |

---

## B.0 Deposit balance model (confirmed owner decisions)

| Rule | Design implication |
|------|-------------------|
| **PAY-004h** One balance per employee | `Deposit.runningTotal` keyed by `employeeId` only (not per company pair) |
| **PAY-004i** Ledger records collector | Each `Deposit` row retains `owningCompanyId` / `payrollCycleId` — audit which company collected |
| **PAY-004j** Refund from collector | `DepositRefund.owningCompanyId` = company that collected; partial refunds per collector ledger |
| **PAY-004k** Rehire new cycle | On rehire (`rehireOfEmployeeId` link), deposit balance resets to ฿0; prior balance must be settled at exit |
| **PAY-004l** Claims above balance | Owner case-by-case outside system — **no automatic debt module**; UI shows shortfall warning only |

**Schema migration note (Phase 4a):** Change deposit cap/running-total aggregation from `(employeeId, owningCompanyId)` to `employeeId` with collector attribution on ledger rows.

---

# Part A — Current state & gap analysis

## A.1 What exists today

| Component | Location | Capability |
|-----------|----------|------------|
| Monthly deposit deduction | `payroll-builder.service.ts`, `payroll.service.ts` | PAY-004/004a/004g — ฿500/mo, cap ฿3,000 |
| Deposit settings | `deposit-settings.types.ts` | `enabled`, amounts, `refundOnProperResignation`, `allowPartialRefund`, `refundRequiresApproval` |
| `Deposit` ledger rows | `payroll.deposits` | Running total per employee; **each row records collecting company** (PAY-004i) |
| `DepositRefund` entity | `finance-request.entity.ts` | Workflow-gated refund request; no exit-reason linkage |
| `POST /finance/deposit-refunds` | `finance.controller.ts` | Manual refund creation |
| Employee terminate | `employee.service.ts` `terminate()` | Closes assignments; **no deposit settlement** |
| Asset module | `asset/` | Assignment tracking; not wired to exit |
| Absence → constructive resignation | POL-003 (Phase 3a) | RS-001 signal only; no exit workflow |

## A.2 Gap summary

| # | Gap | Policy | Impact |
|---|-----|--------|--------|
| G1 | No `EmployeeExitCase` — exit reason not captured | RS-003–005, RS-007 | Cannot enforce refund/forfeit rules |
| G2 | Terminate does not trigger deposit review | PAY-004d–f | Manual, error-prone |
| G3 | No deferral logic when net pay too small | PAY-004b | Builder may over-deduct short months |
| G4 | No loss claim workflow | PAY-004c | Retention undocumented |
| G5 | No exit checklist state | RS-006 | Assets/debt/payroll/access not orchestrated |
| G6 | `DepositRefund` lacks `exitCaseId`, `refundType`, `forfeitReason` | PAY-004e/f | Audit trail incomplete |
| G7 | No UI for exit settlement | RS-006 | HR uses ad-hoc finance forms |

---

# Part B — Domain design

## B.1 Exit reason taxonomy

**Enum `ExitReason`** (schema `employee`):

```
proper_resignation      → PAY-004d / RS-003 — full refund eligible
absconding              → PAY-004e / RS-004 — forfeit (no refund)
gross_misconduct        → PAY-004f / RS-005 / DISC-002 — forfeit
performance_failure     → DISC-001 / RS-007 — full refund (DISC-001d)
constructive_resignation → RS-001 — treated as absconding unless HR overrides
```

**Service:** `ExitReasonPolicyService` (pure)  
**Location:** `backend/src/modules/employee/domain/services/exit-reason-policy.service.ts`

```
resolveDepositOutcome(exitReason, lossClaimTotal, depositBalance) →
  | { type: 'full_refund', amount }
  | { type: 'partial_refund', amount, retained }
  | { type: 'forfeit', amount: 0, reason }
```

| Exit reason | Default deposit outcome |
|-------------|-------------------------|
| `proper_resignation` | Full refund minus documented losses (PAY-004c) |
| `performance_failure` | Full refund (DISC-001d) |
| `absconding` | Forfeit entire balance |
| `gross_misconduct` | Forfeit entire balance |
| `constructive_resignation` | Forfeit unless owner waives → `absconding` default |

## B.2 Employee exit case aggregate

**Entity:** `EmployeeExitCase`  
**Location:** `backend/src/modules/employee/domain/entities/employee-exit-case.entity.ts`

**Lifecycle:**

```
draft → checklist_in_progress → pending_settlement → settled → closed
         ↓ (cancel)
       cancelled
```

**Fields:**

- `employeeId`, `companyId`, `exitReason`, `initiatedAt`, `effectiveTerminationDate`
- Checklist flags: `assetsReturned`, `debtsCleared`, `finalPayrollBuilt`, `accessRevoked`
- Settlement: `depositBalanceAtExit`, `lossClaimAmount`, `refundAmount`, `forfeitAmount`
- Links: `depositRefundId`, `terminationActorId`

**Rules:**

1. Only one open exit case per employee per company.
2. `proper_resignation` requires checklist items before settlement approval.
3. `absconding` / `gross_misconduct` may skip asset checklist but require documented reason.
4. Owner may authorize PAY-004c retention → reduces `refundAmount`.

## B.3 Deposit deferral (PAY-004b)

**Service:** `DepositDeferralService`  
**Location:** `backend/src/modules/payroll/domain/services/deposit-deferral.service.ts`

Applied in `PayrollBuilderService.computeEmployee()` **before** deposit deduction:

```
shouldDeferDeposit(input: {
  netPayBeforeDeposit: number;
  depositAmount: number;
  minNetPayThreshold: number;  // from deposit.rules.minNetPayAfterDeduction (new setting)
  workedDays: number;
  minWorkedDays: number;         // from deposit.rules.minWorkedDaysForDeduction (new setting)
}) → { defer: boolean; reason?: string }
```

When deferred: skip deposit item; append warning to builder preview; record `deposit_deferral` note on cycle employee row (no new table in Phase 1 — warning + audit sufficient).

## B.4 Loss claims (PAY-004c)

**Entity:** `DepositLossClaim` (schema `finance`)

- `exitCaseId`, `employeeId`, `companyId`, `amount`, `category` (`property_damage` | `lost_equipment` | `cash_shortage` | `other`)
- `description`, `assetId` (optional FK to asset), `authorizedBy` (owner user id)
- `status`: `pending` | `approved` | `rejected`

Owner authorization required (permission `finance:approve` + owner business role or matrix).

## B.5 Asset gate (ASSET-001c)

On exit case settlement preview:

```
listOpenAssetAssignments(employeeId) → block full refund if any unreturned
```

HR may mark assets returned (`ASSET-001`) or create loss claim linking asset.

---

# Part C — Database changes

## C.1 New enums

```prisma
enum ExitReason {
  proper_resignation
  absconding
  gross_misconduct
  performance_failure
  constructive_resignation
}

enum ExitCaseStatus {
  draft
  checklist_in_progress
  pending_settlement
  settled
  closed
  cancelled
}

enum DepositLossClaimCategory {
  property_damage
  lost_equipment
  cash_shortage
  other
}
```

## C.2 New tables

### `employee.employee_exit_cases`

```prisma
model EmployeeExitCase {
  id                      String         @id @default(uuid())
  employeeId              String
  companyId               String
  exitReason              ExitReason
  status                  ExitCaseStatus @default(draft)
  effectiveTerminationDate DateTime      @db.Date
  assetsReturned          Boolean        @default(false)
  debtsCleared            Boolean        @default(false)
  finalPayrollBuilt       Boolean        @default(false)
  accessRevoked           Boolean        @default(false)
  depositBalanceAtExit    Decimal?       @db.Decimal(14,2)
  lossClaimTotal          Decimal        @default(0) @db.Decimal(14,2)
  refundAmount            Decimal?       @db.Decimal(14,2)
  forfeitAmount           Decimal?       @db.Decimal(14,2)
  depositRefundId         String?        @db.Uuid
  notes                   String?
  initiatedBy             String         @db.Uuid
  settledAt               DateTime?
  createdAt               DateTime       @default(now())
  ...
  @@unique([employeeId, companyId, status], where: status not in (closed, cancelled)) // partial unique via raw SQL
}
```

### `finance.deposit_loss_claims`

```prisma
model DepositLossClaim {
  id           String                   @id
  exitCaseId   String
  employeeId   String
  companyId    String
  amount       Decimal                  @db.Decimal(14,2)
  category     DepositLossClaimCategory
  description  String
  assetId      String?                  @db.Uuid
  authorizedBy String?                  @db.Uuid
  status       String                   @default("pending")
  ...
}
```

## C.3 Extend existing tables

| Table | Change |
|-------|--------|
| `finance.deposit_refunds` | Add `exit_case_id`, `refund_type` (`full`/`partial`/`forfeit`), `forfeit_reason` |
| `deposit-settings.types.ts` | Add `minNetPayAfterDeduction`, `minWorkedDaysForDeduction`, `constructiveResignationDefault` |

## C.4 Not changing

- `payroll.deposits` running total mechanics — reuse `getRunningTotal()`
- Deposit non-transferable rule — `owningCompanyId` immutable (existing)

---

# Part D — API changes

Base: `/api/v1`

## D.1 Exit case endpoints

| Method | Path | Permission | Description |
|--------|------|------------|-------------|
| `POST` | `/hr/employees/:id/exit` | `employee:terminate` | Initiate exit case + optional auto-terminate |
| `GET` | `/hr/exit-cases/:id` | `employee:read` | Exit case detail + checklist |
| `PATCH` | `/hr/exit-cases/:id/checklist` | `employee:write` | Update checklist flags |
| `POST` | `/hr/exit-cases/:id/settlement/preview` | `employee:read` | Compute refund/forfeit breakdown |
| `POST` | `/hr/exit-cases/:id/settle` | `employee:terminate` | Create `DepositRefund` or forfeit record |
| `POST` | `/hr/exit-cases/:id/loss-claims` | `finance:write` | Create loss claim |
| `POST` | `/hr/exit-cases/:id/loss-claims/:claimId/authorize` | `finance:approve` | Owner authorize PAY-004c |

### Initiate exit — request

```json
{
  "companyId": "uuid",
  "exitReason": "proper_resignation",
  "effectiveTerminationDate": "2026-06-30",
  "terminateNow": true,
  "notes": "ส่งใบลาออกครบถ้วน"
}
```

### Settlement preview — response

```json
{
  "depositBalance": 3000,
  "lossClaims": 500,
  "refundAmount": 2500,
  "forfeitAmount": 0,
  "outcome": "partial_refund",
  "policyRules": ["PAY-004d", "PAY-004c"]
}
```

## D.2 Modified endpoints

| Endpoint | Change |
|----------|--------|
| `POST /employees/:id/terminate` | Deprecate direct terminate for deposit-holding employees — redirect to exit workflow or require `exitCaseId` |
| `POST /finance/deposit-refunds` | Require `exitCaseId` when `refundRequiresApproval` setting true |
| Payroll builder preview | Add `depositDeferred: boolean`, `depositDeferralReason` |

## D.3 Error codes

| Error | HTTP | When |
|-------|------|------|
| `ExitCaseNotFoundError` | 404 | — |
| `ExitCaseAlreadyOpenError` | 409 | Duplicate open case |
| `ExitChecklistIncompleteError` | 422 | Proper resignation without assets/debts |
| `DepositForfeitPolicyError` | 422 | Attempt full refund on absconding |
| `DepositLossClaimUnauthorizedError` | 403 | Non-owner authorizing retention |

---

# Part E — UI changes

## E.1 Employee detail — Exit tab

**File:** `web/src/pages/hr/EmployeeExitPage.tsx` (or tab on `EmployeeDetailPage`)

| Element | Thai label |
|---------|------------|
| Initiate exit | เริ่มกระบวนการลาออก |
| Exit reason | เหตุผลการออก |
| Checklist | รายการตรวจสอบก่อนออก |
| Assets returned | คืนทรัพย์สินครบ |
| Settlement preview | สรุปเงินประกัน |
| Refund amount | คืนเงินประกัน |
| Forfeit | ริบเงินประกัน |

## E.2 Finance — Deposit settlement queue

**Route:** `/finance/deposit-exits`  
List open exit cases pending settlement approval.

## E.3 Payroll cycle detail

Show deferred deposit warnings per employee (PAY-004b).

## E.4 Settings — Deposit

Extend `DepositSettingsPage` with deferral thresholds and constructive resignation default.

---

# Part F — Workflow integration

| Entity type | Workflow | Approver |
|-------------|----------|----------|
| `deposit_refund` | Existing | Per approval matrix (owner) |
| `deposit_loss_claim` | New `deposit_loss_claim_v1` | Owner only (PAY-004c) |

**Outbox handlers:**

- `onDepositRefundWorkflowResolved` — mark exit case `settled`, post payroll credit item
- `onExitCaseSettled` — revoke Telegram identity, close assignments (if not already)

---

# Part G — Implementation phases

## Phase 4a (P0 core) — **IMPLEMENTED**

1. ✅ Migration: `employee_exit_cases`, `deposit_loss_claims`, extend `deposit_refunds`
2. ✅ Domain: `EmployeeExitCase`, `ExitReasonPolicyService`, employee-wide deposit ledger (PAY-004h)
3. ✅ APIs: `POST /employees/:id/exit`, settlement preview/settle/close, deposit balance/ledger
4. ✅ Direct `terminate()` blocked when open exit case exists; termination on exit case close
5. ✅ Workflow routing: Marketing → Big Leader → Owner; Admin/HR/Finance → Secretary → Owner
6. ✅ UI: `/hr/employees/:id/deposit`, `/hr/exit/:id` (Thai-first)
7. ✅ Integration tests: `employee-exit-deposit.integration.spec.ts`

**Settlement preview fields:** total balance, collector breakdown, claims, refundable/forfeit amounts, `legalReviewRequired`, claim shortfall warning (PAY-004l — no auto debt).

## Phase 4b — **IMPLEMENTED**

1. ✅ PAY-004b deposit deferral in payroll builder (`minimumNetPayAfterDeposit`)
2. ✅ Loss claim CRUD + owner approval (`/exit-cases/:id/loss-claims`)
3. ✅ Asset gate ASSET-001c (`exit_case_asset_reviews`, blocks settlement)
4. ✅ Settlement enforces approved claims only + OWNER_CASE_BY_CASE shortfall flag
5. ✅ UI: assets section, claims form, enhanced settlement preview on `/hr/exit/:id`
6. ✅ Tests: `deposit-deferral.integration.spec.ts`, `exit-deposit-phase4b.integration.spec.ts`

## Phase 4c

1. Constructive resignation link from POL-003 absence approval
2. RS-006 full checklist automation (access revoke, final payroll trigger)
3. Telegram notifications

---

# Part H — Acceptance criteria

| AC | Criterion |
|----|-----------|
| AC-1 | Proper resignation + ฿3,000 balance + no losses → settlement preview shows full ฿3,000 refund |
| AC-2 | Absconding exit → refund ฿0, forfeit ฿3,000 |
| AC-3 | Gross misconduct → same as absconding (forfeit) |
| AC-4 | Performance failure (DISC-001) → full refund |
| AC-5 | PAY-004c loss claim ฿500 on proper resignation → partial refund ฿2,500 |
| AC-6 | PAY-004b: employee with 3 worked days and low net pay → deposit deferred, warning in builder |
| AC-7 | Cannot create second open exit case for same employee/company |
| AC-8 | `DepositRefund` links to `exitCaseId`; audit trail complete |
| AC-9 | Open assets block full refund until returned or loss claim filed |
| AC-10 | Owner authorization required for loss claims |

---

# Part I — Test matrix

| Layer | File | Cases |
|-------|------|-------|
| Unit | `exit-reason-policy.service.unit.spec.ts` | All exit reasons → refund/forfeit |
| Unit | `deposit-deferral.service.unit.spec.ts` | Defer vs deduct thresholds |
| Integration | `employee-exit-deposit.integration.spec.ts` | proper → refund; absconding → forfeit |
| Integration | `deposit-deferral.integration.spec.ts` | Short month deferral in builder |

---

*End of POL-004 Implementation Design — ready for Phase 4a implementation.*
