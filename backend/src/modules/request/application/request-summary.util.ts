import {
  calendarDaysBetween,
  formatShortNoticeWarning,
} from '../../leave/domain/services/leave-notice.util';
import { offDayUnitsForLeaveType } from '../../payroll/domain/services/off-day-ot-usage.service';
import { DEFAULT_LEAVE_RULES } from '../../settings/domain/leave-settings.types';

const REASON_LABELS: Record<string, string> = {
  urgent_work: 'งานเร่งด่วน',
  continued_work: 'งานค้างต่อเนื่อง',
  client_meeting: 'ลูกค้า/นัดหมาย',
  other: 'อื่นๆ',
};

const LEAVE_TYPE_LABELS: Record<string, string> = {
  sick: 'ลาป่วย',
  personal: 'ลากิจ',
  emergency: 'ลาฉุกเฉิน',
  unpaid: 'ลาไม่รับค่าจ้าง',
};

function fmtDate(raw: unknown): string | null {
  const s = String(raw ?? '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const [y, m, d] = s.split('-');
  return `${d}/${m}/${y.slice(2)}`;
}

function leaveDateRange(values: Record<string, unknown>): string[] {
  const start = String(values.startDate ?? '').slice(0, 10);
  const end = String(values.endDate ?? start).slice(0, 10);
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

export function buildRequestSummaryLines(
  typeKey: string,
  values: Record<string, unknown>,
  options?: { submittedAt?: Date | null; noticeDays?: number },
): string[] {
  const lines: string[] = [];
  const noticeDays = options?.noticeDays ?? DEFAULT_LEAVE_RULES.defaultLeaveNoticeDays;
  const submittedAt = options?.submittedAt ?? new Date();

  switch (typeKey) {
    case 'ot_request': {
      const date = fmtDate(values.otDate);
      if (date) lines.push(`วันที่ OT: ${date}`);
      const start = values.startTime ? String(values.startTime) : null;
      const end = values.endTime ? String(values.endTime) : null;
      if (start && end) lines.push(`เวลา: ${start} – ${end}`);
      else if (start) lines.push(`เริ่ม: ${start}`);
      const reason = values.reason ? String(values.reason) : '';
      if (reason) {
        const label = REASON_LABELS[reason] ?? reason;
        const detail = values.reasonDetail ? String(values.reasonDetail) : '';
        lines.push(detail ? `เหตุผล: ${label} — ${detail}` : `เหตุผล: ${label}`);
      }
      break;
    }
    case 'leave_request': {
      const leaveType = values.leaveType ? String(values.leaveType) : '';
      const typeLabel = LEAVE_TYPE_LABELS[leaveType] ?? leaveType;
      if (leaveType) {
        lines.push(`ประเภท: ${typeLabel}`);
        if (leaveType === 'emergency') {
          lines.push('🚨 ลาฉุกเฉิน — นับเป็นวันหยุด 2 วันต่อโอที (ไม่หักโควต้าวันหยุด 4 วัน)');
        }
      }
      const dates = leaveDateRange(values);
      const start = fmtDate(values.startDate);
      const end = fmtDate(values.endDate);
      if (start && end && start !== end) lines.push(`วันที่: ${start} – ${end}`);
      else if (start) lines.push(`วันที่: ${start}`);
      if (values.duration) lines.push(`รูปแบบ: ${String(values.duration)}`);
      if (values.reason) lines.push(`เหตุผล: ${String(values.reason)}`);

      const shortDates = dates.filter(
        (d) => calendarDaysBetween(submittedAt, d) < noticeDays,
      );
      const noticeWarn = formatShortNoticeWarning(shortDates, noticeDays);
      if (noticeWarn) lines.push(noticeWarn);

      if (leaveType) {
        const units = dates.length * offDayUnitsForLeaveType(leaveType);
        if (units > 0) {
          lines.push(`ผลต่อโอทีวันหยุด: นับ ${units} วัน (ไม่ได้ ฿600/วัน)`);
        }
      }
      break;
    }
    case 'no_break_report': {
      const date = fmtDate(values.workDate);
      if (date) lines.push(`วันที่: ${date}`);
      if (values.note) lines.push(`หมายเหตุ: ${String(values.note)}`);
      break;
    }
    case 'off_day_change': {
      const current = fmtDate(values.currentOffDay);
      const requested = fmtDate(values.requestedOffDay);
      if (current) lines.push(`ยกเลิกวันหยุดเดิม: ${current}`);
      if (requested) lines.push(`ตั้งวันหยุดใหม่: ${requested}`);
      if (current && requested) lines.push(`เปลี่ยนจาก ${current} → ${requested}`);
      if (values.reason) lines.push(`เหตุผล: ${String(values.reason)}`);
      break;
    }
    case 'shift_change': {
      const date = fmtDate(values.effectiveDate ?? values.requestedShift);
      if (date) lines.push(`วันที่: ${date}`);
      if (values.requestedShift) lines.push(`กะที่ต้องการ: ${String(values.requestedShift)}`);
      if (values.reason) lines.push(`เหตุผล: ${String(values.reason)}`);
      break;
    }
    case 'advance_pay': {
      if (values.amount != null) lines.push(`จำนวน: ฿${values.amount}`);
      if (values.reason) lines.push(`เหตุผล: ${String(values.reason)}`);
      break;
    }
    case 'time_correction': {
      const date = fmtDate(values.attendanceDate ?? values.workDate);
      if (date) lines.push(`วันที่: ${date}`);
      if (values.correctedCheckIn) lines.push(`เช็กอิน: ${String(values.correctedCheckIn)}`);
      if (values.correctedCheckOut) lines.push(`เช็กเอาท์: ${String(values.correctedCheckOut)}`);
      break;
    }
    default: {
      for (const [key, val] of Object.entries(values)) {
        if (val == null || val === '') continue;
        if (key.endsWith('Date') || key.includes('date')) {
          const d = fmtDate(val);
          if (d) lines.push(`${key}: ${d}`);
        } else if (typeof val === 'string' && val.length <= 120) {
          lines.push(`${key}: ${val}`);
        }
      }
      break;
    }
  }

  return lines.slice(0, 10);
}
