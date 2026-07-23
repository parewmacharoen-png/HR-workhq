# WorkHQ — Database Deployment Instructions

How to apply the migration baseline to a database, for both the **Prisma
workflow** (recommended, gives you migration history) and the **direct psql
workflow** (for environments without Node).

> Prerequisites
> * PostgreSQL **16+**
> * Extensions available on the server: `pgcrypto`, `btree_gist`, `vector`
>   (the `vector` extension is **pgvector** — install the `postgresql-16-pgvector`
>   package or equivalent before deploying).
> * A database role with privileges to `CREATE SCHEMA`, `CREATE EXTENSION`,
>   and create functions/triggers.

---

## Option A — Prisma workflow (recommended)

This records each migration in the `_prisma_migrations` table so future
`prisma migrate deploy` runs are incremental and idempotent.

### 1. Configure the connection

`backend/.env`:

```
DATABASE_URL="postgresql://USER:PASSWORD@HOST:5432/workhq?schema=public"
```

The `?schema=public` parameter is required by Prisma's connection string even
though the application uses 19 schemas; Prisma's multi-schema support is enabled
via `previewFeatures = ["multiSchema"]` in `schema.prisma`.

### 2. First-time deploy (fresh database)

```bash
cd backend
npm install
npx prisma migrate deploy
```

`migrate deploy`:
1. Creates `_prisma_migrations` if absent.
2. Applies `20260101000000_init` then `20260101000100_pg_features` in order.
3. Records both as applied. Re-running is a no-op.

### 3. Generate the Prisma client

```bash
npx prisma generate
```

### 4. Verify

```bash
npx prisma migrate status        # should report: Database schema is up to date!
```

---

## Option B — Direct psql workflow (no Node required)

For containers, CI images, or DBA-driven deploys without the Prisma CLI.

```bash
# 1. Create the database
createdb -h "$PGHOST" -U "$PGUSER" workhq

# 2. Apply migrations IN ORDER, fail-fast on any error
psql -h "$PGHOST" -U "$PGUSER" -d workhq -v ON_ERROR_STOP=1 \
     -f prisma/migrations/20260101000000_init/migration.sql

psql -h "$PGHOST" -U "$PGUSER" -d workhq -v ON_ERROR_STOP=1 \
     -f prisma/migrations/20260101000100_pg_features/migration.sql
```

> If you later switch this database to the Prisma workflow, you must
> **baseline** it so Prisma knows these migrations are already applied:
>
> ```bash
> npx prisma migrate resolve --applied 20260101000000_init
> npx prisma migrate resolve --applied 20260101000100_pg_features
> ```

---

## Post-deploy smoke tests

Run these against any freshly migrated database to confirm the critical
guarantees are live:

```sql
-- 74 tables
SELECT count(*) FROM information_schema.tables
WHERE table_schema NOT IN ('pg_catalog','information_schema')
  AND table_type='BASE TABLE';                                  -- expect 74

-- 2 EXCLUDE (no-overlap) constraints
SELECT count(*) FROM pg_constraint WHERE contype='x';           -- expect 2

-- append-only enforcement works
INSERT INTO system.audit_logs(entity_type, action) VALUES ('smoke','create');
UPDATE system.audit_logs SET action='x';
--   -> ERROR: Table system.audit_logs is append-only; UPDATE is not permitted

-- updated_at trigger works
INSERT INTO organization.companies(code, name) VALUES ('SMK','Smoke Co');
UPDATE organization.companies SET name='Smoke Co 2' WHERE code='SMK';
SELECT updated_at > created_at FROM organization.companies WHERE code='SMK';  -- t

-- pgvector index present
SELECT indexname FROM pg_indexes WHERE indexdef LIKE '%hnsw%';  -- ix_ai_emb_vector
```

---

## Rollback

These migrations have no `down` script (Prisma does not use down migrations).
To roll back a **fresh** deployment, drop and recreate the database, or drop the
19 application schemas:

```sql
DROP SCHEMA IF EXISTS
  organization, employee, permission, attendance, leave, workflow, payroll,
  commission, finance, performance, recruitment, referral, training, assets,
  knowledge, ai, reporting, telegram, system
CASCADE;
```

For production, take a backup before any destructive operation:

```bash
pg_dump -h "$PGHOST" -U "$PGUSER" -Fc workhq > workhq_$(date +%Y%m%d_%H%M%S).dump
```

---

## CI/CD recommendation

In a deployment pipeline, run **migrate deploy before** starting the app, and
fail the deploy if it errors:

```bash
npx prisma migrate deploy   # blocks app start on failure
npm run start:prod
```

Never run `prisma migrate dev` in CI or production — it is an interactive
development command that can generate and apply new migrations. Production uses
`migrate deploy` exclusively.

---

## Ordering & idempotency summary

| Property | Status |
|---|---|
| Deterministic order | ✅ folder timestamps `…000000` < `…000100` |
| Fail-fast on error | ✅ `ON_ERROR_STOP=1` / Prisma aborts on first error |
| Re-runnable via Prisma | ✅ `_prisma_migrations` tracks applied state |
| Re-runnable via psql | ⚠️ raw psql is **not** idempotent — apply once to a fresh DB, or use Prisma to track state |
| Extensions guarded | ✅ `CREATE EXTENSION IF NOT EXISTS` |
