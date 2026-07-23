# WorkHQ Enterprise Scorecard

**Document ID:** QA-004-B  
**Version:** 1.0  
**Date:** 2026-06-24

---

## Weighted Overall Score: **74 / 100**

Target for Enterprise Certified: **≥95**

---

## Dimension Scores

| Dimension | Score | Weight | Weighted |
|-----------|-------|--------|----------|
| Architecture | 88 | 8% | 7.0 |
| Database | 92 | 7% | 6.4 |
| API | 95 | 8% | 7.6 |
| Web | 78 | 6% | 4.7 |
| Telegram | 85 | 7% | 6.0 |
| Workflow | 90 | 6% | 5.4 |
| Payroll | 75 | 8% | 6.0 |
| Attendance | 83 | 5% | 4.2 |
| Leave | 83 | 5% | 4.2 |
| Performance | 73 | 4% | 2.9 |
| Exit | 79 | 4% | 3.2 |
| AI | 67 | 3% | 2.0 |
| Knowledge | 72 | 2% | 1.4 |
| Security | 88 | 8% | 7.0 |
| Monitoring | 82 | 4% | 3.3 |
| Operations | 82 | 3% | 2.5 |
| Documentation | 90 | 2% | 1.8 |
| Testing | 68 | 4% | 2.7 |
| Deployment | 80 | 2% | 1.6 |
| Backup | 70 | 2% | 1.4 |
| Recovery | 65 | 2% | 1.3 |

**Weighted Total: 74.4 → 74**

---

## Strengths (≥85)

- **API (95):** Comprehensive REST surface, permission guards, versioning
- **Database (92):** Prisma schema validated, migrations tracked
- **Architecture (88):** Modular NestJS, DDD patterns, outbox, audit
- **Security (88):** JWT, guards, company isolation, access audit
- **Workflow (90):** Universal request center, unified Telegram inbox
- **Documentation (90):** Policy matrix, audits, traceability docs

---

## Weaknesses (<75)

- **AI (67):** Morning brief operational; UAT pending
- **Testing (68):** 68% rule coverage; UAT 0%
- **Recovery (65):** Procedures documented; not live-tested
- **Performance (73):** Benchmark plan only; no load test evidence
- **Payroll (75):** Policy gaps + no E5 UAT

---

## Enterprise Score Trend

| Sprint | Score |
|--------|-------|
| QA-001 Audit | 62 |
| QA-002 Evidence | 68 |
| QA-003 Traceability | 74 |
| QA-004 Certification | **74** |

Score unchanged — certification confirms gaps; UAT execution required to reach ≥95.
