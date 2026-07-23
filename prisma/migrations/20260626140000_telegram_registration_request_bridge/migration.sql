-- Bridge Telegram registration / self-onboarding review to Web Requests

ALTER TABLE telegram.registration_requests
  ADD COLUMN IF NOT EXISTS request_instance_id UUID;

CREATE INDEX IF NOT EXISTS registration_requests_request_instance_id_idx
  ON telegram.registration_requests (request_instance_id);

ALTER TABLE employee.employee_self_onboarding_submissions
  ADD COLUMN IF NOT EXISTS request_instance_id UUID;

CREATE INDEX IF NOT EXISTS employee_self_onboarding_submissions_request_instance_id_idx
  ON employee.employee_self_onboarding_submissions (request_instance_id);
