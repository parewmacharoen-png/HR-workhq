import { Injectable } from '@nestjs/common';
import {
  cacheKeyForCompany,
  PayrollRulesSetting,
} from '../domain/payroll-settings.types';

@Injectable()
export class PayrollSettingsCacheService {
  private readonly cache = new Map<string, PayrollRulesSetting>();

  get(companyId: string): PayrollRulesSetting | undefined {
    return this.cache.get(cacheKeyForCompany(companyId));
  }

  set(companyId: string, rules: PayrollRulesSetting): void {
    this.cache.set(cacheKeyForCompany(companyId), rules);
  }

  invalidate(companyId: string | null): void {
    if (companyId) {
      this.cache.delete(cacheKeyForCompany(companyId));
    } else {
      this.cache.delete(cacheKeyForCompany(null));
    }
  }
}
