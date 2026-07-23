// ============================================================================
// modules/settings/application/referral-settings.service.ts
// ============================================================================

import { Injectable } from '@nestjs/common';
import {
  mergeReferralRules,
  REFERRAL_RULES_SETTING_KEY,
  ReferralRulesSetting,
} from '../domain/referral-settings.types';
import { ReferralSettingsCacheService } from './referral-settings-cache.service';
import { SettingsService } from './settings.service';

@Injectable()
export class ReferralSettingsService {
  constructor(
    private readonly settings: SettingsService,
    private readonly cache: ReferralSettingsCacheService,
  ) {}

  async getRules(companyId: string): Promise<ReferralRulesSetting> {
    const cached = this.cache.get(companyId);
    if (cached) return cached;

    const { value } = await this.settings.getEffectiveValue(
      companyId,
      'referral',
      REFERRAL_RULES_SETTING_KEY,
    );
    const rules = mergeReferralRules(value);
    this.cache.set(companyId, rules);
    return rules;
  }

  invalidate(companyId: string | null): void {
    this.cache.invalidate(companyId);
  }
}
