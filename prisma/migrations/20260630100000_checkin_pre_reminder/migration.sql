-- Pre-shift check-in reminder (15 min before shift start)
ALTER TYPE attendance.reminder_type ADD VALUE IF NOT EXISTS 'checkin_pre_reminder';
