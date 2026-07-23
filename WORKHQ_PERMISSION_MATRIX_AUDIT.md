# WorkHQ Permission Matrix Audit (QA-001)

**Date:** 2026-06-24 | **Scope:** Owner, Secretary, Big Leader, Sub Leader, Employee

## Summary

| Check | Result |
|-------|--------|
| Cross-company denial | **PASS** (integration: `company-isolation.integration.spec.ts`) |
| JWT global + PermissionGuard | **PASS** |
| Salary visibility service | **PASS** (`SalaryVisibilityService`) |
| Document permission guards | **PASS** (QA-001: document-request fixed) |
| Graph query redaction | **PARTIAL** |
| Audit log access | **PASS** (settings:read) |

## Salary Visibility Rules

| Role | Own salary | Team | All companies |
|------|------------|------|---------------|
| Owner | ✓ | ✓ | ✓ |
| Secretary | ✓ | ✓ | ✓ (payroll operator) |
| Big Leader | ✓ | Scoped company | ✗ |
| Sub Leader | ✓ | Self | ✗ |
| Employee | ✓ | ✗ | ✗ |

**Tests:** `business-role-permissions.integration.spec.ts`, `employee-access-audit.integration.spec.ts`

## Module Permission Matrix (sample)

| Module | Owner | Secretary | Big Leader | Sub Leader | Employee |
|--------|-------|-----------|------------|------------|----------|
| Employee profile | R/W all | R/W company | R team | R team | R self |
| Payroll | R/W | R/W export | R scoped | ✗ | R self payslip |
| Leave approve | ✓ | ✓ | ✓ team | ✓ team | ✗ |
| Documents | R/W all | R/W company | R team | R self | R self |
| Exit approve | ✓ | partial | ✓ | ✗ | R self status |
| KPI / Performance | R/W | R/W | R team | R team | R self |
| AI Graph | ✓ company | ✓ company | partial | ✗ | own-data only |
| Audit Explorer | ✓ | ✓ | ✗ | ✗ | ✗ |
| Ops / QA | ✓ | ✗ | ✗ | ✗ | ✗ |

## Denied Cases Verified

- Employee cannot access another employee's payslip (payroll self-scope)
- Sub leader cannot access other company data (`CompanyAccessDeniedError`)
- Non-owner cannot access `/qa/readiness` (`reporting:owner`)
- Finance routes require `finance:*` permissions (HR-only deployment: disable nav)

## Gaps

| Gap | Risk | Status |
|-----|------|--------|
| Graph query salary fields | High | PARTIAL — filter service exists, needs UAT |
| Telegram document download | Medium | Info-only, no file attach |
| `permissions/me/effective` unguarded | Low | Self-service by design |

## QA Verdict: **CONDITIONAL PASS**

Run UAT with real Owner/Secretary/Employee accounts before production.
