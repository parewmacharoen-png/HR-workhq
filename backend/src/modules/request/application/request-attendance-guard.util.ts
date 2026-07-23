// ============================================================================
// request-attendance-guard.util.ts
// Pure rules: attendance-linked requests must match real check-in data.
// ============================================================================

import { parseThaiTimeInput } from '../../../shared/time/thai-time-input.util';

export interface AttendanceDaySnapshot {
  recordId: string | null;
  checkInAt: Date | null;
  checkOutAt: Date | null;
  breakStartAt: Date | null;
  totalBreakMinutes: number;
  breakRecordCount: number;
  onApprovedLeave: boolean;
  hasAbsencePenalty: boolean;
  existingOtRecords: number;
  existingOpenOtRequests: number;
  existingOpenNoBreakRequests: number;
  shiftStartAt: Date | null;
  shiftEndAt: Date | null;
  shiftName: string | null;
}

export function workDateIsoFromRequestValues(
  typeKey: string,
  values: Record<string, unknown>,
): string | null {
  const raw = typeKey === 'ot_request' ? values.otDate : values.workDate;
  const iso = String(raw ?? '').slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso : null;
}

export function assertOtRequestAllowed(snapshot: AttendanceDaySnapshot): void {
  if (!snapshot.recordId || !snapshot.checkInAt) {
    throw new Error('ต้องเช็กอินเข้างานวันนั้นก่อนจึงจะขอ OT ได้');
  }
  if (snapshot.onApprovedLeave) {
    throw new Error('วันนี้มีการลาที่อนุมัติแล้ว ไม่สามารถขอ OT ได้');
  }
  if (snapshot.hasAbsencePenalty) {
    throw new Error('ระบบบันทึกว่าวันนี้ขาดงาน/ไม่เช็กอิน ไม่สามารถขอ OT ได้');
  }
  if (snapshot.existingOtRecords > 0) {
    throw new Error('มีรายการ OT วันนี้แล้ว');
  }
  if (snapshot.existingOpenOtRequests > 0) {
    throw new Error('มีคำร้องขอ OT วันนี้รออนุมัติอยู่แล้ว');
  }
}

/** OT must not overlap the employee's regular shift hours. */
export function assertOtOutsideShiftHours(input: {
  workDateIso: string;
  startTime: string;
  endTime: string;
  shiftStartAt: Date | null;
  shiftEndAt: Date | null;
  shiftName?: string | null;
}): void {
  if (!input.shiftStartAt || !input.shiftEndAt) return;

  const otWindow = buildOtWindowOnWorkDate(input.workDateIso, input.startTime, input.endTime);
  if (!otWindow) {
    throw new Error('รูปแบบเวลา OT ไม่ถูกต้อง (เช่น 21.00)');
  }

  if (intervalsOverlap(otWindow.start, otWindow.end, input.shiftStartAt, input.shiftEndAt)) {
    const shiftLabel = formatShiftRangeLabel(input.shiftStartAt, input.shiftEndAt);
    const name = input.shiftName ? `กะ${input.shiftName} ` : '';
    throw new Error(
      `ไม่สามารถขอ OT ในช่วงเวลากะปกติได้ (${name}${shiftLabel}) — OT ต้องอยู่นอกเวลาทำงาน`,
    );
  }
}

export function buildOtWindowOnWorkDate(
  workDateIso: string,
  startTime: string,
  endTime: string,
): { start: Date; end: Date } | null {
  const startParts = parseThaiTimeInput(String(startTime).trim());
  const endParts = parseThaiTimeInput(String(endTime).trim());
  if (!startParts || !endParts) return null;

  const start = bangkokLocalToUtc(workDateIso, startParts.hours, startParts.minutes);
  let end = bangkokLocalToUtc(workDateIso, endParts.hours, endParts.minutes);
  if (end.getTime() <= start.getTime()) {
    end = bangkokLocalToUtc(addDaysIso(workDateIso, 1), endParts.hours, endParts.minutes);
  }
  return { start, end };
}

export function intervalsOverlap(
  aStart: Date,
  aEnd: Date,
  bStart: Date,
  bEnd: Date,
): boolean {
  return aStart.getTime() < bEnd.getTime() && bStart.getTime() < aEnd.getTime();
}

function formatShiftRangeLabel(start: Date, end: Date): string {
  const fmt = (d: Date) => d.toLocaleTimeString('th-TH', {
    timeZone: 'Asia/Bangkok',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  return `${fmt(start)}–${fmt(end)}`;
}

function bangkokLocalToUtc(dateIso: string, hours: number, minutes: number): Date {
  const local = `${dateIso}T${pad(hours)}:${pad(minutes)}:00`;
  const probe = new Date(`${local}Z`);
  const asBangkok = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(probe);
  const parts = Object.fromEntries(asBangkok.map((p) => [p.type, p.value]));
  const shown = `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}`;
  const offsetMs = Date.parse(`${shown}Z`) - Date.parse(`${local}Z`);
  return new Date(Date.parse(`${local}Z`) - offsetMs);
}

function addDaysIso(dateIso: string, days: number): string {
  const d = new Date(`${dateIso}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

export function assertNoBreakReportAllowed(snapshot: AttendanceDaySnapshot): void {
  if (!snapshot.recordId || !snapshot.checkInAt) {
    throw new Error('ต้องเช็กอินเข้างานวันนั้นก่อนจึงจะแจ้งไม่พักเบรกได้');
  }
  if (snapshot.onApprovedLeave) {
    throw new Error('วันนี้มีการลาที่อนุมัติแล้ว ไม่สามารถแจ้งไม่พักเบรกได้');
  }
  if (snapshot.hasAbsencePenalty) {
    throw new Error('ระบบบันทึกว่าวันนี้ขาดงาน/ไม่เช็กอิน ไม่สามารถแจ้งไม่พักเบรกได้');
  }
  const tookBreak = snapshot.breakRecordCount > 0
    || snapshot.breakStartAt != null
    || snapshot.totalBreakMinutes > 0;
  if (tookBreak) {
    throw new Error('พบการพักเบรกในวันนี้แล้ว ไม่สามารถแจ้งไม่พักได้');
  }
  if (snapshot.existingOtRecords > 0) {
    throw new Error('มีรายการ OT/ไม่พักเบรกวันนี้แล้ว');
  }
  if (snapshot.existingOpenNoBreakRequests > 0) {
    throw new Error('มีคำร้องแจ้งไม่พักเบรกวันนี้รออนุมัติอยู่แล้ว');
  }
}

export function formatAttendanceContextLines(
  snapshot: AttendanceDaySnapshot,
  formatTime: (value: Date) => string,
): string[] {
  if (!snapshot.checkInAt) {
    return ['⚠️ ไม่พบการเช็กอินวันนี้'];
  }
  const lines = [`✅ เช็กอิน: ${formatTime(snapshot.checkInAt)}`];
  if (snapshot.checkOutAt) lines.push(`✅ เช็กเอาท์: ${formatTime(snapshot.checkOutAt)}`);
  else lines.push('⏳ ยังไม่เช็กเอาท์');
  if (snapshot.breakRecordCount > 0 || snapshot.totalBreakMinutes > 0) {
    lines.push(`☕ พักเบรก: ${snapshot.totalBreakMinutes} นาที`);
  } else {
    lines.push('☕ ไม่พบการพักเบรก');
  }
  if (snapshot.onApprovedLeave) lines.push('📅 มีการลาอนุมัติวันนี้');
  if (snapshot.hasAbsencePenalty) lines.push('🚫 ระบบบันทึกขาดงาน/ไม่เช็กอิน');
  return lines;
}
