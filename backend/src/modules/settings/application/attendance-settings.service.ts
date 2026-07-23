// ============================================================================
// modules/settings/application/attendance-settings.service.ts
// Resolves attendance.rules via Settings Engine with per-company caching.
// ============================================================================

import { Injectable } from '@nestjs/common';
import {
  ATTENDANCE_RULES_SETTING_KEY,
  AttendanceRulesSetting,
  mergeAttendanceRules,
} from '../domain/attendance-settings.types';
import { AttendanceSettingsCacheService } from './attendance-settings-cache.service';
import { SettingsService } from './settings.service';

@Injectable()
export class AttendanceSettingsService {
  constructor(
    private readonly settings: SettingsService,
    private readonly cache: AttendanceSettingsCacheService,
  ) {}

  async getRules(companyId: string): Promise<AttendanceRulesSetting> {
    const cached = this.cache.get(companyId);
    if (cached) return cached;

    const { value } = await this.settings.getEffectiveValue(
      companyId,
      'attendance',
      ATTENDANCE_RULES_SETTING_KEY,
    );
    const rules = mergeAttendanceRules(value);
    this.cache.set(companyId, rules);
    return rules;
  }

  invalidate(companyId: string | null): void {
    this.cache.invalidate(companyId);
  }
}
