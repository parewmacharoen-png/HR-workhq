// ============================================================================
// Excess monthly off-day payroll deduction.
// Within allowance (monthlyOffDays): no deduction.
// Beyond allowance: daily wage × multiplier — 1× if notice >= threshold, sudden rate otherwise.
// ============================================================================

import { LeaveRulesSetting } from '../../../settings/domain/leave-settings.types';

export interface ExcessOffDayRow {
  monthlyOffRequestId: string;
  offDate: string;
  submittedAt: Date;
}

export interface ExcessOffDayDeductionParams {
  monthlyOffDays: number;
  noticeDays: number;
  advanceDailyMultiplier: number;
  suddenDailyMultiplier: number;
  dailyWage: number;
}

export interface ExcessOffDayDeductionSource {
  monthlyOffRequestId: string;
  offDate: string;
  noticeDaysGiven: number;
  sudden: boolean;
  dailyMultiplier: number;
  amount: number;
}

export interface ExcessOffDayDeductionSummary {
  totalDeduction: number;
  sources: ExcessOffDayDeductionSource[];
}

export function toExcessOffDayDeductionParams(
  rules: LeaveRulesSetting,
  dailyWage: number,
  entitledMonthlyOffDays?: number,
): ExcessOffDayDeductionParams {
  return {
    monthlyOffDays: entitledMonthlyOffDays ?? rules.monthlyOffDays,
    noticeDays: rules.excessOffDayNoticeDays,
    advanceDailyMultiplier: rules.excessOffDayAdvanceDailyMultiplier,
    suddenDailyMultiplier: rules.excessOffDaySuddenDailyMultiplier,
    dailyWage,
  };
}

export function calendarDaysBetween(submittedAt: Date, offDateIso: string): number {
  const submitIso = submittedAt.toISOString().slice(0, 10);
  const submitMs = Date.parse(`${submitIso}T00:00:00.000Z`);
  const offMs = Date.parse(`${offDateIso}T00:00:00.000Z`);
  return Math.floor((offMs - submitMs) / 86_400_000);
}

export function computeExcessOffDayDeductions(
  rows: ExcessOffDayRow[],
  params: ExcessOffDayDeductionParams,
): ExcessOffDayDeductionSummary {
  const sorted = [...rows].sort((a, b) => a.offDate.localeCompare(b.offDate));
  const sources: ExcessOffDayDeductionSource[] = [];

  for (let i = 0; i < sorted.length; i++) {
    const row = sorted[i];
    const noticeDaysGiven = calendarDaysBetween(row.submittedAt, row.offDate);
    const sudden = noticeDaysGiven < params.noticeDays;
    const withinQuota = i < params.monthlyOffDays;

    // Within quota: deduct only when short notice (< noticeDays).
    // Beyond quota: always deduct (1× advance notice, 2× sudden).
    if (withinQuota && !sudden) continue;

    const dailyMultiplier = sudden
      ? params.suddenDailyMultiplier
      : params.advanceDailyMultiplier;
    const amount = roundMoney(params.dailyWage * dailyMultiplier);

    sources.push({
      monthlyOffRequestId: row.monthlyOffRequestId,
      offDate: row.offDate,
      noticeDaysGiven,
      sudden,
      dailyMultiplier,
      amount,
    });
  }

  const totalDeduction = roundMoney(sources.reduce((sum, s) => sum + s.amount, 0));
  return { totalDeduction, sources };
}

export function formatExcessOffDayDeductionNote(summary: ExcessOffDayDeductionSummary): string {
  if (!summary.sources.length) return 'หักวันหยุดประจำเดือน';
  const refs = summary.sources
    .map((s) => {
      const tag = s.sudden ? 'แจ้งไม่ครบ 7 วัน' : 'เกินโควต้า';
      return `${s.offDate}:฿${s.amount.toFixed(0)}(${tag}, คิด ${s.dailyMultiplier} เท่า)`;
    })
    .join(' | ');
  return `หักวันหยุดประจำเดือน (${summary.sources.length} วัน) | ${refs}`;
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}
