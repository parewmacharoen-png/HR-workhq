// ============================================================================
// employee-business-role.service.unit.spec.ts
// ============================================================================

import { EmployeeBusinessRoleService } from './employee-business-role.service';
import { AccessControlValidationError } from '../../permission/domain/errors/access-control.errors';

describe('EmployeeBusinessRoleService', () => {
  const actor = { userId: 'actor-1', companyId: 'co-1', impersonatorUserId: null };

  const prisma = {
    employeeAssignment: { findFirst: jest.fn() },
    employeeChangeHistory: { create: jest.fn() },
  };

  const audit = { record: jest.fn() };
  const profileAccess = {
    assertOwnerOrSecretary: jest.fn(),
    canEditProfile: jest.fn(),
  };
  const accessControl = {
    getEmployeeAccessContext: jest.fn(),
    assignBusinessRole: jest.fn(),
  };
  const permissions = { findUserAccess: jest.fn() };

  const service = new EmployeeBusinessRoleService(
    prisma as never,
    audit as never,
    profileAccess as never,
    accessControl as never,
    permissions as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    profileAccess.assertOwnerOrSecretary.mockResolvedValue('co-1');
    profileAccess.canEditProfile.mockImplementation(async () => true);
    prisma.employeeAssignment.findFirst.mockResolvedValue({ companyId: 'co-1', teamId: 'team-1' });
    accessControl.getEmployeeAccessContext.mockResolvedValue({
      userId: 'user-target',
      businessRole: 'employee',
    });
    accessControl.assignBusinessRole.mockResolvedValue({});
    prisma.employeeChangeHistory.create.mockResolvedValue({});
  });

  it('owner can change any role', async () => {
    permissions.findUserAccess.mockResolvedValue({ businessRole: 'owner' });

    const result = await service.updateBusinessRole(actor, 'emp-1', { businessRole: 'secretary' });

    expect(result.businessRole).toBe('secretary');
    expect(accessControl.assignBusinessRole).toHaveBeenCalledWith(
      actor,
      'user-target',
      expect.objectContaining({ role: 'secretary' }),
    );
    expect(prisma.employeeChangeHistory.create).toHaveBeenCalled();
    expect(audit.record).toHaveBeenCalledWith(
      actor,
      expect.objectContaining({ action: 'employee_business_role_changed' }),
    );
  });

  it('secretary cannot assign owner', async () => {
    permissions.findUserAccess.mockResolvedValue({ businessRole: 'secretary' });

    await expect(
      service.updateBusinessRole(actor, 'emp-1', { businessRole: 'owner' }),
    ).rejects.toBeInstanceOf(AccessControlValidationError);

    expect(accessControl.assignBusinessRole).not.toHaveBeenCalled();
  });

  it('employee cannot change role', async () => {
    permissions.findUserAccess.mockResolvedValue({ businessRole: 'employee' });

    await expect(
      service.updateBusinessRole(actor, 'emp-1', { businessRole: 'admin' }),
    ).rejects.toBeInstanceOf(AccessControlValidationError);
  });

  it('writes permission audit via access control assign', async () => {
    permissions.findUserAccess.mockResolvedValue({ businessRole: 'owner' });

    await service.updateBusinessRole(actor, 'emp-1', {
      businessRole: 'big_leader',
      reason: 'promotion test',
    });

    expect(accessControl.assignBusinessRole).toHaveBeenCalledWith(
      actor,
      'user-target',
      expect.objectContaining({
        role: 'big_leader',
        companyScopeIds: ['co-1'],
        reason: 'promotion test',
      }),
    );
    expect(prisma.employeeChangeHistory.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          fieldName: 'businessRole',
          reason: 'promotion test',
          changedBy: 'actor-1',
        }),
      }),
    );
  });

  it('owner viewer can edit business role', async () => {
    profileAccess.assertOwnerOrSecretary.mockResolvedValue('co-1');
    permissions.findUserAccess.mockResolvedValue({ businessRole: 'owner' });

    const result = await service.resolveEditorPermissions(actor, 'emp-1', 'employee');
    expect(result).toEqual({ canEditBusinessRole: true, canAssignOwnerRole: true });
  });

  it('secretary can edit non-owner but cannot assign owner', async () => {
    profileAccess.assertOwnerOrSecretary.mockResolvedValue('co-1');
    permissions.findUserAccess.mockResolvedValue({ businessRole: 'secretary' });

    const editable = await service.resolveEditorPermissions(actor, 'emp-1', 'employee');
    expect(editable).toEqual({ canEditBusinessRole: true, canAssignOwnerRole: false });

    const locked = await service.resolveEditorPermissions(actor, 'emp-1', 'owner');
    expect(locked).toEqual({ canEditBusinessRole: false, canAssignOwnerRole: false });
  });

  it('employee cannot edit business role', async () => {
    profileAccess.canEditProfile.mockResolvedValue(false);
    permissions.findUserAccess.mockResolvedValue({ businessRole: 'employee' });

    const result = await service.resolveEditorPermissions(actor, 'emp-1', 'employee');
    expect(result).toEqual({ canEditBusinessRole: false, canAssignOwnerRole: false });
    expect(profileAccess.assertOwnerOrSecretary).not.toHaveBeenCalled();
  });
});
