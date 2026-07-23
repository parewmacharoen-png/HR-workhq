-- Next Phase: AI-001, TRAIN-001, ANALYTICS-001

-- AI knowledge source enums
CREATE TYPE ai.ai_knowledge_source_type AS ENUM (
  'policy', 'handbook', 'sop', 'announcement', 'faq', 'document', 'training'
);
CREATE TYPE ai.ai_knowledge_source_status AS ENUM ('draft', 'published', 'archived');

CREATE TABLE IF NOT EXISTS ai.ai_knowledge_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_type ai.ai_knowledge_source_type NOT NULL,
  title VARCHAR(240) NOT NULL,
  content TEXT NOT NULL,
  company_id UUID REFERENCES organization.companies(id),
  visibility_scope VARCHAR(40) NOT NULL DEFAULT 'company',
  status ai.ai_knowledge_source_status NOT NULL DEFAULT 'draft',
  version INT NOT NULL DEFAULT 1,
  external_ref VARCHAR(120),
  created_by UUID,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ai_knowledge_sources_company ON ai.ai_knowledge_sources(company_id, status);

CREATE TABLE IF NOT EXISTS ai.ai_knowledge_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id UUID NOT NULL REFERENCES ai.ai_knowledge_sources(id) ON DELETE CASCADE,
  chunk_text TEXT NOT NULL,
  chunk_index INT NOT NULL DEFAULT 0,
  metadata_json JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ai_knowledge_chunks_source ON ai.ai_knowledge_chunks(source_id);

CREATE TABLE IF NOT EXISTS ai.ai_query_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id UUID NOT NULL,
  actor_employee_id UUID,
  actor_role VARCHAR(40),
  company_id UUID,
  question TEXT NOT NULL,
  answer TEXT,
  sources_json JSONB,
  confidence NUMERIC(5, 2),
  denied_reason TEXT,
  channel ai.channel NOT NULL DEFAULT 'web',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ai_query_logs_actor ON ai.ai_query_logs(actor_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_query_logs_company ON ai.ai_query_logs(company_id, created_at DESC);

-- Training extensions
CREATE TYPE training.training_course_status AS ENUM ('draft', 'published', 'archived');
CREATE TYPE training.training_lesson_content_type AS ENUM ('article', 'pdf', 'video', 'checklist', 'quiz');

ALTER TABLE training.training_courses
  ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES organization.companies(id),
  ADD COLUMN IF NOT EXISTS category VARCHAR(80),
  ADD COLUMN IF NOT EXISTS status training.training_course_status NOT NULL DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS training.training_lessons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID NOT NULL REFERENCES training.training_courses(id) ON DELETE CASCADE,
  title VARCHAR(200) NOT NULL,
  content_type training.training_lesson_content_type NOT NULL,
  content_json JSONB NOT NULL DEFAULT '{}',
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_training_lessons_course ON training.training_lessons(course_id);

CREATE TABLE IF NOT EXISTS training.training_quizzes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID NOT NULL REFERENCES training.training_courses(id) ON DELETE CASCADE,
  passing_score INT NOT NULL DEFAULT 70,
  questions_json JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS training.training_quiz_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_id UUID NOT NULL REFERENCES training.training_quizzes(id),
  assignment_id UUID NOT NULL REFERENCES training.training_assignments(id),
  employee_id UUID NOT NULL REFERENCES employee.employees(id),
  score NUMERIC(6, 2) NOT NULL,
  passed BOOLEAN NOT NULL DEFAULT FALSE,
  answers_json JSONB NOT NULL DEFAULT '{}',
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE training.training_assignments
  ADD COLUMN IF NOT EXISTS assigned_by UUID;

-- HR analytics snapshots
ALTER TYPE reporting.snapshot_type ADD VALUE IF NOT EXISTS 'hr_daily';

CREATE TABLE IF NOT EXISTS reporting.hr_daily_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_date DATE NOT NULL,
  company_id UUID NOT NULL REFERENCES organization.companies(id),
  headcount INT NOT NULL DEFAULT 0,
  active_employees INT NOT NULL DEFAULT 0,
  probation_employees INT NOT NULL DEFAULT 0,
  leave_count INT NOT NULL DEFAULT 0,
  absent_count INT NOT NULL DEFAULT 0,
  late_count INT NOT NULL DEFAULT 0,
  payroll_total NUMERIC(16, 2) NOT NULL DEFAULT 0,
  pending_requests INT NOT NULL DEFAULT 0,
  exit_cases INT NOT NULL DEFAULT 0,
  payload_json JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (company_id, snapshot_date)
);

CREATE TABLE IF NOT EXISTS reporting.payroll_monthly_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payroll_cycle_id UUID NOT NULL REFERENCES payroll.payroll_cycles(id),
  company_id UUID NOT NULL REFERENCES organization.companies(id),
  total_gross NUMERIC(16, 2) NOT NULL DEFAULT 0,
  total_deduction NUMERIC(16, 2) NOT NULL DEFAULT 0,
  total_net NUMERIC(16, 2) NOT NULL DEFAULT 0,
  employee_count INT NOT NULL DEFAULT 0,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (payroll_cycle_id)
);
