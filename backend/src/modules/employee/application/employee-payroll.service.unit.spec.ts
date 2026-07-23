import { EmployeePayrollService } from './employee-payroll.service';
import { PayrollService } from '../../payroll/application/payroll.service';
import { PayrollBuilderService } from '../../payroll/application/payroll-builder.service';

describe('EmployeePayrollService', () => {
  const actor = { userId: 'u-1', impersonatorUserId: null, companyId: 'co-1' };

  it('delegates to PayrollService without duplicating calculations', async () => {
    const view = {
      summary: {
        currentSalary: 35000,
        salaryType: 'monthly' as const,
        lastPayrollDate: '2026-06-25',
        latestNetPay: 32000,
        payrollStatus: 'paid' as const,
        payPeriod: '2026-05-25 – 2026-06-23',
        salaryReviewDue: false,
        advanceDeductionTotal: 1000,
      },
      history: [{
        id: 'cycle-1',
        payrollCycleId: 'cycle-1',
        payslipId: 'slip-1',
        periodStart: '2026-05-25',
        periodEnd: '2026-06-23',
        payDate: '2026-06-25',
        grossPay: 36000,
        otAmount: 2000,
        commissionAmount: 0,
        bonusAmount: 0,
        deductions: 4000,
        advanceDeduction: 1000,
        netPay: 32000,
        status: 'paid' as const,
      }],
    };

    const payrollService = {
      getEmployeePayrollView: jest.fn().mockResolvedValue(view),
    };
    const employeeAccess = {
      assertEmployeeReadable: jest.fn(),
    };
    const salaryVisibility = {
      assertCanViewSalary: jest.fn(),
    };
    const payrollBuilder = {
      syncEmployeeInOpenCycles: jest.fn().mockResolvedValue({ cyclesSynced: 1, warnings: [] }),
    };

    const service = new EmployeePayrollService(
      payrollService as unknown as PayrollService,
      employeeAccess as never,
      salaryVisibility as never,
      payrollBuilder as unknown as PayrollBuilderService,
    );

    const result = await service.getPayroll(actor, 'emp-1', 'co-1');
    expect(employeeAccess.assertEmployeeReadable).toHaveBeenCalledWith(actor, 'emp-1');
    expect(payrollService.getEmployeePayrollView).toHaveBeenCalledWith(actor, 'emp-1', 'co-1');
    expect(result.summary.currentSalary).toBe(35000);
    expect(result.history[0].netPay).toBe(32000);
  });

  it('syncOpenCycleItems delegates to payroll builder', async () => {
    const payrollService = { getEmployeePayrollView: jest.fn() };
    const employeeAccess = { assertEmployeeReadable: jest.fn() };
    const salaryVisibility = { assertCanViewSalary: jest.fn() };
    const payrollBuilder = {
      syncEmployeeInOpenCycles: jest.fn().mockResolvedValue({ cyclesSynced: 1, warnings: [] }),
    };
    const service = new EmployeePayrollService(
      payrollService as unknown as PayrollService,
      employeeAccess as never,
      salaryVisibility as never,
      payrollBuilder as unknown as PayrollBuilderService,
    );

    const result = await service.syncOpenCycleItems(actor, 'emp-1', 'co-1');
    expect(salaryVisibility.assertCanViewSalary).toHaveBeenCalledWith('u-1', 'emp-1');
    expect(payrollBuilder.syncEmployeeInOpenCycles).toHaveBeenCalledWith(actor, 'emp-1', 'co-1');
    expect(result.cyclesSynced).toBe(1);
  });
});
