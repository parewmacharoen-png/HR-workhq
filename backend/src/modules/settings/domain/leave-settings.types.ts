// ============================================================================
// modules/settings/domain/leave-settings.types.ts
// leave.rules payload — system defaults preserve pre-HR-11C behavior.
// ============================================================================

export const LEAVE_RULES_SETTING_KEY = 'rules';

export interface NewEmployeeEmergencyLeaveRules {
  remainingHalfYearAtLeastMonths: number;
  daysIfAtLeastThreshold: number;
  daysIfBelowThreshold: number;
}

export interface AbsencePenaltiesByRole {
  employee: number;
  subLeader: number;
  bigLeader: number;
  /** ABS-009 — Secretary position; distinct from bigLeader tier */
  secretary: number;
}

export interface LeaveRulesSetting {
  monthlyOffDays: number;
  minimumRecommendedOffDays: number;
  unusedOffDayBonusAmount: number;
  /** Monthly cap for unused off-day bonus — default 1200 THB */
  unusedOffDayBonusCap: number;
  defaultLeaveNoticeDays: number;
  unpaidLeaveNoticeDays: number;
  emergencyLeaveEnabled: boolean;
  emergencyLeaveEligibilityMonths: number;
  emergencyLeaveDaysPerHalfYear: number;
  newEmployeeEmergencyLeave: NewEmployeeEmergencyLeaveRules;
  sickLeaveRequiresCertificateAfterDays: number;
  sickLeaveAdjacentToOffDayRequiresCertificate: boolean;
  rescheduleNoticeDays: number;
  maxReschedulesPerRequest: number;
  rescheduleMustMoveForward: boolean;
  rescheduleMustKeepSameDuration: boolean;
  allowSplitFullDayLeave: boolean;
  emergencyRescheduleExceptionAllowed: boolean;
  shiftSwapNoticeDays: number;
  shiftSwapRequiresBothConsent: boolean;
  shiftSwapRequiresManagementApproval: boolean;
  consecutiveLeavePenaltyEnabled: boolean;
  consecutiveLeaveBaseDays: number;
  additionalConsecutiveLeavePenaltyLaborUnits: number;
  absencePenalties: AbsencePenaltiesByRole;
  /** Min characters for reschedule reason — wired in policy validator */
  minRescheduleReasonLength: number;
  /** Days of advance notice for excess monthly off (within allowance) — default 7 */
  excessOffDayNoticeDays: number;
  /** Daily wage multiplier per excess off-day when notice >= excessOffDayNoticeDays */
  excessOffDayAdvanceDailyMultiplier: number;
  /** Daily wage multiplier per excess off-day when notice < excessOffDayNoticeDays (sudden) */
  excessOffDaySuddenDailyMultiplier: number;
}

export const DEFAULT_LEAVE_RULES: LeaveRulesSetting = {
  monthlyOffDays: 4,
  minimumRecommendedOffDays: 2,
  unusedOffDayBonusAmount: 600,
  unusedOffDayBonusCap: 1200,
  defaultLeaveNoticeDays: 7,
  unpaidLeaveNoticeDays: 7,
  emergencyLeaveEnabled: true,
  emergencyLeaveEligibilityMonths: 3,
  emergencyLeaveDaysPerHalfYear: 4,
  newEmployeeEmergencyLeave: {
    remainingHalfYearAtLeastMonths: 3,
    daysIfAtLeastThreshold: 2,
    daysIfBelowThreshold: 1,
  },
  sickLeaveRequiresCertificateAfterDays: 1,
  sickLeaveAdjacentToOffDayRequiresCertificate: true,
  rescheduleNoticeDays: 7,
  maxReschedulesPerRequest: 1,
  rescheduleMustMoveForward: true,
  rescheduleMustKeepSameDuration: true,
  allowSplitFullDayLeave: false,
  emergencyRescheduleExceptionAllowed: true,
  shiftSwapNoticeDays: 7,
  shiftSwapRequiresBothConsent: true,
  shiftSwapRequiresManagementApproval: true,
  consecutiveLeavePenaltyEnabled: true,
  consecutiveLeaveBaseDays: 2,
  additionalConsecutiveLeavePenaltyLaborUnits: 5,
  absencePenalties: {
    employee: 1000,
    subLeader: 2000,
    bigLeader: 3000,
    secretary: 3000,
  },
  minRescheduleReasonLength: 10,
  excessOffDayNoticeDays: 7,
  excessOffDayAdvanceDailyMultiplier: 1,
  excessOffDaySuddenDailyMultiplier: 2,
};

function mergeNested<T extends object>(defaults: T, partial?: Partial<T>): T {
  if (!partial || typeof partial !== 'object') return { ...defaults };
  return { ...defaults, ...partial };
}

export function mergeLeaveRules(raw: unknown | null | undefined): LeaveRulesSetting {
  if (raw === null || raw === undefined || typeof raw !== 'object' || Array.isArray(raw)) {
    return {
      ...DEFAULT_LEAVE_RULES,
      newEmployeeEmergencyLeave: { ...DEFAULT_LEAVE_RULES.newEmployeeEmergencyLeave },
      absencePenalties: { ...DEFAULT_LEAVE_RULES.absencePenalties },
    };
  }
  const partial = raw as Partial<LeaveRulesSetting>;
  return {
    ...DEFAULT_LEAVE_RULES,
    ...partial,
    newEmployeeEmergencyLeave: mergeNested(
      DEFAULT_LEAVE_RULES.newEmployeeEmergencyLeave,
      partial.newEmployeeEmergencyLeave,
    ),
    absencePenalties: mergeNested(
      DEFAULT_LEAVE_RULES.absencePenalties,
      partial.absencePenalties,
    ),
  };
}

export function normalizeLeaveRules(rules: LeaveRulesSetting): LeaveRulesSetting {
  return mergeLeaveRules(rules);
}

export function validateLeaveRules(rules: LeaveRulesSetting): string[] {
  const errors: string[] = [];

  const nonNegativeInts = [
    ['monthlyOffDays', rules.monthlyOffDays],
    ['minimumRecommendedOffDays', rules.minimumRecommendedOffDays],
    ['defaultLeaveNoticeDays', rules.defaultLeaveNoticeDays],
    ['unpaidLeaveNoticeDays', rules.unpaidLeaveNoticeDays],
    ['emergencyLeaveEligibilityMonths', rules.emergencyLeaveEligibilityMonths],
    ['emergencyLeaveDaysPerHalfYear', rules.emergencyLeaveDaysPerHalfYear],
    ['sickLeaveRequiresCertificateAfterDays', rules.sickLeaveRequiresCertificateAfterDays],
    ['rescheduleNoticeDays', rules.rescheduleNoticeDays],
    ['maxReschedulesPerRequest', rules.maxReschedulesPerRequest],
    ['shiftSwapNoticeDays', rules.shiftSwapNoticeDays],
    ['consecutiveLeaveBaseDays', rules.consecutiveLeaveBaseDays],
    ['additionalConsecutiveLeavePenaltyLaborUnits', rules.additionalConsecutiveLeavePenaltyLaborUnits],
    ['minRescheduleReasonLength', rules.minRescheduleReasonLength],
    ['excessOffDayNoticeDays', rules.excessOffDayNoticeDays],
    ['excessOffDayAdvanceDailyMultiplier', rules.excessOffDayAdvanceDailyMultiplier],
    ['excessOffDaySuddenDailyMultiplier', rules.excessOffDaySuddenDailyMultiplier],
  ] as const;

  for (const [field, value] of nonNegativeInts) {
    if (typeof value !== 'number' || Number.isNaN(value) || value < 0) {
      errors.push(`${field} must be a non-negative number`);
    }
  }

  const nonNegativeAmounts = [
    ['unusedOffDayBonusAmount', rules.unusedOffDayBonusAmount],
    ['unusedOffDayBonusCap', rules.unusedOffDayBonusCap],
    ['absencePenalties.employee', rules.absencePenalties.employee],
    ['absencePenalties.subLeader', rules.absencePenalties.subLeader],
    ['absencePenalties.bigLeader', rules.absencePenalties.bigLeader],
    ['absencePenalties.secretary', rules.absencePenalties.secretary],
  ] as const;

  for (const [field, value] of nonNegativeAmounts) {
    if (typeof value !== 'number' || Number.isNaN(value) || value < 0) {
      errors.push(`${field} must be a non-negative number`);
    }
  }

  if (rules.monthlyOffDays < rules.minimumRecommendedOffDays) {
    errors.push('monthlyOffDays must be >= minimumRecommendedOffDays');
  }

  const ne = rules.newEmployeeEmergencyLeave;
  if (ne.remainingHalfYearAtLeastMonths < 0
    || ne.daysIfAtLeastThreshold < 0
    || ne.daysIfBelowThreshold < 0) {
    errors.push('newEmployeeEmergencyLeave values must be non-negative');
  }

  return errors;
}

export function cacheKeyForCompany(companyId: string | null): string {
  return companyId ?? 'system';
}
