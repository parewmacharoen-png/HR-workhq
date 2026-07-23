// ============================================================================
// Unit tests — export redaction
// ============================================================================

import { ExportRedactionService } from './export-redaction.service';
import type { ExportDataset } from '../domain/export.types';

describe('ExportRedactionService', () => {
  const permissions = {
    findUserAccess: jest.fn(),
  };

  const service = new ExportRedactionService(permissions as never);

  const dataset: ExportDataset = {
    title: 'Employees',
    worksheetName: 'Employees',
    headers: ['Code', 'Salary', 'Bank Account'],
    rows: [['E001', '50000', '1234567890']],
  };

  it('redacts salary and bank columns for big leader', async () => {
    permissions.findUserAccess.mockResolvedValue({
      businessRole: 'big_leader',
      overrides: [{ permission: 'employee:read', effect: 'allow', id: '1', reason: null, createdAt: new Date() }],
    });

    const out = await service.redact({ userId: 'u1', companyId: 'c1', impersonatorUserId: null }, dataset);
    expect(out.rows[0]).toEqual(['E001', '[REDACTED]', '[REDACTED]']);
  });

  it('keeps salary for secretary', async () => {
    permissions.findUserAccess.mockResolvedValue({
      businessRole: 'secretary',
      overrides: [{ permission: 'payroll:read', effect: 'allow', id: '1', reason: null, createdAt: new Date() }],
    });

    const out = await service.redact({ userId: 'u1', companyId: 'c1', impersonatorUserId: null }, dataset);
    expect(out.rows[0]).toEqual(['E001', '50000', '1234567890']);
  });
});
