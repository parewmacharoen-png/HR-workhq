// ============================================================================
// modules/settings/application/referral-settings.service.unit.spec.ts
// ============================================================================

import { ReferralSettingsService } from './referral-settings.service';
import { ReferralSettingsCacheService } from './referral-settings-cache.service';
import { SettingsService } from './settings.service';
import { DEFAULT_REFERRAL_RULES } from '../domain/referral-settings.types';

describe('ReferralSettingsService', () => {
  let settings: jest.Mocked<Pick<SettingsService, 'getEffectiveValue'>>;
  let cache: ReferralSettingsCacheService;
  let service: ReferralSettingsService;

  beforeEach(() => {
    settings = { getEffectiveValue: jest.fn() };
    cache = new ReferralSettingsCacheService();
    service = new ReferralSettingsService(
      settings as unknown as SettingsService,
      cache,
    );
  });

  it('returns company override for reward amount', async () => {
    settings.getEffectiveValue.mockResolvedValue({
      value: { ...DEFAULT_REFERRAL_RULES, rewardAmount: 2500 },
      source: 'company',
    });
    const rules = await service.getRules('co-1');
    expect(rules.rewardAmount).toBe(2500);
  });

  it('caches rules per company', async () => {
    settings.getEffectiveValue.mockResolvedValue({
      value: DEFAULT_REFERRAL_RULES,
      source: 'system',
    });
    await service.getRules('co-1');
    await service.getRules('co-1');
    expect(settings.getEffectiveValue).toHaveBeenCalledTimes(1);
  });

  it('invalidates cache on scope change', async () => {
    settings.getEffectiveValue.mockResolvedValue({
      value: DEFAULT_REFERRAL_RULES,
      source: 'system',
    });
    await service.getRules('co-1');
    service.invalidate('co-1');
    await service.getRules('co-1');
    expect(settings.getEffectiveValue).toHaveBeenCalledTimes(2);
  });
});
