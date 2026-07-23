// ============================================================================
// marketing-report-audit.service.unit.spec.ts
// ============================================================================

import { MarketingReportAuditService } from './marketing-report-audit.service';
import { MarketingReportAuditRepository } from '../domain/repositories/marketing-report-audit.repository';
import { MarketingDailyReportRow } from '../domain/repositories/marketing-daily-report.repository';

describe('MarketingReportAuditService', () => {
  const auditRepo: jest.Mocked<MarketingReportAuditRepository> = {
    appendMany: jest.fn(),
    listByReportId: jest.fn(),
    search: jest.fn(),
  };

  const service = new MarketingReportAuditService(auditRepo);

  const baseRow = (): MarketingDailyReportRow => ({
    id: 'report-1',
    companyId: 'company-1',
    employeeId: 'emp-1',
    reportDate: new Date('2026-06-21'),
    contactedCount: 10,
    newMemberCount: 2,
    depositAmount: 1000,
    startedWorkCount: 1,
    note: null,
    status: 'draft',
    submittedAt: null,
    approvedBy: null,
    approvedAt: null,
    rejectedReason: null,
    voidReason: null,
  });

  beforeEach(() => jest.clearAllMocks());

  it('creates audit entries for changed fields only', async () => {
    const before = baseRow();
    const after = { ...before, contactedCount: 15, startedWorkCount: 2 };

    await service.logFieldChanges({
      companyId: before.companyId,
      reportId: before.id,
      actorId: 'user-1',
      action: 'update',
      reason: 'correct typo',
      before,
      after,
    });

    expect(auditRepo.appendMany).toHaveBeenCalledWith([
      expect.objectContaining({
        fieldName: 'contactedCount',
        oldValue: '10',
        newValue: '15',
        reason: 'correct typo',
      }),
      expect.objectContaining({
        fieldName: 'startedWorkCount',
        oldValue: '1',
        newValue: '2',
      }),
    ]);
  });

  it('logs single action records', async () => {
    await service.logAction({
      companyId: 'company-1',
      reportId: 'report-1',
      actorId: 'user-1',
      action: 'approve',
      fieldName: 'status',
      oldValue: 'submitted',
      newValue: 'approved',
    });

    expect(auditRepo.appendMany).toHaveBeenCalledWith([
      expect.objectContaining({ action: 'approve' }),
    ]);
  });
});
