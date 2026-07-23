-- Asset history, damage tracking, and typed categories

CREATE TYPE assets.asset_category AS ENUM (
  'notebook', 'phone', 'tablet', 'vehicle', 'equipment'
);

CREATE TYPE assets.asset_event_type AS ENUM (
  'created', 'updated', 'assigned', 'returned',
  'damage_reported', 'damage_resolved', 'status_changed', 'retired'
);

CREATE TYPE assets.asset_damage_severity AS ENUM (
  'minor', 'moderate', 'major', 'total'
);

ALTER TABLE assets.assets
  ALTER COLUMN category TYPE assets.asset_category
  USING CASE lower(category)
    WHEN 'notebook'  THEN 'notebook'::assets.asset_category
    WHEN 'phone'     THEN 'phone'::assets.asset_category
    WHEN 'tablet'    THEN 'tablet'::assets.asset_category
    WHEN 'vehicle'   THEN 'vehicle'::assets.asset_category
    WHEN 'equipment' THEN 'equipment'::assets.asset_category
    ELSE NULL
  END;

CREATE INDEX ix_asset_category ON assets.assets (category);

CREATE TABLE assets.asset_events (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id      UUID NOT NULL REFERENCES assets.assets(id),
  event_type    assets.asset_event_type NOT NULL,
  payload       JSONB,
  actor_user_id UUID REFERENCES permission.users(id),
  occurred_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ix_asset_event_asset ON assets.asset_events (asset_id);
CREATE INDEX ix_asset_event_occurred ON assets.asset_events (occurred_at);

CREATE TABLE assets.asset_damage_reports (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id       UUID NOT NULL REFERENCES assets.assets(id),
  assignment_id  UUID REFERENCES assets.asset_assignments(id),
  reported_by    UUID REFERENCES permission.users(id),
  severity       assets.asset_damage_severity NOT NULL,
  description    TEXT NOT NULL,
  estimated_cost NUMERIC(14, 2),
  resolved_at    TIMESTAMPTZ,
  resolved_by    UUID REFERENCES permission.users(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by     UUID,
  updated_by     UUID,
  deleted_at     TIMESTAMPTZ,
  deleted_by     UUID
);

CREATE INDEX ix_asset_damage_asset ON assets.asset_damage_reports (asset_id);
CREATE INDEX ix_asset_damage_assignment ON assets.asset_damage_reports (assignment_id);

CREATE TRIGGER trg_asset_damage_updated
  BEFORE UPDATE ON assets.asset_damage_reports
  FOR EACH ROW EXECUTE FUNCTION system.set_updated_at();

CREATE OR REPLACE FUNCTION assets.prevent_asset_event_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'asset_events is append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_asset_event_append_only
  BEFORE UPDATE OR DELETE ON assets.asset_events
  FOR EACH ROW EXECUTE FUNCTION assets.prevent_asset_event_mutation();
