// ============================================================================
// UX-001 — Button-based form UX helpers for Telegram
// ============================================================================

import { Injectable } from '@nestjs/common';
import { DateProvider } from '../../../shared/time/date.provider';
import {
  parseThaiDateInput,
  formatIsoDateAsDdMmYyyy,
  THAI_DATE_VALIDATION_ERROR,
} from '../../../shared/time/thai-date-input.util';
import {
  formatTimeAsThaiDot,
  normalizeThaiTimeInput,
  parseThaiTimeInput,
  THAI_TIME_INPUT_HINT,
  THAI_TIME_VALIDATION_ERROR,
} from '../../../shared/time/thai-time-input.util';
import {
  BUTTON_FIELD_TYPES,
  EMERGENCY_RELATIONSHIPS,
  OT_QUICK_TIME_SLOT_COUNT,
  QUICK_AMOUNTS,
  QUICK_TIME_SLOTS,
  THAI_BANKS,
} from './telegram-form-ux.constants';

export interface FormOption {
  label: string;
  value: string;
}

type InlineRow = Array<{ text: string; callback_data: string }>;

@Injectable()
export class TelegramFormUxService {
  constructor(private readonly dates: DateProvider) {}

  todayString(): string {
    return this.dates.todayString();
  }

  tomorrowString(): string {
    const d = this.dates.parseDate(this.dates.todayString());
    d.setDate(d.getDate() + 1);
    return d.toISOString().slice(0, 10);
  }

  yesterdayString(): string {
    const d = this.dates.parseDate(this.dates.todayString());
    d.setDate(d.getDate() - 1);
    return d.toISOString().slice(0, 10);
  }

  isButtonField(fieldType: string): boolean {
    return BUTTON_FIELD_TYPES.has(fieldType);
  }

  resolveOptions(fieldType: string, optionsJson: unknown): FormOption[] {
    if (fieldType === 'bank_picker') return [...THAI_BANKS];
    if (fieldType === 'relationship_picker') return [...EMERGENCY_RELATIONSHIPS];
    const opts = (optionsJson as FormOption[] | null) ?? [];
    return opts.filter((o) => o?.value && o?.label);
  }

  buildOptionRows(prefix: string, options: FormOption[]): InlineRow[] {
    return options.map((o) => [{
      text: o.label,
      callback_data: `${prefix}:${this.encodeCallbackValue(o.value)}`,
    }]);
  }

  buildQuickDateRows(prefix: string, opts?: { includePayday?: boolean; includeYesterday?: boolean }): InlineRow[] {
    const rows: InlineRow[] = [
      [{ text: '📅 วันนี้', callback_data: `${prefix}:today` }],
    ];
    if (opts?.includeYesterday) {
      rows.push([{ text: '📅 เมื่อวาน', callback_data: `${prefix}:yesterday` }]);
    }
    rows.push([{ text: '📅 พรุ่งนี้', callback_data: `${prefix}:tomorrow` }]);
    if (opts?.includePayday) {
      rows.push([{ text: '💰 วันเงินเดือนออก', callback_data: `${prefix}:payday` }]);
    }
    rows.push([{ text: '✏️ เลือกวันที่', callback_data: `${prefix}:manual` }]);
    return rows;
  }

  /**
   * Quick time buttons.
   * - Default: daytime slots
   * - OT: pass notBeforeMinutes (shift end, inclusive) and/or afterTime (exclusive, for end time)
   */
  buildQuickTimeRows(
    prefix: string,
    opts?: {
      notBeforeMinutes?: number;
      afterTime?: string;
      count?: number;
    },
  ): InlineRow[] {
    const slots = this.resolveQuickTimeSlots(opts);
    const rows: InlineRow[] = [];
    for (let i = 0; i < slots.length; i += 3) {
      rows.push(
        slots.slice(i, i + 3).map((t) => ({
          text: formatTimeAsThaiDot(t),
          callback_data: `${prefix}:${t.replace(':', '-')}`,
        })),
      );
    }
    rows.push([{ text: '✏️ กรอกเอง', callback_data: `${prefix}:manual` }]);
    return rows;
  }

  /** Hourly HH:mm slots starting at/after shift end (and after OT start when set). */
  resolveQuickTimeSlots(opts?: {
    notBeforeMinutes?: number;
    afterTime?: string;
    count?: number;
  }): string[] {
    if (opts?.notBeforeMinutes == null && !opts?.afterTime) {
      return [...QUICK_TIME_SLOTS];
    }

    let startMinutes = opts?.notBeforeMinutes ?? 0;
    if (startMinutes % 60 !== 0) {
      startMinutes = Math.ceil(startMinutes / 60) * 60;
    }

    if (opts?.afterTime) {
      const parts = parseThaiTimeInput(opts.afterTime);
      if (parts) {
        const afterMinutes = parts.hours * 60 + parts.minutes + 60;
        // Keep continuity across midnight: prefer the later bound on the OT timeline.
        if (opts.notBeforeMinutes != null) {
          const shiftEnd = opts.notBeforeMinutes;
          const afterNorm = afterMinutes;
          // If start is at/after shift end same evening, use afterNorm.
          // If afterNorm wrapped (e.g. start 23:00 → after 24:00), still fine with mod below.
          startMinutes = Math.max(startMinutes, afterNorm);
        } else {
          startMinutes = afterMinutes;
        }
      }
    }

    const count = opts?.count ?? OT_QUICK_TIME_SLOT_COUNT;
    const slots: string[] = [];
    for (let i = 0; i < count; i += 1) {
      const mins = (startMinutes + i * 60) % (24 * 60);
      const hh = String(Math.floor(mins / 60)).padStart(2, '0');
      const mm = String(mins % 60).padStart(2, '0');
      slots.push(`${hh}:${mm}`);
    }
    return slots;
  }

  formatMinutesAsThaiDot(minutesFromMidnight: number): string {
    const mins = ((minutesFromMidnight % (24 * 60)) + (24 * 60)) % (24 * 60);
    const hh = String(Math.floor(mins / 60)).padStart(2, '0');
    const mm = String(mins % 60).padStart(2, '0');
    return formatTimeAsThaiDot(`${hh}:${mm}`);
  }

  buildQuickAmountRows(prefix: string): InlineRow[] {
    const rows: InlineRow[] = [];
    for (let i = 0; i < QUICK_AMOUNTS.length; i += 2) {
      rows.push(
        QUICK_AMOUNTS.slice(i, i + 2).map((a) => ({
          text: `฿${a.toLocaleString('th-TH')}`,
          callback_data: `${prefix}:${a}`,
        })),
      );
    }
    rows.push([{ text: '✏️ กรอกเอง', callback_data: `${prefix}:manual` }]);
    return rows;
  }

  navRows(): InlineRow[] {
    return [
      [
        { text: '⬅️ ย้อนกลับ', callback_data: 'req:back' },
        { text: '❌ ยกเลิก', callback_data: 'req:cancel' },
      ],
    ];
  }

  summaryRows(): InlineRow[] {
    return [
      [{ text: '✅ ส่งข้อมูล', callback_data: 'req:submit' }],
      [
        { text: '✏️ แก้ไข', callback_data: 'req:edit' },
        { text: '❌ ยกเลิก', callback_data: 'req:cancel' },
      ],
    ];
  }

  encodeCallbackValue(value: string): string {
    return value.replace(/:/g, '_').slice(0, 40);
  }

  decodeCallbackValue(encoded: string): string {
    return encoded.replace(/_/g, ':');
  }

  validatePhone(value: string): string | null {
    const digits = value.replace(/\D/g, '');
    if (!/^0[689]\d{8}$/.test(digits)) {
      return 'เบอร์โทรไม่ถูกต้อง (เช่น 0812345678)';
    }
    return null;
  }

  validateBankAccount(value: string): string | null {
    if (!/^\d{10,15}$/.test(value.replace(/\D/g, ''))) {
      return 'เลขบัญชีต้องเป็นตัวเลข 10–15 หลัก';
    }
    return null;
  }

  validateDate(value: string): string | null {
    if (!parseThaiDateInput(value)) return THAI_DATE_VALIDATION_ERROR;
    return null;
  }

  validateTime(value: string): string | null {
    if (!parseThaiTimeInput(value)) return THAI_TIME_VALIDATION_ERROR;
    return null;
  }

  normalizeTime(value: string): string | null {
    return normalizeThaiTimeInput(value);
  }

  timeInputHint(): string {
    return THAI_TIME_INPUT_HINT;
  }

  resolveQuickDate(preset: string, payDate?: string | null): string | null {
    if (preset === 'today') return this.todayString();
    if (preset === 'tomorrow') return this.tomorrowString();
    if (preset === 'yesterday') return this.yesterdayString();
    if (preset === 'payday' && payDate) return payDate.slice(0, 10);
    if (preset === 'payday') return this.todayString();
    return null;
  }

  labelForValue(fieldType: string, value: unknown, optionsJson?: unknown): string {
    const str = String(value ?? '');
    const opts = this.resolveOptions(fieldType, optionsJson);
    const hit = opts.find((o) => o.value === str);
    if (hit?.label) return hit.label;
    if (['date', 'quick_date'].includes(fieldType) && /^\d{4}-\d{2}-\d{2}$/.test(str)) {
      return formatIsoDateAsDdMmYyyy(str);
    }
    if (['time', 'quick_time'].includes(fieldType) && str) {
      return formatTimeAsThaiDot(str);
    }
    return str;
  }
}
