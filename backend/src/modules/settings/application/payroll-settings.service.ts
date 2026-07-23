import { Injectable } from '@nestjs/common';
import {
  mergePayrollRules,
  PAYROLL_RULES_SETTING_KEY,
  PayrollRulesSetting,
} from '../domain/payroll-settings.types';
import { PayrollSettingsCacheService } from './payroll-settings-cache.service';
import { SettingsService } from './settings.service';

@Injectable()
export class PayrollSettingsService {
  constructor(
    private readonly settings: SettingsService,
    private readonly cache: PayrollSettingsCacheService,
  ) {}

  async getRules(companyId: string): Promise<PayrollRulesSetting> {
    const cached = this.cache.get(companyId);
    if (cached) return cached;

    const { value } = await this.settings.getEffectiveValue(
      companyId,
      'payroll',
      PAYROLL_RULES_SETTING_KEY,
    );
    const rules = mergePayrollRules(value);
    this.cache.set(companyId, rules);
    return rules;
  }

  invalidate(companyId: string | null): void {
    this.cache.invalidate(companyId);
  }
}
