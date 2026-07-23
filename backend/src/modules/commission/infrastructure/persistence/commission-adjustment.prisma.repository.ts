// ============================================================================
// modules/commission/infrastructure/persistence/commission-adjustment.prisma.repository.ts
// ============================================================================

import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import {
  CommissionAdjustmentAuditRow,
  CommissionAdjustmentEntryRow,
  CommissionAdjustmentRepository,
  CommissionAdjustmentRow,
  CreateCommissionAdjustmentInput,
} from '../../domain/repositories/commission-adjustment.repository';

function dec(n: number): Prisma.Decimal {
  return new Prisma.Decimal(n);
}

function mapRequest(row: {
  id: string;
  companyId: string;
  earnCycleId: string;
  commissionCycleId: string;
  type: string;
  teamId: string | null;
  employeeId: string;
  sourceResultId: string | null;
  reason: string;
  adjustmentAmount: Prisma.Decimal;
  direction: string;
  status: string;
  workflowInstanceId: string | null;
  submittedBy: string | null;
  submittedAt: Date | null;
  approvedBy: string | null;
  approvedAt: Date | null;
  appliedBy: string | null;
  appliedAt: Date | null;
  rejectedBy: string | null;
  rejectedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): CommissionAdjustmentRow {
  return {
    id: row.id,
    companyId: row.companyId,
    earnCycleId: row.earnCycleId,
    commissionCycleId: row.commissionCycleId,
    type: row.type as CommissionAdjustmentRow['type'],
    teamId: row.teamId,
    employeeId: row.employeeId,
    sourceResultId: row.sourceResultId,
    reason: row.reason,
    adjustmentAmount: Number(row.adjustmentAmount),
    direction: row.direction as CommissionAdjustmentRow['direction'],
    status: row.status as CommissionAdjustmentRow['status'],
    workflowInstanceId: row.workflowInstanceId,
    submittedBy: row.submittedBy,
    submittedAt: row.submittedAt,
    approvedBy: row.approvedBy,
    approvedAt: row.approvedAt,
    appliedBy: row.appliedBy,
    appliedAt: row.appliedAt,
    rejectedBy: row.rejectedBy,
    rejectedAt: row.rejectedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

@Injectable()
export class PrismaCommissionAdjustmentRepository implements CommissionAdjustmentRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<CommissionAdjustmentRow | null> {
    const row = await this.prisma.commissionAdjustmentRequest.findFirst({
      where: { id, deletedAt: null },
    });
    return row ? mapRequest(row) : null;
  }

  async list(filters: {
    companyId: string;
    earnCycleId?: string;
    type?: CommissionAdjustmentRow['type'];
    employeeId?: string;
    status?: CommissionAdjustmentRow['status'];
  }): Promise<CommissionAdjustmentRow[]> {
    const rows = await this.prisma.commissionAdjustmentRequest.findMany({
      where: {
        companyId: filters.companyId,
        deletedAt: null,
        ...(filters.earnCycleId ? { earnCycleId: filters.earnCycleId } : {}),
        ...(filters.type ? { type: filters.type } : {}),
        ...(filters.employeeId ? { employeeId: filters.employeeId } : {}),
        ...(filters.status ? { status: filters.status } : {}),
      },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(mapRequest);
  }

  async create(input: CreateCommissionAdjustmentInput): Promise<CommissionAdjustmentRow> {
    const row = await this.prisma.commissionAdjustmentRequest.create({
      data: {
        id: randomUUID(),
        companyId: input.companyId,
        earnCycleId: input.earnCycleId,
        commissionCycleId: input.commissionCycleId,
        type: input.type,
        teamId: input.teamId ?? null,
        employeeId: input.employeeId,
        sourceResultId: input.sourceResultId ?? null,
        reason: input.reason,
        adjustmentAmount: dec(input.adjustmentAmount),
        direction: input.direction,
        status: 'draft',
        createdBy: input.actorUserId,
        updatedBy: input.actorUserId,
      },
    });
    return mapRequest(row);
  }

  async updateStatus(
    id: string,
    input: {
      status: CommissionAdjustmentRow['status'];
      actorUserId: string;
      workflowInstanceId?: string | null;
      submittedBy?: string;
      submittedAt?: Date;
      approvedBy?: string;
      approvedAt?: Date;
      appliedBy?: string;
      appliedAt?: Date;
      rejectedBy?: string;
      rejectedAt?: Date;
    },
  ): Promise<CommissionAdjustmentRow> {
    const row = await this.prisma.commissionAdjustmentRequest.update({
      where: { id },
      data: {
        status: input.status,
        updatedBy: input.actorUserId,
        ...(input.workflowInstanceId !== undefined ? { workflowInstanceId: input.workflowInstanceId } : {}),
        ...(input.submittedBy !== undefined ? { submittedBy: input.submittedBy } : {}),
        ...(input.submittedAt !== undefined ? { submittedAt: input.submittedAt } : {}),
        ...(input.approvedBy !== undefined ? { approvedBy: input.approvedBy } : {}),
        ...(input.approvedAt !== undefined ? { approvedAt: input.approvedAt } : {}),
        ...(input.appliedBy !== undefined ? { appliedBy: input.appliedBy } : {}),
        ...(input.appliedAt !== undefined ? { appliedAt: input.appliedAt } : {}),
        ...(input.rejectedBy !== undefined ? { rejectedBy: input.rejectedBy } : {}),
        ...(input.rejectedAt !== undefined ? { rejectedAt: input.rejectedAt } : {}),
      },
    });
    return mapRequest(row);
  }

  async createEntry(input: {
    adjustmentRequestId: string;
    employeeId: string;
    sourceResultId: string;
    sourceResultType: CommissionAdjustmentEntryRow['sourceResultType'];
    originalAmount: number;
    adjustmentAmount: number;
    netAmount: number;
    payrollItemId?: string | null;
    actorUserId: string;
  }): Promise<CommissionAdjustmentEntryRow> {
    const row = await this.prisma.commissionAdjustmentEntry.create({
      data: {
        id: randomUUID(),
        adjustmentRequestId: input.adjustmentRequestId,
        employeeId: input.employeeId,
        sourceResultId: input.sourceResultId,
        sourceResultType: input.sourceResultType,
        originalAmount: dec(input.originalAmount),
        adjustmentAmount: dec(input.adjustmentAmount),
        netAmount: dec(input.netAmount),
        payrollItemId: input.payrollItemId ?? null,
        createdBy: input.actorUserId,
      },
    });
    return {
      id: row.id,
      adjustmentRequestId: row.adjustmentRequestId,
      employeeId: row.employeeId,
      sourceResultId: row.sourceResultId,
      sourceResultType: row.sourceResultType as CommissionAdjustmentEntryRow['sourceResultType'],
      originalAmount: Number(row.originalAmount),
      adjustmentAmount: Number(row.adjustmentAmount),
      netAmount: Number(row.netAmount),
      payrollItemId: row.payrollItemId,
      createdAt: row.createdAt,
    };
  }

  async findEntryByRequest(adjustmentRequestId: string): Promise<CommissionAdjustmentEntryRow | null> {
    const row = await this.prisma.commissionAdjustmentEntry.findFirst({
      where: { adjustmentRequestId },
    });
    if (!row) return null;
    return {
      id: row.id,
      adjustmentRequestId: row.adjustmentRequestId,
      employeeId: row.employeeId,
      sourceResultId: row.sourceResultId,
      sourceResultType: row.sourceResultType as CommissionAdjustmentEntryRow['sourceResultType'],
      originalAmount: Number(row.originalAmount),
      adjustmentAmount: Number(row.adjustmentAmount),
      netAmount: Number(row.netAmount),
      payrollItemId: row.payrollItemId,
      createdAt: row.createdAt,
    };
  }

  async listEntries(filters: {
    companyId: string;
    earnCycleId?: string;
    employeeId?: string;
  }): Promise<CommissionAdjustmentEntryRow[]> {
    const rows = await this.prisma.commissionAdjustmentEntry.findMany({
      where: {
        adjustmentRequest: {
          companyId: filters.companyId,
          deletedAt: null,
          ...(filters.earnCycleId ? { earnCycleId: filters.earnCycleId } : {}),
          ...(filters.employeeId ? { employeeId: filters.employeeId } : {}),
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((row) => ({
      id: row.id,
      adjustmentRequestId: row.adjustmentRequestId,
      employeeId: row.employeeId,
      sourceResultId: row.sourceResultId,
      sourceResultType: row.sourceResultType as CommissionAdjustmentEntryRow['sourceResultType'],
      originalAmount: Number(row.originalAmount),
      adjustmentAmount: Number(row.adjustmentAmount),
      netAmount: Number(row.netAmount),
      payrollItemId: row.payrollItemId,
      createdAt: row.createdAt,
    }));
  }

  async createAudit(input: {
    adjustmentRequestId: string;
    action: CommissionAdjustmentAuditRow['action'];
    userId: string;
    beforeStatus: CommissionAdjustmentRow['status'] | null;
    afterStatus: CommissionAdjustmentRow['status'];
    metadata?: unknown;
  }): Promise<CommissionAdjustmentAuditRow> {
    const row = await this.prisma.commissionAdjustmentAudit.create({
      data: {
        id: randomUUID(),
        adjustmentRequestId: input.adjustmentRequestId,
        action: input.action,
        userId: input.userId,
        beforeStatus: input.beforeStatus,
        afterStatus: input.afterStatus,
        metadata: input.metadata as Prisma.InputJsonValue | undefined,
      },
    });
    return {
      id: row.id,
      adjustmentRequestId: row.adjustmentRequestId,
      action: row.action as CommissionAdjustmentAuditRow['action'],
      userId: row.userId,
      beforeStatus: row.beforeStatus as CommissionAdjustmentRow['status'] | null,
      afterStatus: row.afterStatus as CommissionAdjustmentRow['status'],
      metadata: row.metadata,
      createdAt: row.createdAt,
    };
  }

  async listAudits(adjustmentRequestId: string): Promise<CommissionAdjustmentAuditRow[]> {
    const rows = await this.prisma.commissionAdjustmentAudit.findMany({
      where: { adjustmentRequestId },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map((row) => ({
      id: row.id,
      adjustmentRequestId: row.adjustmentRequestId,
      action: row.action as CommissionAdjustmentAuditRow['action'],
      userId: row.userId,
      beforeStatus: row.beforeStatus as CommissionAdjustmentRow['status'] | null,
      afterStatus: row.afterStatus as CommissionAdjustmentRow['status'],
      metadata: row.metadata,
      createdAt: row.createdAt,
    }));
  }

  async findPayrollItemBySource(sourceRefId: string): Promise<string | null> {
    const row = await this.prisma.payrollItem.findFirst({
      where: {
        sourceRefType: 'commission_adjustment',
        sourceRefId,
        deletedAt: null,
      },
    });
    return row?.id ?? null;
  }

  async createPayrollItem(input: {
    payCycleId: string;
    employeeId: string;
    companyId: string;
    amount: number;
    sourceRefId: string;
    note: string;
    actorUserId: string;
  }): Promise<string> {
    const id = randomUUID();
    await this.prisma.payrollItem.create({
      data: {
        id,
        payrollCycleId: input.payCycleId,
        employeeId: input.employeeId,
        companyId: input.companyId,
        itemType: 'commission_adjustment',
        amount: dec(input.amount),
        sourceRefType: 'commission_adjustment',
        sourceRefId: input.sourceRefId,
        note: input.note,
        createdBy: input.actorUserId,
        updatedBy: input.actorUserId,
      },
    });
    return id;
  }
}
