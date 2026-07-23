-- HR-11A Settings Engine foundation

CREATE TYPE system.setting_category AS ENUM (
  'attendance',
  'leave',
  'payroll',
  'referral',
  'deposit',
  'workflow',
  'performance',
  'system'
);

CREATE TABLE system.setting_profiles (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   UUID REFERENCES organization.companies(id),
  category     system.setting_category NOT NULL,
  key          VARCHAR(120) NOT NULL,
  value        JSONB NOT NULL,
  is_active    BOOLEAN NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX setting_profiles_scope_category_key_uidx
  ON system.setting_profiles (
    COALESCE(company_id, '00000000-0000-0000-0000-000000000000'::uuid),
    category,
    key
  );

CREATE INDEX setting_profiles_category_key_idx
  ON system.setting_profiles (category, key);

CREATE INDEX setting_profiles_company_category_idx
  ON system.setting_profiles (company_id, category)
  WHERE company_id IS NOT NULL;

CREATE TABLE system.setting_versions (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  setting_profile_id UUID NOT NULL REFERENCES system.setting_profiles(id) ON DELETE CASCADE,
  previous_value     JSONB,
  new_value          JSONB NOT NULL,
  changed_by         UUID NOT NULL,
  changed_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX setting_versions_profile_changed_idx
  ON system.setting_versions (setting_profile_id, changed_at DESC);

CREATE TABLE system.setting_audits (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID REFERENCES system.setting_profiles(id) ON DELETE SET NULL,
  company_id UUID REFERENCES organization.companies(id),
  category   system.setting_category,
  actor_id   UUID NOT NULL,
  action     VARCHAR(40) NOT NULL,
  key        VARCHAR(120) NOT NULL,
  old_value  JSONB,
  new_value  JSONB,
  timestamp  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX setting_audits_company_timestamp_idx
  ON system.setting_audits (company_id, timestamp DESC);

CREATE INDEX setting_audits_key_timestamp_idx
  ON system.setting_audits (key, timestamp DESC);
