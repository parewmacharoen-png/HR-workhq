-- Production stabilization: formula execution audit + default HR formulas

ALTER TABLE system.formula_execution_logs
  ALTER COLUMN formula_definition_id DROP NOT NULL;

ALTER TABLE system.formula_execution_logs
  ADD COLUMN IF NOT EXISTS formula_key VARCHAR(80),
  ADD COLUMN IF NOT EXISTS fallback_used BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE system.formula_execution_logs
  ALTER COLUMN formula_version SET DEFAULT 0;

-- Default published global formulas (Phase 1 integrations)
INSERT INTO system.formula_definitions (
  id, company_id, key, name, description, domain, expression,
  config_status, config_version, published_at, created_at, updated_at
)
SELECT gen_random_uuid(), NULL, v.key, v.name, v.description, v.domain::system.formula_domain, v.expression,
       'published'::system.formula_config_status, 1, NOW(), NOW(), NOW()
FROM (VALUES
  (
    'attendance.late_deduction',
    'Late Deduction',
    'Attendance late check-in deduction',
    'attendance',
    'IF(lateHours > 0, lateHours * hourlyRate * 2, 0)'
  ),
  (
    'attendance.absence_penalty',
    'Absence Penalty',
    'Absence penalty amount',
    'attendance',
    'absenceDays * rolePenaltyRate'
  ),
  (
    'commission.admin_leave_penalty',
    'Admin Leave Penalty Multiplier',
    'Commission multiplier after excess leave days',
    'commission_admin',
    'IF(leaveDaysOverLimit <= 0, 1, IF(leaveDaysOverLimit = 2, 0.7, IF(leaveDaysOverLimit = 3, 0.6, IF(leaveDaysOverLimit = 6, 0.5, IF(leaveDaysOverLimit = 7, 0.4, IF(leaveDaysOverLimit = 8, 0.3, IF(leaveDaysOverLimit = 9, 0.2, IF(leaveDaysOverLimit >= 10, 0.1, 1))))))))'
  ),
  (
    'kpi.weighted_score',
    'KPI Weighted Score',
    'Weighted performance score',
    'performance',
    '(kpiScore * kpiWeight + leaderScore * leaderWeight + selfScore * selfWeight + feedback360Score * feedback360Weight) / totalWeight'
  ),
  (
    'referral.bonus_amount',
    'Referral Bonus Amount',
    'Referral bonus payout amount',
    'referral',
    'baseReferralBonus'
  )
) AS v(key, name, description, domain, expression)
WHERE NOT EXISTS (
  SELECT 1 FROM system.formula_definitions fd
  WHERE fd.key = v.key AND fd.company_id IS NULL AND fd.deleted_at IS NULL
);
