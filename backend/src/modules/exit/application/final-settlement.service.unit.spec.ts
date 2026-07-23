import { FinalSettlementService } from './final-settlement.service';
import { FinalSettlementInvalidStatusError } from '../domain/errors/final-settlement.errors';
import { FinalSettlementCalculatorService } from '../domain/services/final-settlement-calculator.service';

describe('FinalSettlementService', () => {
  const exitCases = {
    findById: jest.fn(),
  };
  const prisma = {
    finalPayrollSettlement: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    employeeExitCase: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'case-1',
        status: 'pending_settlement',
        refundAmount: null,
        settledAt: null,
        depositRefundId: null,
      }),
    },
  };
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  const calculator = { calculate: jest.fn() };
  const access = {
    assertCanCreateOrEdit: jest.fn().mockResolvedValue(undefined),
    assertCanRead: jest.fn().mockResolvedValue(undefined),
    assertCanSubmit: jest.fn().mockResolvedValue(undefined),
    assertCanApprove: jest.fn().mockResolvedValue(undefined),
    assertCanMarkPaid: jest.fn().mockResolvedValue(undefined),
    assertEmployeePaidSummary: jest.fn().mockResolvedValue(undefined),
  };
  const checklist = { markItemCompleteByKey: jest.fn().mockResolvedValue(undefined) };
  const telegram = {
    notifySubmitted: jest.fn().mockResolvedValue(undefined),
    notifyApproved: jest.fn().mockResolvedValue(undefined),
    notifyPaid: jest.fn().mockResolvedValue(undefined),
  };

  let service: FinalSettlementService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new FinalSettlementService(
      exitCases as never,
      prisma as never,
      audit as never,
      calculator as never,
      access as never,
      checklist as never,
      telegram as never,
    );
  });

  it('creates draft with calculated amounts', async () => {
    exitCases.findById.mockResolvedValue({
      employeeId: 'emp-1',
      companyId: 'co-1',
      exitReason: 'proper_resignation',
      toPersistence: () => ({ effectiveTerminationDate: new Date('2026-06-30') }),
    });
    prisma.finalPayrollSettlement.findUnique.mockResolvedValue(null);
    calculator.calculate.mockResolvedValue({
      payrollCycleId: 'cycle-1',
      salaryProrateAmount: 10000,
      unpaidSalaryAmount: 0,
      pendingOtAmount: 0,
      pendingCommissionAmount: 0,
      pendingBonusAmount: 0,
      advanceDeductionAmount: 0,
      equipmentDeductionAmount: 0,
      penaltyDeductionAmount: 0,
      depositReturnAmount: 5000,
      otherAdjustmentAmount: 0,
      netPayableAmount: 15000,
    });
    prisma.finalPayrollSettlement.create.mockResolvedValue({
      id: 'fs-1',
      employeeId: 'emp-1',
      exitCaseId: 'case-1',
      companyId: 'co-1',
      payrollCycleId: 'cycle-1',
      salaryProrateAmount: 10000,
      unpaidSalaryAmount: 0,
      pendingOtAmount: 0,
      pendingCommissionAmount: 0,
      pendingBonusAmount: 0,
      advanceDeductionAmount: 0,
      equipmentDeductionAmount: 0,
      penaltyDeductionAmount: 0,
      depositReturnAmount: 5000,
      otherAdjustmentAmount: 0,
      netPayableAmount: 15000,
      status: 'draft',
      createdBy: 'u1',
      reviewedBy: null,
      reviewedAt: null,
      approvedBy: null,
      approvedAt: null,
      paidBy: null,
      paidAt: null,
      cancelledBy: null,
      cancelledAt: null,
      notes: null,
      createdAt: new Date('2026-06-23'),
      updatedAt: new Date('2026-06-23'),
    });

    const result = await service.createDraft({ userId: 'u1' } as never, 'case-1');

    expect(result.status).toBe('draft');
    expect(result.netPayableAmount).toBe(15000);
    expect(result.depositSettlementStatus).toBe('preview_only');
    expect(result.depositPreviewAmount).toBe(5000);
    expect(audit.record).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: 'draft_created' }),
    );
  });

  it('submits draft and notifies owner', async () => {
    prisma.finalPayrollSettlement.findUnique.mockResolvedValue({
      id: 'fs-1',
      employeeId: 'emp-1',
      exitCaseId: 'case-1',
      companyId: 'co-1',
      payrollCycleId: null,
      salaryProrateAmount: 10000,
      unpaidSalaryAmount: 0,
      pendingOtAmount: 0,
      pendingCommissionAmount: 0,
      pendingBonusAmount: 0,
      advanceDeductionAmount: 0,
      equipmentDeductionAmount: 0,
      penaltyDeductionAmount: 0,
      depositReturnAmount: 0,
      otherAdjustmentAmount: 0,
      netPayableAmount: 10000,
      status: 'draft',
      createdBy: 'u1',
      reviewedBy: null,
      reviewedAt: null,
      approvedBy: null,
      approvedAt: null,
      paidBy: null,
      paidAt: null,
      cancelledBy: null,
      cancelledAt: null,
      notes: null,
      createdAt: new Date('2026-06-23'),
      updatedAt: new Date('2026-06-23'),
    });
    prisma.finalPayrollSettlement.update.mockResolvedValue({
      id: 'fs-1',
      employeeId: 'emp-1',
      exitCaseId: 'case-1',
      companyId: 'co-1',
      payrollCycleId: null,
      salaryProrateAmount: 10000,
      unpaidSalaryAmount: 0,
      pendingOtAmount: 0,
      pendingCommissionAmount: 0,
      pendingBonusAmount: 0,
      advanceDeductionAmount: 0,
      equipmentDeductionAmount: 0,
      penaltyDeductionAmount: 0,
      depositReturnAmount: 0,
      otherAdjustmentAmount: 0,
      netPayableAmount: 10000,
      status: 'pending_review',
      createdBy: 'u1',
      reviewedBy: 'u1',
      reviewedAt: new Date('2026-06-23'),
      approvedBy: null,
      approvedAt: null,
      paidBy: null,
      paidAt: null,
      cancelledBy: null,
      cancelledAt: null,
      notes: null,
      createdAt: new Date('2026-06-23'),
      updatedAt: new Date('2026-06-23'),
    });

    const result = await service.submit({ userId: 'u1' } as never, 'fs-1');

    expect(result.status).toBe('pending_review');
    expect(telegram.notifySubmitted).toHaveBeenCalled();
    expect(audit.record).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: 'submitted' }),
    );
  });

  it('marks paid and completes checklist item', async () => {
    prisma.finalPayrollSettlement.findUnique.mockResolvedValue({
      id: 'fs-1',
      employeeId: 'emp-1',
      exitCaseId: 'case-1',
      companyId: 'co-1',
      payrollCycleId: null,
      salaryProrateAmount: 10000,
      unpaidSalaryAmount: 0,
      pendingOtAmount: 0,
      pendingCommissionAmount: 0,
      pendingBonusAmount: 0,
      advanceDeductionAmount: 0,
      equipmentDeductionAmount: 0,
      penaltyDeductionAmount: 0,
      depositReturnAmount: 0,
      otherAdjustmentAmount: 0,
      netPayableAmount: 10000,
      status: 'approved',
      createdBy: 'u1',
      reviewedBy: 'u1',
      reviewedAt: new Date('2026-06-23'),
      approvedBy: 'owner-1',
      approvedAt: new Date('2026-06-23'),
      paidBy: null,
      paidAt: null,
      cancelledBy: null,
      cancelledAt: null,
      notes: null,
      createdAt: new Date('2026-06-23'),
      updatedAt: new Date('2026-06-23'),
    });
    prisma.finalPayrollSettlement.update.mockResolvedValue({
      id: 'fs-1',
      employeeId: 'emp-1',
      exitCaseId: 'case-1',
      companyId: 'co-1',
      payrollCycleId: null,
      salaryProrateAmount: 10000,
      unpaidSalaryAmount: 0,
      pendingOtAmount: 0,
      pendingCommissionAmount: 0,
      pendingBonusAmount: 0,
      advanceDeductionAmount: 0,
      equipmentDeductionAmount: 0,
      penaltyDeductionAmount: 0,
      depositReturnAmount: 0,
      otherAdjustmentAmount: 0,
      netPayableAmount: 10000,
      status: 'paid',
      createdBy: 'u1',
      reviewedBy: 'u1',
      reviewedAt: new Date('2026-06-23'),
      approvedBy: 'owner-1',
      approvedAt: new Date('2026-06-23'),
      paidBy: 'u1',
      paidAt: new Date('2026-06-24'),
      cancelledBy: null,
      cancelledAt: null,
      notes: null,
      createdAt: new Date('2026-06-23'),
      updatedAt: new Date('2026-06-24'),
    });

    const result = await service.markPaid({ userId: 'u1' } as never, 'fs-1');

    expect(result.status).toBe('paid');
    expect(checklist.markItemCompleteByKey).toHaveBeenCalledWith(
      expect.anything(),
      'case-1',
      'payroll_settlement_completed',
    );
    expect(telegram.notifyPaid).toHaveBeenCalled();
  });

  it('rejects update when not draft', async () => {
    prisma.finalPayrollSettlement.findUnique.mockResolvedValue({
      id: 'fs-1',
      employeeId: 'emp-1',
      exitCaseId: 'case-1',
      companyId: 'co-1',
      payrollCycleId: null,
      salaryProrateAmount: 10000,
      unpaidSalaryAmount: 0,
      pendingOtAmount: 0,
      pendingCommissionAmount: 0,
      pendingBonusAmount: 0,
      advanceDeductionAmount: 0,
      equipmentDeductionAmount: 0,
      penaltyDeductionAmount: 0,
      depositReturnAmount: 0,
      otherAdjustmentAmount: 0,
      netPayableAmount: 10000,
      status: 'pending_review',
      createdBy: 'u1',
      reviewedBy: null,
      reviewedAt: null,
      approvedBy: null,
      approvedAt: null,
      paidBy: null,
      paidAt: null,
      cancelledBy: null,
      cancelledAt: null,
      notes: null,
      createdAt: new Date('2026-06-23'),
      updatedAt: new Date('2026-06-23'),
    });

    await expect(service.update({ userId: 'u1' } as never, 'fs-1', {}))
      .rejects.toBeInstanceOf(FinalSettlementInvalidStatusError);
  });

  it('recalculates net on manual edit', async () => {
    prisma.finalPayrollSettlement.findUnique.mockResolvedValue({
      id: 'fs-1',
      employeeId: 'emp-1',
      exitCaseId: 'case-1',
      companyId: 'co-1',
      payrollCycleId: null,
      salaryProrateAmount: 10000,
      unpaidSalaryAmount: 0,
      pendingOtAmount: 0,
      pendingCommissionAmount: 0,
      pendingBonusAmount: 0,
      advanceDeductionAmount: 0,
      equipmentDeductionAmount: 0,
      penaltyDeductionAmount: 0,
      depositReturnAmount: 0,
      otherAdjustmentAmount: 0,
      netPayableAmount: 10000,
      status: 'draft',
      createdBy: 'u1',
      reviewedBy: null,
      reviewedAt: null,
      approvedBy: null,
      approvedAt: null,
      paidBy: null,
      paidAt: null,
      cancelledBy: null,
      cancelledAt: null,
      notes: null,
      createdAt: new Date('2026-06-23'),
      updatedAt: new Date('2026-06-23'),
    });
    prisma.finalPayrollSettlement.update.mockImplementation(({ data }) => ({
      id: 'fs-1',
      employeeId: 'emp-1',
      exitCaseId: 'case-1',
      companyId: 'co-1',
      payrollCycleId: null,
      salaryProrateAmount: 10000,
      unpaidSalaryAmount: 0,
      pendingOtAmount: 0,
      pendingCommissionAmount: 0,
      pendingBonusAmount: data.pendingBonusAmount,
      advanceDeductionAmount: 0,
      equipmentDeductionAmount: 0,
      penaltyDeductionAmount: 0,
      depositReturnAmount: 0,
      otherAdjustmentAmount: data.otherAdjustmentAmount,
      netPayableAmount: data.netPayableAmount,
      status: 'draft',
      createdBy: 'u1',
      reviewedBy: null,
      reviewedAt: null,
      approvedBy: null,
      approvedAt: null,
      paidBy: null,
      paidAt: null,
      cancelledBy: null,
      cancelledAt: null,
      notes: data.notes,
      createdAt: new Date('2026-06-23'),
      updatedAt: new Date('2026-06-23'),
    }));

    const result = await service.update({ userId: 'u1' } as never, 'fs-1', {
      pendingBonusAmount: 500,
      otherAdjustmentAmount: -100,
      notes: 'manual bonus',
    });

    expect(result.netPayableAmount).toBe(
      FinalSettlementCalculatorService.computeNetPayable({
        salaryProrateAmount: 10000,
        unpaidSalaryAmount: 0,
        pendingOtAmount: 0,
        pendingCommissionAmount: 0,
        pendingBonusAmount: 500,
        advanceDeductionAmount: 0,
        equipmentDeductionAmount: 0,
        penaltyDeductionAmount: 0,
        depositReturnAmount: 0,
        otherAdjustmentAmount: -100,
      }),
    );
  });

  it('recalculates draft preserving manual bonus and adjustments', async () => {
    exitCases.findById.mockResolvedValue({
      employeeId: 'emp-1',
      companyId: 'co-1',
      exitReason: 'proper_resignation',
      toPersistence: () => ({ effectiveTerminationDate: new Date('2026-06-30') }),
    });
    prisma.finalPayrollSettlement.findUnique.mockResolvedValue({
      id: 'fs-1',
      employeeId: 'emp-1',
      exitCaseId: 'case-1',
      companyId: 'co-1',
      payrollCycleId: null,
      salaryProrateAmount: 10000,
      unpaidSalaryAmount: 0,
      pendingOtAmount: 0,
      pendingCommissionAmount: 0,
      pendingBonusAmount: 2500,
      advanceDeductionAmount: 0,
      equipmentDeductionAmount: 0,
      penaltyDeductionAmount: 0,
      depositReturnAmount: 0,
      otherAdjustmentAmount: -50,
      netPayableAmount: 12450,
      status: 'draft',
      createdBy: 'u1',
      reviewedBy: null,
      reviewedAt: null,
      approvedBy: null,
      approvedAt: null,
      paidBy: null,
      paidAt: null,
      cancelledBy: null,
      cancelledAt: null,
      notes: 'keep',
      createdAt: new Date('2026-06-23'),
      updatedAt: new Date('2026-06-23'),
    });
    calculator.calculate.mockResolvedValue({
      payrollCycleId: 'cycle-1',
      salaryProrateAmount: 12000,
      unpaidSalaryAmount: 1000,
      pendingOtAmount: 0,
      pendingCommissionAmount: 0,
      pendingBonusAmount: 0,
      advanceDeductionAmount: 100,
      equipmentDeductionAmount: 0,
      penaltyDeductionAmount: 0,
      depositReturnAmount: 500,
      otherAdjustmentAmount: 0,
      netPayableAmount: 13400,
    });
    prisma.finalPayrollSettlement.update.mockImplementation(({ data }) => ({
      id: 'fs-1',
      employeeId: 'emp-1',
      exitCaseId: 'case-1',
      companyId: 'co-1',
      payrollCycleId: data.payrollCycleId,
      salaryProrateAmount: data.salaryProrateAmount,
      unpaidSalaryAmount: data.unpaidSalaryAmount,
      pendingOtAmount: data.pendingOtAmount,
      pendingCommissionAmount: data.pendingCommissionAmount,
      pendingBonusAmount: data.pendingBonusAmount,
      advanceDeductionAmount: data.advanceDeductionAmount,
      equipmentDeductionAmount: data.equipmentDeductionAmount,
      penaltyDeductionAmount: data.penaltyDeductionAmount,
      depositReturnAmount: data.depositReturnAmount,
      otherAdjustmentAmount: -50,
      netPayableAmount: data.netPayableAmount,
      status: 'draft',
      createdBy: 'u1',
      reviewedBy: null,
      reviewedAt: null,
      approvedBy: null,
      approvedAt: null,
      paidBy: null,
      paidAt: null,
      cancelledBy: null,
      cancelledAt: null,
      notes: 'keep',
      createdAt: new Date('2026-06-23'),
      updatedAt: new Date('2026-06-23'),
    }));

    const result = await service.recalculate({ userId: 'u1' } as never, 'fs-1');

    expect(result.salaryProrateAmount).toBe(12000);
    expect(result.pendingBonusAmount).toBe(2500);
    expect(result.otherAdjustmentAmount).toBe(-50);
    expect(audit.record).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: 'recalculated' }),
    );
  });
});
