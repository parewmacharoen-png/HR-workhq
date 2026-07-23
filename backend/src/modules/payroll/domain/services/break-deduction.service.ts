// ============================================================================
// Break overage payroll aggregation helpers.
// ============================================================================

import type { BreakPenaltyTier } from '../../../../shared/attendance/break-deduction.util';

export interface BreakDeductionSource {
  attendanceRecordId: string;
  workDate: string;
  amount: number;
  tier: BreakPenaltyTier;
  totalBreakMinutes: number;
}

export interface BreakDeductionSummary {
  totalDeduction: number;
  sources: BreakDeductionSource[];
}

export function summarizeBreakDeductions(
  rows: Array<{
    id: string;
    workDate: Date;
    amount: number;
    tier: BreakPenaltyTier;
    totalBreakMinutes: number;
  }>,
): BreakDeductionSummary {
  const sources = rows
    .filter((row) => row.amount > 0)
    .map((row) => ({
      attendanceRecordId: row.id,
      workDate: row.workDate.toISOString().slice(0, 10),
      amount: roundMoney(row.amount),
      tier: row.tier,
      totalBreakMinutes: row.totalBreakMinutes,
    }));
  const totalDeduction = roundMoney(sources.reduce((sum, row) => sum + row.amount, 0));
  return { totalDeduction, sources };
}

export function formatBreakDeductionNote(summary: BreakDeductionSummary): string {
  if (!summary.sources.length) return 'หักพักเกินเวลา';
  const refs = summary.sources
    .map((s) => (
      `${s.workDate}:฿${s.amount.toFixed(2)}`
      + `(พักรวม ${s.totalBreakMinutes} นาที · หักจากส่วนที่เกินสิทธิ์พัก)`
    ))
    .join(' | ');
  return `หักพักเกินเวลา (${summary.sources.length} วัน) | ${refs}`;
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}
