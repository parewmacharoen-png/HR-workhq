-- P0-001: Invitation-first onboarding — nullable employee, preset fields, started status
ALTER TYPE employee.employee_telegram_invite_status ADD VALUE IF NOT EXISTS 'started';

ALTER TABLE employee.employee_telegram_invites
  ALTER COLUMN employee_id DROP NOT NULL;

ALTER TABLE employee.employee_telegram_invites
  ADD COLUMN IF NOT EXISTS preset_json JSONB NOT NULL DEFAULT '{}';
