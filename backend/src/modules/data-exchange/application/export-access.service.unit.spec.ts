// ============================================================================
// Unit tests — export access control
// ============================================================================

import { ExportAccessService } from './export-access.service';

describe('ExportAccessService', () => {
  const companyAccess = { assertCompanyAccess: jest.fn() };
  const permissions = { findUserAccess: jest.fn() };
  const service = new ExportAccessService(companyAccess as never, permissions as never);

  beforeEach(() => {
    jest.clearAllMocks();
    companyAccess.assertCompanyAccess.mockResolvedValue(undefined);
  });

  it('allows owner for sensitive payroll export', async () => {
    permissions.findUserAccess.mockResolvedValue({ businessRole: 'owner', overrides: [] });
    await expect(service.assertCanExport(
      { userId: 'u1', companyId: 'c1', impersonatorUserId: null },
      'c1',
      'payroll',
    )).resolves.toBeUndefined();
  });

  it('denies employee company export', async () => {
    permissions.findUserAccess.mockResolvedValue({
      businessRole: 'employee',
      overrides: [],
    });
    await expect(service.assertCanExport(
      { userId: 'u1', companyId: 'c1', impersonatorUserId: null },
      'c1',
      'employees',
    )).rejects.toThrow(/cannot run company exports/);
  });

  it('allows list exports for secretary', async () => {
    permissions.findUserAccess.mockResolvedValue({ businessRole: 'secretary', overrides: [] });
    await expect(service.assertCanListExports(
      { userId: 'u1', companyId: 'c1', impersonatorUserId: null },
      'c1',
    )).resolves.toBeUndefined();
  });
});
