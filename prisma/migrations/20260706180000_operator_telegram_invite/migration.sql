-- Operator Telegram invite links for back-office users (no employee record).

CREATE TYPE permission.operator_telegram_invite_status AS ENUM ('pending', 'used', 'expired', 'cancelled');

CREATE TABLE permission.operator_telegram_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES permission.users(id),
  token_hash VARCHAR(128) NOT NULL,
  token_preview VARCHAR(16) NOT NULL,
  status permission.operator_telegram_invite_status NOT NULL DEFAULT 'pending',
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  used_telegram_user_id BIGINT,
  created_by UUID,
  cancelled_at TIMESTAMPTZ,
  cancelled_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX operator_telegram_invites_user_status_idx
  ON permission.operator_telegram_invites (user_id, status);

CREATE INDEX operator_telegram_invites_token_hash_idx
  ON permission.operator_telegram_invites (token_hash);
