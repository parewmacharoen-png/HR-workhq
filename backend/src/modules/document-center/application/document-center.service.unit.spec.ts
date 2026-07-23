import { DocumentCenterService } from './document-center.service';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { CompanyAccessService } from '../../../shared/kernel/company-access.service';
import { DateProvider } from '../../../shared/time/date.provider';
import { BangkokTimeProvider } from '../../../shared/time/bangkok-time.provider';

describe('DocumentCenterService', () => {
  const dates = new DateProvider(new BangkokTimeProvider());

  it('returns dashboard widget counts for a company', async () => {
    const prisma = {
      employeeAssignment: {
        findMany: jest.fn().mockResolvedValue([{ employeeId: 'emp-1' }, { employeeId: 'emp-2' }]),
      },
      employeeDocument: {
        findMany: jest.fn().mockResolvedValue([
          { employeeId: 'emp-1', docType: 'national_id', expiresAt: null, acknowledgedAt: new Date(), uploadedAt: new Date(), fileName: 'a.pdf' },
          { employeeId: 'emp-2', docType: 'resume', expiresAt: new Date('2099-01-01'), acknowledgedAt: null, uploadedAt: new Date(), fileName: 'b.pdf' },
        ]),
      },
      documentGenerationJob: { count: jest.fn().mockResolvedValue(0) },
    } as unknown as PrismaService;

    const companyAccess = {
      assertCompanyAccess: jest.fn().mockResolvedValue(undefined),
    } as unknown as CompanyAccessService;

    const permissions = { findUserAccess: jest.fn() };
    const audit = { record: jest.fn() };
    const storage = { read: jest.fn(), save: jest.fn() };

    const service = new DocumentCenterService(
      prisma,
      companyAccess,
      audit as never,
      dates,
      storage as never,
      permissions as never,
    );
    const result = await service.getDashboard(
      { userId: 'u-1', companyId: 'co-1', impersonatorUserId: null },
      'co-1',
    );

    expect(result.missingRequired).toBe(2);
    expect(result.uploadStatus.total).toBe(2);
    expect(result.uploadStatus.acknowledged).toBe(1);
    expect(result.recentlyUploaded).toHaveLength(2);
  });
});
