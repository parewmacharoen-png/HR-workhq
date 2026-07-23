// ============================================================================
// modules/payroll/infrastructure/persistence/payroll.prisma.repository.ts
// ============================================================================

import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Prisma, PayrollSourceRefType } from '@prisma/client';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { PayrollCycle } from '../../domain/entities/payroll-cycle.entity';
import {
  PayrollCycleRepository, PayrollItemRepository, PayslipRepository,
  SalaryRepository, DepositRepository,
  PayrollItemRow, PayslipRow, SalaryBandRow,
  DepositLedgerEntry, CollectorBreakdownEntry,
} from '../../domain/repositories/payroll.repository';

@Injectable()
export class PrismaPayrollCycleRepository implements PayrollCycleRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<PayrollCycle | null> {
    const row = await this.prisma.payrollCycle.findFirst({ where: { id, deletedAt: null } });
    return row ? PayrollCycle.rehydrate({ ...row, status: row.status as 'open' | 'locked' | 'paid' }) : null;
  }

  async findActiveForCompany(companyId: string): Promise<PayrollCycle | null> {
    const row = await this.prisma.payrollCycle.findFirst({
      where: { companyId, status: { in: ['open', 'locked'] }, deletedAt: null },
      orderBy: { periodStart: 'desc' },
    });
    return row ? PayrollCycle.rehydrate({ ...row, status: row.status as 'open' | 'locked' | 'paid' }) : null;
  }

  async existsForCompanyPeriod(companyId: string, periodStart: Date): Promise<boolean> {
    const count = await this.prisma.payrollCycle.count({ where: { companyId, periodStart, deletedAt: null } });
    return count > 0;
  }

  async save(cycle: PayrollCycle, actorUserId: string): Promise<void> {
    const p = cycle.toPersistence();
    await this.prisma.payrollCycle.upsert({
      where: { id: p.id },
      create: {
        id: p.id, companyId: p.companyId,
        periodStart: p.periodStart, periodEnd: p.periodEnd, payDate: p.payDate,
        status: p.status, lockedAt: p.lockedAt, paidAt: p.paidAt,
        createdBy: actorUserId, updatedBy: actorUserId,
      },
      update: {
        status: p.status, lockedAt: p.lockedAt, paidAt: p.paidAt, updatedBy: actorUserId,
      },
    });
  }
}

@Injectable()
export class PrismaPayrollItemRepository implements PayrollItemRepository {
  constructor(private readonly prisma: PrismaService) {}

  async listByCycle(cycleId: string): Promise<PayrollItemRow[]> {
    const rows = await this.prisma.payrollItem.findMany({ where: { payrollCycleId: cycleId, deletedAt: null } });
    return rows.map(this.toRow);
  }

  async listByCycleAndEmployee(cycleId: string, employeeId: string): Promise<PayrollItemRow[]> {
    const rows = await this.prisma.payrollItem.findMany({
      where: { payrollCycleId: cycleId, employeeId, deletedAt: null },
    });
    return rows.map(this.toRow);
  }

  async findById(id: string): Promise<PayrollItemRow | null> {
    const row = await this.prisma.payrollItem.findFirst({
      where: { id, deletedAt: null },
    });
    return row ? this.toRow(row) : null;
  }

  async create(item: Omit<PayrollItemRow, 'id'>, actorUserId: string): Promise<string> {
    const id = randomUUID();
    await this.prisma.payrollItem.create({
      data: {
        id,
        payrollCycleId: item.payrollCycleId,
        employeeId: item.employeeId,
        companyId: item.companyId,
        itemType: item.itemType,
        amount: new Prisma.Decimal(item.amount),
        quantity: item.quantity != null ? new Prisma.Decimal(item.quantity) : undefined,
        sourceRefType: (item.sourceRefType ?? undefined) as PayrollSourceRefType | undefined,
        sourceRefId: item.sourceRefId ?? undefined,
        note: item.note ?? undefined,
        createdBy: actorUserId, updatedBy: actorUserId,
      },
    });
    return id;
  }

  async update(
    id: string,
    data: { amount: number; note: string | null; quantity?: number | null },
    actorUserId: string,
  ): Promise<void> {
    await this.prisma.payrollItem.update({
      where: { id },
      data: {
        amount: new Prisma.Decimal(data.amount),
        note: data.note,
        ...(data.quantity !== undefined
          ? { quantity: data.quantity != null ? new Prisma.Decimal(data.quantity) : null }
          : {}),
        updatedBy: actorUserId,
      },
    });
  }

  async softDelete(id: string, actorUserId: string): Promise<void> {
    await this.prisma.payrollItem.update({
      where: { id },
      data: { deletedAt: new Date(), deletedBy: actorUserId },
    });
  }

  private toRow(r: any): PayrollItemRow {
    return {
      id: r.id, payrollCycleId: r.payrollCycleId, employeeId: r.employeeId,
      companyId: r.companyId, itemType: r.itemType, amount: Number(r.amount),
      quantity: r.quantity != null ? Number(r.quantity) : null,
      sourceRefType: r.sourceRefType, sourceRefId: r.sourceRefId, note: r.note,
    };
  }
}

@Injectable()
export class PrismaPayslipRepository implements PayslipRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByCycleAndEmployee(cycleId: string, employeeId: string): Promise<PayslipRow | null> {
    const row = await this.prisma.payslip.findFirst({
      where: { payrollCycleId: cycleId, employeeId, deletedAt: null },
    });
    if (!row) return null;
    return {
      id: row.id, payrollCycleId: row.payrollCycleId, employeeId: row.employeeId,
      gross: Number(row.gross), deductions: Number(row.deductions), net: Number(row.net),
      breakdown: (row.breakdown as Record<string, number>) ?? {},
    };
  }

  async create(row: Omit<PayslipRow, 'id'>, actorUserId: string): Promise<string> {
    const id = randomUUID();
    await this.prisma.payslip.create({
      data: {
        id,
        payrollCycleId: row.payrollCycleId, employeeId: row.employeeId,
        gross: new Prisma.Decimal(row.gross), deductions: new Prisma.Decimal(row.deductions),
        net: new Prisma.Decimal(row.net), breakdown: row.breakdown,
        createdBy: actorUserId, updatedBy: actorUserId,
      },
    });
    return id;
  }
}

@Injectable()
export class PrismaSalaryRepository implements SalaryRepository {
  constructor(private readonly prisma: PrismaService) {}

  async getBandsInPeriod(employeeId: string, companyId: string, from: Date, to: Date): Promise<SalaryBandRow[]> {
    const rows = await this.prisma.salaryHistory.findMany({
      where: {
        employeeId, companyId, deletedAt: null,
        effectiveFrom: { lte: to },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: from } }],
      },
      orderBy: { effectiveFrom: 'asc' },
    });
    return rows.map((r) => ({
      monthlySalary: Number(r.monthlySalary),
      effectiveFrom: r.effectiveFrom,
      effectiveTo: r.effectiveTo,
    }));
  }
}

@Injectable()
export class PrismaDepositRepository implements DepositRepository {
  constructor(private readonly prisma: PrismaService) {}

  async getEmployeeBalance(employeeId: string, cycleStart?: Date): Promise<number> {
    const last = await this.prisma.deposit.findFirst({
      where: {
        employeeId,
        deletedAt: null,
        ...(cycleStart ? { createdAt: { gte: cycleStart } } : {}),
      },
      orderBy: { createdAt: 'desc' },
    });
    return last ? Number(last.runningTotal) : 0;
  }

  async getRunningTotal(employeeId: string, _companyId: string): Promise<number> {
    const [ledger, employee] = await Promise.all([
      this.getEmployeeBalance(employeeId),
      this.prisma.employee.findFirst({
        where: { id: employeeId, deletedAt: null },
        select: { legacyDepositAmount: true },
      }),
    ]);
    const legacy = employee?.legacyDepositAmount != null
      ? Math.max(0, Number(employee.legacyDepositAmount))
      : 0;
    return Math.round((ledger + legacy) * 100) / 100;
  }

  async getLedger(employeeId: string, cycleStart?: Date): Promise<DepositLedgerEntry[]> {
    const rows = await this.prisma.deposit.findMany({
      where: {
        employeeId,
        deletedAt: null,
        ...(cycleStart ? { createdAt: { gte: cycleStart } } : {}),
      },
      include: { owningCompany: { select: { code: true, name: true } } },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map((row) => ({
      id: row.id,
      employeeId: row.employeeId,
      owningCompanyId: row.owningCompanyId,
      owningCompanyCode: row.owningCompany?.code ?? null,
      owningCompanyName: row.owningCompany?.name ?? null,
      payrollCycleId: row.payrollCycleId,
      isLegacy: row.payrollCycleId == null,
      amount: Number(row.amount),
      runningTotal: Number(row.runningTotal),
      createdAt: row.createdAt.toISOString(),
    }));
  }

  async getCollectorBreakdown(employeeId: string, cycleStart?: Date): Promise<CollectorBreakdownEntry[]> {
    const rows = await this.prisma.deposit.findMany({
      where: {
        employeeId,
        deletedAt: null,
        ...(cycleStart ? { createdAt: { gte: cycleStart } } : {}),
      },
      include: { owningCompany: { select: { code: true, name: true } } },
    });
    const map = new Map<string, CollectorBreakdownEntry & { legacyOnly: boolean }>();
    for (const row of rows) {
      const existing = map.get(row.owningCompanyId) ?? {
        companyId: row.owningCompanyId,
        companyCode: row.owningCompany?.code ?? null,
        companyName: row.owningCompany?.name ?? null,
        collectedAmount: 0,
        legacyOnly: true,
      };
      existing.collectedAmount += Number(row.amount);
      if (row.payrollCycleId != null) existing.legacyOnly = false;
      map.set(row.owningCompanyId, existing);
    }
    return [...map.values()].map(({ legacyOnly, ...row }) => ({
      ...row,
      isLegacy: legacyOnly,
    }));
  }

  async create(
    input: { employeeId: string; companyId: string; cycleId: string | null; amount: number },
    actorUserId: string,
  ): Promise<string> {
    const id = randomUUID();
    const running = await this.getEmployeeBalance(input.employeeId);
    await this.prisma.deposit.create({
      data: {
        id,
        employeeId: input.employeeId,
        owningCompanyId: input.companyId,
        payrollCycleId: input.cycleId,
        amount: new Prisma.Decimal(input.amount),
        runningTotal: new Prisma.Decimal(running + input.amount),
        createdBy: actorUserId,
        updatedBy: actorUserId,
      },
    });
    return id;
  }

  async softDelete(
    depositId: string,
    actorUserId: string,
  ): Promise<{ employeeId: string; payrollCycleId: string | null; amount: number } | null> {
    const row = await this.prisma.deposit.findFirst({
      where: { id: depositId, deletedAt: null },
    });
    if (!row) return null;

    await this.prisma.deposit.update({
      where: { id: depositId },
      data: {
        deletedAt: new Date(),
        deletedBy: actorUserId,
        updatedBy: actorUserId,
      },
    });
    await this.recalculateRunningTotals(row.employeeId);

    return {
      employeeId: row.employeeId,
      payrollCycleId: row.payrollCycleId,
      amount: Number(row.amount),
    };
  }

  async updateAmount(
    depositId: string,
    amount: number,
    actorUserId: string,
  ): Promise<DepositLedgerEntry | null> {
    const row = await this.prisma.deposit.findFirst({
      where: { id: depositId, deletedAt: null },
      include: { owningCompany: { select: { code: true, name: true } } },
    });
    if (!row) return null;

    await this.prisma.deposit.update({
      where: { id: depositId },
      data: {
        amount: new Prisma.Decimal(amount),
        updatedBy: actorUserId,
      },
    });
    await this.recalculateRunningTotals(row.employeeId);

    const updated = await this.prisma.deposit.findFirst({
      where: { id: depositId },
      include: { owningCompany: { select: { code: true, name: true } } },
    });
    if (!updated) return null;
    return {
      id: updated.id,
      employeeId: updated.employeeId,
      owningCompanyId: updated.owningCompanyId,
      owningCompanyCode: updated.owningCompany?.code ?? null,
      owningCompanyName: updated.owningCompany?.name ?? null,
      payrollCycleId: updated.payrollCycleId,
      isLegacy: updated.payrollCycleId == null,
      amount: Number(updated.amount),
      runningTotal: Number(updated.runningTotal),
      createdAt: updated.createdAt.toISOString(),
    };
  }

  async recalculateRunningTotals(employeeId: string): Promise<void> {
    const rows = await this.prisma.deposit.findMany({
      where: { employeeId, deletedAt: null },
      orderBy: { createdAt: 'asc' },
      select: { id: true, amount: true },
    });
    let running = 0;
    for (const row of rows) {
      running = Math.round((running + Number(row.amount)) * 100) / 100;
      await this.prisma.deposit.update({
        where: { id: row.id },
        data: { runningTotal: new Prisma.Decimal(running) },
      });
    }
  }
}
