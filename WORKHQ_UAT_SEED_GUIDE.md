# WorkHQ UAT Seed Guide

## Existing Seed

```bash
cd backend
npx ts-node --project tsconfig.json prisma/seed.ts
```

Default admin: `admin` / `password`

Companies: SB, MB, KW, VB, HH

## Recommended UAT Accounts

Create via web or seed extension:

| Role | Count | Notes |
|------|-------|-------|
| Owner | 1 | `reporting:owner`, all scope |
| Secretary | 1 | business role `secretary` |
| Big Leader | 1 | role `big_leader` |
| Sub Leader | 1 | role `sub_leader` |
| Employee | 3 | linked Telegram chat IDs |

## Sample Data Checklist

- [ ] 2 teams in 1 company
- [ ] Open payroll cycle with 3 employees
- [ ] Approved leave (today + tomorrow)
- [ ] Pending leave request
- [ ] OT pending approval
- [ ] Sample announcement (unacknowledged)
- [ ] Required document type on employee
- [ ] KPI cycle with 1 assignment
- [ ] Referral in `bonus_eligible` state
- [ ] Exit case in `pending_owner_review`

## Telegram Setup

1. Link each UAT user via `/start` + identity verification
2. Set `TELEGRAM_USE_POLLING=true` for local UAT
3. Verify menus per role from `WORKHQ_TELEGRAM_AUDIT.md`

## QA Dashboard

Owner opens `/qa/readiness` after seed to verify module status.
