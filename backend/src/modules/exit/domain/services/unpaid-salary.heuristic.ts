// ============================================================================
// modules/exit/domain/services/unpaid-salary.heuristic.ts
// PAY-005c — documented unpaid salary heuristic for final settlement.
// ============================================================================

/**
 * PAY-005c / PR-005 unpaid salary heuristic (final settlement):
 *
 * 1. Consider payroll cycles for the company with status `open` or `locked` only.
 *    Cycles marked `paid` are excluded — payroll for that period is treated as disbursed.
 * 2. Exclude the current exit-cycle (salary prorate covers the active period separately).
 * 3. Sum `salary` payroll items for the employee in those cycles.
 *
 * Limitations (documented TODO — PAY-005c / PR-010):
 * - No per-employee partial-paid flag on a cycle; if a cycle is `paid` but an individual
 *   salary item was omitted, it will not appear in unpaid salary.
 * - Locked cycles with generated payslips but not yet marked `paid` are included in full.
 */
export function sumUnpaidSalaryItems(
  items: Array<{ amount: number | string }>,
): number {
  const total = items.reduce((sum, row) => sum + Number(row.amount), 0);
  return Math.round(total * 100) / 100;
}

export const UNPAID_SALARY_CYCLE_STATUSES = ['open', 'locked'] as const;

export const UNPAID_SALARY_PARTIAL_PAID_TODO =
  'Per-employee partial-paid cycle tracking not in schema (PayrollCycleStatus: open|locked|paid only). See PAY-005c / PR-010.';
