// ============================================================================
// modules/employee/domain/employee-recognition.constants.ts
// EMP-011 — award & service recognition type groups.
// ============================================================================

import type { EmployeeRecognitionType } from '../application/dto/employee-recognition.dto';

export const MONTHLY_AWARD_TYPES = [
  'EMPLOYEE_OF_MONTH',
  'BEST_ATTENDANCE',
  'BEST_PERFORMANCE',
  'TOP_RECRUITER',
  'TOP_MARKETING',
] as const satisfies readonly EmployeeRecognitionType[];

export const SERVICE_AWARD_TYPES = [
  'SERVICE_AWARD_1_YEAR',
  'SERVICE_AWARD_3_YEAR',
  'SERVICE_AWARD_5_YEAR',
  'SERVICE_AWARD_10_YEAR',
] as const satisfies readonly EmployeeRecognitionType[];

export const SERVICE_AWARD_BY_YEARS: Record<number, EmployeeRecognitionType> = {
  1: 'SERVICE_AWARD_1_YEAR',
  3: 'SERVICE_AWARD_3_YEAR',
  5: 'SERVICE_AWARD_5_YEAR',
  10: 'SERVICE_AWARD_10_YEAR',
};

export const SERVICE_AWARD_MILESTONE_YEARS = [1, 3, 5, 10] as const;

export const AWARD_AND_SERVICE_TYPES: EmployeeRecognitionType[] = [
  ...MONTHLY_AWARD_TYPES,
  ...SERVICE_AWARD_TYPES,
  'SPECIAL_REWARD',
];

export function isServiceAwardType(type: string): type is (typeof SERVICE_AWARD_TYPES)[number] {
  return (SERVICE_AWARD_TYPES as readonly string[]).includes(type);
}

export function isMonthlyAwardType(type: string): type is (typeof MONTHLY_AWARD_TYPES)[number] {
  return (MONTHLY_AWARD_TYPES as readonly string[]).includes(type);
}
