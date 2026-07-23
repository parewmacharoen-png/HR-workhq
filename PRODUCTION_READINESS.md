# WorkHQ — Production Readiness

WorkHQ v1 is feature-complete. This document is the operational runbook for deploying and running WorkHQ in staging and production.

---

## Deployment steps

### Prerequisites

- Docker 24+ and Docker Compose v2
- PostgreSQL 16 with extensions: `vector`, `btree_gist`, `pgcrypto` (provided by `pgvector/pgvector:pg16` image)
- TLS certificates for production (Let's Encrypt or platform-managed)
- Secrets manager or secure `.env` file (never commit secrets)

### Development (local)

```bash
cp backend/.env.example backend/.env
# Edit JWT_SECRET (≥16 chars for dev)

docker compose up -d --build
./scripts/verify-stack.sh
```

Services:

| Service | URL |
|---------|-----|
| API | http://localhost:3000/api/v1 |
| Web | http://localhost:8080 |
| Postgres | localhost:5432 |
| Redis | localhost:6379 |

### Staging

```bash
cp .env.staging.example .env
# Fill JWT_SECRET (≥64 chars), passwords, optional Telegram/AI keys

docker compose -f docker-compose.yml -f docker-compose.staging.yml up -d --build
./scripts/verify-stack.sh
```

Staging mirrors production (Redis password, JWT length, CORS restrictions) but exposes ports for debugging.

### Production

```bash
# Create persistent volumes once
docker volume create workhq_postgres_data
docker volume create workhq_redis_data

# Set all variables from .env.production.example in your platform
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

Production adds:

- Nginx TLS termination and rate limiting
- No exposed Postgres/Redis ports
- 2 API replicas (load balanced)
- Required `METRICS_TOKEN`, strong `JWT_SECRET`, explicit `CORS_ORIGINS`
- Daily automated backups via `backup-cron`

### Rollback

1. Stop write traffic: `docker compose stop api nginx web`
2. Restore database from backup (see [Backup & restore](#backup--restore))
3. Deploy previous image tag: `docker compose up -d api web nginx` with pinned image digest
4. Verify: `GET /api/v1/health` → `status: ok`
5. Re-register Telegram webhook if URL changed

---

## Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `JWT_SECRET` | Yes | ≥64 chars in staging/production |
| `REDIS_URL` | Recommended | Session locks, future queues |
| `REDIS_PASSWORD` | Prod | Redis auth (compose prod) |
| `CORS_ORIGINS` | Prod | Comma-separated origins (not `*`) |
| `METRICS_TOKEN` | Prod | Protects `/health/details` and `/health/metrics` |
| `TELEGRAM_BOT_TOKEN` | If using Telegram | From @BotFather |
| `TELEGRAM_WEBHOOK_URL` | If using Telegram | Public HTTPS webhook URL |
| `TELEGRAM_WEBHOOK_SECRET` | If using Telegram | Path + header verification |
| `ANTHROPIC_API_KEY` | If using AI chat | Claude advisory copilot |
| `OPENAI_API_KEY` | Optional | RAG vector search (keyword fallback without) |
| `SENTRY_DSN` | Recommended | Error reporting |
| `BACKUP_RETENTION_DAYS` | Optional | Default 30 (prod), 14 (staging) |

Templates: `.env.staging.example`, `.env.production.example`, `backend/.env.example`

---

## Health checks

### `GET /api/v1/health` (public)

Load-balancer probe. Returns structured status:

```json
{
  "status": "ok",
  "checks": {
    "database": "up",
    "redis": "up",
    "telegram": "up",
    "ai": { "anthropic": "up", "openai": "not_configured" },
    "outboxBacklog": 0
  },
  "telegram": { "webhookConfigured": true, "botUsername": "workhq_bot" },
  "time": "2026-06-21T00:00:00.000Z"
}
```

`status: degraded` when database/redis/Telegram is down, AI provider down when configured, or outbox backlog > 500.

### `GET /api/v1/health/details` (protected)

Ops diagnostics. Requires `Authorization: Bearer $METRICS_TOKEN` when `METRICS_TOKEN` is set (required in production).

Includes uptime, dependency connectivity, workflow/outbox counts, audit stats (24h), and config flags.

### `GET /api/v1/health/metrics` (protected)

Prometheus scrape endpoint (same auth as details).

---

## Monitoring

| Signal | Mechanism |
|--------|-----------|
| Request logging | `LoggingInterceptor` → structured JSON (`request_completed` / `request_failed`) |
| Error logging | `AllExceptionsFilter` → structured JSON; 5xx → Sentry |
| AI tool audit | Every tool call logged to `system.audit_logs` |
| Workflow audit | Domain mutations via `AuditService` |
| Prometheus | `/api/v1/health/metrics` |
| Outbox backlog | Health check + `workhq_outbox_events_pending` gauge |

### Alerting recommendations

- Health check fails 3× consecutive → page on-call
- `outboxBacklog > 500` or `workhq_outbox_events_high_attempts > 0`
- Sentry error rate spike
- Backup cron container not running

---

## Backup & restore

Automated daily backups via `backup-cron` service (`docker/backup/backup.sh`).

| Setting | Default |
|---------|---------|
| Schedule | 02:00 UTC (prod), 03:00 UTC (staging) |
| Format | `pg_dump` custom (`workhq_YYYYMMDD_HHMMSS.dump`) |
| Retention | 30 days (prod), 14 days (staging) |
| Location | `./backups` (host volume) |

Manual backup:

```bash
DATABASE_URL="postgresql://..." ./docker/backup/backup.sh
```

Restore:

```bash
export RESTORE_DATABASE_URL="postgresql://..."
./docker/backup/restore.sh ./backups/workhq_YYYYMMDD_HHMMSS.dump
```

Full procedure: `docker/backup/DISASTER_RECOVERY.md`

---

## Security audit findings

Review date: Sprint 10 (2026-06-21)

### Fixed (high risk)

| Finding | Fix |
|---------|-----|
| `/metrics` was unauthenticated | Moved to `/api/v1/health/metrics`; protected by `METRICS_TOKEN` in production |
| `CORS_ORIGINS=*` allowed in production | Boot fails if `*` in staging/production |
| `JWT_SECRET` only 16 chars minimum | Boot requires ≥64 chars in staging/production |
| `/health/details` would expose internals | Protected by `METRICS_TOKEN` |

### Accepted / documented (medium)

| Finding | Mitigation |
|---------|------------|
| JWT `companyId` claim trusted after DB user lookup | Scope enforced per-request via `PermissionService` + `CompanyAccessService`; document for operators |
| Telegram webhook is public (by design) | Dual secret validation (path + `X-Telegram-Bot-Api-Secret-Token` header) |
| AI tools are read-only advisory | RBAC + tier checks + audit on every invocation; AI identity blocked from approve/terminate |

### Low risk (no action required)

| Finding | Status |
|---------|--------|
| Global `PermissionGuard` on all non-`@Public()` routes | OK |
| `helmet()` security headers | OK |
| Nginx rate limits (auth 10/min, API 60/min) | OK |
| Password hashing via bcrypt | OK |
| Prisma parameterized queries | OK |

---

## Performance audit findings

### Recommendations (not implemented — monitor first)

| Area | Observation | Recommendation |
|------|-------------|----------------|
| Owner dashboard | Sequential per-company metric queries | Cache snapshots (already uses reporting snapshots); refresh on schedule |
| Executive insights | Aggregates 5+ services per request | Acceptable for owner-tier; add Redis cache if p95 > 2s |
| AI copilot | Multiple DB round-trips per tool | Tool result caching for idempotent reads (future) |
| Marketing KPI | Team-scoped joins across reports + expenses | Monitor slow query log; indexes exist on `attendance_records(company_id, work_date)` |

### Already optimized

- Outbox partial index: `ix_outbox_unprocessed ON (occurred_at) WHERE processed_at IS NULL`
- Workflow indexes on `company_id`, `status`
- Dashboard builder uses parallel `Promise.all` for independent metrics
- Reporting snapshots avoid live aggregation for cached dashboards

### Low-risk improvement applied

- Health check uses lightweight AI config probe (no paid API calls on every LB ping)
- Full AI connectivity check only in `/health/details`

---

## Audit coverage review

| Domain | HTTP guard | Audit log |
|--------|------------|-----------|
| Auth | Public login; JWT elsewhere | Login events |
| Permissions | `PermissionGuard` | Role/scope changes |
| Workflows | `workflow:act` + approver service | Workflow actions |
| AI tools | RBAC + tier + company scope | Every tool call (success/failure) |
| Payroll/commission writes | Domain permissions | AuditService on mutations |
| Telegram | Webhook secret | Message log table |
| Reporting/Executive | Read-only permissions | No mutation audit needed |

---

## Production checklist

- [ ] Copy and fill `.env.production.example` secrets
- [ ] `JWT_SECRET` ≥ 64 characters
- [ ] `CORS_ORIGINS` set to real web origin(s)
- [ ] `METRICS_TOKEN` set and stored in secrets manager
- [ ] `SENTRY_DSN` configured
- [ ] TLS certificates mounted in `nginx/ssl/`
- [ ] `docker volume create workhq_postgres_data workhq_redis_data`
- [ ] `docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build`
- [ ] `./scripts/verify-stack.sh` passes
- [ ] `GET /api/v1/health` → `ok`
- [ ] Telegram webhook registered (check logs on API boot)
- [ ] `backup-cron` running; confirm first dump in `./backups`
- [ ] Prometheus scraping `/api/v1/health/metrics` with bearer token
- [ ] Change default admin password (`admin` / `password` from seed)
- [ ] Run integration tests against staging before prod promotion

---

## Verification commands

```bash
npx prisma generate
npm run build          # from backend/
npm run test:unit
npm run test:int
cd web && npm run build
./scripts/verify-stack.sh
```

Definition of Done: system deploys via Docker, health checks pass, backups documented, high-risk security issues resolved, operational runbook complete.
