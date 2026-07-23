// ============================================================================
// modules/employee/application/employee-events.access.unit.spec.ts
// HR-013b — company scope enforcement on dashboard APIs.
// ============================================================================

import { CompanyAccessDeniedError } from '../../../shared/kernel/company-access.errors';
import { EmployeeEventsService } from './employee-events.service';

describe('EmployeeEventsService access (unit)', () => {
  const companyAccess = {
    assertCompanyAccess: jest.fn(),
  };
  const prisma = {
    employee: { findMany: jest.fn().mockResolvedValue([]) },
  };
  const service = new EmployeeEventsService(prisma as never, companyAccess as never);
  const actor = { userId: 'user-1', impersonatorUserId: null, companyId: 'co-1' };

  beforeEach(() => {
    jest.clearAllMocks();
    companyAccess.assertCompanyAccess.mockResolvedValue(undefined);
  });

  it('asserts company access before recognition dashboard', async () => {
    await service.getRecognitionDashboard(actor, 'co-1');
    expect(companyAccess.assertCompanyAccess).toHaveBeenCalledWith(actor, 'co-1');
  });

  it('asserts company access before tenure dashboard', async () => {
    await service.getTenureDashboard(actor, 'co-1');
    expect(companyAccess.assertCompanyAccess).toHaveBeenCalledWith(actor, 'co-1');
  });

  it('propagates company access denial', async () => {
    companyAccess.assertCompanyAccess.mockRejectedValue(new CompanyAccessDeniedError());
    await expect(service.getTenureDashboard(actor, 'co-other')).rejects.toBeInstanceOf(CompanyAccessDeniedError);
  });
});
