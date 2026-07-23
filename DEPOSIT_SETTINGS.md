# Deposit Settings (HR-11D)

Employee deposit deduction rules are stored in the Settings Engine under category `deposit`, key `rules`.

## Setting key

| Category | Key | Scope |
|----------|-----|-------|
| `deposit` | `rules` | System default + optional company override |

## Payload (`deposit.rules`)

| Field | Type | Default | Wired | Used by |
|-------|------|---------|-------|---------|
| `enabled` | boolean | `true` | ✅ | `PayrollService.addDeposit` — throws when disabled |
| `monthlyDeductionAmount` | number | `500` | ✅ | Payroll deposit item amount and deposit ledger |
| `maximumBalanceAmount` | number | `3000` | ✅ | Running total cap before `DepositCapExceededError` |
| `deductionItemType` | string | `"deposit"` | ✅ | Payroll item `itemType` on deduction |
| `refundOnProperResignation` | boolean | `true` | Reserved | Exit/refund workflow not implemented in payroll |
| `allowPartialRefund` | boolean | `true` | Reserved | Finance refund module exists separately |
| `refundRequiresApproval` | boolean | `true` | Reserved | Approval workflow not wired to deposit settings |

Defaults preserve pre-HR-11D behavior (฿500/month, cap ฿3,000, payroll deduction type `deposit`).

## Resolution order

1. Company `deposit.rules` (if set)
2. System `deposit.rules` (seeded on deploy)
3. Built-in `DEFAULT_DEPOSIT_RULES` fallback if neither exists

## Caching

`DepositSettingsService` caches resolved rules per company. Cache is invalidated when any `deposit` setting is updated via `SettingsService.setValue()`.

## Admin UI

**Settings → Deposit** (`/settings/deposit`)

Uses existing Settings API:

- `GET /api/v1/settings/deposit?companyId=…`
- `PUT /api/v1/settings/deposit/rules?companyId=…`

Validation: `monthlyDeductionAmount >= 0`, `maximumBalanceAmount >= monthlyDeductionAmount` when `enabled` is true.

## Audit

Every save creates `SettingVersion` and `SettingAudit` records (Settings Engine).

## Migration notes (HR-11D)

- Removed `DEPOSIT_AMOUNT` / `DEPOSIT_CAP` constants from `payroll.service.ts`.
- `PayrollService.addDeposit` reads rules via `DepositSettingsService.getRules(companyId)`.
- Payslip generation sums payroll items — deposit line reflects configured deduction amount.
- Telegram payslip flows unchanged.
- System default seeded in `backend/prisma/seed.ts`.

## Example company override

```json
PUT /api/v1/settings/deposit/rules?companyId=<uuid>
{
  "value": {
    "enabled": true,
    "monthlyDeductionAmount": 400,
    "maximumBalanceAmount": 2400,
    "deductionItemType": "deposit",
    "refundOnProperResignation": true,
    "allowPartialRefund": true,
    "refundRequiresApproval": true
  }
}
```
