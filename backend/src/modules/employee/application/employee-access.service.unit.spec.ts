// ============================================================================
// modules/employee/application/employee-access.service.unit.spec.ts
// SEC-001 / HR-013c — actor scope enforcement.
// ============================================================================

import { CompanyAccessDeniedError } from '../../../shared/kernel/company-access.errors';
import { EmployeeAccessService } from './employee-access.service';
import { EmployeeNotFoundError } from '../domain/errors/employee.errors';

describe('EmployeeAccessService (unit)', () => {
  const companyAccess = { assertCompanyAccess: jest.fn() };
  const permissions = { findUserAccess: jest.fn() };
  const prisma = {
    employeeAssignment: { findFirst: jest.fn() },
  };

  const service = new EmployeeAccessService(
    prisma as never,
    companyAccess as never,
    permissions as never,
  );

  const actor = { userId: 'user-1', impersonatorUserId: null, companyId: 'co-1' };

  beforeEach(() => {
    jest.clearAllMocks();
    companyAccess.assertCompanyAccess.mockResolvedValue(undefined);
  });

  it('allows self-scoped actor to read own employee record', async () => {
    permissions.findUserAccess.mockResolvedValue({ employeeId: 'emp-1' });
    prisma.employeeAssignment.findFirst.mockResolvedValue({ companyId: 'co-1' });

    const companyId = await service.assertEmployeeReadable(actor, 'emp-1');

    expect(companyId).toBe('co-1');
    expect(companyAccess.assertCompanyAccess).not.toHaveBeenCalled();
  });

  it('requires company access for other employees', async () => {
    permissions.findUserAccess.mockResolvedValue({ employeeId: 'emp-other' });
    prisma.employeeAssignment.findFirst.mockResolvedValue({ companyId: 'co-1' });

    await service.assertEmployeeReadable(actor, 'emp-1');

    expect(companyAccess.assertCompanyAccess).toHaveBeenCalledWith(actor, 'co-1');
  });

  it('assertEmployeeSelfOrCompany allows self without company check', async () => {
    permissions.findUserAccess.mockResolvedValue({ employeeId: 'emp-1' });
    prisma.employeeAssignment.findFirst.mockResolvedValue({ companyId: 'co-1' });

    await service.assertEmployeeSelfOrCompany(actor, 'emp-1', 'co-1');

    expect(companyAccess.assertCompanyAccess).not.toHaveBeenCalled();
  });

  it('assertEmployeeSelfOrCompany requires company access for others', async () => {
    permissions.findUserAccess.mockResolvedValue(null);
    prisma.employeeAssignment.findFirst.mockResolvedValue({ companyId: 'co-1' });

    await service.assertEmployeeSelfOrCompany(actor, 'emp-1', 'co-1');

    expect(companyAccess.assertCompanyAccess).toHaveBeenCalledWith(actor, 'co-1');
  });

  it('propagates company access denial', async () => {
    permissions.findUserAccess.mockResolvedValue(null);
    prisma.employeeAssignment.findFirst.mockResolvedValue({ companyId: 'co-other' });
    companyAccess.assertCompanyAccess.mockRejectedValue(new CompanyAccessDeniedError());

    await expect(service.assertEmployeeReadable(actor, 'emp-1')).rejects.toBeInstanceOf(CompanyAccessDeniedError);
  });

  it('throws when employee has no assignment', async () => {
    permissions.findUserAccess.mockResolvedValue(null);
    prisma.employeeAssignment.findFirst.mockResolvedValue(null);

    await expect(service.assertEmployeeReadable(actor, 'emp-missing')).rejects.toBeInstanceOf(EmployeeNotFoundError);
  });
});
