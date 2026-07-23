# POL-025 — Disciplinary Foundation Implementation Design

**Policy authority:** `WORKHQ_MASTER_POLICY_V1.md` v1.1  
**Status:** Phase 1 implemented (2026-06-23)

---

## Scope

Disciplinary warning ladder foundation used by all future warning and termination workflows. Does **not** include full termination settlement engine (POL-025b).

## Confirmed rules

| ID | Rule | Implementation |
|----|------|----------------|
| DISC-001 | Verbal warning | `action_type = verbal_warning` |
| DISC-002 | Warning 1 | `action_type = warning_1` |
| DISC-003 | Warning 2 | `action_type = warning_2` |
| DISC-004 | Termination | `action_type = termination` + `termination_reason`, `termination_note` |
| DISC-005 | Warnings never expire | No expiry columns; permanent storage |

Company may skip levels for severe misconduct (policy guard only — any action type creatable by authorized roles).

## Database

Table: `employee.disciplinary_actions`

Fields: `id`, `employee_id`, `company_id`, `action_type`, `reason`, `details`, `evidence_url`, `termination_reason`, `termination_note`, `issued_by`, `acknowledged_by`, `acknowledged_at`, `created_at`, audit columns.

Migration: `20260623180000_disciplinary_actions`

## Backend

Module: `backend/src/modules/disciplinary/`

- `DisciplinaryActionService.createAction`
- `DisciplinaryActionService.acknowledgeAction`
- `DisciplinaryActionService.listEmployeeActions`
- `DisciplinaryActionService.getEmployeeDisciplinarySummary`

## Permissions

| Role | Scope |
|------|-------|
| Owner | Full |
| Secretary | Admin / HR / Finance department route |
| Big Leader | Marketing department route |
| Employee | Read + acknowledge own records |

## Workflow

```
Create disciplinary record (HR/Owner)
  → Telegram notification to employee
  → Employee acknowledges (Telegram รับทราบ or web)
  → Stored permanently (DISC-005)
```

## APIs

- `GET /employees/:id/disciplinary`
- `POST /employees/:id/disciplinary`
- `GET /disciplinary-actions/:id`
- `POST /disciplinary-actions/:id/acknowledge`

## UI

Route: `/hr/employees/:id/disciplinary`  
Tab label: **วินัย**  
Timeline: date, issuer, reason, evidence, acknowledged status.

## Telegram

`DisciplinaryTelegramNotifier` sends HTML message with inline **รับทราบ** button.  
Callback: `disciplinary:ack:{actionId}` → `DisciplinaryActionService.acknowledgeFromTelegram`

## Tests

- Unit: `disciplinary-action.service.unit.spec.ts`
- Integration: `disciplinary.integration.spec.ts` (requires `DATABASE_URL`)
- UI: `disciplinary.test.ts` (label helpers)

## Remaining gaps (POL-025b)

- Auto-escalation verbal → warning 1 → warning 2 → termination
- Link DISC-004 termination to exit case / employment status change
- Termination settlement (DISC-001d, DISC-002a–d)
- `LEGAL_REVIEW_REQUIRED` flag enforcement
- Salary reduction step (legacy handbook WS-001)
