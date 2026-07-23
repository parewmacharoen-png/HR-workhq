-- Break return pre-reminder alert type

ALTER TYPE "attendance"."reminder_type" ADD VALUE IF NOT EXISTS 'break_return_pre_reminder';
