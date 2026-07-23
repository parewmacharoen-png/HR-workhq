// ============================================================================
// modules/exit/application/final-settlement.service.ts
// PAY-005 — final payroll settlement workflow.
// ============================================================================

import { Inject, Injectable, Optional, forwardRef } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { ActorContext } from '../../../shared/kernel/actor-context';
import { AuditService } from '../../../shared/audit/audit.service';
import { EXIT_CASE_REPOSITORY, ExitCaseRepository } from '../domain/repositories/exit-case.repository';
import { ExitCaseNotFoundError } from '../domain/errors/exit.errors';
import {
  FinalSettlementAlreadyExistsError,
  FinalSettlementForExitNotFoundError,
  FinalSettlementInvalidStatusError,
  FinalSettlementNotFoundError,
} from '../domain/errors/final-settlement.errors';
import { FinalSettlementCalculatorService } from '../domain/services/final-settlement-calculator.service';
import { ExitReason } from '../domain/services/exit-reason-policy.service';
import { FinalSettlementAccessService } from './final-settlement-access.service';
import { ExitChecklistService } from './exit-checklist.service';
import {
  DepositSettlementStatus,
  EmployeePaidSettlementSummary,
  FinalSettlementResponse,
  FinalSettlementStatus,
  UpdateFinalSettlementDto,
} from './dto/final-settlement.dto';
import { FinalSettlementTelegramNotifier } from '../../telegram/application/final-settlement.notifier';
import { TelegramApprovalNotifier } from '../../telegram/application/telegram-approval.notifier';
import { DateProvider } from '../../../shared/time/date.provider';

@Injectable()
export class FinalSettlementService {
  constructor(
    @Inject(EXIT_CASE_REPOSITORY) private readonly exitCases: ExitCaseRepository,
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly calculator: FinalSettlementCalculatorService,
    private readonly access: FinalSettlementAccessService,
    private readonly checklist: ExitChecklistService,
    private readonly dates: DateProvider,
    @Optional() @Inject(forwardRef(() => FinalSettlementTelegramNotifier))
    private readonly telegram?: FinalSettlementTelegramNotifier,
    @Optional() @Inject(forwardRef(() => TelegramApprovalNotifier))
    private readonly approvalNotifier?: TelegramApprovalNotifier,
  ) {}

  async createDraft(actor: ActorContext, exitCaseId: string): Promise<FinalSettlementResponse> {
    const exitCase = await this.requireExitCase(exitCaseId);
    await this.access.assertCanCreateOrEdit(actor, exitCase.companyId);

    const existing = await this.prisma.finalPayrollSettlement.findUnique({
      where: { exitCaseId },
    });
    if (existing) throw new FinalSettlementAlreadyExistsError();

    const calc = await this.calculator.calculate({
      employeeId: exitCase.employeeId,
      companyId: exitCase.companyId,
      exitCaseId,
      exitReason: exitCase.exitReason as ExitReason,
      effectiveTerminationDate: exitCase.toPersistence().effectiveTerminationDate,
    });

    const row = await this.prisma.finalPayrollSettlement.create({
      data: {
        id: randomUUID(),
        employeeId: exitCase.employeeId,
        exitCaseId,
        companyId: exitCase.companyId,
        payrollCycleId: calc.payrollCycleId,
        salaryProrateAmount: new Prisma.Decimal(calc.salaryProrateAmount),
        unpaidSalaryAmount: new Prisma.Decimal(calc.unpaidSalaryAmount),
        pendingOtAmount: new Prisma.Decimal(calc.pendingOtAmount),
        pendingCommissionAmount: new Prisma.Decimal(calc.pendingCommissionAmount),
        pendingBonusAmount: new Prisma.Decimal(calc.pendingBonusAmount),
        advanceDeductionAmount: new Prisma.Decimal(calc.advanceDeductionAmount),
        equipmentDeductionAmount: new Prisma.Decimal(calc.equipmentDeductionAmount),
        penaltyDeductionAmount: new Prisma.Decimal(calc.penaltyDeductionAmount),
        depositReturnAmount: new Prisma.Decimal(calc.depositReturnAmount),
        otherAdjustmentAmount: new Prisma.Decimal(calc.otherAdjustmentAmount),
        netPayableAmount: new Prisma.Decimal(calc.netPayableAmount),
        status: 'draft',
        createdBy: actor.userId,
      },
    });

    await this.audit.record(actor, {
      entityType: 'FinalPayrollSettlement',
      entityId: row.id,
      action: 'draft_created',
      after: row,
    });

    return this.toResponse(row, await this.resolveDepositMeta(exitCaseId, calc.depositReturnAmount));
  }

  async recalculate(actor: ActorContext, id: string): Promise<FinalSettlementResponse> {
    const row = await this.requireSettlement(id);
    await this.access.assertCanCreateOrEdit(actor, row.companyId);
    if (row.status !== 'draft') {
      throw new FinalSettlementInvalidStatusError('Only draft settlements can be recalculated');
    }

    const exitCase = await this.requireExitCase(row.exitCaseId);
    const calc = await this.calculator.calculate({
      employeeId: row.employeeId,
      companyId: row.companyId,
      exitCaseId: row.exitCaseId,
      exitReason: exitCase.exitReason as ExitReason,
      effectiveTerminationDate: exitCase.toPersistence().effectiveTerminationDate,
    });

    const preservedBonus = Number(row.pendingBonusAmount);
    const pendingBonusAmount = preservedBonus !== calc.pendingBonusAmount
      ? preservedBonus
      : calc.pendingBonusAmount;
    const otherAdjustmentAmount = Number(row.otherAdjustmentAmount);
    const netPayableAmount = FinalSettlementCalculatorService.computeNetPayable({
      salaryProrateAmount: calc.salaryProrateAmount,
      unpaidSalaryAmount: calc.unpaidSalaryAmount,
      pendingOtAmount: calc.pendingOtAmount,
      pendingCommissionAmount: calc.pendingCommissionAmount,
      pendingBonusAmount,
      advanceDeductionAmount: calc.advanceDeductionAmount,
      equipmentDeductionAmount: calc.equipmentDeductionAmount,
      penaltyDeductionAmount: calc.penaltyDeductionAmount,
      depositReturnAmount: calc.depositReturnAmount,
      otherAdjustmentAmount,
    });

    const before = { ...row };
    const updated = await this.prisma.finalPayrollSettlement.update({
      where: { id },
      data: {
        payrollCycleId: calc.payrollCycleId,
        salaryProrateAmount: new Prisma.Decimal(calc.salaryProrateAmount),
        unpaidSalaryAmount: new Prisma.Decimal(calc.unpaidSalaryAmount),
        pendingOtAmount: new Prisma.Decimal(calc.pendingOtAmount),
        pendingCommissionAmount: new Prisma.Decimal(calc.pendingCommissionAmount),
        pendingBonusAmount: new Prisma.Decimal(pendingBonusAmount),
        advanceDeductionAmount: new Prisma.Decimal(calc.advanceDeductionAmount),
        equipmentDeductionAmount: new Prisma.Decimal(calc.equipmentDeductionAmount),
        penaltyDeductionAmount: new Prisma.Decimal(calc.penaltyDeductionAmount),
        depositReturnAmount: new Prisma.Decimal(calc.depositReturnAmount),
        netPayableAmount: new Prisma.Decimal(netPayableAmount),
      },
    });

    await this.audit.record(actor, {
      entityType: 'FinalPayrollSettlement',
      entityId: id,
      action: 'recalculated',
      before,
      after: updated,
    });

    return this.toResponse(updated, await this.resolveDepositMeta(row.exitCaseId, calc.depositReturnAmount));
  }

  async getEmployeePaidSummary(
    actor: ActorContext,
    employeeId: string,
  ): Promise<EmployeePaidSettlementSummary> {
    await this.access.assertEmployeePaidSummary(actor, employeeId);

    const row = await this.prisma.finalPayrollSettlement.findFirst({
      where: { employeeId, status: 'paid' },
      orderBy: { paidAt: 'desc' },
    });
    if (!row?.paidAt) {
      throw new FinalSettlementNotFoundError(employeeId);
    }

    return this.toEmployeeSummary(row);
  }

  async getByExitCase(actor: ActorContext, exitCaseId: string): Promise<FinalSettlementResponse> {
    const exitCase = await this.requireExitCase(exitCaseId);
    const row = await this.prisma.finalPayrollSettlement.findUnique({ where: { exitCaseId } });
    if (!row) throw new FinalSettlementForExitNotFoundError(exitCaseId);
    await this.access.assertCanRead(actor, exitCase.employeeId, exitCase.companyId, row.status as FinalSettlementStatus);
    return this.toResponse(row, await this.resolveDepositMeta(exitCaseId, Number(row.depositReturnAmount)));
  }

  async getById(actor: ActorContext, id: string): Promise<FinalSettlementResponse> {
    const row = await this.requireSettlement(id);
    await this.access.assertCanRead(actor, row.employeeId, row.companyId, row.status as FinalSettlementStatus);
    return this.toResponse(row, await this.resolveDepositMeta(row.exitCaseId, Number(row.depositReturnAmount)));
  }

  async update(actor: ActorContext, id: string, dto: UpdateFinalSettlementDto): Promise<FinalSettlementResponse> {
    const row = await this.requireSettlement(id);
    await this.access.assertCanCreateOrEdit(actor, row.companyId);
    if (row.status !== 'draft') {
      throw new FinalSettlementInvalidStatusError('Only draft settlements can be edited');
    }

    const before = { ...row };
    const pendingBonusAmount = dto.pendingBonusAmount ?? Number(row.pendingBonusAmount);
    const otherAdjustmentAmount = dto.otherAdjustmentAmount ?? Number(row.otherAdjustmentAmount);
    const netPayableAmount = FinalSettlementCalculatorService.computeNetPayable({
      salaryProrateAmount: Number(row.salaryProrateAmount),
      unpaidSalaryAmount: Number(row.unpaidSalaryAmount),
      pendingOtAmount: Number(row.pendingOtAmount),
      pendingCommissionAmount: Number(row.pendingCommissionAmount),
      pendingBonusAmount,
      advanceDeductionAmount: Number(row.advanceDeductionAmount),
      equipmentDeductionAmount: Number(row.equipmentDeductionAmount),
      penaltyDeductionAmount: Number(row.penaltyDeductionAmount),
      depositReturnAmount: Number(row.depositReturnAmount),
      otherAdjustmentAmount,
    });

    const updated = await this.prisma.finalPayrollSettlement.update({
      where: { id },
      data: {
        pendingBonusAmount: new Prisma.Decimal(pendingBonusAmount),
        otherAdjustmentAmount: new Prisma.Decimal(otherAdjustmentAmount),
        netPayableAmount: new Prisma.Decimal(netPayableAmount),
        notes: dto.notes ?? row.notes,
      },
    });

    await this.audit.record(actor, {
      entityType: 'FinalPayrollSettlement',
      entityId: id,
      action: 'edited',
      before,
      after: updated,
    });

    return this.toResponse(updated, await this.resolveDepositMeta(row.exitCaseId, Number(updated.depositReturnAmount)));
  }

  private async respond(row: Awaited<ReturnType<FinalSettlementService['requireSettlement']>>): Promise<FinalSettlementResponse> {
    return this.toResponse(row, await this.resolveDepositMeta(row.exitCaseId, Number(row.depositReturnAmount)));
  }

  async submit(actor: ActorContext, id: string): Promise<FinalSettlementResponse> {
    const row = await this.requireSettlement(id);
    await this.access.assertCanSubmit(actor, row.companyId);
    if (row.status !== 'draft') {
      throw new FinalSettlementInvalidStatusError('Only draft settlements can be submitted');
    }

    const before = { ...row };
    const now = this.dates.now();
    const updated = await this.prisma.finalPayrollSettlement.update({
      where: { id },
      data: {
        status: 'pending_review',
        reviewedBy: actor.userId,
        reviewedAt: now,
      },
    });

    await this.audit.record(actor, {
      entityType: 'FinalPayrollSettlement',
      entityId: id,
      action: 'submitted',
      before,
      after: updated,
    });

    const response = await this.respond(updated);
    if (this.telegram) {
      await this.telegram.notifySubmitted({
        companyId: row.companyId,
        settlementId: id,
        employeeId: row.employeeId,
        netPayableAmount: response.netPayableAmount,
      }).catch(() => undefined);
    }
    await this.pushSettlementApproval(id, row, response.netPayableAmount);
    return response;
  }

  async reject(actor: ActorContext, id: string, reason: string): Promise<FinalSettlementResponse> {
    const row = await this.requireSettlement(id);
    await this.access.assertCanApprove(actor, row.companyId);
    if (row.status !== 'pending_review') {
      throw new FinalSettlementInvalidStatusError('Settlement is not pending review');
    }

    const before = { ...row };
    const updated = await this.prisma.finalPayrollSettlement.update({
      where: { id },
      data: {
        status: 'draft',
        notes: reason,
      },
    });

    await this.audit.record(actor, {
      entityType: 'FinalPayrollSettlement',
      entityId: id,
      action: 'rejected',
      before,
      after: updated,
    });

    return this.respond(updated);
  }

  private async pushSettlementApproval(
    settlementId: string,
    row: { companyId: string; employeeId: string },
    netPayableAmount: number,
  ): Promise<void> {
    if (!this.approvalNotifier) return;
    const [employee, company] = await Promise.all([
      this.prisma.employee.findFirst({
        where: { id: row.employeeId, deletedAt: null },
        select: { firstName: true, lastName: true },
      }),
      this.prisma.company.findFirst({ where: { id: row.companyId, deletedAt: null }, select: { name: true } }),
    ]);
    const ownerIds = await this.resolveOwnerUserIds(row.companyId);
    await this.approvalNotifier.notifyCustomApproval({
      reviewType: 'exit_settlement',
      reviewId: settlementId,
      approverUserIds: ownerIds,
      display: {
        requestTypeLabel: 'อนุมัติค่าจ้างสุดท้าย',
        requesterName: employee ? `${employee.firstName} ${employee.lastName}` : '—',
        companyName: company?.name ?? '—',
        teamName: null,
        createdAt: this.dates.now().toISOString().slice(0, 16).replace('T', ' '),
        keyDetails: `ยอดสุทธิ: ฿${netPayableAmount.toLocaleString('th-TH')}`,
      },
    });
  }

  private async resolveOwnerUserIds(companyId: string): Promise<string[]> {
    const assignments = await this.prisma.businessRoleAssignment.findMany({
      where: { role: 'owner', isActive: true, deletedAt: null },
      select: { userId: true },
    });
    const ids: string[] = [];
    for (const a of assignments) {
      const user = await this.prisma.user.findFirst({
        where: { id: a.userId, deletedAt: null, isActive: true },
        include: { scopeGrants: { where: { deletedAt: null } } },
      });
      if (!user) continue;
      if (user.scopeGrants.some((g) => g.scopeType === 'all'
        || (g.scopeType === 'company' && g.companyId === companyId))) {
        ids.push(user.id);
      }
    }
    return ids;
  }

  async approve(actor: ActorContext, id: string): Promise<FinalSettlementResponse> {
    const row = await this.requireSettlement(id);
    await this.access.assertCanApprove(actor, row.companyId);
    if (row.status !== 'pending_review') {
      throw new FinalSettlementInvalidStatusError('Settlement is not pending review');
    }

    const before = { ...row };
    const now = this.dates.now();
    const updated = await this.prisma.finalPayrollSettlement.update({
      where: { id },
      data: {
        status: 'approved',
        approvedBy: actor.userId,
        approvedAt: now,
      },
    });

    await this.audit.record(actor, {
      entityType: 'FinalPayrollSettlement',
      entityId: id,
      action: 'approved',
      before,
      after: updated,
    });

    const response = await this.respond(updated);
    if (this.telegram) {
      await this.telegram.notifyApproved({
        companyId: row.companyId,
        settlementId: id,
        employeeId: row.employeeId,
        netPayableAmount: response.netPayableAmount,
      }).catch(() => undefined);
    }
    return response;
  }

  async markPaid(actor: ActorContext, id: string): Promise<FinalSettlementResponse> {
    const row = await this.requireSettlement(id);
    await this.access.assertCanMarkPaid(actor, row.companyId);
    if (row.status !== 'approved') {
      throw new FinalSettlementInvalidStatusError('Settlement must be approved before marking paid');
    }

    const before = { ...row };
    const now = this.dates.now();
    const updated = await this.prisma.finalPayrollSettlement.update({
      where: { id },
      data: {
        status: 'paid',
        paidBy: actor.userId,
        paidAt: now,
      },
    });

    await this.checklist.markItemCompleteByKey(actor, row.exitCaseId, 'payroll_settlement_completed');

    await this.audit.record(actor, {
      entityType: 'FinalPayrollSettlement',
      entityId: id,
      action: 'paid',
      before,
      after: updated,
    });

    const response = await this.respond(updated);
    if (this.telegram) {
      await this.telegram.notifyPaid({
        companyId: row.companyId,
        settlementId: id,
        employeeId: row.employeeId,
        netPayableAmount: response.netPayableAmount,
        paidAt: response.paidAt ?? now.toISOString(),
        summaryPath: `/me/final-settlement`,
      }).catch(() => undefined);
    }
    return response;
  }

  async cancel(actor: ActorContext, id: string): Promise<FinalSettlementResponse> {
    const row = await this.requireSettlement(id);
    await this.access.assertCanCancel(actor, row.companyId);
    if (row.status === 'paid' || row.status === 'cancelled') {
      throw new FinalSettlementInvalidStatusError('Settlement cannot be cancelled');
    }

    const before = { ...row };
    const now = this.dates.now();
    const updated = await this.prisma.finalPayrollSettlement.update({
      where: { id },
      data: {
        status: 'cancelled',
        cancelledBy: actor.userId,
        cancelledAt: now,
      },
    });

    await this.audit.record(actor, {
      entityType: 'FinalPayrollSettlement',
      entityId: id,
      action: 'cancelled',
      before,
      after: updated,
    });

    return this.respond(updated);
  }

  private async resolveDepositMeta(
    exitCaseId: string,
    previewAmount: number,
  ): Promise<{
    depositPreviewAmount: number;
    depositSettledAmount: number | null;
    depositSettlementStatus: DepositSettlementStatus;
  }> {
    const exitCase = await this.prisma.employeeExitCase.findUnique({ where: { id: exitCaseId } });
    const depositSettledAmount = exitCase?.refundAmount != null
      ? Number(exitCase.refundAmount)
      : null;
    const depositSettled = Boolean(
      exitCase?.settledAt
      || exitCase?.depositRefundId
      || exitCase?.status === 'settled'
      || exitCase?.status === 'closed',
    );

    let depositSettlementStatus: DepositSettlementStatus;
    if (depositSettled && depositSettledAmount != null) {
      depositSettlementStatus = 'settled';
    } else if (previewAmount > 0) {
      depositSettlementStatus = 'preview_only';
    } else {
      depositSettlementStatus = 'not_applicable';
    }

    return {
      depositPreviewAmount: previewAmount,
      depositSettledAmount: depositSettled ? depositSettledAmount : null,
      depositSettlementStatus,
    };
  }

  private toEmployeeSummary(row: {
    id: string;
    exitCaseId: string;
    paidAt: Date | null;
    salaryProrateAmount: Prisma.Decimal;
    unpaidSalaryAmount: Prisma.Decimal;
    pendingOtAmount: Prisma.Decimal;
    pendingCommissionAmount: Prisma.Decimal;
    pendingBonusAmount: Prisma.Decimal;
    advanceDeductionAmount: Prisma.Decimal;
    equipmentDeductionAmount: Prisma.Decimal;
    penaltyDeductionAmount: Prisma.Decimal;
    depositReturnAmount: Prisma.Decimal;
    otherAdjustmentAmount: Prisma.Decimal;
    netPayableAmount: Prisma.Decimal;
  }): EmployeePaidSettlementSummary {
    const lines = {
      salaryProrateAmount: Number(row.salaryProrateAmount),
      unpaidSalaryAmount: Number(row.unpaidSalaryAmount),
      pendingOtAmount: Number(row.pendingOtAmount),
      pendingCommissionAmount: Number(row.pendingCommissionAmount),
      pendingBonusAmount: Number(row.pendingBonusAmount),
      advanceDeductionAmount: Number(row.advanceDeductionAmount),
      equipmentDeductionAmount: Number(row.equipmentDeductionAmount),
      penaltyDeductionAmount: Number(row.penaltyDeductionAmount),
      otherAdjustmentAmount: Number(row.otherAdjustmentAmount),
    };
    const totalAdditions = roundMoney(
      lines.salaryProrateAmount
      + lines.unpaidSalaryAmount
      + lines.pendingOtAmount
      + lines.pendingCommissionAmount
      + lines.pendingBonusAmount
      + Math.max(0, lines.otherAdjustmentAmount),
    );
    const totalDeductions = roundMoney(
      lines.advanceDeductionAmount
      + lines.equipmentDeductionAmount
      + lines.penaltyDeductionAmount
      + Math.max(0, -lines.otherAdjustmentAmount),
    );

    return {
      id: row.id,
      exitCaseId: row.exitCaseId,
      paidAt: row.paidAt!.toISOString(),
      totalAdditions,
      totalDeductions,
      depositReturn: Number(row.depositReturnAmount),
      netPaidAmount: Number(row.netPayableAmount),
      lines,
    };
  }

  private async requireExitCase(id: string) {
    const exitCase = await this.exitCases.findById(id);
    if (!exitCase) throw new ExitCaseNotFoundError(id);
    return exitCase;
  }

  private async requireSettlement(id: string) {
    const row = await this.prisma.finalPayrollSettlement.findUnique({ where: { id } });
    if (!row) throw new FinalSettlementNotFoundError(id);
    return row;
  }

  private toResponse(row: {
    id: string;
    employeeId: string;
    exitCaseId: string;
    companyId: string;
    payrollCycleId: string | null;
    salaryProrateAmount: Prisma.Decimal;
    unpaidSalaryAmount: Prisma.Decimal;
    pendingOtAmount: Prisma.Decimal;
    pendingCommissionAmount: Prisma.Decimal;
    pendingBonusAmount: Prisma.Decimal;
    advanceDeductionAmount: Prisma.Decimal;
    equipmentDeductionAmount: Prisma.Decimal;
    penaltyDeductionAmount: Prisma.Decimal;
    depositReturnAmount: Prisma.Decimal;
    otherAdjustmentAmount: Prisma.Decimal;
    netPayableAmount: Prisma.Decimal;
    status: string;
    createdBy: string;
    reviewedBy: string | null;
    reviewedAt: Date | null;
    approvedBy: string | null;
    approvedAt: Date | null;
    paidBy: string | null;
    paidAt: Date | null;
    cancelledBy: string | null;
    cancelledAt: Date | null;
    notes: string | null;
    createdAt: Date;
    updatedAt: Date;
  }, deposit: {
    depositPreviewAmount: number;
    depositSettledAmount: number | null;
    depositSettlementStatus: DepositSettlementStatus;
  }): FinalSettlementResponse {
    return {
      id: row.id,
      employeeId: row.employeeId,
      exitCaseId: row.exitCaseId,
      companyId: row.companyId,
      payrollCycleId: row.payrollCycleId,
      salaryProrateAmount: Number(row.salaryProrateAmount),
      unpaidSalaryAmount: Number(row.unpaidSalaryAmount),
      pendingOtAmount: Number(row.pendingOtAmount),
      pendingCommissionAmount: Number(row.pendingCommissionAmount),
      pendingBonusAmount: Number(row.pendingBonusAmount),
      advanceDeductionAmount: Number(row.advanceDeductionAmount),
      equipmentDeductionAmount: Number(row.equipmentDeductionAmount),
      penaltyDeductionAmount: Number(row.penaltyDeductionAmount),
      depositReturnAmount: Number(row.depositReturnAmount),
      otherAdjustmentAmount: Number(row.otherAdjustmentAmount),
      netPayableAmount: Number(row.netPayableAmount),
      depositPreviewAmount: deposit.depositPreviewAmount,
      depositSettledAmount: deposit.depositSettledAmount,
      depositSettlementStatus: deposit.depositSettlementStatus,
      status: row.status as FinalSettlementStatus,
      createdBy: row.createdBy,
      reviewedBy: row.reviewedBy,
      reviewedAt: row.reviewedAt?.toISOString() ?? null,
      approvedBy: row.approvedBy,
      approvedAt: row.approvedAt?.toISOString() ?? null,
      paidBy: row.paidBy,
      paidAt: row.paidAt?.toISOString() ?? null,
      cancelledBy: row.cancelledBy,
      cancelledAt: row.cancelledAt?.toISOString() ?? null,
      notes: row.notes,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}
