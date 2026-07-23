// ============================================================================
// commission-adjustment.service.unit.spec.ts
// ============================================================================

import { CommissionAdjustmentService } from './commission-adjustment.service';
import {
  CommissionAdjustmentInvalidTransitionError,
  CommissionCycleNotLockedForAdjustmentError,
} from '../domain/errors/commission-adjustment.errors';

describe('CommissionAdjustmentService', () => {
  const actor = { userId: 'user-1', impersonatorUserId: null, companyId: 'company-1' };

  const repo = {
    findById: jest.fn(),
    list: jest.fn(),
    create: jest.fn(),
    updateStatus: jest.fn(),
    createEntry: jest.fn(),
    findEntryByRequest: jest.fn(),
    listEntries: jest.fn(),
    createAudit: jest.fn(),
    listAudits: jest.fn(),
    findPayrollItemBySource: jest.fn(),
    createPayrollItem: jest.fn(),
  };
  const cycles = { findById: jest.fn() };
  const adminRepo = { resolvePayCycleId: jest.fn() };
  const workflow = { start: jest.fn(), act: jest.fn() };
  const audit = { record: jest.fn() };
  const companyAccess = { assertCompanyAccess: jest.fn() };
  const prisma = {
    commissionCycle: { findFirst: jest.fn() },
    marketingCommissionMemberResult: { findFirst: jest.fn() },
    adminCommissionMemberResult: { findFirst: jest.fn() },
    commissionRecord: { findFirst: jest.fn() },
    referral: { findFirst: jest.fn() },
  };

  const service = new CommissionAdjustmentService(
    repo as never,
    cycles as never,
    adminRepo as never,
    workflow as never,
    audit as never,
    companyAccess as never,
    prisma as never,
  );

  beforeEach(() => jest.clearAllMocks());

  it('rejects create when commission cycle is not locked', async () => {
    prisma.commissionCycle.findFirst.mockResolvedValue({ id: 'cycle-1', status: 'finalized' });

    await expect(service.createAdjustment(actor, {
      companyId: 'company-1',
      earnCycleId: 'earn-1',
      type: 'marketing',
      employeeId: 'emp-1',
      reason: 'KPI miscount',
      adjustmentAmount: 500,
      direction: 'increase',
    })).rejects.toBeInstanceOf(CommissionCycleNotLockedForAdjustmentError);
  });

  it('creates draft adjustment for locked cycle', async () => {
    prisma.commissionCycle.findFirst.mockResolvedValue({ id: 'cycle-1', status: 'locked' });
    repo.create.mockResolvedValue({
      id: 'adj-1',
      companyId: 'company-1',
      earnCycleId: 'earn-1',
      commissionCycleId: 'cycle-1',
      type: 'marketing',
      teamId: null,
      employeeId: 'emp-1',
      sourceResultId: null,
      reason: 'KPI miscount',
      adjustmentAmount: 500,
      direction: 'increase',
      status: 'draft',
      workflowInstanceId: null,
      submittedBy: null,
      submittedAt: null,
      approvedBy: null,
      approvedAt: null,
      appliedBy: null,
      appliedAt: null,
      rejectedBy: null,
      rejectedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const result = await service.createAdjustment(actor, {
      companyId: 'company-1',
      earnCycleId: 'earn-1',
      type: 'marketing',
      employeeId: 'emp-1',
      reason: 'KPI miscount',
      adjustmentAmount: 500,
      direction: 'increase',
    });

    expect(result.status).toBe('draft');
    expect(repo.create).toHaveBeenCalled();
  });

  it('submit starts workflow and moves to submitted', async () => {
    repo.findById.mockResolvedValue({
      id: 'adj-1',
      companyId: 'company-1',
      earnCycleId: 'earn-1',
      commissionCycleId: 'cycle-1',
      type: 'admin',
      teamId: null,
      employeeId: 'emp-1',
      sourceResultId: null,
      reason: 'Expense correction',
      adjustmentAmount: 300,
      direction: 'decrease',
      status: 'draft',
      workflowInstanceId: null,
      submittedBy: null,
      submittedAt: null,
      approvedBy: null,
      approvedAt: null,
      appliedBy: null,
      appliedAt: null,
      rejectedBy: null,
      rejectedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    workflow.start.mockResolvedValue({ instanceId: 'wf-1' });
    repo.updateStatus.mockImplementation((_id, input) => ({
      id: 'adj-1',
      companyId: 'company-1',
      earnCycleId: 'earn-1',
      commissionCycleId: 'cycle-1',
      type: 'admin',
      teamId: null,
      employeeId: 'emp-1',
      sourceResultId: null,
      reason: 'Expense correction',
      adjustmentAmount: 300,
      direction: 'decrease',
      status: input.status,
      workflowInstanceId: input.workflowInstanceId ?? null,
      submittedBy: input.submittedBy ?? null,
      submittedAt: input.submittedAt ?? null,
      approvedBy: null,
      approvedAt: null,
      appliedBy: null,
      appliedAt: null,
      rejectedBy: null,
      rejectedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    }));

    const result = await service.submitAdjustment(actor, 'adj-1');
    expect(result.status).toBe('submitted');
    expect(workflow.start).toHaveBeenCalledWith(actor, expect.objectContaining({
      entityType: 'commission_adjustment',
      entityId: 'adj-1',
    }));
  });

  it('apply creates payroll adjustment item for finalized cycle', async () => {
    const req = {
      id: 'adj-1',
      companyId: 'company-1',
      earnCycleId: 'earn-1',
      commissionCycleId: 'cycle-1',
      type: 'admin' as const,
      teamId: null,
      employeeId: 'emp-1',
      sourceResultId: 'member-1',
      reason: 'Admin leave penalty correction',
      adjustmentAmount: 200,
      direction: 'increase' as const,
      status: 'approved' as const,
      workflowInstanceId: null,
      submittedBy: 'user-1',
      submittedAt: new Date(),
      approvedBy: 'user-1',
      approvedAt: new Date(),
      appliedBy: null,
      appliedAt: null,
      rejectedBy: null,
      rejectedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    repo.findById.mockResolvedValue(req);
    prisma.adminCommissionMemberResult.findFirst.mockResolvedValue({
      id: 'member-1',
      finalPayout: 1000,
    });
    cycles.findById.mockResolvedValue({
      id: 'cycle-1',
      status: 'locked',
    });
    repo.findPayrollItemBySource.mockResolvedValue(null);
    adminRepo.resolvePayCycleId.mockResolvedValue('pay-1');
    repo.createPayrollItem.mockResolvedValue('payroll-item-1');
    repo.createEntry.mockResolvedValue({
      id: 'entry-1',
      adjustmentRequestId: 'adj-1',
      employeeId: 'emp-1',
      sourceResultId: 'member-1',
      sourceResultType: 'admin_member',
      originalAmount: 1000,
      adjustmentAmount: 200,
      netAmount: 1200,
      payrollItemId: 'payroll-item-1',
      createdAt: new Date(),
    });
    repo.updateStatus.mockImplementation((_id, input) => ({ ...req, status: input.status, appliedBy: input.appliedBy }));

    const result = await service.applyAdjustment(actor, 'adj-1');
    expect(result.payrollItemId).toBe('payroll-item-1');
    expect(repo.createPayrollItem).toHaveBeenCalledWith(expect.objectContaining({
      amount: 200,
      sourceRefId: 'adj-1',
    }));
    expect(result.entry.netAmount).toBe(1200);
  });

  it('blocks invalid transition from draft to approve', async () => {
    repo.findById.mockResolvedValue({
      id: 'adj-1',
      companyId: 'company-1',
      earnCycleId: 'earn-1',
      commissionCycleId: 'cycle-1',
      type: 'marketing',
      teamId: null,
      employeeId: 'emp-1',
      sourceResultId: null,
      reason: 'Wrong assignment',
      adjustmentAmount: 100,
      direction: 'increase',
      status: 'draft',
      workflowInstanceId: null,
      submittedBy: null,
      submittedAt: null,
      approvedBy: null,
      approvedAt: null,
      appliedBy: null,
      appliedAt: null,
      rejectedBy: null,
      rejectedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await expect(service.approveAdjustment(actor, 'adj-1'))
      .rejects.toBeInstanceOf(CommissionAdjustmentInvalidTransitionError);
  });
});
