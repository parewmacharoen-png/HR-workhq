-- HR-12: Business role permission system

CREATE TYPE "permission"."business_role_code" AS ENUM (
  'owner',
  'secretary',
  'big_leader',
  'sub_leader',
  'admin_manager',
  'admin',
  'employee'
);

CREATE TYPE "permission"."permission_override_effect" AS ENUM ('allow', 'deny');

CREATE TABLE "permission"."business_role_assignments" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "role" "permission"."business_role_code" NOT NULL,
  "assigned_by" UUID,
  "assigned_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "created_by" UUID,
  "updated_by" UUID,
  "deleted_at" TIMESTAMPTZ,
  "deleted_by" UUID,
  CONSTRAINT "business_role_assignments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "business_role_assignments_user_id_is_active_idx"
  ON "permission"."business_role_assignments" ("user_id", "is_active");

ALTER TABLE "permission"."business_role_assignments"
  ADD CONSTRAINT "business_role_assignments_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "permission"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "permission"."user_permission_overrides" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "permission" VARCHAR(80) NOT NULL,
  "effect" "permission"."permission_override_effect" NOT NULL,
  "reason" VARCHAR(500),
  "created_by" UUID NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "deleted_at" TIMESTAMPTZ,
  "deleted_by" UUID,
  CONSTRAINT "user_permission_overrides_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "user_permission_overrides_user_id_idx"
  ON "permission"."user_permission_overrides" ("user_id");

ALTER TABLE "permission"."user_permission_overrides"
  ADD CONSTRAINT "user_permission_overrides_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "permission"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "permission"."permission_audits" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "actor_id" UUID NOT NULL,
  "target_user_id" UUID NOT NULL,
  "action" VARCHAR(80) NOT NULL,
  "old_value" JSONB,
  "new_value" JSONB,
  "reason" VARCHAR(500),
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "permission_audits_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "permission_audits_target_user_id_created_at_idx"
  ON "permission"."permission_audits" ("target_user_id", "created_at");
