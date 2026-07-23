// ============================================================================
// modules/referral/domain/services/qualification.service.ts
// Pure qualification rules per spec:
//   Qualified when: passed probation  OR  worked >= requiredEmploymentDays
// Returns the qualifying condition that was met (whichever comes first).
// ============================================================================

import {
  DEFAULT_REFERRAL_RULES,
  requiredEmploymentMs,
} from '../../../settings/domain/referral-settings.types';
import { EmployeeNotYetEligibleError } from '../errors/referral.errors';

export type QualifyingCondition = 'probation_pass' | 'three_months';

export interface QualificationConfig {
  requiredEmploymentDays: number;
}

export interface EmployeeEligibilityInput {
  hireDate: Date;
  employmentStatus: 'probation' | 'active' | 'suspended' | 'terminated';
  probationEndDate: Date | null;
  asOf?: Date;
}

export interface QualificationResult {
  qualified: boolean;
  condition: QualifyingCondition | null;
  qualifiedAt: Date | null;
  reason: string | null;
}

/** @deprecated Use requiredEmploymentMs from referral-settings.types */
export const THREE_MONTHS_MS = 3 * 30.44 * 24 * 60 * 60 * 1000;

export function toQualificationConfig(
  rules: { requiredEmploymentDays: number },
): QualificationConfig {
  return { requiredEmploymentDays: rules.requiredEmploymentDays };
}

export class QualificationService {
  assess(
    input: EmployeeEligibilityInput,
    config: QualificationConfig = toQualificationConfig(DEFAULT_REFERRAL_RULES),
  ): QualificationResult {
    const now = input.asOf ?? new Date();
    const thresholdMs = requiredEmploymentMs(config.requiredEmploymentDays);

    if (input.employmentStatus === 'terminated') {
      return { qualified: false, condition: null, qualifiedAt: null, reason: 'Employee is terminated' };
    }

    const tenureMs = now.getTime() - input.hireDate.getTime();
    const employmentReached = tenureMs >= thresholdMs;
    const employmentDate = new Date(input.hireDate.getTime() + thresholdMs);

    const passedProbation =
      input.employmentStatus === 'active' &&
      input.probationEndDate !== null &&
      input.probationEndDate <= now;

    if (passedProbation) {
      return {
        qualified: true,
        condition: 'probation_pass',
        qualifiedAt: input.probationEndDate!,
        reason: null,
      };
    }

    if (employmentReached) {
      return {
        qualified: true,
        condition: 'three_months',
        qualifiedAt: employmentDate,
        reason: null,
      };
    }

    const daysLeft = Math.ceil((thresholdMs - tenureMs) / 86_400_000);
    return {
      qualified: false,
      condition: null,
      qualifiedAt: null,
      reason: `Not yet eligible: ${daysLeft} day(s) until ${config.requiredEmploymentDays}-day mark; probation not yet passed`,
    };
  }

  assertEligible(
    input: EmployeeEligibilityInput,
    config: QualificationConfig = toQualificationConfig(DEFAULT_REFERRAL_RULES),
  ): QualifyingCondition {
    const result = this.assess(input, config);
    if (!result.qualified || !result.condition) {
      throw new EmployeeNotYetEligibleError(result.reason ?? 'unknown');
    }
    return result.condition;
  }
}
