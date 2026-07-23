// ============================================================================
// Consecutive leave penalty — additional days adjacent to 2+ day approved blocks.
// ============================================================================

export interface LeaveApprovalEvent {
  requestId: string;
  startDate: Date;
  endDate: Date;
  leaveTypeCode: string;
  createdAt: Date;
}

export interface ConsecutiveLeavePenaltyParams {
  enabled: boolean;
  baseDays: number;
  laborUnits: number;
  hourlyRate: number;
}

export interface ConsecutiveLeavePenaltySource {
  leaveRequestId: string;
  date: string;
  laborUnits: number;
  amount: number;
}

export interface ConsecutiveLeavePenaltySummary {
  totalDeduction: number;
  sources: ConsecutiveLeavePenaltySource[];
}

export function expandInclusiveDates(start: Date, end: Date): string[] {
  const dates: string[] = [];
  const cursor = new Date(start);
  const endIso = end.toISOString().slice(0, 10);
  while (cursor.toISOString().slice(0, 10) <= endIso) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

function addDaysIso(iso: string, days: number): string {
  const cursor = new Date(`${iso}T00:00:00.000Z`);
  cursor.setUTCDate(cursor.getUTCDate() + days);
  return cursor.toISOString().slice(0, 10);
}

function consecutiveRunLength(dates: Set<string>, anchor: string): number {
  if (!dates.has(anchor)) return 0;
  let start = anchor;
  while (dates.has(addDaysIso(start, -1))) start = addDaysIso(start, -1);
  let end = anchor;
  while (dates.has(addDaysIso(end, 1))) end = addDaysIso(end, 1);
  const startMs = Date.parse(`${start}T00:00:00.000Z`);
  const endMs = Date.parse(`${end}T00:00:00.000Z`);
  return Math.floor((endMs - startMs) / 86_400_000) + 1;
}

function isEmergencyLeave(code: string): boolean {
  return code.toLowerCase() === 'emergency';
}

export function computeConsecutiveLeavePenalties(
  requests: LeaveApprovalEvent[],
  params: ConsecutiveLeavePenaltyParams,
  periodStartIso: string,
  periodEndIso: string,
): ConsecutiveLeavePenaltySummary {
  if (!params.enabled || params.hourlyRate <= 0) {
    return { totalDeduction: 0, sources: [] };
  }

  const sorted = [...requests].sort(
    (a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.requestId.localeCompare(b.requestId),
  );
  const approvedDates = new Set<string>();
  const sources: ConsecutiveLeavePenaltySource[] = [];

  for (const req of sorted) {
    const newDates = expandInclusiveDates(req.startDate, req.endDate);
    if (!isEmergencyLeave(req.leaveTypeCode)) {
      for (const date of newDates) {
        if (date < periodStartIso || date > periodEndIso) continue;
        const prev = addDaysIso(date, -1);
        const next = addDaysIso(date, 1);
        const adjacentPriorBlock =
          (approvedDates.has(prev) && consecutiveRunLength(approvedDates, prev) >= params.baseDays)
          || (approvedDates.has(next) && consecutiveRunLength(approvedDates, next) >= params.baseDays);
        if (adjacentPriorBlock) {
          sources.push({
            leaveRequestId: req.requestId,
            date,
            laborUnits: params.laborUnits,
            amount: roundMoney(params.laborUnits * params.hourlyRate),
          });
        }
      }
    }
    for (const date of newDates) approvedDates.add(date);
  }

  const totalDeduction = roundMoney(sources.reduce((sum, row) => sum + row.amount, 0));
  return { totalDeduction, sources };
}

export function formatConsecutiveLeavePenaltyNote(summary: ConsecutiveLeavePenaltySummary): string {
  if (!summary.sources.length) return 'หักลาติดต่อกัน';
  const refs = summary.sources
    .map((s) => `${s.date}:฿${s.amount.toFixed(0)}(${s.laborUnits} แรง)`)
    .join(' | ');
  return `หักลาติดต่อกัน (${summary.sources.length} วัน) | ${refs}`;
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}
