-- Pilot Release — Workforce staffing rules

CREATE TABLE IF NOT EXISTS organization.workforce_staffing_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES organization.companies(id),
  team_id UUID REFERENCES organization.teams(id),
  role_key VARCHAR(40),
  minimum_required INT NOT NULL DEFAULT 1,
  target_required INT NOT NULL DEFAULT 1,
  effective_from DATE NOT NULL,
  effective_to DATE,
  created_by_id UUID,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS workforce_staffing_rules_company_idx
  ON organization.workforce_staffing_rules(company_id, effective_from, effective_to);

CREATE INDEX IF NOT EXISTS workforce_staffing_rules_team_idx
  ON organization.workforce_staffing_rules(team_id)
  WHERE team_id IS NOT NULL;
