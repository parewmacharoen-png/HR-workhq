-- ATT-010 / REQ-005 — extend attendance reminder types for alert escalation
ALTER TYPE attendance.reminder_type ADD VALUE IF NOT EXISTS 'missing_checkin_escalated';
ALTER TYPE attendance.reminder_type ADD VALUE IF NOT EXISTS 'missing_checkout_escalated';
ALTER TYPE attendance.reminder_type ADD VALUE IF NOT EXISTS 'missing_break_return';
ALTER TYPE attendance.reminder_type ADD VALUE IF NOT EXISTS 'missing_break_return_escalated';
