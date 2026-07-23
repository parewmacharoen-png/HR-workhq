// ============================================================================
// MarketingKpiQueryService — read-only KPI from daily reports
// ============================================================================

import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { ActorContext } from '../../../shared/kernel/actor-context';
import { CompanyAccessService } from '../../../shared/kernel/company-access.service';
import { PayrollCycleResolverService } from '../../../shared/payroll/payroll-cycle-resolver.service';
import {
  MARKETING_DAILY_REPORT_REPOSITORY,
  MarketingDailyReportRepository,
} from '../domain/repositories/marketing-daily-report.repository';
import {
  MARKETING_TEAM_REPOSITORY,
  MarketingTeamRepository,
} from '../domain/repositories/marketing-team.repository';
import {
  buildKpiSnapshot,
  sumDailyReportTotals,
} from '../domain/services/marketing-kpi-aggregation.service';
import { MarketingDailyReportService } from './marketing-daily-report.service';
import { MarketingTeamService } from './marketing-team.service';
import {
  CompanyMarketingKpiResponse,
  EmployeeMarketingKpiResponse,
  TeamMarketingKpiResponse,
} from './dto/marketing-kpi.dto';
import { MarketingEmployeeNotLinkedError } from '../domain/errors/marketing.errors';

@Injectable()
export class MarketingKpiQueryService {
  constructor(
    @Inject(MARKETING_DAILY_REPORT_REPOSITORY)
    private readonly reports: MarketingDailyReportRepository,
    @Inject(MARKETING_TEAM_REPOSITORY)
    private readonly marketingTeams: MarketingTeamRepository,
    private readonly dailyReportService: MarketingDailyReportService,
    private readonly marketingTeamService: MarketingTeamService,
    private readonly prisma: PrismaService,
    private readonly companyAccess: CompanyAccessService,
    private readonly cycleResolver: PayrollCycleResolverService,
  ) {}

  async getMyKpi(
    actor: ActorContext,
    earnCycleId?: string,
  ): Promise<EmployeeMarketingKpiResponse | { error: string }> {
    const companyId = await this.resolveCompanyId(actor);
    if (!companyId) return { error: 'companyId could not be resolved for this user' };

    try {
      await this.companyAccess.assertCompanyAccess(actor, companyId);
      const kpi = await this.dailyReportService.getMyMonthlyKpi(actor, companyId, earnCycleId);
      return kpi as EmployeeMarketingKpiResponse;
    } catch (err) {
      if (err instanceof MarketingEmployeeNotLinkedError) {
        return { error: err.message };
      }
      throw err;
    }
  }

  async getTeamKpi(
    actor: ActorContext,
    companyId: string,
    teamId: string,
    earnCycleId?: string,
  ): Promise<TeamMarketingKpiResponse> {
    await this.companyAccess.assertCompanyAccess(actor, companyId);
    await this.marketingTeamService.assertCanViewTeam(actor, companyId, teamId);
    return this.dailyReportService.getTeamMonthlyKpi(actor, companyId, teamId, earnCycleId);
  }

  async getCompanyKpi(
    actor: ActorContext,
    companyId: string,
    earnCycleId?: string,
  ): Promise<CompanyMarketingKpiResponse> {
    await this.companyAccess.assertCompanyAccess(actor, companyId);
    return this.dailyReportService.getCompanyMonthlyKpi(actor, companyId, earnCycleId);
  }

  /** Finalized commission input — approved daily reports only. */
  async sumApprovedStartedWork(
    companyId: string,
    employeeId: string,
    periodStart: Date,
    periodEnd: Date,
  ): Promise<number> {
    return this.reports.sumEmployeeStartedWork(
      companyId,
      employeeId,
      periodStart,
      periodEnd,
      'final',
    );
  }

  async getEmployeeKpiSnapshot(
    companyId: string,
    employeeId: string,
    periodStart: Date,
    periodEnd: Date,
    mode: 'projected' | 'final',
  ) {
    const teamAtDate = await this.marketingTeams.getEmployeeMarketingTeamAtDate(
      companyId,
      employeeId,
      periodEnd,
    );
    const bigLeaderEmployeeId = teamAtDate
      ? await this.marketingTeams.resolveRootBigLeaderEmployeeId(teamAtDate.teamId, companyId)
      : null;
    const kpiExempt = bigLeaderEmployeeId === employeeId;
    const rows = await this.reports.listEmployeeReportsInPeriod(
      companyId,
      employeeId,
      periodStart,
      periodEnd,
      mode,
    );
    return buildKpiSnapshot(sumDailyReportTotals(rows), kpiExempt);
  }

  private async resolveCompanyId(actor: ActorContext): Promise<string | null> {
    if (actor.companyId) return actor.companyId;
    const user = await this.prisma.user.findFirst({
      where: { id: actor.userId, deletedAt: null },
      select: { employeeId: true },
    });
    if (!user?.employeeId) return null;
    const assignment = await this.prisma.employeeAssignment.findFirst({
      where: {
        employeeId: user.employeeId,
        isPrimaryCompany: true,
        effectiveTo: null,
        deletedAt: null,
      },
      select: { companyId: true },
    });
    return assignment?.companyId ?? null;
  }
}
