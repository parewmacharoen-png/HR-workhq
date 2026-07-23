// ============================================================================
// modules/reporting/domain/entities/dashboard-payloads.ts
// Typed payload shapes stored in report_snapshots.payload (JSONB).
// Keeping these in the domain layer ensures every dashboard writes + reads
// the same structure, regardless of which service generated it.
// ============================================================================

/** Shared header present in every snapshot payload. */
export interface SnapshotMeta {
  generatedAt: string;    // ISO-8601
  snapshotDate: string;   // YYYY-MM-DD
  companyId: string | null;
  companyName: string | null;
}

// ── Morning Brief ────────────────────────────────────────────────────────────
export interface MorningBriefPayload extends SnapshotMeta {
  totalExpected: number;
  checkedIn: number;
  notYetIn: number;
  lateCount: number;
  checkInRate: number;   // 0–100 %
}

// ── Evening Brief ────────────────────────────────────────────────────────────
export interface EveningBriefPayload extends SnapshotMeta {
  missingCheckout: number;
  pendingOtCount: number;
  absentCount: number;
  pendingApprovals: number;
  pendingLeave: number;
}

// ── Company Dashboard ────────────────────────────────────────────────────────
export interface CompanyDashboardPayload extends SnapshotMeta {
  headcountActive: number;
  headcountProbation: number;
  attendanceRate: number;
  pendingApprovals: number;
  payroll: {
    cycleStatus: string;
    totalGross: number;
    totalNet: number;
  };
  finance: {
    revenuePosted: number;
    expensePosted: number;
    net: number;
    advancePending: number;
  };
  commission: {
    onHoldCount: number;
    qualifiedRate: number;
  };
}

// ── Owner Dashboard (cross-company aggregate) ─────────────────────────────────
export interface OwnerDashboardPayload extends SnapshotMeta {
  companies: Array<{
    companyId: string;
    companyName: string;
    headcountActive: number;
    attendanceRate: number;
    pendingApprovals: number;
    revenuePosted: number;
    expensePosted: number;
    net: number;
  }>;
  totals: {
    headcount: number;
    pendingApprovals: number;
    revenuePosted: number;
    expensePosted: number;
    net: number;
  };
  leaveReschedule: {
    countMtd: number;
    approvalRate: number;
    topEmployees: Array<{ employeeId: string; employeeName: string; count: number }>;
  };
  commissionDashboard?: import('./commission-executive-dashboard.types').CommissionDashboardBlock;
}

// ── Executive Dashboard ────────────────────────────────────────────────────────
export interface ExecutiveDashboardPayload extends SnapshotMeta {
  period: { start: string; end: string };
  headcount: { active: number; probation: number; terminatedMtd: number };
  attendance: { rate: number; late: number; absent: number };
  payroll: { totalGross: number; totalNet: number; cycleStatus: string };
  finance: { revenue: number; expenses: number; net: number };
  commission: { qualifiedRate: number; onHold: number };
  workflows: { pending: number; byType: Record<string, number> };
}

// ── Risk Dashboard ─────────────────────────────────────────────────────────────
export interface RiskDashboardPayload extends SnapshotMeta {
  alerts: Array<{
    severity: 'high' | 'medium' | 'low';
    category: string;
    message: string;
    count: number;
    companyId?: string;
  }>;
  metrics: {
    missingCheckouts: number;
    pendingOt: number;
    commissionOnHold: number;
    overdueApprovals: number;    // pending > 48h
    advancePending: number;
    terminatedMtd: number;
  };
}

// ── Pending Approval Dashboard ────────────────────────────────────────────────
export interface PendingApprovalPayload extends SnapshotMeta {
  total: number;
  byType: {
    leave: number;
    overtime: number;
    advance: number;
    depositRefund: number;
    payrollAdjustment: number;
    performanceReview: number;
    other: number;
  };
  overdueCount: number;     // pending > 48 hours
  items: Array<{
    instanceId: string;
    entityType: string;
    initiatedBy: string;
    companyId: string;
    currentStep: number;
    pendingHours: number;
  }>;
}
