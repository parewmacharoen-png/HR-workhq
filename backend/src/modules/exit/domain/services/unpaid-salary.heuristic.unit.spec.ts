import {
  sumUnpaidSalaryItems,
  UNPAID_SALARY_CYCLE_STATUSES,
  UNPAID_SALARY_PARTIAL_PAID_TODO,
} from './unpaid-salary.heuristic';
import { FinalSettlementCalculatorService } from './final-settlement-calculator.service';

describe('unpaid salary heuristic (PAY-005c)', () => {
  it('sums salary item amounts with two-decimal rounding', () => {
    expect(sumUnpaidSalaryItems([{ amount: 10000 }, { amount: 5000.005 }])).toBe(15000.01);
  });

  it('documents eligible cycle statuses', () => {
    expect(UNPAID_SALARY_CYCLE_STATUSES).toEqual(['open', 'locked']);
  });

  it('documents partial-paid limitation', () => {
    expect(UNPAID_SALARY_PARTIAL_PAID_TODO).toContain('PAY-005c');
  });
});

describe('FinalSettlementCalculatorService.sumUnpaidSalary', () => {
  const prisma = {
    payrollCycle: { findMany: jest.fn() },
    payrollItem: { findMany: jest.fn() },
  };
  const depositRead = {} as never;
  const deposits = {} as never;
  const lateDeductions = {} as never;
  const absenceDeductions = {} as never;

  let calculator: FinalSettlementCalculatorService;

  beforeEach(() => {
    jest.clearAllMocks();
    calculator = new FinalSettlementCalculatorService(
      prisma as never,
      depositRead,
      deposits,
      lateDeductions,
      absenceDeductions,
    );
  });

  it('includes salary from open cycles excluding current cycle', async () => {
    prisma.payrollCycle.findMany.mockResolvedValue([
      { id: 'cycle-open', status: 'open' },
    ]);
    prisma.payrollItem.findMany.mockResolvedValue([{ amount: 15000 }]);

    const total = await calculator.sumUnpaidSalary('emp-1', 'co-1', 'cycle-current');

    expect(prisma.payrollCycle.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        status: { in: ['open', 'locked'] },
        id: { not: 'cycle-current' },
      }),
    }));
    expect(total).toBe(15000);
  });

  it('includes salary from locked cycles', async () => {
    prisma.payrollCycle.findMany.mockResolvedValue([
      { id: 'cycle-locked', status: 'locked' },
    ]);
    prisma.payrollItem.findMany.mockResolvedValue([{ amount: 8000 }]);

    const total = await calculator.sumUnpaidSalary('emp-1', 'co-1', null);
    expect(total).toBe(8000);
  });

  it('returns zero when no eligible cycles exist (paid cycles excluded by query)', async () => {
    prisma.payrollCycle.findMany.mockResolvedValue([]);
    const total = await calculator.sumUnpaidSalary('emp-1', 'co-1', null);
    expect(total).toBe(0);
    expect(prisma.payrollItem.findMany).not.toHaveBeenCalled();
  });
});
