import { PayrollService } from './payroll.service';
import { SalaryAccessDeniedError } from '../../permission/domain/errors/permission.errors';

describe('PayrollService employee view', () => {
  const actor = { userId: 'u-1', impersonatorUserId: null, companyId: 'co-1' };

  it('maps summary and history from payroll overview assembler', async () => {
    const employeeAccess = { assertEmployeeInCompany: jest.fn() };
    const salaryVisibility = {
      assertCanViewSalary: jest.fn(),
      canViewSalary: jest.fn(),
    };
    const overviewAssembler = {
      buildEmployeeRow: jest.fn().mockResolvedValue({
        employeeId: 'emp-1',
        employeeCode: 'EMP001',
        employeeName: 'Somchai Test',
        companyName: 'Acme',
        department: null,
        teamName: null,
        position: null,
        hireDate: '2020-01-15',
        tenureDisplay: '6 ปี',
        baseSalary: 30000,
        mealAllowance: 2000,
        mealEligibleDays: 20,
        crossBorderAllowance: 300,
        crossBorderEligibleDays: 3,
        otAmount: 1500,
        commissionAmount: 500,
        bonusAmount: 0,
        lateDeduction: 200,
        absenceDeduction: 0,
        leaveDeduction: 0,
        advanceDeduction: 1000,
        deposit: 500,
        otherDeduction: 0,
        totalDeduction: 1700,
        netPayAmount: 32800,
        payrollStatus: 'ready',
        bankName: null,
        bankAccountNoMasked: null,
        bankAccountName: null,
        notes: [],
        hasException: false,
        exceptionReasons: [],
      }),
    };
    const prisma = {
      company: { findFirst: jest.fn().mockResolvedValue({ name: 'Acme' }) },
      employee: { findFirst: jest.fn().mockResolvedValue({ hireDate: new Date('2020-01-15') }) },
      salaryHistory: { findFirst: jest.fn().mockResolvedValue({ monthlySalary: 35000, effectiveFrom: new Date('2024-01-01') }) },
      payrollCycle: {
        findMany: jest.fn().mockResolvedValue([{
          id: 'cycle-1',
          periodStart: new Date('2026-05-25'),
          periodEnd: new Date('2026-06-23'),
          payDate: new Date('2026-06-25'),
          status: 'paid',
        }]),
      },
      payrollItem: { findFirst: jest.fn().mockResolvedValue(null) },
      payslip: { findMany: jest.fn().mockResolvedValue([{ id: 'slip-1', payrollCycleId: 'cycle-1' }]) },
      employeeChangeHistory: { findFirst: jest.fn().mockResolvedValue(null) },
    };

    const service = new PayrollService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      prisma as never,
      {} as never,
      employeeAccess as never,
      {} as never,
      {} as never,
      {} as never,
      salaryVisibility as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      overviewAssembler as never,
    );

    const result = await service.getEmployeePayrollView(actor, 'emp-1', 'co-1');
    expect(salaryVisibility.assertCanViewSalary).toHaveBeenCalledWith('u-1', 'emp-1');
    expect(result.summary.currentSalary).toBe(35000);
    expect(result.summary.latestNetPay).toBe(32800);
    expect(result.history).toHaveLength(1);
    expect(result.history[0].grossPay).toBe(34300);
    expect(result.history[0].baseSalary).toBe(30000);
    expect(result.history[0].mealAllowance).toBe(2000);
    expect(result.history[0].crossBorderAllowance).toBe(300);
    expect(result.history[0].crossBorderEligibleDays).toBe(3);
    expect(result.history[0].deposit).toBe(500);
    expect(result.history[0].status).toBe('paid');
  });

  it('denies access when salary visibility fails', async () => {
    const salaryVisibility = {
      assertCanViewSalary: jest.fn().mockRejectedValue(new SalaryAccessDeniedError('denied')),
    };
    const service = new PayrollService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      { assertEmployeeInCompany: jest.fn() } as never,
      {} as never,
      {} as never,
      {} as never,
      salaryVisibility as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await expect(service.getEmployeePayrollView(actor, 'emp-1', 'co-1')).rejects.toBeInstanceOf(SalaryAccessDeniedError);
  });
});
