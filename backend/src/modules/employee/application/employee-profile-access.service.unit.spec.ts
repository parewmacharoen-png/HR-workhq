// ============================================================================
// Unit tests — employee profile access
// ============================================================================

import { EmployeeProfileAccessService } from './employee-profile-access.service';

describe('EmployeeProfileAccessService', () => {
  const employeeAccess = {
    assertEmployeeReadable: jest.fn().mockResolvedValue('company-1'),
    assertEmployeeWritable: jest.fn().mockResolvedValue(undefined),
  };
  const permissions = { findUserAccess: jest.fn() };
  const service = new EmployeeProfileAccessService(employeeAccess as never, permissions as never);

  beforeEach(() => jest.clearAllMocks());

  it('allows owner to edit', async () => {
    permissions.findUserAccess.mockResolvedValue({ businessRole: 'owner', overrides: [] });
    await expect(service.assertOwnerOrSecretary(
      { userId: 'u1', companyId: 'company-1', impersonatorUserId: null },
      'emp-1',
    )).resolves.toBe('company-1');
  });

  it('denies big leader edit', async () => {
    permissions.findUserAccess.mockResolvedValue({ businessRole: 'big_leader', overrides: [] });
    await expect(service.assertOwnerOrSecretary(
      { userId: 'u1', companyId: 'company-1', impersonatorUserId: null },
      'emp-1',
    )).rejects.toThrow(/Only Owner or Secretary/);
  });

  it('requires owner for access edit', async () => {
    permissions.findUserAccess.mockResolvedValue({ businessRole: 'secretary', overrides: [] });
    await expect(service.assertOwner(
      { userId: 'u1', companyId: 'company-1', impersonatorUserId: null },
    )).rejects.toThrow(/Owner permission required/);
  });
});
