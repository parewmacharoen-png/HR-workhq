import { TelegramRegistrationRequestBridgeService } from './telegram-registration-request-bridge.service';
import { RequestInstanceService } from './request-instance.service';

describe('TelegramRegistrationRequestBridgeService', () => {
  const prisma = {
    requestType: { findFirst: jest.fn() },
    requestInstance: { findFirst: jest.fn(), findMany: jest.fn() },
    registrationRequest: { update: jest.fn() },
    employeeSelfOnboardingSubmission: { update: jest.fn() },
    employeeAssignment: { findFirst: jest.fn() },
  };
  const audit = { record: jest.fn() };
  const instances = {
    createAndSubmitSystemRequest: jest.fn().mockResolvedValue('req-new'),
    submitDraftTelegramRegistration: jest.fn().mockResolvedValue(undefined),
  };

  let service: TelegramRegistrationRequestBridgeService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new TelegramRegistrationRequestBridgeService(
      prisma as never,
      audit as never,
      instances as unknown as RequestInstanceService,
    );
    prisma.requestType.findFirst.mockResolvedValue({ id: 'type-1' });
  });

  it('submits existing draft instead of leaving it draft', async () => {
    prisma.requestInstance.findFirst.mockResolvedValue({
      id: 'req-draft',
      status: 'draft',
      values: [{ valueText: '999' }],
    });
    const id = await service.createAndSubmit({
      employeeId: 'emp-1',
      companyId: 'co-1',
      telegramUserId: 999,
      verificationMethod: 'employee_code_phone',
    });
    expect(id).toBe('req-draft');
    expect(instances.submitDraftTelegramRegistration).toHaveBeenCalledWith('req-draft');
    expect(instances.createAndSubmitSystemRequest).not.toHaveBeenCalled();
  });

  it('creates in_review request via createAndSubmitSystemRequest', async () => {
    prisma.requestInstance.findFirst.mockResolvedValue(null);
    const id = await service.createAndSubmit({
      employeeId: 'emp-1',
      companyId: 'co-1',
      telegramUserId: 123,
      verificationMethod: 'employee_code_phone',
      registrationRequestId: 'reg-1',
    });
    expect(id).toBe('req-new');
    expect(instances.createAndSubmitSystemRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        typeKey: 'telegram_registration_review',
        companyId: 'co-1',
        requesterEmployeeId: 'emp-1',
      }),
    );
  });

  it('repairDraftRequests submits all drafts', async () => {
    prisma.requestType.findFirst.mockResolvedValue({ id: 'type-1' });
    prisma.requestInstance.findMany.mockResolvedValue([{ id: 'd1' }, { id: 'd2' }]);
    const result = await service.repairDraftRequests();
    expect(result.repaired).toEqual(['d1', 'd2']);
    expect(instances.submitDraftTelegramRegistration).toHaveBeenCalledTimes(2);
  });
});
