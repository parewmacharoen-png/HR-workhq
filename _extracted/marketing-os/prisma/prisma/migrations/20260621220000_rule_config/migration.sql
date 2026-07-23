-- Rule config profiles with version history for commission settings

CREATE TYPE "system"."RuleConfigDomain" AS ENUM ('marketing_commission', 'admin_commission');

CREATE TABLE "system"."rule_config_profiles" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "company_id" UUID NOT NULL,
    "domain" "system"."RuleConfigDomain" NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rule_config_profiles_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "rule_config_profiles_company_id_domain_key"
  ON "system"."rule_config_profiles"("company_id", "domain");

ALTER TABLE "system"."rule_config_profiles"
  ADD CONSTRAINT "rule_config_profiles_company_id_fkey"
  FOREIGN KEY ("company_id") REFERENCES "organization"."companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "system"."rule_config_versions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "profile_id" UUID NOT NULL,
    "version_number" INTEGER NOT NULL,
    "config" JSONB NOT NULL,
    "reason" VARCHAR(500) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rule_config_versions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "rule_config_versions_profile_id_version_number_key"
  ON "system"."rule_config_versions"("profile_id", "version_number");

CREATE INDEX "rule_config_versions_profile_id_is_active_idx"
  ON "system"."rule_config_versions"("profile_id", "is_active");

ALTER TABLE "system"."rule_config_versions"
  ADD CONSTRAINT "rule_config_versions_profile_id_fkey"
  FOREIGN KEY ("profile_id") REFERENCES "system"."rule_config_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
