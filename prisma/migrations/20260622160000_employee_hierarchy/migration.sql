-- HR-14: Employee reporting hierarchy
CREATE TYPE employee.hierarchy_relationship_type AS ENUM (
  'direct_manager',
  'functional_manager',
  'acting_manager',
  'mentor'
);

CREATE TABLE employee.employee_hierarchy (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES employee.employees(id),
  manager_employee_id UUID NOT NULL REFERENCES employee.employees(id),
  relationship_type employee.hierarchy_relationship_type NOT NULL DEFAULT 'direct_manager',
  effective_from DATE NOT NULL,
  effective_to DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID,
  updated_by UUID,
  deleted_at TIMESTAMPTZ,
  deleted_by UUID,
  CONSTRAINT employee_hierarchy_no_self CHECK (employee_id <> manager_employee_id)
);

CREATE INDEX employee_hierarchy_employee_id_idx ON employee.employee_hierarchy (employee_id);
CREATE INDEX employee_hierarchy_manager_employee_id_idx ON employee.employee_hierarchy (manager_employee_id);
CREATE INDEX employee_hierarchy_active_lookup_idx ON employee.employee_hierarchy (employee_id, relationship_type, effective_to);
