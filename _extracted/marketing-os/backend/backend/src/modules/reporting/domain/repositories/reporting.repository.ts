// ============================================================================
// modules/reporting/domain/repositories/reporting.repository.ts
// Three ports keep concerns clean:
//   SnapshotRepository  – immutable snapshot read/write (report_snapshots)
//   KpiRepository       – KPI daily facts upsert/read (kpi_daily_facts)
//   MetricQueryService  – live DB queries that feed dashboard builders
// ============================================================================

export const SNAPSHOT_REPOSITORY   = Symbol('SNAPSHOT_REPOSITORY');
export const KPI_REPOSITORY        = Symbol('KPI_REPOSITORY');
export const METRIC_QUERY_REPOSITORY = Symbol('METRIC_QUERY_REPOSITORY');

export type SnapshotType =
  | 'morning_brief' | 'evening_brief' | 'executive' | 'profit'
  | 'forecast'      | 'risk'          | 'owner'     | 'company'
  | 'pending_approval';

export interface SnapshotRow {
  id: string;
  companyId: string | null;
  snapshotType: SnapshotType;
  snapshotDate: Date;
  periodStart: Date | null;
  periodEnd: Date | null;
  payload: Record<string, unknown>;
  generatedAt: Date;
}

export interface SnapshotRepository {
  /** Upsert by (company_id, snapshot_type, snapshot_date). Returns the id. */
  upsert(input: {
    companyId: string | null;
    snapshotType: SnapshotType;
    snapshotDate: Date;
    periodStart?: Date | null;
    periodEnd?: Date | null;
    payload: Record<string, unknown>;
    actorUserId: string;
  }): Promise<string>;

  findLatest(companyId: string | null, type: SnapshotType): Promise<SnapshotRow | null>;
  findForDate(companyId: string | null, type: SnapshotType, date: Date): Promise<SnapshotRow | null>;
  listHistory(companyId: string | null, type: SnapshotType, limit: number): Promise<SnapshotRow[]>;
}

export interface KpiFactInput {
  companyId: string;
  factDate: Date;
  metricKey: string;
  metricValue: number;
  actorUserId: string;
}

export interface KpiRepository {
  /** Upsert a single KPI fact (idempotent on compound unique key). */
  upsert(input: KpiFactInput): Promise<void>;
  /** Upsert multiple facts in one DB round trip. */
  upsertMany(facts: KpiFactInput[]): Promise<void>;
  /** Read a specific fact. */
  get(companyId: string, metricKey: string, date: Date): Promise<number | null>;
  /** Read multiple keys for a company on a date. Returns key→value map. */
  getMany(companyId: string, keys: string[], date: Date): Promise<Record<string, number>>;
  /** Trend: one value per day for a key over a range. */
  trend(companyId: string, metricKey: string, from: Date, to: Date): Promise<Array<{ date: string; value: number }>>;
}

// ── Live metric shapes ──────────────────────────────────────────────────────
export interface AttendanceMetrics {
  totalExpected: number;
  checkedIn: number;
  checkedOut: number;
  absent: number;
  lateCount: number;
  missingCheckout: number;
  checkInRate: number;
}

export interface WorkflowMetrics {
  pendingTotal: number;
  byType: Record<string, number>;
  overdueCount: number;
}

export interface PayrollMetrics {
  cycleStatus: string | null;
  totalGross: number;
  totalNet: number;
}

export interface FinanceMetrics {
  revenuePosted: number;
  expensePosted: number;
  net: number;
  advancePending: number;
}

export interface HeadcountMetrics {
  active: number;
  probation: number;
  terminatedMtd: number;
}

export interface CommissionMetrics {
  onHoldCount: number;
  qualifiedRate: number;
}

export interface LeaveRescheduleMetrics {
  countMtd: number;
  approvalRate: number;
  topEmployees: Array<{ employeeId: string; employeeName: string; count: number }>;
}

// ── Pending workflow item shape (for pending-approval dashboard) ─────────────
export interface PendingWorkflowItem {
  instanceId: string;
  entityType: string;
  initiatedBy: string;
  companyId: string;
  currentStep: number;
  pendingHours: number;
}

export interface MetricQueryRepository {
  /** All metrics for one company on a given date. */
  attendance(companyId: string, date: Date): Promise<AttendanceMetrics>;
  workflows(companyId: string | null): Promise<WorkflowMetrics>;
  payroll(companyId: string): Promise<PayrollMetrics>;
  finance(companyId: string, periodStart: Date, periodEnd: Date): Promise<FinanceMetrics>;
  headcount(companyId: string, date: Date): Promise<HeadcountMetrics>;
  commission(companyId: string): Promise<CommissionMetrics>;
  leaveReschedules(companyId: string | null, monthStart: Date, monthEnd: Date): Promise<LeaveRescheduleMetrics>;
  listActiveCompanies(): Promise<Array<{ id: string; name: string }>>;
  /** Pending approval items for the pending-approval dashboard. */
  pendingWorkflowItems(companyId: string | null): Promise<PendingWorkflowItem[]>;
}
