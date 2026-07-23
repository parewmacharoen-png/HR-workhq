# Referral Settings (HR-11D)

Referral business rules are stored in the Settings Engine under category `referral`, key `rules`.

## Setting key

| Category | Key | Scope |
|----------|-----|-------|
| `referral` | `rules` | System default + optional company override |

## Payload (`referral.rules`)

| Field | Type | Default | Wired | Used by |
|-------|------|---------|-------|---------|
| `rewardAmount` | number | `2000` | ✅ | `ReferralService.register`, payroll item on pay |
| `requiredEmploymentDays` | number | `90` | ✅ | `QualificationService` via `ReferralSettingsService` |
| `payoutMode` | `"one_time"` | `"one_time"` | Reserved | Only `one_time` supported; validation rejects others |
| `autoCreatePayrollItem` | boolean | `true` | ✅ | `ReferralService.pay` — blocks pay when `false` |
| `allowMultipleReferrals` | boolean | `true` | Reserved | DB unique index still enforces one reward per referred employee |
| `duplicateCheckEnabled` | boolean | `true` | ✅ | Gates phone/national ID/bank duplicate checks on qualify |

Defaults preserve pre-HR-11D behavior (฿2,000 reward, ~90-day employment threshold, duplicate checks on, payroll item on pay).

**Migration note:** Qualification previously used `3 × 30.44` calendar days (~91.32 days). Defaults now use **90 whole calendar days** (`requiredEmploymentDays × 86_400_000 ms`). This is the documented sprint default; adjust per company if the legacy threshold must be preserved exactly.

## Resolution order

1. Company `referral.rules` (if set)
2. System `referral.rules` (seeded on deploy)
3. Built-in `DEFAULT_REFERRAL_RULES` fallback if neither exists

## Caching

`ReferralSettingsService` caches resolved rules per company. Cache is invalidated when any `referral` setting is updated via `SettingsService.setValue()`.

## Admin UI

**Settings → Referral** (`/settings/referral`)

Uses existing Settings API:

- `GET /api/v1/settings/referral?companyId=…`
- `PUT /api/v1/settings/referral/rules?companyId=…`

## Audit

Every save creates `SettingVersion` and `SettingAudit` records (Settings Engine).

## Migration notes (HR-11D)

- Removed `REWARD_AMOUNT` constant from `referral.entity.ts`.
- `ReferralService` reads rules via `ReferralSettingsService.getRules(companyId)`.
- Telegram referral status / qualification flows unchanged (same service layer).
- System default seeded in `backend/prisma/seed.ts`.

## Example company override

```json
PUT /api/v1/settings/referral/rules?companyId=<uuid>
{
  "value": {
    "rewardAmount": 2500,
    "requiredEmploymentDays": 90,
    "payoutMode": "one_time",
    "autoCreatePayrollItem": true,
    "allowMultipleReferrals": true,
    "duplicateCheckEnabled": true
  }
}
```
