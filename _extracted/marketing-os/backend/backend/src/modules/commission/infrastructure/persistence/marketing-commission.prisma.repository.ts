// ============================================================================
// modules/commission/infrastructure/persistence/marketing-commission.prisma.repository.ts
// ============================================================================

import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import {
  MARKETING_DAILY_REPORT_REPOSITORY,
  MarketingDailyReportRepository,
} from '../../../marketing/domain/repositories/marketing-daily-report.repository';
import {
  MARKETING_TEAM_REPOSITORY,
  MarketingTeamRepository,
} from '../../../marketing/domain/repositories/marketing-team.repository';
import {
  MarketingCommissionRepository,
  MarketingTeamContext,
  MarketingTeamMemberRow,
  PendingCarryRow,
  PersistMarketingCycleInput,
  MarketingCycleSummaryRow,
  MarketingCompanySummary,
} from '../../domain/repositories/marketing-commission.repository';
import { MarketingTeamNotFoundError } from '../../domain/errors/marketing-commission.errors';

@Injectable()
export class PrismaMarketingCommissionRepository implements MarketingCommissionRepository {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(MARKETING_DAILY_REPORT_REPOSITORY)
    private readonly dailyReports: MarketingDailyReportRepository,
    @Inject(MARKETING_TEAM_REPOSITORY)
    private readonly marketingTeams: MarketingTeamRepository,
  ) {}

  async findCycle(companyId: string, teamId: string, earnCycleId: string) {
    const row = await this.prisma.marketingCommissionCycle.findFirst({
      where: { companyId, teamId, earnCycleId, deletedAt: null },
      select: { id: true, status: true },
    });
    return row;
  }

  async loadTeamContext(companyId: string, teamId: string, earnCycleId: string): Promise<MarketingTeamContext> {
    const team = await this.prisma.marketingTeam.findFirst({
      where: { id: teamId, companyId, deletedAt: null },
    });
    if (!team) throw new MarketingTeamNotFoundError(teamId);

    const earnCycle = await this.prisma.payrollCycle.findFirst({
      where: { id: earnCycleId, companyId, deletedAt: null },
    });
    if (!earnCycle) throw new Error(`Earn cycle ${earnCycleId} not found`);

    const payCycleId = await this.resolvePayCycleId(companyId, earnCycleId);
    const bigLeaderEmployeeId = await this.marketingTeams.resolveRootBigLeaderEmployeeId(
      teamId,
      companyId,
    );

    return {
      teamId,
      companyId,
      bigLeaderEmployeeId,
      earnCycleId,
      payCycleId,
      cyclePeriodEnd: earnCycle.periodEnd,
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

  async loadTeamMembers(
    teamId: string,
    companyId: string,
    earnCycleId: string,
    bigLeaderEmployeeId: string | null,
  ): Promise<MarketingTeamMemberRow[]> {
    const earnCycle = await this.prisma.payrollCycle.findFirst({
      where: { id: earnCycleId, companyId, deletedAt: null },
      select: { periodStart: true, periodEnd: true },
    });
    if (!earnCycle) throw new Error(`Earn cycle ${earnCycleId} not found`);

    const members = await this.marketingTeams.listActiveTeamMembers(
      teamId,
      companyId,
      earnCycle.periodEnd,
    );

    const employeeIds = members.map((m) => m.employeeId);
    const approvedDecls = employeeIds.length > 0
      ? await this.prisma.commissionDeclarationAssignment.findMany({
        where: {
          companyId,
          teamId,
          deletedAt: null,
          declaration: {
            status: 'approved',
            deletedAt: null,
            employeeId: { in: employeeIds },
          },
        },
        include: { declaration: { select: { employeeId: true } } },
      })
      : [];
    const declByEmployee = new Map(
      approvedDecls.map((d) => [d.declaration.employeeId, d] as const),
    );

    const rows: MarketingTeamMemberRow[] = [];
    for (const member of members) {
      const decl = declByEmployee.get(member.employeeId);
      if (!decl) continue;

      if (decl.commissionMethod === 'none' || decl.commissionMethod === 'unsure') continue;

      const employee = await this.prisma.employee.findFirst({
        where: { id: member.employeeId, deletedAt: null },
        select: { id: true, hireDate: true },
      });
      if (!employee) continue;

      const count = await this.dailyReports.sumEmployeeStartedWork(
        companyId,
        member.employeeId,
        earnCycle.periodStart,
        earnCycle.periodEnd,
        'final',
      );

      const commissionRole = member.role === 'big_leader'
        ? 'big_leader'
        : 'employee';
      const isBigLeaderOnly = member.employeeId === bigLeaderEmployeeId
        && commissionRole === 'big_leader';
      rows.push({
        employeeId: member.employeeId,
        roleLevel: commissionRole as MarketingTeamMemberRow['roleLevel'],
        hireDate: employee.hireDate,
        achievedCandidates: count,
        rampOverridePercent: decl.commissionMethod === 'big_leader_split' && decl.employeePercent != null
          ? Number(decl.employeePercent)
          : null,
        includeInTeamPool: !isBigLeaderOnly && decl.commissionMethod === 'team_pool',
        kpiExempt: member.employeeId === bigLeaderEmployeeId,
        declarationMethod: decl.commissionMethod,
        declarationBigLeaderPercent: decl.bigLeaderPercent != null ? Number(decl.bigLeaderPercent) : null,
        declarationEmployeePercent: decl.employeePercent != null ? Number(decl.employeePercent) : null,
      });
    }
    return rows;
  }

  async loadPendingCarries(teamId: string, companyId: string): Promise<PendingCarryRow[]> {
    const rows = await this.prisma.marketingCommissionCarryForward.findMany({
      where: { teamId, companyId, status: 'pending', deletedAt: null },
    });
    return rows.map((r) => ({
      id: r.id,
      employeeId: r.employeeId,
      amount: Number(r.amount),
      sourceCycleId: r.sourceCycleId,
    }));
  }

  async persistCalculation(input: PersistMarketingCycleInput, actorUserId: string): Promise<string> {
    const { context, financial, calculation } = input;
    const cycleId = randomUUID();

    await this.prisma.$transaction(async (tx) => {
      await tx.marketingCommissionCycle.create({
        data: {
          id: cycleId,
          companyId: context.companyId,
          teamId: context.teamId,
          earnCycleId: context.earnCycleId,
          payCycleId: context.payCycleId ?? undefined,
          grossProfit: dec(financial.grossProfit),
          employeeSalaryExpense: dec(financial.employeeSalaryExpense),
          marketingExpense: dec(financial.marketingExpense),
          lineExpense: dec(financial.lineExpense),
          telesalesExpense: dec(financial.telesalesExpense),
          promotionExpense: dec(financial.promotionExpense),
          profitAfterExpenses: dec(calculation.trace.profitAfterExpenses),
          companyHeadDeduction: dec(calculation.trace.companyHeadDeduction),
          netProfit: dec(calculation.netProfit),
          teamCommissionPool: dec(calculation.teamCommissionPool),
          leaderBase: dec(calculation.leaderBase),
          bigLeaderEmployeeId: calculation.bigLeaderEmployeeId ?? undefined,
          bigLeaderCommission: dec(calculation.bigLeaderCommission),
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
        await tx.marketingCommissionMemberResult.create({
          data: {
            id: memberId,
            cycleId,
            employeeId: m.employeeId,
            roleLevel: m.roleLevel as 'employee' | 'sub_leader' | 'big_leader',
            achievedCandidates: dec(m.achievedCandidates),
            targetCandidates: dec(m.targetCandidates),
            kpiQualified: m.kpiQualified,
            kpiExempt: m.kpiExempt,
            tenureMonth: m.tenureMonth,
            rampPercent: dec(m.rampPercent),
            rampOverridePercent: m.rampOverridePercent != null ? dec(m.rampOverridePercent) : undefined,
            memberCount: m.memberCount,
            baseShare: dec(m.baseShare),
            rampedAmount: dec(m.rampedAmount),
            redistributionBonus: dec(m.redistributionBonus),
            poolPayout: dec(m.poolPayout),
            carryForwardIn: dec(m.carryForwardIn),
            carryForwardOut: dec(m.carryForwardOut),
            carryExpired: dec(m.carryExpired),
            finalPayout: dec(m.finalPayout),
            status: m.status,
            calculationTrace: m.trace as unknown as Prisma.InputJsonValue,
            createdBy: actorUserId,
            updatedBy: actorUserId,
          },
        });
      }

      for (const r of calculation.redistributions) {
        await tx.marketingCommissionRedistribution.create({
          data: {
            id: randomUUID(),
            cycleId,
            redistributionType: r.type,
            sourceMemberResultId: r.sourceEmployeeId
              ? memberIdByEmployee.get(r.sourceEmployeeId)
              : undefined,
            recipientEmployeeId: r.recipientEmployeeId,
            amount: dec(r.amount),
            createdBy: actorUserId,
          },
        });
      }

      for (const c of calculation.newCarryForwards) {
        const sourceMemberResultId = memberIdByEmployee.get(c.employeeId);
        if (!sourceMemberResultId) continue;
        await tx.marketingCommissionCarryForward.create({
          data: {
            id: randomUUID(),
            companyId: context.companyId,
            teamId: context.teamId,
            employeeId: c.employeeId,
            sourceCycleId: cycleId,
            sourceMemberResultId,
            amount: dec(c.amount),
            status: 'pending',
            createdBy: actorUserId,
            updatedBy: actorUserId,
          },
        });
      }

      if (calculation.recoveredCarryEmployeeIds.length) {
        await this.markCarriesRecoveredInTx(
          tx,
          context.teamId,
          context.companyId,
          calculation.recoveredCarryEmployeeIds,
          memberIdByEmployee,
          cycleId,
          actorUserId,
        );
      }

      if (calculation.expiredCarryEmployeeIds.length) {
        await tx.marketingCommissionCarryForward.updateMany({
          where: {
            teamId: context.teamId,
            companyId: context.companyId,
            employeeId: { in: calculation.expiredCarryEmployeeIds },
            status: 'pending',
            deletedAt: null,
          },
          data: {
            status: 'expired',
            expiredCycleId: cycleId,
            updatedBy: actorUserId,
          },
        });
      }
    });

    return cycleId;
  }

  async findCycleById(id: string): Promise<MarketingCycleSummaryRow | null> {
    const row = await this.prisma.marketingCommissionCycle.findFirst({
      where: { id, deletedAt: null },
    });
    if (!row) return null;
    return {
      id: row.id,
      companyId: row.companyId,
      teamId: row.teamId,
      earnCycleId: row.earnCycleId,
      payCycleId: row.payCycleId,
      status: row.status,
      teamCommissionPool: Number(row.teamCommissionPool),
      bigLeaderCommission: Number(row.bigLeaderCommission),
      bigLeaderEmployeeId: row.bigLeaderEmployeeId,
      netProfit: Number(row.netProfit),
      finalizedAt: row.finalizedAt,
    };
  }

  async listMemberResults(cycleId: string) {
    const rows = await this.prisma.marketingCommissionMemberResult.findMany({
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
    await this.prisma.marketingCommissionMemberResult.update({
      where: { id: memberResultId },
      data: { status: 'paid', payrollItemId, updatedBy: actorUserId },
    });
  }

  async markBigLeaderPaid(cycleId: string, payrollItemId: string, actorUserId: string): Promise<void> {
    await this.prisma.marketingCommissionCycle.update({
      where: { id: cycleId },
      data: { bigLeaderPayrollItemId: payrollItemId, updatedBy: actorUserId },
    });
  }

  async finalizeCycle(cycleId: string, actorUserId: string): Promise<void> {
    await this.prisma.marketingCommissionCycle.update({
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
        sourceRefType: 'marketing_commission',
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
        sourceRefType: 'marketing_commission',
        sourceRefId,
        deletedAt: null,
      },
    });
    return row?.id ?? null;
  }

  async companySummary(companyId: string, earnCycleId?: string): Promise<MarketingCompanySummary> {
    const cycleWhere: Prisma.MarketingCommissionCycleWhereInput = {
      companyId,
      deletedAt: null,
      ...(earnCycleId ? { earnCycleId } : {}),
    };

    const [cycles, paidMembers, carried, redistributed] = await Promise.all([
      this.prisma.marketingCommissionCycle.findMany({ where: cycleWhere }),
      this.prisma.marketingCommissionMemberResult.findMany({
        where: {
          status: 'paid',
          cycle: cycleWhere,
        },
        select: { finalPayout: true },
      }),
      this.prisma.marketingCommissionCarryForward.findMany({
        where: { companyId, status: 'pending', deletedAt: null },
        select: { amount: true },
      }),
      this.prisma.marketingCommissionRedistribution.findMany({
        where: { cycle: cycleWhere },
        select: { amount: true },
      }),
    ]);

    const totalTeamPool = cycles.reduce((s, c) => s + Number(c.teamCommissionPool), 0);
    const bigLeaderCommission = cycles.reduce((s, c) => s + Number(c.bigLeaderCommission), 0);
    const paidAmount = paidMembers.reduce((s, m) => s + Number(m.finalPayout), 0);
    const carryForwardAmount = carried.reduce((s, c) => s + Number(c.amount), 0);
    const redistributedAmount = redistributed.reduce((s, r) => s + Number(r.amount), 0);

    const holdAmount = await this.prisma.marketingCommissionMemberResult.aggregate({
      where: {
        status: 'carried_forward',
        cycle: cycleWhere,
      },
      _sum: { carryForwardOut: true },
    });

    return {
      totalTeamPool: round(totalTeamPool),
      paidAmount: round(paidAmount),
      holdAmount: round(Number(holdAmount._sum.carryForwardOut ?? 0)),
      carryForwardAmount: round(carryForwardAmount),
      redistributedAmount: round(redistributedAmount),
      bigLeaderCommission: round(bigLeaderCommission),
    };
  }

  async markCarriesRecovered(
    cycleId: string,
    employeeIds: string[],
    recoveredMemberResultIdByEmployee: Map<string, string>,
    actorUserId: string,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const cycle = await tx.marketingCommissionCycle.findUnique({ where: { id: cycleId } });
      if (!cycle) return;
      await this.markCarriesRecoveredInTx(
        tx,
        cycle.teamId,
        cycle.companyId,
        employeeIds,
        recoveredMemberResultIdByEmployee,
        cycleId,
        actorUserId,
      );
    });
  }

  async markCarriesExpired(cycleId: string, employeeIds: string[], actorUserId: string): Promise<void> {
    const cycle = await this.prisma.marketingCommissionCycle.findUnique({ where: { id: cycleId } });
    if (!cycle) return;
    await this.prisma.marketingCommissionCarryForward.updateMany({
      where: {
        teamId: cycle.teamId,
        companyId: cycle.companyId,
        employeeId: { in: employeeIds },
        status: 'pending',
        deletedAt: null,
      },
      data: { status: 'expired', expiredCycleId: cycleId, updatedBy: actorUserId },
    });
  }

  private async markCarriesRecoveredInTx(
    tx: Prisma.TransactionClient,
    teamId: string,
    companyId: string,
    employeeIds: string[],
    recoveredMemberResultIdByEmployee: Map<string, string>,
    recoveredCycleId: string,
    actorUserId: string,
  ): Promise<void> {
    for (const employeeId of employeeIds) {
      const recoveredMemberResultId = recoveredMemberResultIdByEmployee.get(employeeId);
      if (!recoveredMemberResultId) continue;
      await tx.marketingCommissionCarryForward.updateMany({
        where: {
          teamId,
          companyId,
          employeeId,
          status: 'pending',
          deletedAt: null,
        },
        data: {
          status: 'recovered',
          recoveredCycleId,
          recoveredMemberResultId,
          updatedBy: actorUserId,
        },
      });
    }
  }
}

function dec(n: number): Prisma.Decimal {
  return new Prisma.Decimal(n);
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
