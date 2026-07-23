// ============================================================================
// modules/settings/application/referral-settings-cache.service.ts
// ============================================================================

import { Injectable } from '@nestjs/common';
import { cacheKeyForCompany, ReferralRulesSetting } from '../domain/referral-settings.types';

@Injectable()
export class ReferralSettingsCacheService {
  private readonly cache = new Map<string, ReferralRulesSetting>();

  get(companyId: string | null): ReferralRulesSetting | undefined {
    return this.cache.get(cacheKeyForCompany(companyId));
  }

  set(companyId: string | null, rules: ReferralRulesSetting): void {
    this.cache.set(cacheKeyForCompany(companyId), rules);
  }

  invalidate(companyId: string | null): void {
    if (companyId === null) {
      this.cache.clear();
      return;
    }
    this.cache.delete(cacheKeyForCompany(companyId));
  }
}
