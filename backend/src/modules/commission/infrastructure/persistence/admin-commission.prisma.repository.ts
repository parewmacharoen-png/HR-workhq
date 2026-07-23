// ============================================================================
// modules/commission/infrastructure/persistence/admin-commission.prisma.repository.ts
// ============================================================================

import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import {
  AdminCommissionRepository,
  AdminCycleContext,
  AdminCompanySummary,
  AdminCycleSummaryRow,
  PersistAdminCycleInput,
} from '../../domain/repositories/admin-commission.repository';
import {
  AdminCommissionCalculationService,
  AdminMemberInput,
  AdminShiftSegmentInput,
} from '../../domain/services/admin-commission-calculation.service';

const EXEMPT_LEAVE_TYPE_CODES = new Set(['sick_with_cert', 'emergency']);

@Injectable()
export class PrismaAdminCommissionRepository implements AdminCommissionRepository {
  private readonly calculator = new AdminCommissionCalculationService();

  constructor(private readonly prisma: PrismaService) {}

  async findCycle(companyId: string, earnCycleId: string) {
    const row = await this.prisma.adminCommissionCycle.findFirst({
      where: { companyId, earnCycleId, deletedAt: null },
      select: { id: true, status: true },
    });
    return row;
  }

  async loadCycleContext(companyId: string, earnCycleId: string): Promise<AdminCycleContext> {
    const earnCycle = await this.prisma.payrollCycle.findFirst({
      where: { id: earnCycleId, companyId, deletedAt: null },
    });
    if (!earnCycle) throw new Error(`Earn cycle ${earnCycleId} not found`);

    const payCycleId = await this.resolvePayCycleId(companyId, earnCycleId);
    const payCycle = payCycleId
      ? await this.prisma.payrollCycle.findFirst({ where: { id: payCycleId, deletedAt: null } })
      : null;

    const cycleDays = inclusiveDays(earnCycle.periodStart, earnCycle.periodEnd);

    return {
      companyId,
      earnCycleId,
      payCycleId,
      cyclePeriodStart: earnCycle.periodStart,
      cyclePeriodEnd: earnCycle.periodEnd,
      cyclePayDate: payCycle?.payDate ?? earnCycle.payDate,
      cycleDays,
    };
  }

  async resolvePayCycleId(companyId: string, earnCycleId: string): Promise<string | null> {
    const earn = await this.prisma.payrollCycle.findFirst({
      where: { id: earnCycleId, deletedAt: null },
    });
    if (!earn) return null;

    const pay = await this.prisma.payrollCycle.findFirst({
      where: {
        companyId,
        deletedAt: null,
        periodStart: { gt: earn.periodStart },
      },
      orderBy: { periodStart: 'asc' },
    });
    return pay?.id ?? null;
  }

  async loadMembers(companyId: string, context: AdminCycleContext): Promise<AdminMemberInput[]> {
    const profiles = await this.prisma.adminCommissionEmployeeProfile.findMany({
      where: { companyId, isActive: true, deletedAt: null },
      include: {
        employee: {
          select: {
            id: true,
            hireDate: true,
            terminationDate: true,
            employmentStatus: true,
          },
        },
      },
    });

    const members: AdminMemberInput[] = [];

    for (const profile of profiles) {
      const employee = profile.employee;
      const workWindow = employmentWindowInCycle(
        employee.hireDate,
        employee.terminationDate,
        context.cyclePeriodStart,
        context.cyclePeriodEnd,
      );
      const daysWorkedInCycle = workWindow?.days ?? 0;
      const resignedBeforePayout = employee.employmentStatus === 'terminated'
        && employee.terminationDate != null
        && employee.terminationDate < context.cyclePayDate;

      const shiftSegments = await this.loadShiftSegments(
        companyId,
        profile.employeeId,
        context.earnCycleId,
        profile.defaultShift as 'day' | 'night',
        workWindow?.start ?? context.cyclePeriodStart,
        workWindow?.end ?? context.cyclePeriodEnd,
      );

      const leaveStats = await this.loadLeaveStats(
        profile.employeeId,
        context.cyclePeriodStart,
        context.cyclePeriodEnd,
      );
      const extraLeaveDays = this.calculator.computeExtraLeaveDays(
        leaveStats.totalLeaveDays,
        leaveStats.exemptLeaveDays,
      );

      members.push({
        employeeId: profile.employeeId,
        officeType: profile.officeType as AdminMemberInput['officeType'],
        shiftSegments,
        daysWorkedInCycle,
        cycleDays: context.cycleDays,
        extraLeaveDays,
        resignedBeforePayout,
      });
    }

    return members;
  }

  async persistCalculation(input: PersistAdminCycleInput, actorUserId: string): Promise<string> {
    const { context, netProfit, calculation } = input;
    const cycleId = randomUUID();

    await this.prisma.$transaction(async (tx) => {
      await tx.adminCommissionCycle.create({
        data: {
          id: cycleId,
          companyId: context.companyId,
          earnCycleId: context.earnCycleId,
          payCycleId: context.payCycleId ?? undefined,
          netProfit: dec(netProfit),
          adminPool: dec(calculation.adminPool),
          poolA: dec(calculation.poolA),
          poolB: dec(calculation.poolB),
          totalPenalties: dec(calculation.totalPenalties),
          totalRedistributed: dec(calculation.totalRedistributed),
          totalPayable: dec(calculation.totalPayable),
          frontOfficeTotal: dec(calculation.frontOfficeTotal),
          backOfficeTotal: dec(calculation.backOfficeTotal),
          calculationTrace: calculation.trace as unknown as Prisma.InputJsonValue,
          status: 'calculated',
          createdBy: actorUserId,
          updatedBy: actorUserId,
        },
      });

      const memberIdByEmployee = new Map<string, string>();

      for (const m of calculation.members) {
        const memberId = randomUUID();
        memberIdByEmployee.set(m.employeeId, memberId);
        await tx.adminCommissionMemberResult.create({
          data: {
            id: memberId,
            cycleId,
            employeeId: m.employeeId,
            officeType: m.officeType,
            daysWorkedInCycle: dec(m.daysWorkedInCycle),
            cycleDays: dec(m.cycleDays),
            extraLeaveDays: dec(m.extraLeaveDays),
            poolAShare: dec(m.poolAShare),
            poolBShare: dec(m.poolBShare),
            basePoolAmount: dec(m.basePoolAmount),
            prorateFactor: dec(m.prorateFactor),
            proratedBase: dec(m.proratedBase),
            penaltyRate: dec(m.penaltyRate),
            penaltyDeduction: dec(m.penaltyDeduction),
            redistributionBonus: dec(m.redistributionBonus),
            finalPayout: dec(m.finalPayout),
            shiftSegments: m.shiftSegments as unknown as Prisma.InputJsonValue,
            status: m.status,
            calculationTrace: m.trace as unknown as Prisma.InputJsonValue,
            createdBy: actorUserId,
            updatedBy: actorUserId,
          },
        });
      }

      for (const p of calculation.penalties) {
        const memberResultId = memberIdByEmployee.get(p.employeeId);
        if (!memberResultId) continue;
        await tx.adminCommissionPenalty.create({
          data: {
            id: randomUUID(),
            cycleId,
            memberResultId,
            employeeId: p.employeeId,
            extraLeaveDays: dec(p.extraLeaveDays),
            penaltyRate: dec(p.penaltyRate),
            deductedAmount: dec(p.deductedAmount),
            createdBy: actorUserId,
          },
        });
      }

      for (const r of calculation.redistributions) {
        await tx.adminCommissionRedistribution.create({
          data: {
            id: randomUUID(),
            cycleId,
            redistributionType: 'leave_penalty',
            shift: r.shift,
            sourceMemberResultId: memberIdByEmployee.get(r.sourceEmployeeId),
            recipientEmployeeId: r.recipientEmployeeId,
            amount: dec(r.amount),
            createdBy: actorUserId,
          },
        });
      }
    });

    return cycleId;
  }

  async findCycleById(id: string): Promise<AdminCycleSummaryRow | null> {
    const row = await this.prisma.adminCommissionCycle.findFirst({
      where: { id, deletedAt: null },
    });
    if (!row) return null;
    return {
      id: row.id,
      companyId: row.companyId,
      earnCycleId: row.earnCycleId,
      payCycleId: row.payCycleId,
      status: row.status,
      netProfit: Number(row.netProfit),
      adminPool: Number(row.adminPool),
      poolA: Number(row.poolA),
      poolB: Number(row.poolB),
      totalPenalties: Number(row.totalPenalties),
      totalRedistributed: Number(row.totalRedistributed),
      totalPayable: Number(row.totalPayable),
      frontOfficeTotal: Number(row.frontOfficeTotal),
      backOfficeTotal: Number(row.backOfficeTotal),
      finalizedAt: row.finalizedAt,
    };
  }

  async listMemberResults(cycleId: string) {
    const rows = await this.prisma.adminCommissionMemberResult.findMany({
      where: { cycleId },
      select: {
        id: true, employeeId: true, finalPayout: true, status: true, payrollItemId: true,
      },
    });
    return rows.map((r) => ({
      id: r.id,
      employeeId: r.employeeId,
      finalPayout: Number(r.finalPayout),
      status: r.status,
      payrollItemId: r.payrollItemId,
    }));
  }

  async markMemberPaid(memberResultId: string, payrollItemId: string, actorUserId: string): Promise<void> {
    await this.prisma.adminCommissionMemberResult.update({
      where: { id: memberResultId },
      data: { status: 'paid', payrollItemId, updatedBy: actorUserId },
    });
  }

  async finalizeCycle(cycleId: string, actorUserId: string): Promise<void> {
    await this.prisma.adminCommissionCycle.update({
      where: { id: cycleId },
      data: { status: 'finalized', finalizedAt: new Date(), updatedBy: actorUserId },
    });
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
        itemType: 'commission',
        amount: dec(input.amount),
        sourceRefType: 'admin_commission',
        sourceRefId: input.sourceRefId,
        note: input.note,
        createdBy: input.actorUserId,
        updatedBy: input.actorUserId,
      },
    });
    return id;
  }

  async findPayrollItemBySource(sourceRefId: string): Promise<string | null> {
    const row = await this.prisma.payrollItem.findFirst({
      where: {
        sourceRefType: 'admin_commission',
        sourceRefId,
        deletedAt: null,
      },
    });
    return row?.id ?? null;
  }

  async companySummary(companyId: string, earnCycleId?: string): Promise<AdminCompanySummary> {
    const cycleWhere: Prisma.AdminCommissionCycleWhereInput = {
      companyId,
      deletedAt: null,
      ...(earnCycleId ? { earnCycleId } : {}),
    };

    const cycles = await this.prisma.adminCommissionCycle.findMany({ where: cycleWhere });

    return {
      totalAdminPool: round(cycles.reduce((s, c) => s + Number(c.adminPool), 0)),
      poolATotal: round(cycles.reduce((s, c) => s + Number(c.poolA), 0)),
      poolBTotal: round(cycles.reduce((s, c) => s + Number(c.poolB), 0)),
      totalPenalties: round(cycles.reduce((s, c) => s + Number(c.totalPenalties), 0)),
      totalRedistributed: round(cycles.reduce((s, c) => s + Number(c.totalRedistributed), 0)),
      totalPayable: round(cycles.reduce((s, c) => s + Number(c.totalPayable), 0)),
      frontOfficeTotal: round(cycles.reduce((s, c) => s + Number(c.frontOfficeTotal), 0)),
      backOfficeTotal: round(cycles.reduce((s, c) => s + Number(c.backOfficeTotal), 0)),
    };
  }

  private async loadShiftSegments(
    companyId: string,
    employeeId: string,
    earnCycleId: string,
    defaultShift: 'day' | 'night',
    windowStart: Date,
    windowEnd: Date,
  ): Promise<AdminShiftSegmentInput[]> {
    const rows = await this.prisma.adminCommissionShiftSegment.findMany({
      where: {
        companyId,
        employeeId,
        earnCycleId,
        deletedAt: null,
      },
      orderBy: { segmentStart: 'asc' },
    });

    if (rows.length === 0) {
      const days = inclusiveDays(windowStart, windowEnd);
      return [{
        shift: defaultShift,
        segmentStart: windowStart,
        segmentEnd: windowEnd,
        segmentDays: days,
      }];
    }

    return rows.map((r) => ({
      shift: r.shift as AdminShiftSegmentInput['shift'],
      segmentStart: r.segmentStart,
      segmentEnd: r.segmentEnd,
      segmentDays: inclusiveDays(r.segmentStart, r.segmentEnd),
    }));
  }

  private async loadLeaveStats(
    employeeId: string,
    periodStart: Date,
    periodEnd: Date,
  ): Promise<{ totalLeaveDays: number; exemptLeaveDays: number }> {
    const requests = await this.prisma.leaveRequest.findMany({
      where: {
        employeeId,
        status: 'approved',
        deletedAt: null,
        startDate: { lte: periodEnd },
        endDate: { gte: periodStart },
      },
      include: { leaveType: { select: { code: true } } },
    });

    let totalLeaveDays = 0;
    let exemptLeaveDays = 0;

    for (const req of requests) {
      const overlapStart = req.startDate > periodStart ? req.startDate : periodStart;
      const overlapEnd = req.endDate < periodEnd ? req.endDate : periodEnd;
      const overlapDays = inclusiveDays(overlapStart, overlapEnd);
      const reqSpanDays = inclusiveDays(req.startDate, req.endDate);
      const scaledDays = reqSpanDays > 0
        ? round(Number(req.days) * (overlapDays / reqSpanDays))
        : 0;
      totalLeaveDays = round(totalLeaveDays + scaledDays);
      if (EXEMPT_LEAVE_TYPE_CODES.has(req.leaveType.code)) {
        exemptLeaveDays = round(exemptLeaveDays + scaledDays);
      }
    }

    return { totalLeaveDays, exemptLeaveDays };
  }
}

function dec(n: number): Prisma.Decimal {
  return new Prisma.Decimal(n);
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

function inclusiveDays(start: Date, end: Date): number {
  const ms = end.getTime() - start.getTime();
  return Math.max(0, Math.floor(ms / 86_400_000) + 1);
}

function employmentWindowInCycle(
  hireDate: Date,
  terminationDate: Date | null,
  cycleStart: Date,
  cycleEnd: Date,
): { start: Date; end: Date; days: number } | null {
  const start = hireDate > cycleStart ? hireDate : cycleStart;
  const end = terminationDate && terminationDate < cycleEnd ? terminationDate : cycleEnd;
  if (start > end) return null;
  return { start, end, days: inclusiveDays(start, end) };
}
