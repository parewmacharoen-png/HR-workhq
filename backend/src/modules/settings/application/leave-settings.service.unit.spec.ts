// ============================================================================
// modules/settings/application/leave-settings.service.unit.spec.ts
// ============================================================================

import { LeaveSettingsService } from './leave-settings.service';
import { LeaveSettingsCacheService } from './leave-settings-cache.service';
import { SettingsService } from './settings.service';
import { DEFAULT_LEAVE_RULES } from '../domain/leave-settings.types';

describe('LeaveSettingsService', () => {
  let settings: jest.Mocked<Pick<SettingsService, 'getEffectiveValue'>>;
  let cache: LeaveSettingsCacheService;
  let service: LeaveSettingsService;

  beforeEach(() => {
    settings = { getEffectiveValue: jest.fn() };
    cache = new LeaveSettingsCacheService();
    service = new LeaveSettingsService(
      settings as unknown as SettingsService,
      cache,
    );
  });

  it('returns company override for reschedule notice', async () => {
    settings.getEffectiveValue.mockResolvedValue({
      value: { ...DEFAULT_LEAVE_RULES, rescheduleNoticeDays: 14 },
      source: 'company',
    });
    const rules = await service.getRules('co-1');
    expect(rules.rescheduleNoticeDays).toBe(14);
  });

  it('caches rules per company', async () => {
    settings.getEffectiveValue.mockResolvedValue({
      value: DEFAULT_LEAVE_RULES,
      source: 'system',
    });
    await service.getRules('co-1');
    await service.getRules('co-1');
    expect(settings.getEffectiveValue).toHaveBeenCalledTimes(1);
  });

  it('invalidates cache on scope change', async () => {
    settings.getEffectiveValue.mockResolvedValue({
      value: DEFAULT_LEAVE_RULES,
      source: 'system',
    });
    await service.getRules('co-1');
    service.invalidate('co-1');
    await service.getRules('co-1');
    expect(settings.getEffectiveValue).toHaveBeenCalledTimes(2);
  });
});
