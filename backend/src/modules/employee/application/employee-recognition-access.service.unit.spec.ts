// ============================================================================
// modules/employee/application/employee-recognition-access.service.unit.spec.ts
// EMP-011 — recognition access by role.
// ============================================================================

import { ForbiddenError } from '../../../shared/kernel/domain-error';
import { EmployeeRecognitionAccessService } from './employee-recognition-access.service';

describe('EmployeeRecognitionAccessService (unit)', () => {
  const companyAccess = { assertCompanyAccess: jest.fn().mockResolvedValue(undefined) };
  const employeeAccess = {
    assertEmployeeInCompany: jest.fn().mockResolvedValue(undefined),
    assertEmployeeWritable: jest.fn().mockResolvedValue(undefined),
  };
  const hierarchy = { getDescendantEmployeeIds: jest.fn().mockResolvedValue(['team-1']) };
  const permissions = {
    findUserAccess: jest.fn(),
  };

  const service = new EmployeeRecognitionAccessService(
    companyAccess as never,
    employeeAccess as never,
    hierarchy as never,
    permissions as never,
  );

  const actor = { userId: 'user-1', impersonatorUserId: null, companyId: null };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('allows employee to read own recognitions', async () => {
    permissions.findUserAccess.mockResolvedValue({ employeeId: 'emp-1', businessRole: 'employee' });
    await expect(service.assertCanRead(actor, 'emp-1', 'co-1')).resolves.toBeUndefined();
    expect(companyAccess.assertCompanyAccess).not.toHaveBeenCalled();
  });

  it('allows secretary to read company employee', async () => {
    permissions.findUserAccess.mockResolvedValue({ employeeId: null, businessRole: 'secretary' });
    await service.assertCanRead(actor, 'emp-2', 'co-1');
    expect(employeeAccess.assertEmployeeInCompany).toHaveBeenCalledWith('emp-2', 'co-1');
  });

  it('allows sub leader to read team member only', async () => {
    permissions.findUserAccess.mockResolvedValue({ employeeId: 'sub-1', businessRole: 'sub_leader' });
    await service.assertCanRead(actor, 'team-1', 'co-1');
    await expect(service.assertCanRead(actor, 'other-1', 'co-1')).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('allows owner/secretary/big leader to create awards', async () => {
    permissions.findUserAccess.mockResolvedValue({ businessRole: 'big_leader' });
    await service.assertCanCreate(actor, 'emp-1', 'co-1');
    expect(employeeAccess.assertEmployeeWritable).toHaveBeenCalled();
  });

  it('denies sub leader from creating awards', async () => {
    permissions.findUserAccess.mockResolvedValue({ businessRole: 'sub_leader', employeeId: 'sub-1' });
    await expect(service.assertCanCreate(actor, 'emp-1', 'co-1')).rejects.toBeInstanceOf(ForbiddenError);
  });
});
