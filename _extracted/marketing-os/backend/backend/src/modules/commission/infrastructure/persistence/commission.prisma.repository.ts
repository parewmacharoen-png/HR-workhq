// ============================================================================
// modules/commission/infrastructure/persistence/commission.prisma.repository.ts
// ============================================================================

import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Prisma, CommissionRecordStatus } from '@prisma/client';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import {
  CommissionRepository, BigLeaderLedgerRepository,
  CommissionRecordRow, HoldRow, BigLeaderLedgerRow, SplitInput,
} from '../../domain/repositories/commission.repository';

@Injectable()
export class PrismaCommissionRepository implements CommissionRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<CommissionRecordRow | null> {
    const row = await this.prisma.commissionRecord.findFirst({ where: { id, deletedAt: null } });
    return row ? this.toRow(row) : null;
  }

  async findForEmployeeCycle(employeeId: string, earnCycleId: string): Promise<CommissionRecordRow | null> {
    const row = await this.prisma.commissionRecord.findFirst({
      where: { employeeId, earnCycleId, deletedAt: null },
    });
    return row ? this.toRow(row) : null;
  }

  async findPendingHoldForEmployee(employeeId: string, companyId: string): Promise<HoldRow | null> {
    const hold = await this.prisma.commissionHold.findFirst({
      where: { resolution: 'pending', deletedAt: null, commissionRecord: { employeeId, companyId } },
    });
    if (!hold) return null;
    return {
      id: hold.id, commissionRecordId: hold.commissionRecordId,
      holdCycleId: hold.holdCycleId, resolution: hold.resolution as 'released' | 'redistributed' | 'pending',
      resolvedCycleId: hold.resolvedCycleId,
    };
  }

  async create(record: Omit<CommissionRecordRow, 'id'>, actorUserId: string): Promise<string> {
    const id = randomUUID();
    await this.prisma.commissionRecord.create({
      data: {
        id,
        employeeId: record.employeeId, companyId: record.companyId,
        earnCycleId: record.earnCycleId, payCycleId: record.payCycleId ?? undefined,
        achievedValue: new Prisma.Decimal(record.achievedValue),
        targetValue: new Prisma.Decimal(record.targetValue),
        qualified: record.qualified,
        grossAmount: new Prisma.Decimal(record.grossAmount),
        status: record.status,
        createdBy: actorUserId, updatedBy: actorUserId,
      },
    });
    return id;
  }

  async updateStatus(id: string, status: string, payCycleId: string | null, actorUserId: string): Promise<void> {
    await this.prisma.commissionRecord.update({
      where: { id },
      data: { status: status as CommissionRecordStatus, payCycleId: payCycleId ?? undefined, updatedBy: actorUserId },
    });
  }

  async createHold(input: { commissionRecordId: string; holdCycleId: string }, actorUserId: string): Promise<string> {
    const id = randomUUID();
    await this.prisma.commissionHold.create({
      data: {
        id,
        commissionRecordId: input.commissionRecordId,
        holdCycleId: input.holdCycleId,
        resolution: 'pending',
        createdBy: actorUserId, updatedBy: actorUserId,
      },
    });
    return id;
  }

  async resolveHold(holdId: string, resolution: 'released' | 'redistributed', resolvedCycleId: string, actorUserId: string): Promise<void> {
    await this.prisma.commissionHold.update({
      where: { id: holdId },
      data: { resolution, resolvedCycleId, updatedBy: actorUserId },
    });
  }

  async createRedistribution(input: {
    sourceRecordId: string; sourceHoldId: string | null; toTeamId: string;
    toEmployeeId: string | null; amount: number; redistributedCycleId: string;
  }, actorUserId: string): Promise<void> {
    await this.prisma.commissionRedistribution.create({
      data: {
        id: randomUUID(),
        sourceCommissionRecordId: input.sourceRecordId,
        sourceHoldId: input.sourceHoldId ?? undefined,
        toTeamId: input.toTeamId,
        toEmployeeId: input.toEmployeeId ?? undefined,
        amount: new Prisma.Decimal(input.amount),
        redistributedCycleId: input.redistributedCycleId,
        createdBy: actorUserId, updatedBy: actorUserId,
      },
    });
  }

  async createSplits(splits: SplitInput[], actorUserId: string): Promise<void> {
    await this.prisma.commissionSplit.createMany({
      data: splits.map((s) => ({
        id: randomUUID(),
        commissionRecordId: s.commissionRecordId,
        employeeId: s.employeeId,
        shareRatio: new Prisma.Decimal(s.shareRatio),
        amount: new Prisma.Decimal(s.amount),
        createdBy: actorUserId, updatedBy: actorUserId,
      })),
    });
  }

  private toRow(row: any): CommissionRecordRow {
    return {
      id: row.id, employeeId: row.employeeId, companyId: row.companyId,
      earnCycleId: row.earnCycleId, payCycleId: row.payCycleId,
      achievedValue: Number(row.achievedValue), targetValue: Number(row.targetValue),
      qualified: row.qualified, grossAmount: Number(row.grossAmount),
      status: row.status, payrollItemId: row.payrollItemId,
    };
  }
}

@Injectable()
export class PrismaBigLeaderLedgerRepository implements BigLeaderLedgerRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findForCycle(employeeId: string, companyId: string, cycleId: string): Promise<BigLeaderLedgerRow | null> {
    const row = await this.prisma.bigLeaderLedger.findFirst({
      where: { employeeId, companyId, cycleId, deletedAt: null },
    });
    return row ? this.toRow(row) : null;
  }

  async getLastClosingCarry(employeeId: string, companyId: string): Promise<number> {
    const row = await this.prisma.bigLeaderLedger.findFirst({
      where: { employeeId, companyId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    return row ? Number(row.closingCarry) : 0;
  }

  async create(row: Omit<BigLeaderLedgerRow, 'id'>, actorUserId: string): Promise<string> {
    const id = randomUUID();
    await this.prisma.bigLeaderLedger.create({
      data: {
        id,
        employeeId: row.employeeId, companyId: row.companyId, cycleId: row.cycleId,
        openingCarry: new Prisma.Decimal(row.openingCarry),
        earned: new Prisma.Decimal(row.earned),
        closingCarry: new Prisma.Decimal(row.closingCarry),
        createdBy: actorUserId, updatedBy: actorUserId,
      },
    });
    return id;
  }

  async attachPayrollItem(id: string, payrollItemId: string): Promise<void> {
    await this.prisma.bigLeaderLedger.update({ where: { id }, data: { payrollItemId } });
  }

  private toRow(row: any): BigLeaderLedgerRow {
    return {
      id: row.id, employeeId: row.employeeId, companyId: row.companyId,
      cycleId: row.cycleId, openingCarry: Number(row.openingCarry),
      earned: Number(row.earned), closingCarry: Number(row.closingCarry),
      payrollItemId: row.payrollItemId,
    };
  }
}
