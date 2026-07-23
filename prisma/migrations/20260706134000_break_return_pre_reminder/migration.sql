-- Break return pre-reminder (e.g. 5 minutes before the 1-hour break limit)
ALTER TYPE attendance.reminder_type ADD VALUE IF NOT EXISTS 'break_return_pre_reminder';
