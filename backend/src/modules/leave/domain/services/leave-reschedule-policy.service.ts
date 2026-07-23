// ============================================================================
// modules/leave/domain/services/leave-reschedule-policy.service.ts
// Pure validation for leave reschedule and shift-swap business rules.
// ============================================================================

import { ValidationError } from '../../../../shared/kernel/domain-error';
import {
  DEFAULT_LEAVE_RULES,
  LeaveRulesSetting,
} from '../../../settings/domain/leave-settings.types';

const MS_PER_DAY = 86_400_000;

/** Policy fields used by reschedule/swap validators. */
export interface LeavePolicyConfig {
  minRescheduleReasonLength: number;
  rescheduleNoticeDays: number;
  shiftSwapNoticeDays: number;
  maxReschedulesPerRequest: number;
  rescheduleMustMoveForward: boolean;
  rescheduleMustKeepSameDuration: boolean;
  emergencyRescheduleExceptionAllowed: boolean;
}

export function toLeavePolicyConfig(rules: LeaveRulesSetting): LeavePolicyConfig {
  return {
    minRescheduleReasonLength: rules.minRescheduleReasonLength,
    rescheduleNoticeDays: rules.rescheduleNoticeDays,
    shiftSwapNoticeDays: rules.shiftSwapNoticeDays,
    maxReschedulesPerRequest: rules.maxReschedulesPerRequest,
    rescheduleMustMoveForward: rules.rescheduleMustMoveForward,
    rescheduleMustKeepSameDuration: rules.rescheduleMustKeepSameDuration,
    emergencyRescheduleExceptionAllowed: rules.emergencyRescheduleExceptionAllowed,
  };
}

/** @deprecated Use toLeavePolicyConfig(DEFAULT_LEAVE_RULES) */
export const MIN_RESCHEDULE_REASON_LENGTH = DEFAULT_LEAVE_RULES.minRescheduleReasonLength;
/** @deprecated Use toLeavePolicyConfig(DEFAULT_LEAVE_RULES) */
export const RESCHEDULE_NOTICE_DAYS = DEFAULT_LEAVE_RULES.rescheduleNoticeDays;
/** @deprecated Use toLeavePolicyConfig(DEFAULT_LEAVE_RULES) */
export const SHIFT_SWAP_NOTICE_DAYS = DEFAULT_LEAVE_RULES.shiftSwapNoticeDays;

const DEFAULT_POLICY = toLeavePolicyConfig(DEFAULT_LEAVE_RULES);

export function dateOnly(value: Date | string): Date {
  const d = typeof value === 'string' ? new Date(`${value}T00:00:00.000Z`) : new Date(value);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

export function computeInclusiveLeaveDays(startDate: Date | string, endDate: Date | string): number {
  const start = dateOnly(startDate);
  const end = dateOnly(endDate);
  const diff = Math.round((end.getTime() - start.getTime()) / MS_PER_DAY) + 1;
  return Math.max(0.5, diff);
}

export function computeEndDateFromStart(startDate: Date | string, days: number): Date {
  const start = dateOnly(startDate);
  const wholeDays = Math.max(1, Math.ceil(days));
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + wholeDays - 1);
  return end;
}

export function daysBetween(from: Date | string, to: Date | string): number {
  const a = dateOnly(from);
  const b = dateOnly(to);
  return Math.round((b.getTime() - a.getTime()) / MS_PER_DAY);
}

export interface RescheduleValidationInput {
  originalStartDate: Date;
  originalEndDate: Date;
  originalDays: number;
  newStartDate: Date;
  newEndDate: Date;
  newDays: number;
  reason: string;
  isEmergency: boolean;
  rescheduleCount: number;
  submittedAt: Date;
}

export function validateRescheduleRequest(
  input: RescheduleValidationInput,
  config: LeavePolicyConfig = DEFAULT_POLICY,
): void {
  const reason = input.reason.trim();
  if (reason.length < config.minRescheduleReasonLength) {
    throw new ValidationError(
      `Reschedule reason must be at least ${config.minRescheduleReasonLength} characters`,
    );
  }

  if (input.rescheduleCount >= config.maxReschedulesPerRequest) {
    throw new ValidationError('This leave request has already been rescheduled once');
  }

  if (config.rescheduleMustKeepSameDuration) {
    if (input.newDays !== input.originalDays) {
      throw new ValidationError('Reschedule must keep the same leave duration');
    }

    const computedDays = computeInclusiveLeaveDays(input.newStartDate, input.newEndDate);
    if (computedDays !== input.originalDays) {
      throw new ValidationError('New date range does not match the original leave duration');
    }
  }

  if (config.rescheduleMustMoveForward) {
    const originalStart = dateOnly(input.originalStartDate);
    const newStart = dateOnly(input.newStartDate);
    if (newStart.getTime() <= originalStart.getTime()) {
      throw new ValidationError('New leave date must be later than the original leave date');
    }
  }

  const skipNotice = input.isEmergency && config.emergencyRescheduleExceptionAllowed;
  if (!skipNotice) {
    const noticeDays = daysBetween(input.submittedAt, input.originalStartDate);
    if (noticeDays < config.rescheduleNoticeDays) {
      throw new ValidationError(
        `Reschedule must be submitted at least ${config.rescheduleNoticeDays} days before the original leave date`,
      );
    }
  }
}

export interface ShiftSwapValidationInput {
  requesterLeave: {
    employeeId: string;
    companyId: string;
    startDate: Date;
    endDate: Date;
    days: number;
    status: string;
  };
  partnerLeave: {
    employeeId: string;
    companyId: string;
    startDate: Date;
    endDate: Date;
    days: number;
    status: string;
  };
  submittedAt: Date;
}

export function validateShiftSwapRequest(
  input: ShiftSwapValidationInput,
  config: LeavePolicyConfig = DEFAULT_POLICY,
): void {
  const { requesterLeave, partnerLeave } = input;

  if (requesterLeave.employeeId === partnerLeave.employeeId) {
    throw new ValidationError('Cannot swap leave with yourself');
  }

  if (requesterLeave.companyId !== partnerLeave.companyId) {
    throw new ValidationError('Both employees must belong to the same company');
  }

  if (requesterLeave.status !== 'approved' || partnerLeave.status !== 'approved') {
    throw new ValidationError('Both leave requests must be approved');
  }

  if (requesterLeave.days !== partnerLeave.days) {
    throw new ValidationError('Both leave requests must have the same duration');
  }

  const earliestLeave = dateOnly(
    requesterLeave.startDate < partnerLeave.startDate
      ? requesterLeave.startDate
      : partnerLeave.startDate,
  );
  const noticeDays = daysBetween(input.submittedAt, earliestLeave);
  if (noticeDays < config.shiftSwapNoticeDays) {
    throw new ValidationError(
      `Shift swap must be submitted at least ${config.shiftSwapNoticeDays} days before the leave dates`,
    );
  }
}
