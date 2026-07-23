// ============================================================================
// modules/payroll/domain/services/absence-deduction.service.ts
// ============================================================================

export interface AbsenceDeductionSource {
  absenceRecordId: string;
  workDate: string;
  amount: number;
  roleLevel: string | null;
}

export interface AbsenceDeductionSummary {
  totalDeduction: number;
  sources: AbsenceDeductionSource[];
}

export function summarizeAbsenceDeductions(
  rows: Array<{
    id: string;
    workDate: Date;
    amount: number;
    roleLevel: string | null;
  }>,
): AbsenceDeductionSummary {
  const sources = rows
    .filter((row) => row.amount > 0)
    .map((row) => ({
      absenceRecordId: row.id,
      workDate: row.workDate.toISOString().slice(0, 10),
      amount: roundMoney(row.amount),
      roleLevel: row.roleLevel,
    }));

  const totalDeduction = roundMoney(sources.reduce((sum, row) => sum + row.amount, 0));
  return { totalDeduction, sources };
}

export function formatAbsenceDeductionNote(summary: AbsenceDeductionSummary): string {
  if (!summary.sources.length) return 'หักขาดงาน';
  const refs = summary.sources
    .map((s) => `${s.workDate}:฿${s.amount.toFixed(0)}`)
    .join(' | ');
  return `หักขาดงาน (${summary.sources.length} วัน) | ${refs}`;
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}
