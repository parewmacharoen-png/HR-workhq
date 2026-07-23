// ============================================================================
// modules/settings/application/leave-settings.service.ts
// ============================================================================

import { Injectable } from '@nestjs/common';
import {
  LEAVE_RULES_SETTING_KEY,
  LeaveRulesSetting,
  mergeLeaveRules,
} from '../domain/leave-settings.types';
import { LeaveSettingsCacheService } from './leave-settings-cache.service';
import { SettingsService } from './settings.service';

@Injectable()
export class LeaveSettingsService {
  constructor(
    private readonly settings: SettingsService,
    private readonly cache: LeaveSettingsCacheService,
  ) {}

  async getRules(companyId: string): Promise<LeaveRulesSetting> {
    const cached = this.cache.get(companyId);
    if (cached) return cached;

    const { value } = await this.settings.getEffectiveValue(
      companyId,
      'leave',
      LEAVE_RULES_SETTING_KEY,
    );
    const rules = mergeLeaveRules(value);
    this.cache.set(companyId, rules);
    return rules;
  }

  invalidate(companyId: string | null): void {
    this.cache.invalidate(companyId);
  }
}
