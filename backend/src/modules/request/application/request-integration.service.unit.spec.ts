import {
  computeOtHoursFromTimes,
  mapCorrectionTypeToField,
  RequestIntegrationService,
} from './request-integration.service';

describe('RequestIntegrationService field mapping', () => {
  it('maps correction form types to attendance fields', () => {
    expect(mapCorrectionTypeToField('check_in')).toBe('checkInAt');
    expect(mapCorrectionTypeToField('check_out')).toBe('checkOutAt');
    expect(mapCorrectionTypeToField('missed_in')).toBe('checkInAt');
    expect(mapCorrectionTypeToField('missed_out')).toBe('checkOutAt');
    expect(mapCorrectionTypeToField('break_return')).toBe('breakEndAt');
    expect(mapCorrectionTypeToField('break_start')).toBe('breakStartAt');
    expect(mapCorrectionTypeToField('break_end')).toBe('breakEndAt');
  });

  it('computes OT hours from start/end time strings', () => {
    expect(computeOtHoursFromTimes('18:00', '20:30')).toBe(2);
    expect(computeOtHoursFromTimes('22:00', '06:00')).toBe(8);
  });

  it('computes OT hours from dot-separated time strings', () => {
    expect(computeOtHoursFromTimes('18.00', '20.30')).toBe(2);
  });

  it('returns minimum 1 hour for invalid or zero-length OT windows', () => {
    expect(computeOtHoursFromTimes('invalid', '20:00')).toBe(1);
    expect(computeOtHoursFromTimes('18:00', '18:00')).toBe(1);
  });
});

describe('RequestIntegrationService (unit)', () => {
  const prisma: {
    requestInstance: { findFirst: jest.Mock; update: jest.Mock };
    requestTimelineEvent: { create: jest.Mock };
    $transaction: jest.Mock;
  } = {
    requestInstance: {
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    $transaction: jest.fn(),
    requestTimelineEvent: { create: jest.fn() },
  };
  prisma.$transaction.mockImplementation(async (fn: (tx: typeof prisma) => Promise<void>) => fn(prisma));
  const audit = { record: jest.fn() };

  const attendanceGuard = { assertAttendanceLinkedRequest: jest.fn() };
  const service = new RequestIntegrationService(
    prisma as never,
    audit as never,
    { todayString: () => '2026-01-01', now: () => new Date() } as never,
    attendanceGuard as never,
  );

  beforeEach(() => jest.clearAllMocks());

  it('skips integration when request is not fully approved', async () => {
    prisma.requestInstance.findFirst.mockResolvedValue({
      id: 'req-1',
      status: 'in_review',
      integrationStatus: null,
      requestType: { key: 'leave_request' },
      values: [],
      approvalSteps: [{ status: 'pending' }],
    });

    await service.processApprovedRequest(
      { userId: 'u-1', companyId: 'co-1', impersonatorUserId: null },
      'req-1',
    );

    expect(prisma.requestInstance.update).not.toHaveBeenCalled();
  });

  it('skips integration when already completed with entity', async () => {
    prisma.requestInstance.findFirst.mockResolvedValue({
      id: 'req-1',
      status: 'approved',
      integrationStatus: 'completed',
      integrationEntityId: 'entity-1',
      requestType: { key: 'leave_request' },
      values: [],
      approvalSteps: [{ status: 'approved' }],
    });

    await service.processApprovedRequest(
      { userId: 'u-1', companyId: 'co-1', impersonatorUserId: null },
      'req-1',
    );

    expect(prisma.requestInstance.update).not.toHaveBeenCalled();
  });
});
