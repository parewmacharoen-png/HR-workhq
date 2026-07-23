# WorkHQ Database Audit

**Sprint:** QA-001 Production Stabilization  
**Generated:** 2026-06-25  
**Engine:** PostgreSQL 16 · Prisma ORM (multi-schema)

## Executive Summary

| Check | Result | Notes |
|-------|--------|-------|
| `prisma validate` | **PASS** | Schema syntax and relations valid |
| `prisma generate` | **PASS** | Client generated to `backend/node_modules/.prisma/client` |
| Migration deploy | **PASS** | Latest: `20260624180000_production_stabilization` |
| Soft delete pattern | **PASS** | `deletedAt` / `deletedBy` on business models |
| Multi-schema | **PASS** | 20 PostgreSQL schemas |
| pgvector extension | **PASS** | AI embeddings in `ai` schema |
| EXCLUDE constraints | **PASS** | In raw SQL migrations (Prisma cannot express) |

## Schema Domains

| Schema | Purpose | Key Models | Status |
|--------|---------|------------|--------|
| `employee` | Core HR | Employee, ExitCase, FinalSettlement, DisciplinaryAction | PASS |
| `organization` | Org structure | Company, Team, Position, Department | PASS |
| `attendance` | Time tracking | AttendanceRecord, AbsenceRecord, OvertimeRequest | PASS |
| `leave` | Leave management | LeaveRequest, LeaveBalance, LeaveType, ShiftSwap | PASS |
| `payroll` | Compensation | PayrollCycle, PayrollItem, Payslip | PASS |
| `workflow` | Approval engine | WorkflowInstance, WorkflowStep, WorkflowDefinition | PASS |
| `performance` | Reviews & KPI | PerformanceReview, KpiCycle, KpiScore | PASS |
| `knowledge` | Content | KnowledgeArticle, DocumentTemplate | PASS |
| `ai` | AI services | AiChatSession, KnowledgeGraphNode, AiMorningBrief | PASS |
| `system` | Platform | FormulaDefinition, FormulaExecutionLog, OutboxEvent, AuditLog | PASS |
| `permission` | RBAC | Role, Permission, BusinessRoleAssignment | PASS |
| `commission` | Admin commission | CommissionCycle, CommissionEntry | PASS |
| `finance` | Finance ops | CostCenter, Budget, Transaction, DepositRefund | PASS |
| `referral` | Referral program | ReferralRegistration, ReferralBonus | PASS |
| `recruitment` | Hiring | JobPosting, Applicant | PASS |
| `marketing` | Marketing OS | MarketingTeam, DailyReport, Expense | PASS (hidden in HR mode) |
| `training` | L&D | TrainingCourse, TrainingEnrollment | PASS |
| `assets` | Asset tracking | Asset, AssetAssignment | PASS |
| `telegram` | Bot identity | TelegramAccount, TelegramSession | PASS |
| `reporting` | Dashboards | ReportSnapshot | PASS |

## Migration: `20260624180000_production_stabilization`

| Change | Type | Impact |
|--------|------|--------|
| `formula_execution_logs.formula_definition_id` nullable | ALTER | Allows fallback execution logging |
| `formula_key` column added | ADD | Key-based formula resolution |
| `fallback_used` column added | ADD | Audit trail for fallback paths |
| `formula_version` default → 0 | ALTER | Version tracking |
| 5 default global formulas seeded | INSERT | Phase 1 integrations |

### Seeded Formula Keys

| Key | Domain | Expression Summary |
|-----|--------|-------------------|
| `attendance.late_deduction` | attendance | `lateHours * hourlyRate * 2` |
| `attendance.absence_penalty` | attendance | `absenceDays * rolePenaltyRate` |
| `commission.admin_leave_penalty` | commission_admin | Tiered multiplier by leave days |
| `kpi.weighted_score` | performance | Weighted KPI + leader + self + 360 |
| `referral.bonus_amount` | referral | `baseReferralBonus` |

## Prior Migration: `20260624150000_workhq_phase2_hr_os`

Phase 2 HR OS schema additions including document center, announcement center, competency matrix, succession planning, and AI morning brief tables.

## Data Integrity Checks

| Check | Result | Method |
|-------|--------|--------|
| Foreign key constraints | PASS | Prisma relations + SQL migrations |
| Partial unique indexes | PASS | Raw SQL (soft-delete aware) |
| Append-only audit logs | PASS | Trigger in SQL migration |
| Company isolation | PASS | `companyId` scoping in app layer |
| EXCLUDE no-overlap (leave) | PASS | `btree_gist` extension |

## Audit Log Schema

| Field | Type | Notes |
|-------|------|-------|
| `entityType` | String | e.g. DocumentRequest, PayrollCycle |
| `entityId` | UUID | Scoped to company |
| `action` | String | e.g. `morning_brief_opened` |
| `before` / `after` | JSON | Salary redacted for employee role |
| `actorUserId` | UUID | Immutable |

## Connection & Performance

| Parameter | Recommendation |
|-----------|----------------|
| `DATABASE_URL` | Required; connection pooling via PgBouncer in production |
| Connection limit | Default Prisma pool; tune for replica count |
| Indexes | Partial indexes on `deletedAt IS NULL` for hot tables |
| Migrations | Always run `prisma migrate deploy` before app start |

## Known Gaps

1. **Vector index tuning** — pgvector HNSW indexes not yet benchmarked at production scale.
2. **Migration rollback** — migrations are additive; no automated down-migration scripts.
3. **Cross-schema joins** — some reporting queries span 3+ schemas; monitor query plans.
4. **Seed data** — UAT seed guide exists; production seed not automated.

## Recommendations

1. Run `prisma migrate deploy` in CI before integration tests.
2. Monitor `system.outbox_events` backlog (alert threshold: 500 unprocessed).
3. Schedule weekly `VACUUM ANALYZE` on high-write tables (attendance, audit_log).
4. Document formula seed idempotency (`WHERE NOT EXISTS` pattern) for re-deploy safety.
