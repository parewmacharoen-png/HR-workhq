import {
  ExitCaseNotCancellableError,
  ExitCancellationReasonRequiredError,
} from '../domain/errors/exit.errors';
import { EmployeeExitCase } from '../domain/entities/employee-exit-case.entity';
import { ExitCaseService } from './exit-case.service';
import { DateProvider } from '../../../shared/time/date.provider';
import { BangkokTimeProvider } from '../../../shared/time/bangkok-time.provider';

const dates = new DateProvider(new BangkokTimeProvider());

describe('EmployeeExitCase.cancel', () => {
  it('sets cancelled status with reason', () => {
    const exitCase = EmployeeExitCase.create({
      id: 'case-1',
      employeeId: 'emp-1',
      companyId: 'co-1',
      exitReason: 'proper_resignation',
      departmentRoute: 'admin',
      effectiveTerminationDate: new Date('2026-06-30'),
      initiatedBy: 'user-1',
    });

    exitCase.cancel('user-2', 'Employee withdrew resignation', new Date('2026-06-23'));

    expect(exitCase.status).toBe('cancelled');
    expect(exitCase.toPersistence().cancellationReason).toBe('Employee withdrew resignation');
    expect(exitCase.toPersistence().cancelledBy).toBe('user-2');
  });

  it('rejects cancel when already closed', () => {
    const exitCase = EmployeeExitCase.rehydrate({
      ...EmployeeExitCase.create({
        id: 'case-1',
        employeeId: 'emp-1',
        companyId: 'co-1',
        exitReason: 'proper_resignation',
        departmentRoute: 'admin',
        effectiveTerminationDate: new Date('2026-06-30'),
        initiatedBy: 'user-1',
      }).toPersistence(),
      status: 'closed',
      closedAt: new Date(),
    });

    expect(() => exitCase.cancel('user-2', 'Too late', new Date())).toThrow('cannot be cancelled');
  });
});

describe('ExitCaseService.cancel', () => {
  const actor = { userId: 'owner-1' };
  const exitCase = EmployeeExitCase.create({
    id: 'case-1',
    employeeId: 'emp-1',
    companyId: 'co-1',
    exitReason: 'performance_failure',
    departmentRoute: 'marketing',
    effectiveTerminationDate: new Date('2026-06-30'),
    initiatedBy: 'user-1',
  });

  const exitCases = {
    findById: jest.fn().mockResolvedValue(exitCase),
    save: jest.fn().mockResolvedValue(undefined),
  };
  const exitAccess = {
    assertCanCancel: jest.fn().mockResolvedValue(undefined),
  };
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  const checklist = {
    countPending: jest.fn().mockResolvedValue(0),
    listItems: jest.fn().mockResolvedValue([]),
  };
  const prisma = {
    employeeExitCase: {
      findFirst: jest.fn().mockResolvedValue({
        exitType: 'termination',
        sourceType: 'manual',
        sourceId: null,
      }),
    },
  };
  const telegram = { notifyExitCancelled: jest.fn().mockResolvedValue(undefined) };

  let service: ExitCaseService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new ExitCaseService(
      exitCases as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      prisma as never,
      {} as never,
      audit as never,
      checklist as never,
      exitAccess as never,
      dates,
      telegram as never,
    );
  });

  it('requires cancellation reason', async () => {
    await expect(service.cancel(actor as never, 'case-1', { cancellationReason: '  ' }))
      .rejects.toBeInstanceOf(ExitCancellationReasonRequiredError);
  });

  it('cancels open case and audits', async () => {
    const result = await service.cancel(actor as never, 'case-1', {
      cancellationReason: 'Duplicate case opened in error',
    });

    expect(exitAccess.assertCanCancel).toHaveBeenCalled();
    expect(exitCases.save).toHaveBeenCalled();
    expect(audit.record).toHaveBeenCalledWith(actor, expect.objectContaining({ action: 'cancel' }));
    expect(telegram.notifyExitCancelled).toHaveBeenCalled();
    expect(result.lifecycleStatus).toBe('CANCELLED');
  });

  it('rejects cancelling closed case', async () => {
    exitCases.findById.mockResolvedValueOnce(
      EmployeeExitCase.rehydrate({
        ...exitCase.toPersistence(),
        status: 'closed',
        closedAt: new Date(),
      }),
    );

    await expect(service.cancel(actor as never, 'case-1', {
      cancellationReason: 'Too late',
    })).rejects.toBeInstanceOf(ExitCaseNotCancellableError);
  });
});
