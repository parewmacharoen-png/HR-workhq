import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { ActorContext } from '../../../shared/kernel/actor-context';
import { EmployeeAccessService } from '../../employee/application/employee-access.service';
import type {
  EmployeeCommissionAssignmentDto,
  EmployeeCommissionHistoryItemDto,
  EmployeeCommissionSummaryDto,
  EmployeeCommissionUiStatus,
  EmployeeCommissionViewDto,
} from './dto/employee-commission-view.dto';

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function formatPeriod(start: Date, end: Date): string {
  return `${start.toISOString().slice(0, 10)} – ${end.toISOString().slice(0, 10)}`;
}

function mapMarketingUiStatus(status: string, kpiQualified: boolean): EmployeeCommissionUiStatus {
  if (status === 'paid') return 'paid';
  if (status === 'carried_forward') return 'carry_forward';
  if (status === 'pending_pay') return 'pending';
  if (!kpiQualified) return 'rejected';
  return 'eligible';
}

function mapAdminUiStatus(status: string): EmployeeCommissionUiStatus {
  if (status === 'paid') return 'paid';
  if (status === 'pending_pay') return 'pending';
  if (status === 'no_payout') return 'rejected';
  return 'neutral';
}

function methodLabel(method: string | null): string {
  if (!method) return '—';
  switch (method) {
    case 'team_pool': return 'Team Pool';
    case 'big_leader_split': return 'Big Leader Split';
    case 'front_office': return 'Front Office';
    case 'back_office': return 'Back Office';
    case 'none': return 'None';
    case 'unsure': return 'Unsure';
    default: return method;
  }
}

@Injectable()
export class EmployeeCommissionViewService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly employeeAccess: EmployeeAccessService,
  ) {}

  async getEmployeeCommissionView(
    actor: ActorContext,
    employeeId: string,
    companyId: string,
  ): Promise<EmployeeCommissionViewDto> {
    await this.employeeAccess.assertEmployeeSelfOrCompany(actor, employeeId, companyId);

    const since = new Date();
    since.setUTCMonth(since.getUTCMonth() - 24);

    const [
      company,
      employee,
      adminProfile,
      marketingMembership,
      declaration,
      pendingCarries,
      marketingResults,
      adminResults,
      currentEarnCycle,
    ] = await Promise.all([
      this.prisma.company.findFirst({
        where: { id: companyId, deletedAt: null },
        select: { id: true, name: true },
      }),
      this.prisma.employee.findFirst({
        where: { id: employeeId, deletedAt: null },
        select: { id: true },
      }),
      this.prisma.adminCommissionEmployeeProfile.findFirst({
        where: { employeeId, companyId, deletedAt: null, isActive: true },
      }),
      this.prisma.marketingTeamMember.findFirst({
        where: {
          employeeId,
          deletedAt: null,
          effectiveTo: null,
          team: { companyId, deletedAt: null },
        },
        include: { team: { select: { id: true, name: true, companyId: true } } },
        orderBy: { effectiveFrom: 'desc' },
      }),
      this.prisma.commissionDeclaration.findFirst({
        where: {
          employeeId,
          companyId,
          deletedAt: null,
          status: { in: ['approved', 'submitted', 'hr_review'] },
        },
        orderBy: { updatedAt: 'desc' },
        include: {
          assignments: {
            where: { companyId, deletedAt: null },
            include: {
              company: { select: { name: true } },
              team: { select: { id: true, name: true } },
            },
            orderBy: { sortOrder: 'asc' },
          },
        },
      }),
      this.prisma.marketingCommissionCarryForward.findMany({
        where: {
          employeeId,
          companyId,
          status: 'pending',
          deletedAt: null,
        },
        select: { amount: true },
      }),
      this.prisma.marketingCommissionMemberResult.findMany({
        where: {
          employeeId,
          cycle: {
            companyId,
            deletedAt: null,
            earnCycle: { periodStart: { gte: since } },
          },
        },
        include: {
          cycle: {
            include: {
              earnCycle: { select: { periodStart: true, periodEnd: true } },
              team: { select: { id: true, name: true } },
              company: { select: { id: true, name: true } },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 200,
      }),
      this.prisma.adminCommissionMemberResult.findMany({
        where: {
          employeeId,
          cycle: {
            companyId,
            deletedAt: null,
            earnCycle: { periodStart: { gte: since } },
          },
        },
        include: {
          cycle: {
            include: {
              earnCycle: { select: { periodStart: true, periodEnd: true } },
              company: { select: { id: true, name: true } },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 200,
      }),
      this.prisma.payrollCycle.findFirst({
        where: { companyId, status: { in: ['open', 'locked'] }, deletedAt: null },
        orderBy: { periodStart: 'desc' },
        select: { id: true, periodStart: true, periodEnd: true },
      }),
    ]);

    const companyName = company?.name ?? '';
    const carryForwardTotal = roundMoney(
      pendingCarries.reduce((sum, row) => sum + Number(row.amount), 0),
    );

    const sourceCycleIds = [
      ...marketingResults.map((row) => row.cycleId),
      ...adminResults.map((row) => row.cycleId),
    ];
    const finalizationRows = sourceCycleIds.length
      ? await this.prisma.commissionCycle.findMany({
          where: { sourceCycleId: { in: [...new Set(sourceCycleIds)] }, deletedAt: null },
          select: { id: true, sourceCycleId: true },
        })
      : [];
    const finalizationBySource = new Map(
      finalizationRows.map((row) => [row.sourceCycleId, row.id]),
    );

    const history: EmployeeCommissionHistoryItemDto[] = [];

    for (const row of marketingResults) {
      const earn = row.cycle.earnCycle;
      history.push({
        id: row.id,
        sourceCycleId: row.cycleId,
        finalizationCycleId: finalizationBySource.get(row.cycleId) ?? null,
        periodStart: earn.periodStart.toISOString().slice(0, 10),
        periodEnd: earn.periodEnd.toISOString().slice(0, 10),
        periodLabel: formatPeriod(earn.periodStart, earn.periodEnd),
        companyId: row.cycle.companyId,
        companyName: row.cycle.company.name,
        teamId: row.cycle.teamId,
        teamName: row.cycle.team.name,
        commissionType: 'marketing',
        method: methodLabel(
          declaration?.assignments.find((a) => a.teamId === row.cycle.teamId)?.commissionMethod ?? 'team_pool',
        ),
        target: Number(row.targetCandidates),
        achieved: Number(row.achievedCandidates),
        commission: roundMoney(Number(row.finalPayout)),
        bonus: roundMoney(Number(row.redistributionBonus)),
        carryForward: roundMoney(Number(row.carryForwardOut)),
        status: row.status,
        uiStatus: mapMarketingUiStatus(row.status, row.kpiQualified),
      });
    }

    for (const row of adminResults) {
      const earn = row.cycle.earnCycle;
      history.push({
        id: row.id,
        sourceCycleId: row.cycleId,
        finalizationCycleId: finalizationBySource.get(row.cycleId) ?? null,
        periodStart: earn.periodStart.toISOString().slice(0, 10),
        periodEnd: earn.periodEnd.toISOString().slice(0, 10),
        periodLabel: formatPeriod(earn.periodStart, earn.periodEnd),
        companyId: row.cycle.companyId,
        companyName: row.cycle.company.name,
        teamId: null,
        teamName: null,
        commissionType: 'admin',
        method: methodLabel(row.officeType),
        target: null,
        achieved: Number(row.daysWorkedInCycle),
        commission: roundMoney(Number(row.finalPayout)),
        bonus: roundMoney(Number(row.redistributionBonus)),
        carryForward: 0,
        status: row.status,
        uiStatus: mapAdminUiStatus(row.status),
      });
    }

    history.sort((a, b) => b.periodStart.localeCompare(a.periodStart));

    const latestMarketing = marketingResults[0] ?? null;
    const latestAdmin = adminResults[0] ?? null;
    const currentMarketing = currentEarnCycle
      ? marketingResults.find((row) => row.cycle.earnCycleId === currentEarnCycle.id) ?? null
      : latestMarketing;
    const currentAdmin = currentEarnCycle
      ? adminResults.find((row) => row.cycle.earnCycleId === currentEarnCycle.id) ?? null
      : latestAdmin;

    const lastPaid = history.find((row) => row.status === 'paid') ?? null;

    const primaryAssignment = this.buildAssignment({
      companyId,
      companyName,
      employeeRole: marketingMembership?.role ?? null,
      adminProfile,
      marketingMembership,
      declaration,
      latestMarketing: currentMarketing ?? latestMarketing,
      carryForwardTotal,
    });

    const estimatedCommission = roundMoney(
      (currentMarketing ? Number(currentMarketing.finalPayout) : 0)
      + (currentAdmin ? Number(currentAdmin.finalPayout) : 0),
    );

    const cycleLabel = (() => {
      if (currentEarnCycle) {
        return formatPeriod(currentEarnCycle.periodStart, currentEarnCycle.periodEnd);
      }
      const latest = history[0];
      return latest?.periodLabel ?? null;
    })();

    const activeMarketing = currentMarketing ?? latestMarketing;
    const activeAdmin = currentAdmin ?? latestAdmin;

    const summary: EmployeeCommissionSummaryDto = {
      currentCycleLabel: cycleLabel,
      estimatedCommission: (currentMarketing || currentAdmin) ? estimatedCommission : null,
      lastPaidCommission: lastPaid?.commission ?? null,
      currentTeamName: marketingMembership?.team.name ?? primaryAssignment?.teamName ?? null,
      commissionMethod: primaryAssignment?.commissionMethod ?? null,
      eligibleStatus: activeMarketing
        ? (activeMarketing.kpiQualified ? 'Eligible' : 'Not eligible')
        : activeAdmin
          ? (activeAdmin.status !== 'no_payout' ? 'Eligible' : 'Not eligible')
          : null,
      carryForwardStatus: carryForwardTotal > 0
        ? `${carryForwardTotal.toLocaleString('en-US')} pending`
        : 'None',
      targetProgress: activeMarketing && Number(activeMarketing.targetCandidates) > 0
        ? `${Number(activeMarketing.achievedCandidates)}/${Number(activeMarketing.targetCandidates)}`
        : null,
      commissionStatus: activeMarketing?.status ?? activeAdmin?.status ?? declaration?.status ?? null,
    };

    return {
      summary,
      assignment: primaryAssignment,
      history,
    };
  }

  private buildAssignment(input: {
    companyId: string;
    companyName: string;
    employeeRole: string | null;
    adminProfile: { officeType: string } | null;
    marketingMembership: {
      team: { id: string; name: string };
    } | null;
    declaration: {
      assignments: Array<{
        companyId: string;
        teamId: string;
        commissionMethod: string;
        bigLeaderPercent: unknown;
        employeePercent: unknown;
        company: { name: string };
        team: { id: string; name: string };
      }>;
    } | null;
    latestMarketing: {
      rampPercent: unknown;
      kpiQualified: boolean;
      targetCandidates: unknown;
      carryForwardOut: unknown;
    } | null;
    carryForwardTotal: number;
  }): EmployeeCommissionAssignmentDto | null {
    const declAssignment = input.declaration?.assignments.find(
      (row) => row.companyId === input.companyId
        || row.teamId === input.marketingMembership?.team.id,
    ) ?? input.declaration?.assignments[0] ?? null;

    if (input.marketingMembership) {
      return {
        companyId: input.companyId,
        companyName: input.companyName,
        teamId: input.marketingMembership.team.id,
        teamName: input.marketingMembership.team.name,
        businessRole: input.employeeRole,
        commissionMethod: methodLabel(declAssignment?.commissionMethod ?? 'team_pool'),
        rampPercent: input.latestMarketing ? roundMoney(Number(input.latestMarketing.rampPercent) * 100) : null,
        eligibilityPercent: input.latestMarketing
          ? (input.latestMarketing.kpiQualified ? 100 : roundMoney(Number(input.latestMarketing.rampPercent) * 100))
          : null,
        bigLeaderPercent: declAssignment?.bigLeaderPercent != null
          ? Number(declAssignment.bigLeaderPercent)
          : null,
        employeePercent: declAssignment?.employeePercent != null
          ? Number(declAssignment.employeePercent)
          : null,
        target: input.latestMarketing ? Number(input.latestMarketing.targetCandidates) : null,
        carryForward: input.carryForwardTotal > 0
          ? input.carryForwardTotal
          : input.latestMarketing
            ? Number(input.latestMarketing.carryForwardOut)
            : null,
        engine: 'marketing',
      };
    }

    if (input.adminProfile) {
      return {
        companyId: input.companyId,
        companyName: input.companyName,
        teamId: null,
        teamName: null,
        businessRole: input.employeeRole,
        commissionMethod: methodLabel(input.adminProfile.officeType),
        rampPercent: null,
        eligibilityPercent: null,
        bigLeaderPercent: null,
        employeePercent: null,
        target: null,
        carryForward: null,
        engine: 'admin',
      };
    }

    if (declAssignment) {
      return {
        companyId: declAssignment.companyId,
        companyName: declAssignment.company.name,
        teamId: declAssignment.teamId,
        teamName: declAssignment.team.name,
        businessRole: input.employeeRole,
        commissionMethod: methodLabel(declAssignment.commissionMethod),
        rampPercent: null,
        eligibilityPercent: null,
        bigLeaderPercent: declAssignment.bigLeaderPercent != null
          ? Number(declAssignment.bigLeaderPercent)
          : null,
        employeePercent: declAssignment.employeePercent != null
          ? Number(declAssignment.employeePercent)
          : null,
        target: null,
        carryForward: input.carryForwardTotal > 0 ? input.carryForwardTotal : null,
        engine: 'none',
      };
    }

    return null;
  }
}
