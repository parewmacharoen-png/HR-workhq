// ============================================================================
// modules/commission/application/commission-adjustment.service.ts
// Post-lock commission corrections via workflow approval — never direct edits.
// ============================================================================

import { Inject, Injectable } from '@nestjs/common';
import {
  COMMISSION_ADJUSTMENT_REPOSITORY,
  CommissionAdjustmentRepository,
  CommissionAdjustmentRow,
  CommissionAdjustmentSourceType,
} from '../domain/repositories/commission-adjustment.repository';
import {
  COMMISSION_FINALIZATION_REPOSITORY,
  CommissionFinalizationRepository,
  CommissionCycleType,
} from '../domain/repositories/commission-finalization.repository';
import { ADMIN_COMMISSION_REPOSITORY, AdminCommissionRepository } from '../domain/repositories/admin-commission.repository';
import {
  CommissionAdjustmentAlreadyAppliedError,
  CommissionAdjustmentInvalidTransitionError,
  CommissionAdjustmentNotFoundError,
  CommissionAdjustmentSourceNotFoundError,
  CommissionCycleNotLockedForAdjustmentError,
} from '../domain/errors/commission-adjustment.errors';
import {
  CommissionAdjustmentEntryResponse,
  CommissionAdjustmentResponse,
  toCommissionAdjustmentAuditResponse,
  toCommissionAdjustmentEntryResponse,
  toCommissionAdjustmentResponse,
} from './dto/commission-adjustment.dto';
import { WorkflowService } from '../../workflow/application/workflow.service';
import { AuditService } from '../../../shared/audit/audit.service';
import { ActorContext } from '../../../shared/kernel/actor-context';
import { CompanyAccessService } from '../../../shared/kernel/company-access.service';
import { PrismaService } from '../../../shared/prisma/prisma.service';

export interface CreateCommissionAdjustmentDto {
  companyId: string;
  earnCycleId: string;
  type: CommissionCycleType;
  teamId?: string;
  employeeId: string;
  sourceResultId?: string;
  reason: string;
  adjustmentAmount: number;
  direction: 'increase' | 'decrease';
}

@Injectable()
export class CommissionAdjustmentService {
  constructor(
    @Inject(COMMISSION_ADJUSTMENT_REPOSITORY)
    private readonly repo: CommissionAdjustmentRepository,
    @Inject(COMMISSION_FINALIZATION_REPOSITORY)
    private readonly cycles: CommissionFinalizationRepository,
    @Inject(ADMIN_COMMISSION_REPOSITORY)
    private readonly adminRepo: AdminCommissionRepository,
    private readonly workflow: WorkflowService,
    private readonly audit: AuditService,
    private readonly companyAccess: CompanyAccessService,
    private readonly prisma: PrismaService,
  ) {}

  async createAdjustment(
    actor: ActorContext,
    dto: CreateCommissionAdjustmentDto,
  ): Promise<CommissionAdjustmentResponse> {
    await this.companyAccess.assertCompanyAccess(actor, dto.companyId);
    if (dto.adjustmentAmount <= 0) {
      throw new CommissionAdjustmentSourceNotFoundError('adjustmentAmount must be positive');
    }

    const cycle = await this.prisma.commissionCycle.findFirst({
      where: {
        companyId: dto.companyId,
        earnCycleId: dto.earnCycleId,
        type: dto.type,
        ...(dto.teamId ? { teamId: dto.teamId } : {}),
        deletedAt: null,
      },
    });
    if (!cycle || cycle.status !== 'locked') {
      throw new CommissionCycleNotLockedForAdjustmentError();
    }

    const row = await this.repo.create({
      companyId: dto.companyId,
      earnCycleId: dto.earnCycleId,
      commissionCycleId: cycle.id,
      type: dto.type,
      teamId: dto.teamId ?? null,
      employeeId: dto.employeeId,
      sourceResultId: dto.sourceResultId ?? null,
      reason: dto.reason,
      adjustmentAmount: dto.adjustmentAmount,
      direction: dto.direction,
      actorUserId: actor.userId,
    });

    await this.audit.record(actor, {
      entityType: 'CommissionAdjustmentRequest',
      entityId: row.id,
      action: 'create',
      after: { status: 'draft', adjustmentAmount: row.adjustmentAmount },
    });

    return toCommissionAdjustmentResponse(row);
  }

  async submitAdjustment(actor: ActorContext, id: string): Promise<CommissionAdjustmentResponse> {
    const req = await this.require(actor, id);
    if (req.status !== 'draft') {
      throw new CommissionAdjustmentInvalidTransitionError(req.status, 'submit');
    }

    const { instanceId } = await this.workflow.start(actor, {
      entityType: 'commission_adjustment',
      entityId: id,
      companyId: req.companyId,
    });

    const updated = await this.repo.updateStatus(id, {
      status: 'submitted',
      actorUserId: actor.userId,
      workflowInstanceId: instanceId,
      submittedBy: actor.userId,
      submittedAt: new Date(),
    });
    await this.repo.createAudit({
      adjustmentRequestId: id,
      action: 'submit',
      userId: actor.userId,
      beforeStatus: req.status,
      afterStatus: 'submitted',
      metadata: { workflowInstanceId: instanceId },
    });
    await this.audit.record(actor, {
      entityType: 'CommissionAdjustmentRequest',
      entityId: id,
      action: 'submit',
      after: { status: 'submitted', workflowInstanceId: instanceId },
    });
    return toCommissionAdjustmentResponse(updated);
  }

  async approveAdjustment(actor: ActorContext, id: string): Promise<CommissionAdjustmentResponse> {
    const req = await this.require(actor, id);
    if (req.status === 'applied') {
      return toCommissionAdjustmentResponse(req);
    }
    if (req.status !== 'submitted') {
      throw new CommissionAdjustmentInvalidTransitionError(req.status, 'approve');
    }

    if (req.workflowInstanceId) {
      await this.workflow.act(actor, req.workflowInstanceId, { action: 'approve' });
      const refreshed = await this.repo.findById(id);
      return toCommissionAdjustmentResponse(refreshed ?? req);
    }

    const approved = await this.repo.updateStatus(id, {
      status: 'approved',
      actorUserId: actor.userId,
      approvedBy: actor.userId,
      approvedAt: new Date(),
    });
    await this.repo.createAudit({
      adjustmentRequestId: id,
      action: 'approve',
      userId: actor.userId,
      beforeStatus: req.status,
      afterStatus: 'approved',
    });
    await this.applyAdjustment(actor, id);
    const applied = await this.repo.findById(id);
    return toCommissionAdjustmentResponse(applied ?? approved);
  }

  async rejectAdjustment(actor: ActorContext, id: string, reason?: string): Promise<CommissionAdjustmentResponse> {
    const req = await this.require(actor, id);
    if (req.status === 'rejected' || req.status === 'applied') {
      return toCommissionAdjustmentResponse(req);
    }
    if (req.status !== 'submitted' && req.status !== 'approved') {
      throw new CommissionAdjustmentInvalidTransitionError(req.status, 'reject');
    }

    if (req.workflowInstanceId && req.status === 'submitted') {
      await this.workflow.act(actor, req.workflowInstanceId, { action: 'reject', comment: reason });
      const refreshed = await this.repo.findById(id);
      return toCommissionAdjustmentResponse(refreshed ?? req);
    }

    const updated = await this.repo.updateStatus(id, {
      status: 'rejected',
      actorUserId: actor.userId,
      rejectedBy: actor.userId,
      rejectedAt: new Date(),
    });
    await this.repo.createAudit({
      adjustmentRequestId: id,
      action: 'reject',
      userId: actor.userId,
      beforeStatus: req.status,
      afterStatus: 'rejected',
      metadata: reason ? { reason } : undefined,
    });
    return toCommissionAdjustmentResponse(updated);
  }

  async applyAdjustment(
    actor: ActorContext,
    id: string,
  ): Promise<{ request: CommissionAdjustmentResponse; entry: CommissionAdjustmentEntryResponse; payrollItemId: string | null }> {
    const req = await this.require(actor, id);
    if (req.status === 'applied') {
      const existing = await this.repo.findEntryByRequest(id);
      if (!existing) throw new CommissionAdjustmentAlreadyAppliedError();
      return {
        request: toCommissionAdjustmentResponse(req),
        entry: toCommissionAdjustmentEntryResponse(existing),
        payrollItemId: existing.payrollItemId,
      };
    }
    if (req.status !== 'approved' && req.status !== 'submitted') {
      throw new CommissionAdjustmentInvalidTransitionError(req.status, 'apply');
    }

    const source = await this.resolveSource(req);
    const signedDelta = req.direction === 'increase' ? req.adjustmentAmount : -req.adjustmentAmount;
    const netAmount = Math.max(0, source.originalAmount + signedDelta);

    let payrollItemId: string | null = null;
    const cycle = await this.cycles.findById(req.commissionCycleId);

    if (cycle && (cycle.status === 'finalized' || cycle.status === 'locked')) {
      payrollItemId = await this.repo.findPayrollItemBySource(id);
      if (!payrollItemId && signedDelta !== 0) {
        const payCycleId = await this.adminRepo.resolvePayCycleId(req.companyId, req.earnCycleId);
        if (payCycleId) {
          payrollItemId = await this.repo.createPayrollItem({
            payCycleId,
            employeeId: req.employeeId,
            companyId: req.companyId,
            amount: signedDelta,
            sourceRefId: id,
            note: `Commission adjustment — ${req.reason}`,
            actorUserId: actor.userId,
          });
        }
      }
    }

    const entry = await this.repo.createEntry({
      adjustmentRequestId: id,
      employeeId: req.employeeId,
      sourceResultId: source.sourceResultId,
      sourceResultType: source.sourceResultType,
      originalAmount: source.originalAmount,
      adjustmentAmount: signedDelta,
      netAmount,
      payrollItemId,
      actorUserId: actor.userId,
    });

    const updated = await this.repo.updateStatus(id, {
      status: 'applied',
      actorUserId: actor.userId,
      approvedBy: req.approvedBy ?? actor.userId,
      approvedAt: req.approvedAt ?? new Date(),
      appliedBy: actor.userId,
      appliedAt: new Date(),
    });
    await this.repo.createAudit({
      adjustmentRequestId: id,
      action: 'apply',
      userId: actor.userId,
      beforeStatus: req.status,
      afterStatus: 'applied',
      metadata: { entryId: entry.id, payrollItemId, netAmount },
    });
    await this.audit.record(actor, {
      entityType: 'CommissionAdjustmentRequest',
      entityId: id,
      action: 'apply',
      after: { entryId: entry.id, payrollItemId, netAmount },
    });

    return {
      request: toCommissionAdjustmentResponse(updated),
      entry: toCommissionAdjustmentEntryResponse(entry),
      payrollItemId,
    };
  }

  async getAdjustments(
    actor: ActorContext,
    filters: {
      companyId: string;
      earnCycleId?: string;
      type?: CommissionCycleType;
      employeeId?: string;
      status?: CommissionAdjustmentRow['status'];
    },
  ): Promise<CommissionAdjustmentResponse[]> {
    await this.companyAccess.assertCompanyAccess(actor, filters.companyId);
    const rows = await this.repo.list(filters);
    return rows.map(toCommissionAdjustmentResponse);
  }

  async getAdjustment(
    actor: ActorContext,
    id: string,
  ): Promise<CommissionAdjustmentResponse & {
    audits: ReturnType<typeof toCommissionAdjustmentAuditResponse>[];
    entry: CommissionAdjustmentEntryResponse | null;
  }> {
    const req = await this.require(actor, id);
    const [audits, entry] = await Promise.all([
      this.repo.listAudits(id),
      this.repo.findEntryByRequest(id),
    ]);
    return {
      ...toCommissionAdjustmentResponse(req),
      audits: audits.map(toCommissionAdjustmentAuditResponse),
      entry: entry ? toCommissionAdjustmentEntryResponse(entry) : null,
    };
  }

  async getAdjustmentHistory(
    actor: ActorContext,
    filters: { companyId: string; earnCycleId?: string; employeeId?: string },
  ): Promise<CommissionAdjustmentEntryResponse[]> {
    await this.companyAccess.assertCompanyAccess(actor, filters.companyId);
    const rows = await this.repo.listEntries(filters);
    return rows.map(toCommissionAdjustmentEntryResponse);
  }

  async onWorkflowResolved(
    entityId: string,
    status: 'approved' | 'rejected' | 'cancelled',
  ): Promise<void> {
    const req = await this.repo.findById(entityId);
    if (!req) return;

    if (status === 'approved') {
      await this.repo.updateStatus(entityId, {
        status: 'approved',
        actorUserId: req.submittedBy ?? 'workflow_system',
        approvedBy: req.submittedBy ?? undefined,
        approvedAt: new Date(),
      });
      await this.repo.createAudit({
        adjustmentRequestId: entityId,
        action: 'approve',
        userId: req.submittedBy ?? 'workflow_system',
        beforeStatus: req.status,
        afterStatus: 'approved',
      });
      await this.applyAdjustment(
        { userId: req.submittedBy ?? 'workflow_system', impersonatorUserId: null, companyId: req.companyId },
        entityId,
      );
      return;
    }

    await this.repo.updateStatus(entityId, {
      status: 'rejected',
      actorUserId: req.submittedBy ?? 'workflow_system',
      rejectedBy: req.submittedBy ?? undefined,
      rejectedAt: new Date(),
    });
    await this.repo.createAudit({
      adjustmentRequestId: entityId,
      action: 'reject',
      userId: req.submittedBy ?? 'workflow_system',
      beforeStatus: req.status,
      afterStatus: 'rejected',
      metadata: { workflowStatus: status },
    });
  }

  private async require(actor: ActorContext, id: string) {
    const row = await this.repo.findById(id);
    if (!row) throw new CommissionAdjustmentNotFoundError(id);
    await this.companyAccess.assertCompanyAccess(actor, row.companyId);
    return row;
  }

  private async resolveSource(req: CommissionAdjustmentRow): Promise<{
    sourceResultId: string;
    sourceResultType: CommissionAdjustmentSourceType;
    originalAmount: number;
  }> {
    switch (req.type) {
      case 'marketing': {
        const member = req.sourceResultId
          ? await this.prisma.marketingCommissionMemberResult.findFirst({ where: { id: req.sourceResultId } })
          : await this.prisma.marketingCommissionMemberResult.findFirst({
            where: {
              employeeId: req.employeeId,
              cycle: {
                companyId: req.companyId,
                earnCycleId: req.earnCycleId,
                ...(req.teamId ? { teamId: req.teamId } : {}),
                deletedAt: null,
              },
            },
          });
        if (!member) throw new CommissionAdjustmentSourceNotFoundError('Marketing member result not found');
        return {
          sourceResultId: member.id,
          sourceResultType: 'marketing_member',
          originalAmount: Number(member.finalPayout),
        };
      }
      case 'admin': {
        const member = req.sourceResultId
          ? await this.prisma.adminCommissionMemberResult.findFirst({ where: { id: req.sourceResultId } })
          : await this.prisma.adminCommissionMemberResult.findFirst({
            where: {
              employeeId: req.employeeId,
              cycle: { companyId: req.companyId, earnCycleId: req.earnCycleId, deletedAt: null },
            },
          });
        if (!member) throw new CommissionAdjustmentSourceNotFoundError('Admin member result not found');
        return {
          sourceResultId: member.id,
          sourceResultType: 'admin_member',
          originalAmount: Number(member.finalPayout),
        };
      }
      case 'recruitment': {
        const record = req.sourceResultId
          ? await this.prisma.commissionRecord.findFirst({ where: { id: req.sourceResultId, deletedAt: null } })
          : await this.prisma.commissionRecord.findFirst({
            where: {
              employeeId: req.employeeId,
              companyId: req.companyId,
              earnCycleId: req.earnCycleId,
              deletedAt: null,
            },
          });
        if (!record) throw new CommissionAdjustmentSourceNotFoundError('Recruitment commission record not found');
        return {
          sourceResultId: record.id,
          sourceResultType: 'recruitment_record',
          originalAmount: Number(record.grossAmount),
        };
      }
      case 'referral': {
        const referral = req.sourceResultId
          ? await this.prisma.referral.findFirst({ where: { id: req.sourceResultId, deletedAt: null } })
          : await this.prisma.referral.findFirst({
            where: {
              referrerEmployeeId: req.employeeId,
              companyId: req.companyId,
              deletedAt: null,
            },
            orderBy: { createdAt: 'desc' },
          });
        if (!referral) throw new CommissionAdjustmentSourceNotFoundError('Referral not found');
        return {
          sourceResultId: referral.id,
          sourceResultType: 'referral',
          originalAmount: Number(referral.rewardAmount),
        };
      }
      default:
        throw new CommissionAdjustmentSourceNotFoundError(`Unsupported type ${req.type}`);
    }
  }
}
