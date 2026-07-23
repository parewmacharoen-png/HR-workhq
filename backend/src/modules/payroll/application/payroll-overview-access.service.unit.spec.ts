import { PayrollOverviewAccessService } from './payroll-overview-access.service';
import { SalaryAccessDeniedError } from '../../permission/domain/errors/permission.errors';

describe('PayrollOverviewAccessService', () => {
  const companyAccess = { assertCompanyAccess: jest.fn().mockResolvedValue(undefined) };
  const salaryVisibility = { canViewCompanyPayrollSummary: jest.fn() };
  const employeeAccess = {
    assertEmployeeInCompany: jest.fn().mockResolvedValue(undefined),
    assertEmployeeReadable: jest.fn().mockResolvedValue('co-1'),
  };

  let service: PayrollOverviewAccessService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new PayrollOverviewAccessService(
      companyAccess as never,
      salaryVisibility as never,
      employeeAccess as never,
    );
  });

  it('allows owner company overview', async () => {
    salaryVisibility.canViewCompanyPayrollSummary.mockResolvedValue({ canView: true, reason: 'ok' });
    await expect(service.assertCanViewCompanyOverview({ userId: 'u1' } as never, 'co-1'))
      .resolves.toBeUndefined();
  });

  it('denies sub leader company overview', async () => {
    salaryVisibility.canViewCompanyPayrollSummary.mockResolvedValue({
      canView: false,
      reason: 'Sub leader may not view company payroll summaries.',
    });
    await expect(service.assertCanViewCompanyOverview({ userId: 'u1' } as never, 'co-1'))
      .rejects.toBeInstanceOf(SalaryAccessDeniedError);
  });

  it('allows big leader scoped overview', async () => {
    salaryVisibility.canViewCompanyPayrollSummary.mockResolvedValue({
      canView: true,
      reason: 'Big leader scoped',
    });
    await expect(service.assertCanViewCompanyOverview({ userId: 'u1' } as never, 'co-1'))
      .resolves.toBeUndefined();
  });

  it('falls back to employee self read for row detail', async () => {
    salaryVisibility.canViewCompanyPayrollSummary.mockResolvedValue({ canView: false, reason: 'self only' });
    await service.assertCanViewEmployeeRow({ userId: 'u1' } as never, 'emp-1', 'co-1');
    expect(employeeAccess.assertEmployeeReadable).toHaveBeenCalled();
  });
});
