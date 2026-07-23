// ============================================================================
// marketing-access.service.unit.spec.ts
// ============================================================================

import { MarketingAccessService } from './marketing-access.service';
import { MarketingEditReasonRequiredError } from '../domain/errors/marketing.errors';
import { MarketingDailyReportRow } from '../domain/repositories/marketing-daily-report.repository';

describe('MarketingAccessService', () => {
  const prisma = {
    user: { findFirst: jest.fn() },
    employeeAssignment: { findFirst: jest.fn() },
    marketingTeam: { findFirst: jest.fn() },
  };
  const companyAccess = {
    assertCompanyAccess: jest.fn(),
    hasAllScope: jest.fn(),
  };
  const permissions = { can: jest.fn() };
  const marketingTeams = {
    getEmployeeMarketingTeamAtDate: jest.fn(),
    findById: jest.fn(),
  };

  const service = new MarketingAccessService(
    prisma as never,
    companyAccess as never,
    permissions as never,
    marketingTeams as never,
  );

  const actor = { userId: 'user-1', companyId: 'company-1', impersonatorUserId: null };
  const report: MarketingDailyReportRow = {
    id: 'report-1',
    companyId: 'company-1',
    employeeId: 'emp-1',
    reportDate: new Date('2026-06-21'),
    contactedCount: 1,
    newMemberCount: 1,
    depositAmount: 1,
    startedWorkCount: 1,
    note: null,
    status: 'submitted',
    submittedAt: new Date(),
    approvedBy: null,
    approvedAt: null,
    rejectedReason: null,
    voidReason: null,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    companyAccess.assertCompanyAccess.mockResolvedValue(undefined);
    companyAccess.hasAllScope.mockResolvedValue(false);
    permissions.can.mockResolvedValue(false);
    prisma.user.findFirst.mockResolvedValue({ employeeId: 'emp-2' });
  });

  it('requires reason for admin edits', async () => {
    companyAccess.hasAllScope.mockResolvedValue(true);

    await expect(service.assertCanEdit(actor, report, '', { requireReason: true }))
      .rejects
      .toBeInstanceOf(MarketingEditReasonRequiredError);
  });

  it('allows employee to edit own submitted report without reason', async () => {
    prisma.user.findFirst.mockResolvedValue({ employeeId: 'emp-1' });

    await expect(service.assertCanEdit(actor, report, undefined, { requireReason: false }))
      .resolves
      .toBe('employee');
  });
});
