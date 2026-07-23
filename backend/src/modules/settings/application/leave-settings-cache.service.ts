// ============================================================================
// modules/settings/application/leave-settings-cache.service.ts
// ============================================================================

import { Injectable } from '@nestjs/common';
import { cacheKeyForCompany, LeaveRulesSetting } from '../domain/leave-settings.types';

@Injectable()
export class LeaveSettingsCacheService {
  private readonly cache = new Map<string, LeaveRulesSetting>();

  get(companyId: string | null): LeaveRulesSetting | undefined {
    return this.cache.get(cacheKeyForCompany(companyId));
  }

  set(companyId: string | null, rules: LeaveRulesSetting): void {
    this.cache.set(cacheKeyForCompany(companyId), rules);
  }

  invalidate(companyId: string | null): void {
    if (companyId === null) {
      this.cache.clear();
      return;
    }
    this.cache.delete(cacheKeyForCompany(companyId));
  }

  clear(): void {
    this.cache.clear();
  }
}
