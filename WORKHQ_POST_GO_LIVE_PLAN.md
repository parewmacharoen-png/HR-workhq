# WorkHQ Post Go-Live Monitoring Plan

**Document ID:** QA-004-L  
**Version:** 1.0  
**Date:** 2026-06-24

---

## First 24 Hours

| Hour | Activity | Owner |
|------|----------|-------|
| 0–1 | Verify `/ops/health` = healthy | Technical Lead |
| 0–2 | Monitor outbox backlog every 15 min | Technical Lead |
| 0–4 | Spot-check Telegram approvals (5 samples) | Secretary |
| 0–8 | First Morning Brief delivery verification | Owner |
| 0–24 | Watch error logs; zero critical alerts | Technical Lead |

**KPIs (24h):**
- Failed approvals: target 0 unexplained failures
- Failed Telegram messages: target <1% of outbound
- User-reported P1 bugs: target 0

---

## First 7 Days

| Day | Activity |
|-----|----------|
| 1 | Payroll cycle smoke (if cycle open) |
| 2 | Leave/OT approval audit sample (20 records) |
| 3 | Document generation success rate review |
| 4 | AI query denial rate review |
| 5 | Permission denial spike analysis |
| 6 | Formula fallback usage review |
| 7 | Week-1 retrospective with Owner |

**KPIs (7d):**
- Payroll discrepancies: target 0 unresolved
- Attendance issues: <5% of check-ins flagged
- AI false positives: <10% of queries

---

## First Month

- Weekly `/qa/traceability` review
- Full UAT regression on any hotfix
- Backup restore spot-check
- Performance baseline vs smoke test targets
- Policy gap triage (PAY-003a, etc.)

---

## Escalation Matrix

| Severity | Example | Response Time | Escalate To |
|----------|---------|---------------|-------------|
| P1 Critical | Payroll wrong amount paid | 1 hour | Owner + Technical Lead |
| P1 Critical | Cross-company data leak | Immediate | Owner + Security |
| P2 High | Telegram approvals stuck | 4 hours | Technical Lead |
| P2 High | Scheduler not running | 4 hours | Technical Lead |
| P3 Medium | Document gen failure | 24 hours | Secretary |
| P4 Low | UI cosmetic issue | Next sprint | Product |

---

## Monitoring Dashboards

- **Operational:** `/ops/health`
- **Traceability:** `/qa/traceability`
- **Readiness:** `/qa/readiness`

---

## Rollback Triggers

- P1 payroll calculation error affecting >1 employee
- Confirmed cross-company permission leak
- Database corruption
- Sustained Telegram delivery failure >4 hours with growing outbox

**Action:** Freeze payroll exports, revert application, restore DB if needed.
