-- ============================================================================
-- docker/postgres/init-schemas.sql
-- Creates all 19 application schemas required by the Prisma multi-schema setup.
-- This runs ONCE when the PostgreSQL container is first initialised (before
-- Prisma migrations run). The schemas must exist before `prisma migrate deploy`
-- can create tables inside them.
--
-- Idempotent: IF NOT EXISTS means re-running this is always safe.
-- ============================================================================

-- Application domain schemas
CREATE SCHEMA IF NOT EXISTS organization;
CREATE SCHEMA IF NOT EXISTS employee;
CREATE SCHEMA IF NOT EXISTS "permission";
CREATE SCHEMA IF NOT EXISTS attendance;
CREATE SCHEMA IF NOT EXISTS "leave";
CREATE SCHEMA IF NOT EXISTS workflow;
CREATE SCHEMA IF NOT EXISTS payroll;
CREATE SCHEMA IF NOT EXISTS commission;
CREATE SCHEMA IF NOT EXISTS finance;
CREATE SCHEMA IF NOT EXISTS performance;
CREATE SCHEMA IF NOT EXISTS recruitment;
CREATE SCHEMA IF NOT EXISTS referral;
CREATE SCHEMA IF NOT EXISTS training;
CREATE SCHEMA IF NOT EXISTS assets;
CREATE SCHEMA IF NOT EXISTS knowledge;
CREATE SCHEMA IF NOT EXISTS ai;
CREATE SCHEMA IF NOT EXISTS reporting;
CREATE SCHEMA IF NOT EXISTS telegram;
CREATE SCHEMA IF NOT EXISTS marketing;
CREATE SCHEMA IF NOT EXISTS "system";

-- Extensions required by the application
-- pgcrypto   → gen_random_uuid(), pgp_sym_encrypt/decrypt for field encryption
-- btree_gist → EXCLUDE constraints (salary range overlap prevention)
-- vector     → pgvector for AI embeddings (HNSW index on ai.ai_embeddings)
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS btree_gist;
CREATE EXTENSION IF NOT EXISTS vector;

-- Grant the application user full access to all schemas
DO $$
DECLARE
  sch text;
  schemas text[] := ARRAY[
    'organization','employee','permission','attendance','leave','workflow',
    'payroll','commission','finance','performance','recruitment','referral',
    'training','assets','knowledge','ai','reporting','telegram','marketing','system'
  ];
BEGIN
  FOREACH sch IN ARRAY schemas LOOP
    EXECUTE format('GRANT ALL PRIVILEGES ON SCHEMA %I TO workhq', sch);
    EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA %I GRANT ALL ON TABLES TO workhq', sch);
    EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA %I GRANT ALL ON SEQUENCES TO workhq', sch);
  END LOOP;
END $$;
