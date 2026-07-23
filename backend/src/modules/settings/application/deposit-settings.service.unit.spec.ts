// ============================================================================
// modules/settings/application/deposit-settings.service.unit.spec.ts
// ============================================================================

import { DepositSettingsService } from './deposit-settings.service';
import { DepositSettingsCacheService } from './deposit-settings-cache.service';
import { SettingsService } from './settings.service';
import { DEFAULT_DEPOSIT_RULES } from '../domain/deposit-settings.types';

describe('DepositSettingsService', () => {
  let settings: jest.Mocked<Pick<SettingsService, 'getEffectiveValue'>>;
  let cache: DepositSettingsCacheService;
  let service: DepositSettingsService;

  beforeEach(() => {
    settings = { getEffectiveValue: jest.fn() };
    cache = new DepositSettingsCacheService();
    service = new DepositSettingsService(
      settings as unknown as SettingsService,
      cache,
    );
  });

  it('returns company override for monthly deduction', async () => {
    settings.getEffectiveValue.mockResolvedValue({
      value: { ...DEFAULT_DEPOSIT_RULES, monthlyDeductionAmount: 400 },
      source: 'company',
    });
    const rules = await service.getRules('co-1');
    expect(rules.monthlyDeductionAmount).toBe(400);
  });

  it('caches rules per company', async () => {
    settings.getEffectiveValue.mockResolvedValue({
      value: DEFAULT_DEPOSIT_RULES,
      source: 'system',
    });
    await service.getRules('co-1');
    await service.getRules('co-1');
    expect(settings.getEffectiveValue).toHaveBeenCalledTimes(1);
  });

  it('invalidates cache on scope change', async () => {
    settings.getEffectiveValue.mockResolvedValue({
      value: DEFAULT_DEPOSIT_RULES,
      source: 'system',
    });
    await service.getRules('co-1');
    service.invalidate('co-1');
    await service.getRules('co-1');
    expect(settings.getEffectiveValue).toHaveBeenCalledTimes(2);
  });
});
