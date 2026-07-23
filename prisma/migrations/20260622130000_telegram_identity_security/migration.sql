-- HR-11.5 Telegram Identity & Access Security

ALTER TABLE employee.employees
  ADD COLUMN IF NOT EXISTS invite_code VARCHAR(32);

CREATE INDEX IF NOT EXISTS employees_invite_code_idx ON employee.employees (invite_code);

CREATE TYPE telegram.telegram_identity_status AS ENUM ('ACTIVE', 'PENDING', 'REVOKED');
CREATE TYPE telegram.registration_request_status AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
CREATE TYPE telegram.telegram_verification_method AS ENUM ('employee_code_phone', 'invite_code_phone', 'manual');

CREATE TABLE telegram.telegram_identities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES employee.employees(id),
  telegram_user_id BIGINT NOT NULL,
  telegram_username VARCHAR(120),
  telegram_first_name VARCHAR(120),
  telegram_last_name VARCHAR(120),
  linked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ,
  status telegram.telegram_identity_status NOT NULL DEFAULT 'PENDING',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID,
  updated_by UUID,
  deleted_at TIMESTAMPTZ,
  deleted_by UUID
);

CREATE INDEX telegram_identities_employee_id_idx ON telegram.telegram_identities (employee_id);
CREATE INDEX telegram_identities_telegram_user_id_idx ON telegram.telegram_identities (telegram_user_id);
CREATE INDEX telegram_identities_status_idx ON telegram.telegram_identities (status);

CREATE UNIQUE INDEX telegram_identities_one_active_per_employee
  ON telegram.telegram_identities (employee_id)
  WHERE status = 'ACTIVE' AND deleted_at IS NULL;

CREATE UNIQUE INDEX telegram_identities_one_active_per_telegram
  ON telegram.telegram_identities (telegram_user_id)
  WHERE status = 'ACTIVE' AND deleted_at IS NULL;

CREATE TABLE telegram.registration_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID REFERENCES employee.employees(id),
  telegram_user_id BIGINT NOT NULL,
  telegram_username VARCHAR(120),
  request_status telegram.registration_request_status NOT NULL DEFAULT 'PENDING',
  verification_method telegram.telegram_verification_method NOT NULL,
  rejection_reason TEXT,
  submitted_employee_code VARCHAR(32),
  submitted_phone VARCHAR(32),
  submitted_invite_code VARCHAR(32),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  approved_at TIMESTAMPTZ,
  approved_by UUID,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX registration_requests_telegram_user_id_idx ON telegram.registration_requests (telegram_user_id);
CREATE INDEX registration_requests_request_status_idx ON telegram.registration_requests (request_status);
CREATE INDEX registration_requests_employee_id_idx ON telegram.registration_requests (employee_id);

-- Backfill ACTIVE identities from existing linked Telegram accounts
INSERT INTO telegram.telegram_identities (
  employee_id,
  telegram_user_id,
  telegram_username,
  linked_at,
  last_seen_at,
  status
)
SELECT
  u.employee_id,
  ta.telegram_user_id,
  ta.username,
  ta.linked_at,
  NOW(),
  'ACTIVE'::telegram.telegram_identity_status
FROM telegram.telegram_accounts ta
JOIN permission.users u ON u.id = ta.user_id
WHERE ta.deleted_at IS NULL
  AND u.deleted_at IS NULL
  AND u.employee_id IS NOT NULL
  AND u.is_active = true
  AND ta.telegram_user_id > 0
  AND NOT EXISTS (
    SELECT 1 FROM telegram.telegram_identities ti
    WHERE ti.telegram_user_id = ta.telegram_user_id
      AND ti.status = 'ACTIVE'
      AND ti.deleted_at IS NULL
  );
