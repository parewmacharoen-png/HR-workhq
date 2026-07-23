// ============================================================================
// modules/reporting/domain/entities/metric-keys.ts
// Single source of truth for all kpi_daily_facts.metric_key strings.
// Grouping makes it easy to list all keys for a given dashboard without
// string literals scattered across the codebase.
// ============================================================================

export const KpiKey = {
  // ── Attendance ─────────────────────────────────────────────────────────────
  ATTENDANCE_TOTAL_EXPECTED:    'attendance.total_expected',
  ATTENDANCE_CHECKED_IN:        'attendance.checked_in',
  ATTENDANCE_CHECKED_OUT:       'attendance.checked_out',
  ATTENDANCE_ABSENT:            'attendance.absent',
  ATTENDANCE_LATE:              'attendance.late',
  ATTENDANCE_MISSING_CHECKOUT:  'attendance.missing_checkout',
  ATTENDANCE_CHECK_IN_RATE:     'attendance.checkin_rate',

  // ── Overtime ───────────────────────────────────────────────────────────────
  OT_PENDING_COUNT:             'ot.pending_count',
  OT_APPROVED_HOURS:            'ot.approved_hours',
  OT_APPROVED_AMOUNT:           'ot.approved_amount',

  // ── Leave ─────────────────────────────────────────────────────────────────
  LEAVE_PENDING_COUNT:          'leave.pending_count',
  LEAVE_APPROVED_TODAY:         'leave.approved_today',
  LEAVE_RESCHEDULE_COUNT_MTD:   'leave.reschedule_count_mtd',
  LEAVE_RESCHEDULE_APPROVAL_RATE: 'leave.reschedule_approval_rate',

  // ── Workflow / Approvals ───────────────────────────────────────────────────
  WORKFLOW_PENDING_TOTAL:       'workflow.pending_total',
  WORKFLOW_PENDING_LEAVE:       'workflow.pending_leave',
  WORKFLOW_PENDING_OT:          'workflow.pending_ot',
  WORKFLOW_PENDING_ADVANCE:     'workflow.pending_advance',
  WORKFLOW_PENDING_DEPOSIT:     'workflow.pending_deposit',
  WORKFLOW_PENDING_PAYROLL:     'workflow.pending_payroll',

  // ── Payroll ────────────────────────────────────────────────────────────────
  PAYROLL_CYCLE_STATUS:         'payroll.cycle_status',
  PAYROLL_TOTAL_GROSS:          'payroll.total_gross',
  PAYROLL_TOTAL_NET:            'payroll.total_net',

  // ── Finance ────────────────────────────────────────────────────────────────
  FINANCE_REVENUE_POSTED:       'finance.revenue_posted',
  FINANCE_EXPENSE_POSTED:       'finance.expense_posted',
  FINANCE_NET:                  'finance.net',
  FINANCE_ADVANCE_PENDING:      'finance.advance_pending',

  // ── Commission ────────────────────────────────────────────────────────────
  COMMISSION_ON_HOLD:           'commission.on_hold',
  COMMISSION_QUALIFIED_RATE:    'commission.qualified_rate',

  // ── Headcount ─────────────────────────────────────────────────────────────
  HEADCOUNT_ACTIVE:             'headcount.active',
  HEADCOUNT_PROBATION:          'headcount.probation',
  HEADCOUNT_TERMINATED_MTD:     'headcount.terminated_mtd',
} as const;

export type KpiKeyValue = typeof KpiKey[keyof typeof KpiKey];

/** Keys used by the morning brief */
export const MORNING_BRIEF_KEYS: KpiKeyValue[] = [
  KpiKey.ATTENDANCE_TOTAL_EXPECTED,
  KpiKey.ATTENDANCE_CHECKED_IN,
  KpiKey.ATTENDANCE_ABSENT,
  KpiKey.ATTENDANCE_LATE,
];

/** Keys used by the evening brief */
export const EVENING_BRIEF_KEYS: KpiKeyValue[] = [
  KpiKey.ATTENDANCE_MISSING_CHECKOUT,
  KpiKey.OT_PENDING_COUNT,
  KpiKey.ATTENDANCE_ABSENT,
  KpiKey.WORKFLOW_PENDING_TOTAL,
  KpiKey.LEAVE_PENDING_COUNT,
];

/** Keys used by the owner / executive dashboard */
export const EXECUTIVE_KEYS: KpiKeyValue[] = [
  KpiKey.HEADCOUNT_ACTIVE,
  KpiKey.ATTENDANCE_CHECK_IN_RATE,
  KpiKey.WORKFLOW_PENDING_TOTAL,
  KpiKey.PAYROLL_TOTAL_GROSS,
  KpiKey.FINANCE_REVENUE_POSTED,
  KpiKey.FINANCE_EXPENSE_POSTED,
  KpiKey.FINANCE_NET,
  KpiKey.COMMISSION_QUALIFIED_RATE,
];

/** Keys used by the risk dashboard */
export const RISK_KEYS: KpiKeyValue[] = [
  KpiKey.ATTENDANCE_MISSING_CHECKOUT,
  KpiKey.OT_PENDING_COUNT,
  KpiKey.WORKFLOW_PENDING_TOTAL,
  KpiKey.COMMISSION_ON_HOLD,
  KpiKey.FINANCE_ADVANCE_PENDING,
  KpiKey.HEADCOUNT_TERMINATED_MTD,
];
