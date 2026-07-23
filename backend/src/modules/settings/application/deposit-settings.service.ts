// ============================================================================
// modules/settings/application/deposit-settings.service.ts
// ============================================================================

import { Injectable } from '@nestjs/common';
import {
  DEPOSIT_RULES_SETTING_KEY,
  DepositRulesSetting,
  mergeDepositRules,
} from '../domain/deposit-settings.types';
import { DepositSettingsCacheService } from './deposit-settings-cache.service';
import { SettingsService } from './settings.service';

@Injectable()
export class DepositSettingsService {
  constructor(
    private readonly settings: SettingsService,
    private readonly cache: DepositSettingsCacheService,
  ) {}

  async getRules(companyId: string): Promise<DepositRulesSetting> {
    const cached = this.cache.get(companyId);
    if (cached) return cached;

    const { value } = await this.settings.getEffectiveValue(
      companyId,
      'deposit',
      DEPOSIT_RULES_SETTING_KEY,
    );
    const rules = mergeDepositRules(value);
    this.cache.set(companyId, rules);
    return rules;
  }

  invalidate(companyId: string | null): void {
    this.cache.invalidate(companyId);
  }
}
