// ============================================================================
// Advance-notice checks for leave / monthly off warnings.
// Counted from request submission date → target leave/off day.
// ============================================================================

/** Shown in Telegram / approval copy so staff know the notice window anchor. */
export const NOTICE_COUNTED_FROM_SUBMISSION =
  'นับจากวันที่ส่งคำขอถึงวันที่ลา/วันหยุด';

export function calendarDaysBetween(submittedAt: Date, targetDateIso: string): number {
  const submitIso = submittedAt.toISOString().slice(0, 10);
  const submitMs = Date.parse(`${submitIso}T00:00:00.000Z`);
  const targetMs = Date.parse(`${targetDateIso}T00:00:00.000Z`);
  return Math.floor((targetMs - submitMs) / 86_400_000);
}

export function isShortNotice(
  submittedAt: Date,
  targetDateIso: string,
  noticeDays: number,
): boolean {
  return calendarDaysBetween(submittedAt, targetDateIso) < noticeDays;
}

export function shortNoticeDates(
  submittedAt: Date,
  dates: string[],
  noticeDays: number,
): string[] {
  return dates.filter((d) => isShortNotice(submittedAt, d, noticeDays));
}

export function formatShortNoticeWarning(
  dates: string[],
  noticeDays: number,
): string | null {
  if (!dates.length) return null;
  const preview = dates.slice(0, 3).join(', ');
  const suffix = dates.length > 3 ? ` (+${dates.length - 3} วัน)` : '';
  return (
    `⚠️ แจ้งไม่ครบ ${noticeDays} วันล่วงหน้า (${NOTICE_COUNTED_FROM_SUBMISSION}) ` +
    `(${preview}${suffix}) — อาจถูกหักเงินเดือน`
  );
}

export function formatAdvanceNoticeDeductionLine(noticeDays: number, sudden: boolean): string {
  if (sudden) {
    return `• แจ้งไม่ครบ ${noticeDays} วัน (${NOTICE_COUNTED_FROM_SUBMISSION}, กระทันหัน): หัก 2 เท่าค่าแรงรายวัน`;
  }
  return `• แจ้งล่วงหน้า ≥${noticeDays} วัน (${NOTICE_COUNTED_FROM_SUBMISSION}): หัก 1 เท่าค่าแรงรายวัน`;
}

export function formatNoticePeriodHint(noticeDays: number): string {
  return `💡 แจ้งล่วงหน้า ${noticeDays} วัน (${NOTICE_COUNTED_FROM_SUBMISSION}) — ไม่ครบอาจถูกหักเงินเดือน`;
}

export function expandDateRangeIso(startIso: string, endIso?: string): string[] {
  const start = String(startIso).slice(0, 10);
  const end = String(endIso ?? startIso).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) return [];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(end)) return [start];
  const dates: string[] = [];
  const cursor = new Date(`${start}T00:00:00.000Z`);
  const last = new Date(`${end}T00:00:00.000Z`);
  while (cursor.getTime() <= last.getTime()) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}
