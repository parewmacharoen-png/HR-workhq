# WorkHQ Production Readiness

## Stabilization Sprint Scope (HR-only)

- Telegram menus wired for Employee, Leader, Owner/Secretary
- AI Morning Brief scheduler at **08:00 Asia/Bangkok**
- Formula engine Phase 1 integrations with fallback
- Integration test matrix (skip without `DATABASE_URL`)
- UAT checklist and seed guidance

## Pre-Deploy Checklist

1. Run `bash scripts/workhq-production-stabilization-check.sh`
2. Apply migrations: `cd backend && npx prisma migrate deploy --schema ../prisma/schema.prisma`
3. Regenerate client: `npx prisma generate --schema ../prisma/schema.prisma`
4. Set `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_URL` (or `TELEGRAM_USE_POLLING=true` for dev)
5. Verify Redis available for scheduler locks
6. Confirm `DATABASE_URL` for integration tests in CI

## Scheduler Behavior

| Job | Time (Bangkok) | Lock TTL |
|-----|----------------|----------|
| AI Morning Brief | 08:00 | 3600s |
| Legacy Owner Brief | 09:00 | 3600s |
| Evening Brief | 23:59 | 3600s |

## Formula Keys (Phase 1)

| Key | Module | Fallback |
|-----|--------|----------|
| `attendance.late_deduction` | Attendance check-in | Hardcoded late multiplier |
| `attendance.absence_penalty` | Absence approval | Role-based penalty table |
| `commission.admin_leave_penalty` | Admin commission | Tier table |
| `kpi.weighted_score` | Performance review | PerformanceScoreService |
| `referral.bonus_amount` | Referral payout | ReferralProgram.bonusAmount |

## Audit Events

- `morning_brief_generated`, `morning_brief_sent`, `morning_brief_failed`, `morning_brief_opened`
- `FormulaExecutionLog` with `fallbackUsed` on every resolve

## Known Gaps

- Full 9-flow integration matrix (OT, exit, referral end-to-end) — partial smoke tests only
- Optional `/uat` dashboard not implemented (low-risk deferral)
- Pre-existing backend build errors in some modules may remain outside stabilization diff
- Marketing Telegram items hidden when `marketingEnabled=false` (HR-only mode)

## Rollback

Migrations are additive. Disable schedulers by stopping backend replicas. Formula fallbacks ensure payroll/attendance continue if formulas unpublished.
