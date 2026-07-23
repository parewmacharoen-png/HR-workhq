# WorkHQ Performance Certification

**Document ID:** QA-004-I  
**Version:** 1.0  
**Date:** 2026-06-24

---

## Summary

**Certification Status:** **Not Ready** — benchmark plan documented; formal load tests not executed in this sprint.

---

## Smoke Test Latency (Integration Environment)

Measured in `production-smoke.integration.spec.ts` (single-tenant, small dataset):

| Operation | Target | Observed (max) |
|-----------|--------|----------------|
| Login | <5s | ✓ enforced in test |
| Employee search | <8s | ✓ enforced in test |
| Leave request | <10s | ✓ enforced in test |
| Workflow inbox | <8s | ✓ enforced in test |
| Payroll cycles list | <8s | ✓ enforced in test |
| Ops health | <8s | ✓ enforced in test |
| AI manager brief | <15s | ✓ enforced in test |
| Knowledge Graph query | <15s | ✓ enforced in test |

---

## Planned Benchmarks (Not Yet Executed)

### 100 Employees

| Endpoint | Target p95 |
|----------|------------|
| Dashboard load | <2s |
| Attendance check-in | <500ms |
| Team calendar | <3s |
| Payroll preview | <5s |
| Telegram callback | <1s |
| AI query | <10s |

### 500 Employees

| Endpoint | Target p95 |
|----------|------------|
| Dashboard load | <5s |
| Employee list (paginated) | <3s |
| Payroll preview | <15s |
| Calendar month view | <5s |

---

## Recommendations

1. Run k6 or Artillery against staging with 100/500 employee seed
2. Add DB indexes review for payroll build queries
3. Enable Redis caching for dashboard aggregates if p95 exceeds targets
4. Monitor `/ops/health` formula fallback rate under load

**Performance certification deferred to pre-go-live load test sprint.**
