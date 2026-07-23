# WorkHQ Security Audit

**Sprint:** QA-001 Production Stabilization  
**Generated:** 2026-06-25  
**Scope:** Authentication, authorization, data redaction, webhook security

## Executive Summary

| Domain | Result | Critical Issues |
|--------|--------|-----------------|
| Authentication (JWT) | **PASS** | 0 |
| Authorization (RBAC) | **PASS** | 0 (4 fixed QA-001) |
| Finance access control | **PASS** | 0 |
| Salary data redaction | **PARTIAL** | 0 critical; graph gaps |
| Telegram webhook | **PASS** | 0 (by design @Public) |
| Company isolation | **PASS** | 0 |
| Audit trail | **PASS** | 0 |

## QA-001 Security Fixes

### Document Request Permission Guards (CRITICAL → RESOLVED)

| Route | Vulnerability | Fix | Status |
|-------|---------------|-----|--------|
| GET `/document-requests/types` | Unauthenticated read | `@RequirePermission('document:read')` | FIXED |
| GET `/document-requests/mine` | Cross-user access | `@RequirePermission('document:read')` | FIXED |
| GET `/document-requests/:id` | IDOR | `@RequirePermission('document:read')` | FIXED |
| POST `/document-requests/employees/:id` | Unauthorized submit | `@RequirePermission('document:write')` | FIXED |

## Authentication

| Control | Implementation | Status |
|---------|----------------|--------|
| JWT global guard | `APP_GUARD` → `JwtAuthGuard` | PASS |
| `@Public()` decorator | Auth login, health, Telegram webhook only | PASS |
| Password change gate | `MustChangePasswordGuard` | PASS |
| Login rate limit | 5 attempts / 60s | PASS |
| Password min length | 8 chars on change | PASS |
| Temp password enforcement | Blocks API until changed | PASS |

## Authorization (RBAC)

| Layer | Mechanism | Status |
|-------|-----------|--------|
| System roles | owner, super_admin, sub_leader, employee | PASS |
| Business roles | owner, secretary, big_leader, sub_leader, employee | PASS |
| Permission bundles | `BUSINESS_ROLE_BUNDLES` | PASS |
| `@RequirePermission` | 614/621 routes | PASS |
| Company scoping | `CompanyAccessService` | PASS |
| Cross-company denial | 403 on scope violation | PASS |

## Finance Module Gating

All 15 finance routes require explicit permissions:

| Operation | Permission | Status |
|-----------|------------|--------|
| Read (cost centers, budgets, transactions) | `finance:read` | PASS |
| Write (create, update, delete) | `finance:write` | PASS |
| Approve / post | `finance:approve` | PASS |

Web nav gated by `finance:read` on `/finance` route.

## Salary Data Redaction

| Surface | Redaction Logic | Status |
|---------|-----------------|--------|
| Audit Explorer | `SALARY_ENTITY_TYPES` redacted for employee/sub_leader | PASS |
| Knowledge Graph | `redactedFields: ['salary','netPay','baseSalary','amount']` | PARTIAL |
| AI Graph Query (Telegram) | Same filter via `canViewSalary(actor)` | PARTIAL |
| Payroll API | `payroll:read` permission required | PASS |
| Payslip self-service | Scoped to own employeeId | PASS |

### Redaction Gaps (Partial)

1. Knowledge Graph may expose salary-adjacent fields in graph edges not in redacted list.
2. AI Manager brief sections include counts but not amounts — verify in UAT.
3. Executive dashboard commission totals visible to `reporting:executive` — by design.

## Telegram Webhook Security

| Control | Detail | Status |
|---------|--------|--------|
| `@Public()` | Required — Telegram servers cannot send JWT | By design |
| Path secret | `TELEGRAM_WEBHOOK_SECRET` param match | PASS |
| Header secret | `X-Telegram-Bot-Api-Secret-Token` match | PASS |
| Missing secret config | Returns 401 Unauthorized | PASS |
| Processing isolation | Fire-and-forget; errors logged + alerted | PASS |
| Identity linking | Telegram account ↔ user ↔ employee | PASS |

## Access Control Integration Tests

| Test | Spec | Result |
|------|------|--------|
| Business role permissions | `business-role-permissions` | PASS |
| Access control matrix | `access-control` | PASS |
| Employee access audit | `employee-access-audit` | PASS |
| Company isolation | `company-isolation` | PASS |
| Telegram identity security | `telegram-identity` | PASS |
| Approval authority | `approval-authority` | PASS |

## Sensitive Data Handling

| Data Class | Protection | Status |
|------------|------------|--------|
| Passwords | bcrypt hash; never logged | PASS |
| JWT tokens | Short-lived; no refresh in response body logged | PASS |
| Bank account numbers | Encrypted at rest (employee module) | PASS |
| Salary amounts | Permission + redaction | PARTIAL |
| Audit logs | Append-only; immutable | PASS |
| File uploads | Company-scoped storage path | PASS |

## Threat Model Summary

| Threat | Mitigation | Residual Risk |
|--------|------------|---------------|
| IDOR on document requests | QA-001 permission guards | Low |
| Cross-company data leak | CompanyAccessService | Low |
| Telegram webhook spoofing | Dual secret validation | Low |
| Brute force login | ThrottlerGuard | Low |
| Salary exposure via AI graph | Partial redaction | Medium |
| Unguarded API routes | 7 intentional only | Low |

## Recommendations

1. Extend Knowledge Graph redaction to all salary-adjacent edge properties.
2. Add automated security scan: detect routes missing `@RequirePermission`.
3. Rotate `TELEGRAM_WEBHOOK_SECRET` on bot redeployment.
4. UAT salary visibility with employee, sub_leader, and owner roles.
5. Review `@Public()` usage quarterly — currently 5 decorators across 3 controllers.
