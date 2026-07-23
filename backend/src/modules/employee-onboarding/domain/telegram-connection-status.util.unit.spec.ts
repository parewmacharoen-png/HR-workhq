import {
  mapConnectionStatusToOverview,
  resolveTelegramConnectionStatus,
} from './telegram-connection-status.util';

function createPrismaMock(overrides: {
  requestTypes?: Array<{ id: string; key: string }>;
  requestInstance?: { id: string; status: string } | null;
  identity?: { status: string } | null;
  submission?: { status: string } | null;
  invite?: { status: string; expiresAt: Date } | null;
}) {
  return {
    telegramIdentity: {
      findFirst: jest.fn().mockResolvedValue(overrides.identity ?? null),
    },
    employeeSelfOnboardingSubmission: {
      findFirst: jest.fn().mockResolvedValue(overrides.submission ?? null),
    },
    employeeTelegramInvite: {
      findFirst: jest.fn().mockResolvedValue(overrides.invite ?? null),
    },
    requestType: {
      findMany: jest.fn().mockResolvedValue(overrides.requestTypes ?? []),
    },
    requestInstance: {
      findFirst: jest.fn().mockResolvedValue(overrides.requestInstance ?? null),
    },
  } as never;
}

describe('resolveTelegramConnectionStatus', () => {
  it('returns pending_review when employee_onboarding request is in_review', async () => {
    const prisma = createPrismaMock({
      requestTypes: [
        { id: 'type-1', key: 'employee_onboarding' },
        { id: 'type-2', key: 'telegram_registration_review' },
      ],
      requestInstance: { id: 'req-1', status: 'in_review' },
      identity: { status: 'PENDING' },
    });

    const status = await resolveTelegramConnectionStatus(prisma, 'emp-1');
    expect(status).toBe('pending_review');
    expect(prisma.requestType.findMany).toHaveBeenCalled();
  });

  it('returns linked when identity is active even if submission is still draft', async () => {
    const prisma = createPrismaMock({
      identity: { status: 'ACTIVE' },
      submission: { status: 'draft' },
      requestInstance: { id: 'req-1', status: 'in_review' },
    });

    const status = await resolveTelegramConnectionStatus(prisma, 'emp-1');
    expect(status).toBe('linked');
  });

  it('returns linked when identity is active and onboarding request is completed', async () => {
    const prisma = createPrismaMock({
      requestTypes: [{ id: 'type-1', key: 'employee_onboarding' }],
      requestInstance: { id: 'req-1', status: 'completed' },
      identity: { status: 'ACTIVE' },
      submission: { status: 'approved' },
    });

    const status = await resolveTelegramConnectionStatus(prisma, 'emp-1');
    expect(status).toBe('linked');
  });

  it('returns linked when identity is active and no open review', async () => {
    const prisma = createPrismaMock({
      requestTypes: [{ id: 'type-1', key: 'employee_onboarding' }],
      requestInstance: { id: 'req-1', status: 'approved' },
      identity: { status: 'ACTIVE' },
      submission: { status: 'approved' },
    });

    const status = await resolveTelegramConnectionStatus(prisma, 'emp-1');
    expect(status).toBe('linked');
  });
});

describe('mapConnectionStatusToOverview', () => {
  it('maps pending review states to overview pending_review', () => {
    expect(mapConnectionStatusToOverview('pending_review')).toBe('pending_review');
    expect(mapConnectionStatusToOverview('started')).toBe('pending_review');
    expect(mapConnectionStatusToOverview('onboarding_submitted')).toBe('pending_review');
  });

  it('does not map active identity alone to linked', () => {
    expect(mapConnectionStatusToOverview('not_connected')).toBe('not_linked');
    expect(mapConnectionStatusToOverview('linked')).toBe('linked');
    expect(mapConnectionStatusToOverview('rejected')).toBe('rejected');
  });
});
