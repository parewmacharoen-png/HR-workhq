// ============================================================================
// modules/settings/application/deposit-settings-cache.service.ts
// ============================================================================

import { Injectable } from '@nestjs/common';
import { cacheKeyForCompany, DepositRulesSetting } from '../domain/deposit-settings.types';

@Injectable()
export class DepositSettingsCacheService {
  private readonly cache = new Map<string, DepositRulesSetting>();

  get(companyId: string | null): DepositRulesSetting | undefined {
    return this.cache.get(cacheKeyForCompany(companyId));
  }

  set(companyId: string | null, rules: DepositRulesSetting): void {
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
