// ============================================================================
// modules/leave/domain/services/holiday-conversion.service.ts
// Pure calculation of unused-holiday -> bonus per payroll cycle.
// ============================================================================

import { LeaveRulesSetting } from '../../../settings/domain/leave-settings.types';

export interface HolidayConversionParams {
  ratePerDay: number;
  defaultCap: number;
}

export function toHolidayConversionParams(rules: LeaveRulesSetting): HolidayConversionParams {
  return {
    ratePerDay: rules.unusedOffDayBonusAmount,
    defaultCap: rules.unusedOffDayBonusCap,
  };
}

/** @deprecated Use toHolidayConversionParams from leave.rules */
export const DEFAULT_HOLIDAY_PARAMS: HolidayConversionParams = {
  ratePerDay: 600,
  defaultCap: 1200,
};

export interface HolidayConversionResult {
  unusedDays: number;
  ratePerDay: number;
  capAmount: number;
  overrideCap: boolean;
  bonusAmount: number;
}

export class HolidayConversionService {
  constructor(private readonly params: HolidayConversionParams) {}

  compute(input: {
    unusedDays: number;
    overrideCap?: boolean;
    customCap?: number | null;
  }): HolidayConversionResult {
    const unusedDays = Math.max(0, input.unusedDays);
    const gross = unusedDays * this.params.ratePerDay;
    const cap = input.customCap ?? this.params.defaultCap;
    const overrideCap = input.overrideCap ?? false;
    const bonusAmount = overrideCap ? gross : Math.min(gross, cap);
    return {
      unusedDays,
      ratePerDay: this.params.ratePerDay,
      capAmount: cap,
      overrideCap,
      bonusAmount: Math.round(bonusAmount * 100) / 100,
    };
  }
}
