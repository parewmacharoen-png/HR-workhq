// ============================================================================
// modules/settings/application/settings.service.unit.spec.ts
// ============================================================================

import { SettingsService } from './settings.service';
import { CompanyAccessService } from '../../../shared/kernel/company-access.service';
import { PrismaService } from '../../../shared/prisma/prisma.service';

describe('SettingsService', () => {
  const actor = { userId: 'user-1', impersonatorUserId: null, companyId: 'co-1' };

  let prisma: jest.Mocked<Pick<PrismaService,
    'settingProfile' | 'settingVersion' | 'settingAudit'>>;
  let companyAccess: jest.Mocked<Pick<CompanyAccessService, 'assertCompanyAccess'>>;
  let service: SettingsService;

  beforeEach(() => {
    prisma = {
      settingProfile: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      settingVersion: {
        create: jest.fn(),
        findMany: jest.fn(),
      },
      settingAudit: {
        create: jest.fn(),
        findMany: jest.fn(),
      },
    } as unknown as typeof prisma;

    companyAccess = {
      assertCompanyAccess: jest.fn().mockResolvedValue(undefined),
    };

    service = new SettingsService(
      prisma as unknown as PrismaService,
      companyAccess as unknown as CompanyAccessService,
      { invalidate: jest.fn() } as never,
      { invalidate: jest.fn() } as never,
      { invalidate: jest.fn() } as never,
      { invalidate: jest.fn() } as never,
      { invalidate: jest.fn() } as never,
    );
  });

  it('getEffectiveValue prefers company over system', async () => {
    (prisma.settingProfile.findFirst as jest.Mock)
      .mockResolvedValueOnce({ value: 400 })
      .mockResolvedValueOnce({ value: 500 });

    const result = await service.getEffectiveValue('co-1', 'deposit', 'monthly_deduction');
    expect(result.value).toBe(400);
    expect(result.source).toBe('company');
  });

  it('getEffectiveValue falls back to system', async () => {
    (prisma.settingProfile.findFirst as jest.Mock)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ value: 500 });

    const result = await service.getEffectiveValue('co-1', 'deposit', 'monthly_deduction');
    expect(result.value).toBe(500);
    expect(result.source).toBe('system');
  });

  it('setValue creates profile, version, and audit on first write', async () => {
    (prisma.settingProfile.findFirst as jest.Mock).mockResolvedValue(null);
    (prisma.settingProfile.create as jest.Mock).mockResolvedValue({
      id: 'prof-1',
      companyId: 'co-1',
      category: 'referral',
      key: 'reward_amount',
      value: 2000,
      isActive: true,
      createdAt: new Date('2026-01-01'),
      updatedAt: new Date('2026-01-01'),
    });

    const result = await service.setValue(actor, 'referral', 'reward_amount', 2000, {
      companyId: 'co-1',
    });

    expect(result.value).toBe(2000);
    expect(prisma.settingVersion.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          newValue: 2000,
          changedBy: actor.userId,
        }),
      }),
    );
    expect(prisma.settingAudit.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'create',
          key: 'reward_amount',
        }),
      }),
    );
  });
});
