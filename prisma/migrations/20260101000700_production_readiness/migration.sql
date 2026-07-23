-- Production readiness: forced password change flag for Telegram onboarding users.
ALTER TABLE permission.users
  ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT false;
