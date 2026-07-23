# WorkHQ Security Certification

**Document ID:** QA-004-J  
**Version:** 1.0  
**Date:** 2026-06-24

---

## Summary

| Control | Status | Evidence |
|---------|--------|----------|
| JWT authentication | **PASS** | `auth.integration.spec.ts` |
| Permission guards | **PASS** | 614/621 routes guarded |
| Company isolation | **PASS** | `company-isolation.integration.spec.ts` |
| Salary visibility | **PASS** | `employee-access-audit.integration.spec.ts` |
| Knowledge Graph redaction | **PARTIAL** | Service-level; UAT-O-08 pending |
| Document permissions | **PASS** | QA-001 document-request guards added |
| Telegram callback replay | **PASS** | Callback data + actor binding |
| Formula sandbox safety | **PASS** | `safe-formula.evaluator` — no eval |

**Certification Status:** **Provisionally Certified** — no critical findings; Knowledge Graph UAT pending

---

## JWT Verification

- Access tokens signed with `JWT_SECRET`
- `@CurrentActor()` extracts user context on all protected routes
- Inactive users rejected (`auth.integration.spec.ts`)

---

## Permission Guards

- `@RequirePermission('module:action')` on controllers
- `@Public()` only on health, login, telegram webhook
- Business role routing via `BusinessPermissionRepository`

---

## Company Isolation

- `EmployeeAccessService` enforces company scope on reads
- `CompanyAccessService` validates actor company assignments
- Integration test verifies cross-company denial

---

## Salary Visibility

- Sub-leaders see own payslip only (UAT-SL-02)
- Payroll cycle items scoped via access service
- Knowledge Graph must redact salary fields (partial evidence)

---

## Telegram Security

- Webhook secret validation
- Callback handlers bind to Telegram user → employee identity
- Approval actions require approver role match

---

## Formula Sandbox

- `safe-formula` evaluator: whitelisted operators only
- No `eval()`, no arbitrary code execution
- Execution logged to `FormulaExecutionLog` with fallback flag

---

## Critical Security Findings

| ID | Finding | Severity | Status |
|----|---------|----------|--------|
| SEC-F01 | Knowledge Graph salary redaction not UAT-verified | Medium | Open |
| SEC-F02 | AC-013 LEGAL_REVIEW_REQUIRED not implemented | Low | Open |

**No critical security findings blocking conditional UAT deployment.**
