# WorkHQ Architecture Audit

**Sprint:** QA-001 Production Stabilization  
**Generated:** 2026-06-25  
**Stack:** NestJS backend · React/Vite web · PostgreSQL 16 (multi-schema) · Redis · Telegram Bot API

## Executive Summary

| Check | Result | Notes |
|-------|--------|-------|
| Controller count | **62** | HTTP controllers under `backend/src` |
| Route handlers | **621** | `@Get/@Post/@Put/@Patch/@Delete` decorators |
| RequirePermission coverage | **614 / 621** (98.9%) | 7 intentionally unguarded |
| JwtAuthGuard (global) | **PASS** | Registered as `APP_GUARD` in `app.module.ts` |
| PermissionGuard (global) | **PASS** | Enforces `@RequirePermission` |
| ThrottlerGuard (global) | **PASS** | Rate limiting on auth routes |
| Prisma validate | **PASS** | `npx prisma validate` |
| Backend tsc --noEmit | **PARTIAL** | Pre-existing type errors in some modules |
| Backend build | **PARTIAL** | May fail with `ENOTEMPTY` on dist directory |
| Web build | **PASS** | Vite production build |

## Guard Stack (Request Pipeline)

```
Request → ThrottlerGuard → JwtAuthGuard → MustChangePasswordGuard → PermissionGuard → Controller
```

| Order | Guard | Purpose |
|-------|-------|---------|
| 0 | ThrottlerGuard | Rate limit (login: 5/min) |
| 1 | JwtAuthGuard | JWT authentication (global) |
| 2 | MustChangePasswordGuard | Temp password enforcement |
| 3 | PermissionGuard | `@RequirePermission` authorization |

Routes marked `@Public()` skip JwtAuthGuard only; PermissionGuard still applies unless no `@RequirePermission` is set.

## Controller Inventory (62)

| Domain | Controllers | Routes (approx) |
|--------|-------------|-----------------|
| Employee / HR | 12 | 180 |
| Attendance / Leave | 4 | 34 |
| Payroll / Finance | 6 | 49 |
| Commission / Marketing | 14 | 98 |
| Request / Workflow | 5 | 89 |
| Performance / KPI | 4 | 58 |
| Document / Knowledge | 4 | 33 |
| AI | 3 | 16 |
| Permission / Security | 5 | 38 |
| Settings / Ops / QA | 5 | 26 |
| Auth / Health / Telegram | 3 | 8 |

## Unguarded Routes (7 — By Design)

| # | Method | Route | Controller | Rationale |
|---|--------|-------|------------|-----------|
| 1 | POST | `/auth/login` | AuthController | Public login; throttled |
| 2 | GET | `/auth/me` | AuthController | JWT-only; returns own profile |
| 3 | POST | `/auth/change-password` | AuthController | JWT-only; self-service |
| 4 | GET | `/health` | HealthController | Liveness probe |
| 5 | GET | `/health/details` | HealthController | `@Public` + MetricsTokenGuard |
| 6 | GET | `/health/metrics` | HealthController | Prometheus; token-guarded |
| 7 | POST | `/telegram/webhook/:secret` | TelegramController | Telegram servers; secret validated |

**QA-001 fix:** Document Request controller (4 routes) previously lacked `@RequirePermission`; all 4 now guarded with `document:read` / `document:write`.

## Module Architecture

```
backend/src/
├── auth/                  # JWT, login, password change
├── common/                # Health, monitoring, outbox, schedulers
├── shared/                # Prisma, audit, kernel
└── modules/
    ├── employee/          # Core HR
    ├── attendance/        # Check-in/out, absence, OT
    ├── leave/             # Leave requests, reschedule, shift swap
    ├── payroll/           # Cycles, export, manual commission
    ├── request/           # Request platform + workflow builder
    ├── workflow/          # Workflow engine + inbox
    ├── telegram/          # Bot service, webhook, handlers
    ├── ai/                # Assistant, manager, knowledge graph
    └── ... (35 domain modules)
```

## Build & TypeScript Issues

| Issue | Severity | Status |
|-------|----------|--------|
| `ENOTEMPTY` on `backend/dist` during parallel build | Medium | Workaround: remove dist before build |
| Pre-existing tsc errors in extracted/marketing modules | Low | Out of HR-only scope |
| `dist.bak.*` directories from failed builds | Low | Cleanup recommended |

## Infrastructure Dependencies

| Service | Required | Health Check |
|---------|----------|--------------|
| PostgreSQL 16 | Yes | `/health` → database |
| Redis | Yes (schedulers) | `/health` → redis |
| Telegram Bot API | Optional | `/health` → telegram |
| Anthropic / OpenAI | Optional | `/health` → ai |
| File storage | Yes | `STORAGE_PATH` / `UPLOAD_DIR` |

## Scheduler Architecture

| Job | Time (Asia/Bangkok) | Lock |
|-----|---------------------|------|
| AI Morning Brief | 08:00 | Redis 3600s |
| Legacy Owner Brief | 09:00 | Redis 3600s |
| Evening Brief | 23:59 | Redis 3600s |
| Recognition awards | Cron | Redis lock |

## Recommendations

1. Add CI step to `rm -rf backend/dist` before build to prevent ENOTEMPTY.
2. Resolve remaining tsc errors before production tag.
3. Document the 7 intentionally unguarded routes in security runbook.
4. Keep `@Public()` usage restricted to auth, health, and Telegram webhook.
