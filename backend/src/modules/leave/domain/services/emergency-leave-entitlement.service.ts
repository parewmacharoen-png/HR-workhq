// ============================================================================
// modules/leave/domain/services/emergency-leave-entitlement.service.ts
// Half-year emergency leave entitlement with new-hire proration.
// ============================================================================

import { LeaveRulesSetting } from '../../../settings/domain/leave-settings.types';

export interface HalfYearPeriod {
  periodStart: Date;
  periodEnd: Date;
}

export interface EmergencyEntitlementInput {
  hireDate: Date;
  requestDate: Date;
  employmentStatus: string;
  probationEndDate: Date | null;
  rules: LeaveRulesSetting;
}

export interface EmergencyEntitlementResult {
  eligible: boolean;
  entitled: number;
  period: HalfYearPeriod;
  reason?: string;
}

export function halfYearPeriodContaining(date: Date): HalfYearPeriod {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  if (month < 6) {
    return {
      periodStart: new Date(Date.UTC(year, 0, 1)),
      periodEnd: new Date(Date.UTC(year, 5, 30)),
    };
  }
  return {
    periodStart: new Date(Date.UTC(year, 6, 1)),
    periodEnd: new Date(Date.UTC(year, 11, 31)),
  };
}

export function hasPassedProbation(
  employmentStatus: string,
  probationEndDate: Date | null,
  asOf: Date,
): boolean {
  if (employmentStatus === 'terminated' || employmentStatus === 'suspended') return false;
  if (employmentStatus === 'active') return true;
  if (employmentStatus === 'probation') {
    if (!probationEndDate) return false;
    return probationEndDate.getTime() <= asOf.getTime();
  }
  return false;
}

export function computeEmergencyLeaveEntitlement(
  input: EmergencyEntitlementInput,
): EmergencyEntitlementResult {
  const period = halfYearPeriodContaining(input.requestDate);

  if (!input.rules.emergencyLeaveEnabled) {
    return { eligible: false, entitled: 0, period, reason: 'Emergency leave is disabled' };
  }

  if (!hasPassedProbation(input.employmentStatus, input.probationEndDate, input.requestDate)) {
    return { eligible: false, entitled: 0, period, reason: 'Employee has not completed probation' };
  }

  const hiredInPeriod =
    input.hireDate.getTime() >= period.periodStart.getTime()
    && input.hireDate.getTime() <= period.periodEnd.getTime();

  let entitled = input.rules.emergencyLeaveDaysPerHalfYear;
  if (hiredInPeriod) {
    const monthsRemaining = monthsRemainingInPeriod(input.hireDate, period.periodEnd);
    if (monthsRemaining >= input.rules.newEmployeeEmergencyLeave.remainingHalfYearAtLeastMonths) {
      entitled = input.rules.newEmployeeEmergencyLeave.daysIfAtLeastThreshold;
    } else {
      entitled = input.rules.newEmployeeEmergencyLeave.daysIfBelowThreshold;
    }
  }

  return { eligible: true, entitled, period };
}

function monthsRemainingInPeriod(from: Date, periodEnd: Date): number {
  const startYear = from.getUTCFullYear();
  const startMonth = from.getUTCMonth();
  const endYear = periodEnd.getUTCFullYear();
  const endMonth = periodEnd.getUTCMonth();
  return (endYear - startYear) * 12 + (endMonth - startMonth) + 1;
}
