import { PayrollExportAccessService } from './payroll-export-access.service';
import { PayrollExportForbiddenError } from '../domain/errors/payroll-export.errors';

describe('PayrollExportAccessService', () => {
  const companyAccess = { assertCompanyAccess: jest.fn().mockResolvedValue(undefined) };
  const permissions = { findUserAccess: jest.fn() };

  let service: PayrollExportAccessService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new PayrollExportAccessService(companyAccess as never, permissions as never);
  });

  it('allows owner to export', async () => {
    permissions.findUserAccess.mockResolvedValue({ businessRole: 'owner' });
    await expect(service.assertCanExport({ userId: 'u1' } as never, 'co-1')).resolves.toBeUndefined();
  });

  it('allows secretary to download within company', async () => {
    permissions.findUserAccess.mockResolvedValue({ businessRole: 'secretary' });
    await expect(service.assertCanDownload({ userId: 'u1' } as never, 'co-1')).resolves.toBeUndefined();
  });

  it('denies big leader bank export', async () => {
    permissions.findUserAccess.mockResolvedValue({ businessRole: 'big_leader' });
    await expect(service.assertCanExport({ userId: 'u1' } as never, 'co-1'))
      .rejects.toBeInstanceOf(PayrollExportForbiddenError);
  });

  it('denies employee bank export', async () => {
    permissions.findUserAccess.mockResolvedValue({ businessRole: 'employee' });
    await expect(service.assertCanDownload({ userId: 'u1' } as never, 'co-1'))
      .rejects.toBeInstanceOf(PayrollExportForbiddenError);
  });

  it('allows owner to confirm exceptions', async () => {
    permissions.findUserAccess.mockResolvedValue({ businessRole: 'owner' });
    await expect(service.assertOwnerConfirmExceptions({ userId: 'u1' } as never, 'co-1')).resolves.toBeUndefined();
  });

  it('denies secretary confirming exceptions', async () => {
    permissions.findUserAccess.mockResolvedValue({ businessRole: 'secretary' });
    await expect(service.assertOwnerConfirmExceptions({ userId: 'u1' } as never, 'co-1'))
      .rejects.toBeInstanceOf(PayrollExportForbiddenError);
  });
});
