// ============================================================================
// modules/employee/application/employee-recognition.service.unit.spec.ts
// HR-013c / EMP-011 — recognition & awards.
// ============================================================================

import { ConflictError } from '../../../shared/kernel/domain-error';
import { EmployeeRecognitionService } from './employee-recognition.service';
import { DateProvider } from '../../../shared/time/date.provider';
import { BangkokTimeProvider } from '../../../shared/time/bangkok-time.provider';

describe('EmployeeRecognitionService (unit)', () => {
  const dates = new DateProvider(new BangkokTimeProvider());
  const access = {
    assertCanRead: jest.fn().mockResolvedValue(undefined),
    assertCanCreate: jest.fn().mockResolvedValue(undefined),
    assertCanReadCompanyDashboard: jest.fn().mockResolvedValue('owner'),
  };
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  const telegram = {
    notifyGiftRecorded: jest.fn().mockResolvedValue(undefined),
    broadcastCompanyBirthdayAnnouncement: jest.fn().mockResolvedValue(undefined),
    notifyAwardGiven: jest.fn().mockResolvedValue(undefined),
  };
  const prisma = {
    employee: { findFirst: jest.fn().mockResolvedValue({ id: 'emp-1', firstName: 'A', lastName: 'B' }) },
    employeeAssignment: { findFirst: jest.fn().mockResolvedValue({ companyId: 'co-1' }) },
    employeeRecognition: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
        id: 'rec-1',
        employeeId: data.employeeId,
        companyId: data.companyId,
        recognitionType: data.recognitionType,
        recognitionDate: data.recognitionDate,
        awardMonth: data.awardMonth ?? null,
        giftOrReward: data.giftOrReward ?? null,
        notes: data.notes ?? null,
        recordedBy: data.recordedBy,
        givenBy: data.givenBy ?? data.recordedBy,
        createdAt: new Date('2026-06-23T10:00:00Z'),
      })),
    },
    user: {
      findFirst: jest.fn().mockResolvedValue({
        username: 'hr1',
        employee: { firstName: 'HR', lastName: 'User' },
      }),
    },
  };

  const service = new EmployeeRecognitionService(
    prisma as never,
    access as never,
    audit as never,
    dates,
    telegram as never,
  );

  const actor = { userId: 'user-1', impersonatorUserId: null, companyId: 'co-1' };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('marks birthday gift and notifies Telegram', async () => {
    const result = await service.markBirthdayGift(actor, 'emp-1', {
      companyId: 'co-1',
      announceCompanyWide: true,
    });

    expect(result.recognitionType).toBe('BIRTHDAY_GIFT');
    expect(telegram.notifyGiftRecorded).toHaveBeenCalled();
    expect(telegram.broadcastCompanyBirthdayAnnouncement).toHaveBeenCalledWith('co-1', 'emp-1');
  });

  it('creates employee of month award and notifies Telegram', async () => {
    const result = await service.createRecognition(actor, 'emp-1', {
      companyId: 'co-1',
      recognitionType: 'EMPLOYEE_OF_MONTH',
      awardMonth: '2026-06-01',
      giftOrReward: 'Trophy',
      notes: 'Outstanding',
    });

    expect(result.recognitionType).toBe('EMPLOYEE_OF_MONTH');
    expect(telegram.notifyAwardGiven).toHaveBeenCalled();
    expect(access.assertCanCreate).toHaveBeenCalled();
  });

  it('rejects duplicate birthday gift in same year', async () => {
    prisma.employeeRecognition.findFirst.mockResolvedValue({
      recognitionDate: new Date('2026-03-01'),
    });

    await expect(
      service.markBirthdayGift(actor, 'emp-1', { companyId: 'co-1' }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('rejects duplicate service award', async () => {
    prisma.employeeRecognition.findFirst.mockResolvedValue({ id: 'existing' });

    await expect(
      service.createRecognition(actor, 'emp-1', {
        companyId: 'co-1',
        recognitionType: 'SERVICE_AWARD_1_YEAR',
      }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('lists recognition timeline for employee', async () => {
    prisma.employeeRecognition.findMany.mockResolvedValue([
      {
        id: 'rec-1',
        employeeId: 'emp-1',
        companyId: 'co-1',
        recognitionType: 'BEST_PERFORMANCE',
        recognitionDate: new Date('2026-01-15'),
        awardMonth: null,
        giftOrReward: null,
        notes: 'Excellent work',
        recordedBy: 'user-1',
        givenBy: 'user-1',
        createdAt: new Date('2026-01-15T09:00:00Z'),
      },
    ]);

    const result = await service.listRecognitions(actor, 'emp-1', 'co-1');

    expect(result.items).toHaveLength(1);
    expect(result.items[0].recognitionType).toBe('BEST_PERFORMANCE');
    expect(access.assertCanRead).toHaveBeenCalled();
  });
});
