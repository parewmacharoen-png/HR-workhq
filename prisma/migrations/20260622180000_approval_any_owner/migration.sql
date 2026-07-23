-- HR-15: Any Owner approver strategy (first approval completes the step)
ALTER TYPE workflow.approver_rule ADD VALUE IF NOT EXISTS 'any_owner';
ALTER TYPE workflow.approver_strategy ADD VALUE IF NOT EXISTS 'any_owner';
