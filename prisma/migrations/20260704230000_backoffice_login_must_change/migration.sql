-- Standalone back-office accounts get an admin-set password, not a Telegram temp password.
-- Clear must_change_password so login session/bootstrap works immediately.
UPDATE permission.users
SET must_change_password = false,
    updated_at = NOW()
WHERE employee_id IS NULL
  AND deleted_at IS NULL
  AND must_change_password = true;
