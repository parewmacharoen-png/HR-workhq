// ============================================================================
// Short-notice leave payroll deduction (< noticeDays advance).
// Applies to approved leave requests (not sick). Sudden rate = 2× daily wage per day.
// Only days that fall inside the payroll attendance window are charged.
// ============================================================================

import { LeaveRulesSetting } from '../../../settings/domain/leave-settings.types';
import { calendarDaysBetween } from './excess-off-day-deduction.service';

export interface ShortNoticeLeaveRow {
  leaveRequestId: string;
  leaveTypeCode: string;
  startDate: string;
  endDate: string;
  days: number;
  submittedAt: Date;
}

export interface ShortNoticeLeaveDeductionSource {
  leaveRequestId: string;
  leaveTypeCode: string;
  startDate: string;
  days: number;
  noticeDaysGiven: number;
  amount: number;
}

export interface ShortNoticeLeaveDeductionSummary {
  totalDeduction: number;
  sources: ShortNoticeLeaveDeductionSource[];
}

const EXEMPT_LEAVE_TYPES = new Set(['sick']);

function expandInclusiveDates(startIso: string, endIso: string): string[] {
  if (endIso < startIso) return [];
  const dates: string[] = [];
  const cursor = new Date(`${startIso}T00:00:00.000Z`);
  const end = new Date(`${endIso}T00:00:00.000Z`);
  while (cursor <= end) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

export function computeShortNoticeLeaveDeductions(
  rows: ShortNoticeLeaveRow[],
  params: { noticeDays: number; suddenDailyMultiplier: number; dailyWage: number },
  periodStartIso?: string,
  periodEndIso?: string,
): ShortNoticeLeaveDeductionSummary {
  if (params.dailyWage <= 0) return { totalDeduction: 0, sources: [] };

  const sources: ShortNoticeLeaveDeductionSource[] = [];
  for (const row of rows) {
    if (EXEMPT_LEAVE_TYPES.has(row.leaveTypeCode)) continue;
    const noticeDaysGiven = calendarDaysBetween(row.submittedAt, row.startDate);
    if (noticeDaysGiven >= params.noticeDays) continue;

    let daysInPeriod = expandInclusiveDates(row.startDate, row.endDate);
    if (periodStartIso && periodEndIso) {
      daysInPeriod = daysInPeriod.filter(
        (date) => date >= periodStartIso && date <= periodEndIso,
      );
    }
    const days = daysInPeriod.length;
    if (days <= 0) continue;

    const amount = roundMoney(params.dailyWage * params.suddenDailyMultiplier * days);
    sources.push({
      leaveRequestId: row.leaveRequestId,
      leaveTypeCode: row.leaveTypeCode,
      startDate: daysInPeriod[0],
      days,
      noticeDaysGiven,
      amount,
    });
  }

  return {
    totalDeduction: roundMoney(sources.reduce((sum, s) => sum + s.amount, 0)),
    sources,
  };
}

export function toShortNoticeLeaveParams(rules: LeaveRulesSetting, dailyWage: number) {
  return {
    noticeDays: rules.defaultLeaveNoticeDays,
    suddenDailyMultiplier: rules.excessOffDaySuddenDailyMultiplier,
    dailyWage,
  };
}

export function formatShortNoticeLeaveDeductionNote(
  summary: ShortNoticeLeaveDeductionSummary,
): string {
  if (!summary.sources.length) return 'หักลาแจ้งล่วงหน้าน้อย';
  const refs = summary.sources
    .map((s) => `${s.startDate}:฿${s.amount.toFixed(0)}(${s.days} วัน)`)
    .join(' | ');
  return `หักลาแจ้งไม่ครบ 7 วัน (${summary.sources.length} รายการ) | ${refs}`;
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}
