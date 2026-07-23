// ============================================================================
// modules/disciplinary/application/disciplinary-action.service.unit.spec.ts
// POL-025
// ============================================================================

import { DisciplinaryActionService } from './disciplinary-action.service';
import {
  DisciplinaryAcknowledgeForbiddenError,
  DisciplinaryAlreadyAcknowledgedError,
  DisciplinaryForbiddenError,
  DisciplinaryTerminationReasonRequiredError,
} from '../domain/errors/disciplinary.errors';

describe('DisciplinaryActionService', () => {
  const employees = { findById: jest.fn() };
  const permissions = { findUserAccess: jest.fn() };
  const prisma = {
    disciplinaryAction: {
      create: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
    },
    user: { findFirst: jest.fn() },
    employeeAssignment: { findFirst: jest.fn() },
  };
  const companyAccess = { assertCompanyAccess: jest.fn() };
  const employeeAccess = { assertEmployeeInCompany: jest.fn().mockResolvedValue(undefined) };
  const audit = { record: jest.fn() };
  const telegram = { notifyEmployee: jest.fn().mockResolvedValue(undefined) };

  const service = new DisciplinaryActionService(
    employees as never,
    permissions as never,
    prisma as never,
    companyAccess as never,
    employeeAccess as never,
    audit as never,
    telegram as never,
  );

  const ownerActor = { userId: 'owner-user', companyId: null, impersonatorUserId: null };
  const employeeActor = { userId: 'emp-user', companyId: null, impersonatorUserId: null };

  beforeEach(() => {
    jest.clearAllMocks();
    companyAccess.assertCompanyAccess.mockResolvedValue(undefined);
    permissions.findUserAccess.mockImplementation(async (userId: string) => {
      if (userId === 'owner-user') return { businessRole: 'owner', employeeId: null };
      if (userId === 'emp-user') return { businessRole: 'employee', employeeId: 'emp-1' };
      if (userId === 'sec-user') return { businessRole: 'secretary', employeeId: null };
      return null;
    });
    employees.findById.mockResolvedValue({
      toPersistence: () => ({ department: 'hr' }),
    });
    prisma.employeeAssignment.findFirst.mockResolvedValue({ companyId: 'co-1' });
  });

  it('requires terminationReason for termination actions', async () => {
    await expect(service.createAction(ownerActor, 'emp-1', {
      companyId: 'co-1',
      actionType: 'termination',
      reason: 'Misconduct',
    })).rejects.toBeInstanceOf(DisciplinaryTerminationReasonRequiredError);
  });

  it('creates verbal warning and notifies employee', async () => {
    const createdAt = new Date('2026-06-23T10:00:00Z');
    prisma.disciplinaryAction.create.mockResolvedValue({
      id: 'act-1',
      employeeId: 'emp-1',
      companyId: 'co-1',
      actionType: 'verbal_warning',
      reason: 'Late',
      details: null,
      evidenceUrl: null,
      terminationReason: null,
      terminationNote: null,
      issuedBy: 'owner-user',
      acknowledgedBy: null,
      acknowledgedAt: null,
      createdAt,
    });
    prisma.user.findFirst.mockResolvedValue({ username: 'owner', employee: null });

    const result = await service.createAction(ownerActor, 'emp-1', {
      companyId: 'co-1',
      actionType: 'verbal_warning',
      reason: 'Late',
    });

    expect(result.actionType).toBe('verbal_warning');
    expect(telegram.notifyEmployee).toHaveBeenCalled();
    expect(audit.record).toHaveBeenCalled();
  });

  it('allows employee to acknowledge own action', async () => {
    const row = {
      id: 'act-1',
      employeeId: 'emp-1',
      companyId: 'co-1',
      actionType: 'warning_1',
      reason: 'Absent',
      details: null,
      evidenceUrl: null,
      terminationReason: null,
      terminationNote: null,
      issuedBy: 'owner-user',
      acknowledgedBy: null,
      acknowledgedAt: null,
      createdAt: new Date(),
    };
    prisma.disciplinaryAction.findFirst.mockResolvedValue(row);
    prisma.disciplinaryAction.update.mockResolvedValue({
      ...row,
      acknowledgedBy: 'emp-user',
      acknowledgedAt: new Date(),
    });
    prisma.user.findFirst.mockResolvedValue({ username: 'owner', employee: null });

    const result = await service.acknowledgeAction(employeeActor, 'act-1');
    expect(result.acknowledged).toBe(true);
  });

  it('rejects acknowledgement by non-subject employee', async () => {
    prisma.disciplinaryAction.findFirst.mockResolvedValue({
      id: 'act-1',
      employeeId: 'emp-2',
      companyId: 'co-1',
      actionType: 'warning_1',
      reason: 'Absent',
      details: null,
      evidenceUrl: null,
      terminationReason: null,
      terminationNote: null,
      issuedBy: 'owner-user',
      acknowledgedBy: null,
      acknowledgedAt: null,
      createdAt: new Date(),
    });

    await expect(service.acknowledgeAction(employeeActor, 'act-1'))
      .rejects.toBeInstanceOf(DisciplinaryAcknowledgeForbiddenError);
  });

  it('rejects double acknowledgement', async () => {
    prisma.disciplinaryAction.findFirst.mockResolvedValue({
      id: 'act-1',
      employeeId: 'emp-1',
      companyId: 'co-1',
      actionType: 'warning_1',
      reason: 'Absent',
      details: null,
      evidenceUrl: null,
      terminationReason: null,
      terminationNote: null,
      issuedBy: 'owner-user',
      acknowledgedBy: 'emp-user',
      acknowledgedAt: new Date(),
      createdAt: new Date(),
    });

    await expect(service.acknowledgeAction(employeeActor, 'act-1'))
      .rejects.toBeInstanceOf(DisciplinaryAlreadyAcknowledgedError);
  });

  it('returns summary with warningsNeverExpire true', async () => {
    prisma.disciplinaryAction.findMany.mockResolvedValue([
      {
        actionType: 'verbal_warning',
        acknowledgedAt: null,
        createdAt: new Date('2026-01-01'),
      },
      {
        actionType: 'warning_1',
        acknowledgedAt: new Date(),
        createdAt: new Date('2026-06-01'),
      },
    ]);
    prisma.user.findFirst.mockResolvedValue({ username: 'owner', employee: null });

    const list = await service.listEmployeeActions(ownerActor, 'emp-1', 'co-1');
    expect(list.summary.warningsNeverExpire).toBe(true);
    expect(list.summary.verbalWarningCount).toBe(1);
    expect(list.summary.warning1Count).toBe(1);
    expect(list.items).toHaveLength(2);
  });

  it('denies secretary for marketing department employee', async () => {
    employees.findById.mockResolvedValue({
      toPersistence: () => ({ department: 'marketing' }),
    });

    await expect(service.createAction(
      { userId: 'sec-user', companyId: null, impersonatorUserId: null },
      'emp-1',
      { companyId: 'co-1', actionType: 'verbal_warning', reason: 'Late' },
    )).rejects.toBeInstanceOf(DisciplinaryForbiddenError);
  });
});
