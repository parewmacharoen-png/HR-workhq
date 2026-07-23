// ============================================================================
// modules/exit/infrastructure/persistence/exit-case.prisma.repository.ts
// ============================================================================

import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import {
  EmployeeExitCase,
  ExitCaseStatus,
  ExitDepartmentRoute,
} from '../../domain/entities/employee-exit-case.entity';
import { ExitReason } from '../../domain/services/exit-reason-policy.service';
import { resolveExitType } from '../../domain/services/exit-lifecycle.mapper';
import { ExitCaseRepository } from '../../domain/repositories/exit-case.repository';

const OPEN: ExitCaseStatus[] = [
  'draft', 'pending_leader_review', 'pending_owner_review', 'pending_settlement', 'settled',
];

@Injectable()
export class PrismaExitCaseRepository implements ExitCaseRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<EmployeeExitCase | null> {
    const row = await this.prisma.employeeExitCase.findFirst({ where: { id, deletedAt: null } });
    return row ? this.toDomain(row) : null;
  }

  async findOpenForEmployee(employeeId: string, companyId: string): Promise<EmployeeExitCase | null> {
    const row = await this.prisma.employeeExitCase.findFirst({
      where: {
        employeeId,
        companyId,
        deletedAt: null,
        status: { in: OPEN },
      },
      orderBy: { createdAt: 'desc' },
    });
    return row ? this.toDomain(row) : null;
  }

  async listByEmployee(employeeId: string): Promise<EmployeeExitCase[]> {
    const rows = await this.prisma.employeeExitCase.findMany({
      where: { employeeId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((r) => this.toDomain(r));
  }

  async save(record: EmployeeExitCase): Promise<void> {
    const p = record.toPersistence();
    await this.prisma.employeeExitCase.upsert({
      where: { id: p.id },
      create: {
        id: p.id,
        employeeId: p.employeeId,
        companyId: p.companyId,
        exitReason: p.exitReason,
        exitType: resolveExitType(p.exitReason),
        status: p.status,
        departmentRoute: p.departmentRoute,
        effectiveTerminationDate: p.effectiveTerminationDate,
        assetsReturned: p.assetsReturned,
        debtsCleared: p.debtsCleared,
        finalPayrollBuilt: p.finalPayrollBuilt,
        accessRevoked: p.accessRevoked,
        depositBalanceAtExit: p.depositBalanceAtExit != null
          ? new Prisma.Decimal(p.depositBalanceAtExit) : null,
        lossClaimTotal: new Prisma.Decimal(p.lossClaimTotal),
        refundAmount: p.refundAmount != null ? new Prisma.Decimal(p.refundAmount) : null,
        forfeitAmount: p.forfeitAmount != null ? new Prisma.Decimal(p.forfeitAmount) : null,
        legalReviewRequired: p.legalReviewRequired,
        depositRefundId: p.depositRefundId,
        leaderReviewedBy: p.leaderReviewedBy,
        leaderReviewedAt: p.leaderReviewedAt,
        leaderNotes: p.leaderNotes,
        ownerReviewedBy: p.ownerReviewedBy,
        ownerReviewedAt: p.ownerReviewedAt,
        ownerNotes: p.ownerNotes,
        notes: p.notes,
        initiatedBy: p.initiatedBy,
        settledAt: p.settledAt,
        closedAt: p.closedAt,
        cancelledAt: p.cancelledAt,
        cancelledBy: p.cancelledBy,
        cancellationReason: p.cancellationReason,
      },
      update: {
        status: p.status,
        assetsReturned: p.assetsReturned,
        debtsCleared: p.debtsCleared,
        finalPayrollBuilt: p.finalPayrollBuilt,
        accessRevoked: p.accessRevoked,
        depositBalanceAtExit: p.depositBalanceAtExit != null
          ? new Prisma.Decimal(p.depositBalanceAtExit) : null,
        lossClaimTotal: new Prisma.Decimal(p.lossClaimTotal),
        refundAmount: p.refundAmount != null ? new Prisma.Decimal(p.refundAmount) : null,
        forfeitAmount: p.forfeitAmount != null ? new Prisma.Decimal(p.forfeitAmount) : null,
        legalReviewRequired: p.legalReviewRequired,
        depositRefundId: p.depositRefundId,
        leaderReviewedBy: p.leaderReviewedBy,
        leaderReviewedAt: p.leaderReviewedAt,
        leaderNotes: p.leaderNotes,
        ownerReviewedBy: p.ownerReviewedBy,
        ownerReviewedAt: p.ownerReviewedAt,
        ownerNotes: p.ownerNotes,
        notes: p.notes,
        settledAt: p.settledAt,
        closedAt: p.closedAt,
        cancelledAt: p.cancelledAt,
        cancelledBy: p.cancelledBy,
        cancellationReason: p.cancellationReason,
      },
    });
  }

  private toDomain(row: {
    id: string;
    employeeId: string;
    companyId: string;
    exitReason: string;
    status: string;
    departmentRoute: string;
    effectiveTerminationDate: Date;
    assetsReturned: boolean;
    debtsCleared: boolean;
    finalPayrollBuilt: boolean;
    accessRevoked: boolean;
    depositBalanceAtExit: Prisma.Decimal | null;
    lossClaimTotal: Prisma.Decimal;
    refundAmount: Prisma.Decimal | null;
    forfeitAmount: Prisma.Decimal | null;
    legalReviewRequired: boolean;
    depositRefundId: string | null;
    leaderReviewedBy: string | null;
    leaderReviewedAt: Date | null;
    leaderNotes: string | null;
    ownerReviewedBy: string | null;
    ownerReviewedAt: Date | null;
    ownerNotes: string | null;
    notes: string | null;
    initiatedBy: string;
    settledAt: Date | null;
    closedAt: Date | null;
    cancelledAt: Date | null;
    cancelledBy: string | null;
    cancellationReason: string | null;
    deletedAt: Date | null;
  }): EmployeeExitCase {
    return EmployeeExitCase.rehydrate({
      id: row.id,
      employeeId: row.employeeId,
      companyId: row.companyId,
      exitReason: row.exitReason as ExitReason,
      status: row.status as ExitCaseStatus,
      departmentRoute: row.departmentRoute as ExitDepartmentRoute,
      effectiveTerminationDate: row.effectiveTerminationDate,
      assetsReturned: row.assetsReturned,
      debtsCleared: row.debtsCleared,
      finalPayrollBuilt: row.finalPayrollBuilt,
      accessRevoked: row.accessRevoked,
      depositBalanceAtExit: row.depositBalanceAtExit != null ? Number(row.depositBalanceAtExit) : null,
      lossClaimTotal: Number(row.lossClaimTotal),
      refundAmount: row.refundAmount != null ? Number(row.refundAmount) : null,
      forfeitAmount: row.forfeitAmount != null ? Number(row.forfeitAmount) : null,
      legalReviewRequired: row.legalReviewRequired,
      depositRefundId: row.depositRefundId,
      leaderReviewedBy: row.leaderReviewedBy,
      leaderReviewedAt: row.leaderReviewedAt,
      leaderNotes: row.leaderNotes,
      ownerReviewedBy: row.ownerReviewedBy,
      ownerReviewedAt: row.ownerReviewedAt,
      ownerNotes: row.ownerNotes,
      notes: row.notes,
      initiatedBy: row.initiatedBy,
      settledAt: row.settledAt,
      closedAt: row.closedAt,
      cancelledAt: row.cancelledAt,
      cancelledBy: row.cancelledBy,
      cancellationReason: row.cancellationReason,
      deletedAt: row.deletedAt,
    });
  }
}
