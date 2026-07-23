# WorkHQ Deployment Certification

**Document ID:** QA-004-H  
**Version:** 1.0  
**Date:** 2026-06-24

---

## Deployment Procedure Verification

| Step | Action | Verified | Evidence |
|------|--------|----------|----------|
| 1 | Fresh environment | Documented | WORKHQ_UAT_SEED_GUIDE.md |
| 2 | Apply migrations | **PASS** | `npx prisma migrate deploy` |
| 3 | Seed UAT | Documented | Seed scripts + UAT guide |
| 4 | Build backend | **PASS** | `npm run build` (backend) |
| 5 | Build frontend | **FAIL** | Pre-existing TS errors in web |
| 6 | Start services | Documented | Docker / PM2 / K8s |
| 7 | Health checks | **PASS** | `GET /api/v1/health`, `GET /ops/health` |
| 8 | Telegram connection | **PASS** | Webhook + token configured |
| 9 | Scheduler startup | **PASS** | NestJS `@Cron` on bootstrap |
| 10 | Smoke tests | **PASS** (with DATABASE_URL) | `production-smoke.integration.spec.ts` |

**Certification Status:** **Provisionally Certified** — web build requires TS fixes

---

## Environment Variables (Production Minimum)

```
DATABASE_URL=
REDIS_URL=
JWT_SECRET=
TELEGRAM_BOT_TOKEN=
TELEGRAM_WEBHOOK_SECRET=
DOCUMENT_STORAGE_DRIVER=local|s3
DOCUMENT_STORAGE_BUCKET=  (if s3)
```

---

## Deploy Commands

```bash
# 1. Database
npx prisma migrate deploy --schema prisma/schema.prisma
npx prisma generate --schema prisma/schema.prisma

# 2. Backend
cd backend && npm ci && npm run build && npm run start:prod

# 3. Frontend
cd web && npm ci && npm run build
# Serve dist/ via nginx or CDN

# 4. Verify
bash scripts/workhq-enterprise-certification.sh
```

---

## Post-Deploy Checklist

- [ ] `GET /api/v1/health` returns 200
- [ ] Owner can access `/ops/health`
- [ ] Telegram bot responds to /start
- [ ] Morning brief scheduler registered (08:00 Bangkok)
- [ ] Smoke tests pass against production URL (read-only subset)

---

## Rollback

1. Revert to previous container/image tag
2. If migration applied: restore DB snapshot (do not reverse migrate)
3. Verify `/ops/health` overallStatus = healthy
