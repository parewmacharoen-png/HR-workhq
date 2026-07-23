# WorkHQ API Audit

**Sprint:** QA-001 Production Stabilization  
**Generated:** 2026-06-25  
**Base URL:** `/api/v1`  
**Auth:** Bearer JWT (global guard) + `@RequirePermission`

## Executive Summary

| Metric | Value |
|--------|-------|
| Total route handlers | 621 |
| With `@RequirePermission` | 614 (98.9%) |
| Intentionally unguarded | 7 |
| Fixed in QA-001 | 4 (document-request) |
| Controllers | 62 |
| Throttled routes | 2 (login, change-password) |

## Permission Coverage

| Category | Routes | Guarded | Unguarded | Status |
|----------|--------|---------|-----------|--------|
| Business API | 614 | 614 | 0 | PASS |
| Auth (self) | 2 | 0 | 2 | PASS (JWT-only) |
| Health / Metrics | 3 | 0 | 3 | PASS (public/token) |
| Telegram webhook | 1 | 0 | 1 | PASS (secret-validated) |
| Document Request (pre-QA-001) | 4 | 0 → 4 | Fixed | PASS |

## QA-001 Document Request Fix

| Route | Method | Permission (added) | Before | After |
|-------|--------|-------------------|--------|-------|
| `/document-requests/types` | GET | `document:read` | Unguarded | PASS |
| `/document-requests/mine` | GET | `document:read` | Unguarded | PASS |
| `/document-requests/:id` | GET | `document:read` | Unguarded | PASS |
| `/document-requests/employees/:employeeId` | POST | `document:write` | Unguarded | PASS |

## Sample Routes (30 across modules)

| # | Method | Route | Permission | Module | Status |
|---|--------|-------|------------|--------|--------|
| 1 | POST | `/auth/login` | — (Public) | Auth | PASS |
| 2 | GET | `/auth/me` | — (JWT) | Auth | PASS |
| 3 | GET | `/health` | — (Public) | Health | PASS |
| 4 | GET | `/employees` | `employee:read` | Employee | PASS |
| 5 | POST | `/employees` | `employee:write` | Employee | PASS |
| 6 | GET | `/employees/:id/home-summary` | `employee:read` | Employee | PASS |
| 7 | POST | `/attendance/employees/:id/check-in` | `attendance:write` | Attendance | PASS |
| 8 | POST | `/attendance/employees/:id/corrections` | `attendance:write` | Attendance | PASS |
| 9 | POST | `/leave/employees/:id/requests` | `leave:write` | Leave | PASS |
| 10 | GET | `/leave/employees/:id/balances` | `leave:read` | Leave | PASS |
| 11 | GET | `/payroll/cycles` | `payroll:read` | Payroll | PASS |
| 12 | POST | `/payroll/cycles/:id/build` | `payroll:write` | Payroll | PARTIAL |
| 13 | GET | `/workflow/inbox` | `workflow:act` | Workflow | PASS |
| 14 | POST | `/workflow/instances/:id/actions` | `workflow:act` | Workflow | PASS |
| 15 | POST | `/requests` | `workflow:write` | Request | PASS |
| 16 | GET | `/requests/pending` | `workflow:act` | Request | PASS |
| 17 | POST | `/document-requests/employees/:id` | `document:write` | Document Request | PASS |
| 18 | GET | `/documents/dashboard` | `document:read` | Document Center | PASS |
| 19 | POST | `/announcements` | `document:write` | Announcement | PASS |
| 20 | GET | `/announcements/dashboard` | `document:read` | Announcement | PASS |
| 21 | GET | `/ai/manager/brief` | `employee:read` | AI Manager | PASS |
| 22 | POST | `/ai/chat` | `ai:chat` | AI Assistant | PASS |
| 23 | GET | `/ai/knowledge-graph/query` | `employee:read` | Knowledge Graph | PARTIAL |
| 24 | POST | `/referrals` | `referral:write` | Referral | PASS |
| 25 | POST | `/referrals/:id/pay` | `referral:write` | Referral | PASS |
| 26 | GET | `/finance/companies/:id/cost-centers` | `finance:read` | Finance | PASS |
| 27 | POST | `/exit-cases/:id/leader-review` | `employee:write` | Exit | PASS |
| 28 | GET | `/audit/explorer` | `settings:read` | Audit | PASS |
| 29 | GET | `/qa/readiness` | `reporting:owner` | QA | PASS |
| 30 | POST | `/telegram/webhook/:secret` | — (Public+secret) | Telegram | PASS |

## Module Route Counts (Top 10)

| Module | Routes | All Guarded |
|--------|--------|-------------|
| Request | 48 | Yes |
| Position Framework | 38 | Yes |
| Employee | 30 | Yes |
| Exit Case | 26 | Yes |
| KPI | 22 | Yes |
| Recruitment | 20 | Yes |
| Compensation Review | 19 | Yes |
| Performance | 19 | Yes |
| Reporting | 17 | Yes |
| Payroll | 16 | Yes |

## Response & Error Conventions

| Pattern | Status | Notes |
|---------|--------|-------|
| Success (create) | 201 | With entity body |
| Success (read) | 200 | Paginated where applicable |
| Forbidden (scope) | 403 | Cross-company denied |
| Unauthorized | 401 | Missing/invalid JWT |
| Validation error | 400 | class-validator DTOs |
| Not found | 404 | Soft-deleted excluded |

## Rate Limiting

| Route | Limit | Window |
|-------|-------|--------|
| POST `/auth/login` | 5 | 60s |
| POST `/auth/change-password` | 10 | 60s |
| All others | Default throttler | Per IP |

## API Gaps

1. **OpenAPI spec** — not auto-generated; manual documentation only.
2. **Versioning** — single `/api/v1` prefix; no v2 strategy documented.
3. **Pagination consistency** — some list endpoints return arrays without cursor metadata.
4. **GraphQL** — not implemented (REST-only).

## Recommendations

1. Add automated scan in CI: flag new routes missing `@RequirePermission`.
2. Generate OpenAPI from NestJS decorators for external consumers.
3. Standardize list response envelope (`{ data, total, cursor }`).
4. Re-run permission matrix audit after each sprint (`WORKHQ_PERMISSION_MATRIX_AUDIT.md`).
