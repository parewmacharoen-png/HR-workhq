# WorkHQ Go-Live Checklist

**Document ID:** QA-004-K  
**Version:** 1.0  
**Date:** 2026-06-24

---

## Infrastructure

- [ ] Production PostgreSQL provisioned with automated backups
- [ ] Redis instance available
- [ ] Application servers / containers configured
- [ ] HTTPS/TLS certificates installed
- [ ] Environment variables set (see DEPLOYMENT_CERTIFICATION)
- [ ] CDN/static hosting for web build

## Database

- [ ] `npx prisma migrate deploy` executed successfully
- [ ] Seed data verified (companies, roles, permissions)
- [ ] Backup restore drill completed (recommended)

## Telegram

- [ ] `TELEGRAM_BOT_TOKEN` configured
- [ ] Webhook URL registered with Telegram
- [ ] Test message sent to Owner account
- [ ] Unified approval inbox verified

## Users

- [ ] Owner account created and linked to Telegram
- [ ] Secretary account(s) provisioned
- [ ] Big Leaders / Sub Leaders assigned
- [ ] Employee Telegram identities linked

## Permissions

- [ ] Business roles assigned per org chart
- [ ] Approval matrix configured per department
- [ ] Cross-company isolation spot-checked

## Schedulers

- [ ] All cron jobs running (Asia/Bangkok)
- [ ] AI Morning Brief 08:00 verified
- [ ] Birthday/anniversary recognition verified

## Monitoring

- [ ] `/ops/health` accessible to Owner
- [ ] Alert thresholds reviewed
- [ ] Error tracking (Sentry/Datadog) configured
- [ ] Outbox backlog monitoring enabled

## Backups

- [ ] Daily DB backup scheduled
- [ ] Document storage backup configured
- [ ] Recovery procedure documented and tested

## Training

- [ ] Owner trained on QA dashboards and ops console
- [ ] Secretary trained on payroll export
- [ ] Leaders trained on Telegram approvals
- [ ] Employees informed of Telegram menus

## Rollback Plan

- [ ] Previous application image tagged and retained
- [ ] DB snapshot taken pre-go-live
- [ ] Rollback runbook distributed to technical lead

---

## Sign-Off

| Role | Name | Date | Signature |
|------|------|------|-----------|
| Owner | _________________ | ________ | __________ |
| Secretary | _________________ | ________ | __________ |
| Technical Lead | _________________ | ________ | __________ |

## Go-Live Decision

- [ ] **GO** — All checklist items complete, UAT passed, confidence ≥95%
- [ ] **GO WITH CONDITIONS** — UAT in progress, known low-risk gaps documented
- [x] **NO GO** — UAT not executed; payroll E5 missing (current state)

**Current Recommendation:** **NO GO** until UAT sprint completes.
