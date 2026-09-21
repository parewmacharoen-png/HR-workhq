// ============================================================================
// modules/settings/domain/attendance-settings.types.ts
// attendance.rules payload — system defaults preserve pre-HR-11B behavior.
// ============================================================================

export const ATTENDANCE_RULES_SETTING_KEY = 'rules';

export interface AttendanceRulesSetting {
  graceMinutes: number;
  latePenaltyMultiplier: number;
  breakMinutes: number;
  breakOveragePenaltyThresholdHours: number;
  halfDayAbsenceThresholdHours: number;
  fullDayAbsenceThresholdHours: number;
  missingCheckInAllowed: boolean;
  missingCheckOutAllowed: boolean;
  autoCloseMissingCheckOut: boolean;
  overtimeEnabled: boolean;
  minimumOvertimeMinutes: number;
  /** Minutes from midnight — default 09:00 */
  shiftStartMinutes: number;
  /** Minutes from midnight — default 21:00 */
  shiftEndMinutes: number;
  /** Minutes past shift end before OT gate — default 30 */
  otStartDelayMinutes: number;
  /** Flat OT hourly rate (THB) — default 50 */
  otHourlyRate: number;
  /** ATT-010 — minutes before shift start to send pre check-in reminder */
  checkInPreReminderMinutes: number;
  /** ATT-010 — minutes after shift start before missed check-in warning */
  checkInReminderMinutes: number;
  /** ATT-010 — minutes after shift start before escalation to Big Leader */
  checkInEscalationMinutes: number;
  /** ATT-010 — minutes before break limit to send pre return reminder */
  breakPreReminderMinutes: number;
  /** ATT-010 — minutes after break start before return reminder */
  breakReminderMinutes: number;
  /** ATT-010 — minutes after break start before escalation */
  breakEscalationMinutes: number;
  /** ATT-010 — minutes after shift end before check-out reminder */
  checkOutReminderMinutes: number;
  /** ATT-010 — minutes after shift end before check-out escalation */
  checkOutEscalationMinutes: number;
  /** ATT-LOC — max distance (meters) from an employee's captured home baseline before a
   * check-in/check-out is flagged as a location anomaly and alerted to owner/HR. */
  homeLocationRadiusMeters: number;
}

/** System defaults — matches hardcoded values before HR-11B migration. */
export const DEFAULT_ATTENDANCE_RULES: AttendanceRulesSetting = {
  graceMinutes: 15,
  latePenaltyMultiplier: 2,
  breakMinutes: 60,
  breakOveragePenaltyThresholdHours: 2,
  halfDayAbsenceThresholdHours: 4,
  fullDayAbsenceThresholdHours: 6,
  missingCheckInAllowed: false,
  missingCheckOutAllowed: false,
  autoCloseMissingCheckOut: false,
  overtimeEnabled: true,
  minimumOvertimeMinutes: 60,
  shiftStartMinutes: 9 * 60,
  shiftEndMinutes: 21 * 60,
  otStartDelayMinutes: 30,
  otHourlyRate: 50,
  checkInPreReminderMinutes: 15,
  checkInReminderMinutes: 30,
  checkInEscalationMinutes: 60,
  breakPreReminderMinutes: 5,
  breakReminderMinutes: 60,
  breakEscalationMinutes: 90,
  checkOutReminderMinutes: 30,
  checkOutEscalationMinutes: 120,
  homeLocationRadiusMeters: 300,
};

export function mergeAttendanceRules(
  raw: unknown | null | undefined,
): AttendanceRulesSetting {
  if (raw === null || raw === undefined) {
    return { ...DEFAULT_ATTENDANCE_RULES };
  }
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    return { ...DEFAULT_ATTENDANCE_RULES };
  }
  return {
    ...DEFAULT_ATTENDANCE_RULES,
    ...(raw as Partial<AttendanceRulesSetting>),
  };
}

export function validateAttendanceRules(rules: AttendanceRulesSetting): string[] {
  const errors: string[] = [];

  const nonNegative = [
    ['graceMinutes', rules.graceMinutes],
    ['latePenaltyMultiplier', rules.latePenaltyMultiplier],
    ['breakOveragePenaltyThresholdHours', rules.breakOveragePenaltyThresholdHours],
    ['halfDayAbsenceThresholdHours', rules.halfDayAbsenceThresholdHours],
    ['fullDayAbsenceThresholdHours', rules.fullDayAbsenceThresholdHours],
    ['minimumOvertimeMinutes', rules.minimumOvertimeMinutes],
    ['shiftStartMinutes', rules.shiftStartMinutes],
    ['shiftEndMinutes', rules.shiftEndMinutes],
    ['otStartDelayMinutes', rules.otStartDelayMinutes],
    ['otHourlyRate', rules.otHourlyRate],
    ['checkInPreReminderMinutes', rules.checkInPreReminderMinutes],
    ['checkInReminderMinutes', rules.checkInReminderMinutes],
    ['checkInEscalationMinutes', rules.checkInEscalationMinutes],
    ['breakPreReminderMinutes', rules.breakPreReminderMinutes],
    ['breakReminderMinutes', rules.breakReminderMinutes],
    ['breakEscalationMinutes', rules.breakEscalationMinutes],
    ['checkOutReminderMinutes', rules.checkOutReminderMinutes],
    ['checkOutEscalationMinutes', rules.checkOutEscalationMinutes],
    ['homeLocationRadiusMeters', rules.homeLocationRadiusMeters],
  ] as const;

  for (const [field, value] of nonNegative) {
    if (typeof value !== 'number' || Number.isNaN(value) || value < 0) {
      errors.push(`${field} must be a non-negative number`);
    }
  }

  if (typeof rules.breakMinutes !== 'number' || rules.breakMinutes <= 0) {
    errors.push('breakMinutes must be greater than 0');
  }

  if (typeof rules.homeLocationRadiusMeters !== 'number' || rules.homeLocationRadiusMeters <= 0) {
    errors.push('homeLocationRadiusMeters must be greater than 0');
  }

  if (rules.halfDayAbsenceThresholdHours > rules.fullDayAbsenceThresholdHours) {
    errors.push('halfDayAbsenceThresholdHours must not exceed fullDayAbsenceThresholdHours');
  }

  if (rules.shiftStartMinutes >= rules.shiftEndMinutes) {
    errors.push('shiftStartMinutes must be before shiftEndMinutes');
  }

  if (
    rules.breakPreReminderMinutes > 0
    && rules.breakReminderMinutes > 0
    && rules.breakPreReminderMinutes >= rules.breakReminderMinutes
  ) {
    errors.push('breakPreReminderMinutes must be less than breakReminderMinutes');
  }

  return errors;
}

export function cacheKeyForCompany(companyId: string | null): string {
  return companyId ?? 'system';
}
