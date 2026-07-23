// ============================================================================
// modules/attendance/domain/services/attendance-rules.service.ts
// Pure calculation of attendance-derived figures. All constants come from
// AttendanceRulesSetting via toAttendanceRuleParams().
// ============================================================================

import {
  AttendanceRulesSetting,
  DEFAULT_ATTENDANCE_RULES,
} from '../../../settings/domain/attendance-settings.types';

export interface AttendanceRuleParams {
  shiftStartMinutes: number;
  shiftEndMinutes: number;
  breakMinutes: number;
  lateGraceMinutes: number;
  lateMultiplier: number;
  monthlyHourlyRate: number;
  otStartDelayMinutes: number;
  otHourlyRate: number;
  overtimeEnabled: boolean;
  minimumOvertimeMinutes: number;
}

export function toAttendanceRuleParams(
  rules: AttendanceRulesSetting,
  monthlyHourlyRate: number,
): AttendanceRuleParams {
  return {
    shiftStartMinutes: rules.shiftStartMinutes,
    shiftEndMinutes: rules.shiftEndMinutes,
    breakMinutes: rules.breakMinutes,
    lateGraceMinutes: rules.graceMinutes,
    lateMultiplier: rules.latePenaltyMultiplier,
    monthlyHourlyRate,
    otStartDelayMinutes: rules.otStartDelayMinutes,
    otHourlyRate: rules.otHourlyRate,
    overtimeEnabled: rules.overtimeEnabled,
    minimumOvertimeMinutes: rules.minimumOvertimeMinutes,
  };
}

/** @deprecated Use toAttendanceRuleParams(DEFAULT_ATTENDANCE_RULES, rate) instead. */
export const DEFAULT_ATTENDANCE_PARAMS: AttendanceRuleParams = toAttendanceRuleParams(
  DEFAULT_ATTENDANCE_RULES,
  0,
);

export interface LateResult {
  lateMinutes: number;
  roundedLateHours: number;
  lateDeduction: number;
}

export interface OvertimeResult {
  otHours: number;
  otMinutes: number;
  amount: number;
}

export function computeRoundedLateHours(lateMinutes: number): number {
  if (lateMinutes <= 0) return 0;
  return Math.ceil(lateMinutes / 60);
}

export class AttendanceRulesService {
  constructor(private readonly params: AttendanceRuleParams) {}

  private minutesFromMidnight(d: Date): number {
    return d.getHours() * 60 + d.getMinutes();
  }

  /**
   * Late minutes beyond shiftStart + grace, with hour-rounded wage-hour deduction.
   * P0-005: deduct 2 wage-hours per rounded-up late hour.
   */
  computeLate(checkInAt: Date, shiftStartAt?: Date): LateResult {
    const startAt = shiftStartAt ?? this.inferShiftStartAt(checkInAt);
    const diffMinutes = Math.floor((checkInAt.getTime() - startAt.getTime()) / 60000);
    if (diffMinutes <= this.params.lateGraceMinutes) {
      return { lateMinutes: 0, roundedLateHours: 0, lateDeduction: 0 };
    }
    const lateMinutes = diffMinutes;
    const roundedLateHours = computeRoundedLateHours(lateMinutes);
    const lateDeduction = roundedLateHours
      * this.params.lateMultiplier
      * this.params.monthlyHourlyRate;
    return {
      lateMinutes,
      roundedLateHours,
      lateDeduction: this.round2(lateDeduction),
    };
  }

  /** Net worked minutes (clamped at 0), subtracting the unpaid break. */
  computeWorkedMinutes(checkInAt: Date, checkOutAt: Date): number {
    const raw = Math.floor((checkOutAt.getTime() - checkInAt.getTime()) / 60000);
    return Math.max(0, raw - this.params.breakMinutes);
  }

  /**
   * Overtime from explicit OT end time (employee-declared).
   * Uses shift end as OT start when provided.
   */
  computeOvertimeFromEnd(
    otStartAt: Date,
    otEndAt: Date,
  ): OvertimeResult {
    if (!this.params.overtimeEnabled) return { otHours: 0, otMinutes: 0, amount: 0 };
    const otMinutes = Math.max(0, Math.floor((otEndAt.getTime() - otStartAt.getTime()) / 60000));
    if (otMinutes < this.params.minimumOvertimeMinutes) {
      return { otHours: 0, otMinutes: 0, amount: 0 };
    }
    const otHours = Math.ceil(otMinutes / 60);
    if (otHours < 1) return { otHours: 0, otMinutes: 0, amount: 0 };
    return {
      otHours,
      otMinutes,
      amount: this.round2(otHours * this.params.otHourlyRate),
    };
  }

  /**
   * Overtime: only when enabled, past shiftEnd + otStartDelay,
   * and only in whole completed hours meeting minimumOvertimeMinutes.
   * @deprecated Prefer employee-declared OT via computeOvertimeFromEnd.
   */
  computeOvertime(checkOutAt: Date): OvertimeResult {
    if (!this.params.overtimeEnabled) return { otHours: 0, otMinutes: 0, amount: 0 };

    const outMin = this.minutesFromMidnight(checkOutAt);
    const otThreshold = this.params.shiftEndMinutes + this.params.otStartDelayMinutes;
    if (outMin <= otThreshold) return { otHours: 0, otMinutes: 0, amount: 0 };

    const minutesPastShiftEnd = outMin - this.params.shiftEndMinutes;
    if (minutesPastShiftEnd < this.params.minimumOvertimeMinutes) {
      return { otHours: 0, otMinutes: 0, amount: 0 };
    }

    const otHours = Math.floor(minutesPastShiftEnd / 60);
    if (otHours < 1) return { otHours: 0, otMinutes: 0, amount: 0 };
    return {
      otHours,
      otMinutes: minutesPastShiftEnd,
      amount: this.round2(otHours * this.params.otHourlyRate),
    };
  }

  private inferShiftStartAt(checkInAt: Date): Date {
    const d = new Date(checkInAt);
    d.setHours(0, 0, 0, 0);
    d.setMinutes(d.getMinutes() + this.params.shiftStartMinutes);
    return d;
  }

  private round2(n: number): number {
    return Math.round(n * 100) / 100;
  }
}
