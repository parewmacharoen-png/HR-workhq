// ============================================================================
// modules/settings/application/attendance-settings-cache.service.ts
// In-memory per-company cache for attendance.rules resolution.
// ============================================================================

import { Injectable } from '@nestjs/common';
import {
  AttendanceRulesSetting,
  cacheKeyForCompany,
} from '../domain/attendance-settings.types';

@Injectable()
export class AttendanceSettingsCacheService {
  private readonly cache = new Map<string, AttendanceRulesSetting>();

  get(companyId: string | null): AttendanceRulesSetting | undefined {
    return this.cache.get(cacheKeyForCompany(companyId));
  }

  set(companyId: string | null, rules: AttendanceRulesSetting): void {
    this.cache.set(cacheKeyForCompany(companyId), rules);
  }

  /** Drop cached rules for a scope; system changes clear all company caches. */
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
