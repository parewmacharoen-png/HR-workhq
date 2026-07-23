// ============================================================================
// modules/payroll/domain/services/late-deduction.service.ts
// ============================================================================

export interface LateDeductionSource {
  attendanceRecordId: string;
  workDate: string;
  amount: number;
}

export interface LateDeductionSummary {
  totalDeduction: number;
  sources: LateDeductionSource[];
}

export function summarizeLateDeductions(
  rows: Array<{ id: string; workDate: Date; amount: number }>,
): LateDeductionSummary {
  const sources = rows
    .filter((row) => row.amount > 0)
    .map((row) => ({
      attendanceRecordId: row.id,
      workDate: row.workDate.toISOString().slice(0, 10),
      amount: roundMoney(row.amount),
    }));

  const totalDeduction = roundMoney(sources.reduce((sum, row) => sum + row.amount, 0));
  return { totalDeduction, sources };
}

export function formatLateDeductionNote(summary: LateDeductionSummary): string {
  if (!summary.sources.length) return 'หักเข้างานสาย';
  const refs = summary.sources
    .map((s) => `${s.workDate}:฿${Number(s.amount.toFixed(2))}(เข้างานสาย)`)
    .join(' | ');
  return `หักเข้างานสาย (${summary.sources.length} วัน) | ${refs}`;
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}
