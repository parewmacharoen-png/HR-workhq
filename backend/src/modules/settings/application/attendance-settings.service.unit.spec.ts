// ============================================================================
// modules/settings/application/attendance-settings.service.unit.spec.ts
// ============================================================================

import { AttendanceSettingsService } from './attendance-settings.service';
import { AttendanceSettingsCacheService } from './attendance-settings-cache.service';
import { SettingsService } from './settings.service';
import { DEFAULT_ATTENDANCE_RULES } from '../domain/attendance-settings.types';

describe('AttendanceSettingsService', () => {
  let settings: jest.Mocked<Pick<SettingsService, 'getEffectiveValue'>>;
  let cache: AttendanceSettingsCacheService;
  let service: AttendanceSettingsService;

  beforeEach(() => {
    settings = {
      getEffectiveValue: jest.fn(),
    };
    cache = new AttendanceSettingsCacheService();
    service = new AttendanceSettingsService(
      settings as unknown as SettingsService,
      cache,
    );
  });

  it('returns company override for grace period', async () => {
    settings.getEffectiveValue.mockResolvedValue({
      value: { ...DEFAULT_ATTENDANCE_RULES, graceMinutes: 25 },
      source: 'company',
    });

    const rules = await service.getRules('co-1');
    expect(rules.graceMinutes).toBe(25);
  });

  it('caches rules per company', async () => {
    settings.getEffectiveValue.mockResolvedValue({
      value: DEFAULT_ATTENDANCE_RULES,
      source: 'system',
    });

    await service.getRules('co-1');
    await service.getRules('co-1');
    expect(settings.getEffectiveValue).toHaveBeenCalledTimes(1);
  });

  it('invalidates cache on scope change', async () => {
    settings.getEffectiveValue.mockResolvedValue({
      value: DEFAULT_ATTENDANCE_RULES,
      source: 'system',
    });

    await service.getRules('co-1');
    service.invalidate('co-1');
    await service.getRules('co-1');
    expect(settings.getEffectiveValue).toHaveBeenCalledTimes(2);
  });
});
