// ============================================================================
// ExecutiveDailyBriefService — today / yesterday / MTD executive briefing
// Prepared for future 07:00 automation; no scheduler wired in this sprint.
// ============================================================================

import { Injectable } from '@nestjs/common';
import { ActorContext } from '../../../shared/kernel/actor-context';
import { ReportingService } from './reporting.service';
import { ExecutiveInsightService } from './executive-insight.service';
import {
  ExecutiveDailyBriefPayload,
  ExecutiveDailyBriefSection,
  ExecutiveHeadline,
} from './dto/executive-insight.dto';
import { buildExecutiveHeadline, buildExecutiveRecommendations, buildExecutiveRisks } from '../domain/services/executive-insight.builder';

interface DailyBriefQuery {
  companyId?: string;
}

@Injectable()
export class ExecutiveDailyBriefService {
  constructor(
    private readonly insights: ExecutiveInsightService,
    private readonly reporting: ReportingService,
  ) {}

  async getDailyBrief(
    actor: ActorContext,
    query: DailyBriefQuery = {},
  ): Promise<ExecutiveDailyBriefPayload> {
    const summary = await this.insights.getExecutiveSummary(actor, query);
    const recommendations = await this.insights.getExecutiveRecommendations(actor, query);
    const today = this.sectionFromSummary('today', 'Today', summary.headline, summary.finance?.net ?? 0, recommendations.recommendations);

    const yesterdayDate = new Date();
    yesterdayDate.setUTCDate(yesterdayDate.getUTCDate() - 1);
    const yesterdayDashboard = await this.loadDashboardForDate(summary.scope.companyId, yesterdayDate);
    const yesterdayHeadline = buildExecutiveHeadline({
      headcountActive: yesterdayDashboard.headcount?.active ?? summary.headline.headcountActive,
      attendanceRate: yesterdayDashboard.attendance?.rate ?? 0,
      financeNet: yesterdayDashboard.finance?.net ?? 0,
      payrollNet: yesterdayDashboard.payroll?.totalNet ?? 0,
      pendingApprovals: yesterdayDashboard.workflows?.pending ?? 0,
      riskAlertCount: 0,
      commissionOnHold: yesterdayDashboard.commission?.onHold ?? 0,
    });
    const yesterday = this.sectionFromSummary(
      'yesterday',
      'Yesterday',
      yesterdayHeadline,
      yesterdayDashboard.finance?.net ?? 0,
      recommendations.recommendations.slice(0, 2),
    );

    const mtdDashboard = summary.scope.companyId
      ? await this.reporting.getCompanyDashboard(summary.scope.companyId)
      : await this.reporting.getExecutiveDashboard();
    const mtdFinance = (mtdDashboard as { finance?: { net: number } }).finance?.net ?? summary.headline.financeNet;
    const mtd = this.sectionFromSummary(
      'mtd',
      'Month to date',
      summary.headline,
      mtdFinance,
      recommendations.recommendations,
    );

    return {
      scope: summary.scope,
      generatedAt: new Date().toISOString(),
      today,
      yesterday,
      mtd,
    };
  }

  /** Hook for future scheduled briefing job at 07:00. */
  async generateScheduledBrief(actor: ActorContext, companyId?: string): Promise<ExecutiveDailyBriefPayload> {
    return this.getDailyBrief(actor, { companyId });
  }

  private sectionFromSummary(
    period: ExecutiveDailyBriefSection['period'],
    label: string,
    headline: ExecutiveHeadline,
    financeNet: number,
    recommendations: string[],
  ): ExecutiveDailyBriefSection {
    return {
      period,
      label,
      headline,
      financeNet,
      payrollNet: headline.payrollNet,
      attendanceRate: headline.attendanceRate,
      pendingApprovals: headline.pendingApprovals,
      riskCount: headline.riskAlertCount,
      recommendations,
    };
  }

  private async loadDashboardForDate(companyId: string | null, date: Date) {
    if (companyId) {
      return this.reporting.generateCompanyDashboard(companyId, date) as Promise<{
        headcount?: { active: number };
        attendance?: { rate: number };
        payroll?: { totalNet: number };
        finance?: { net: number };
        workflows?: { pending: number };
        commission?: { onHold: number };
      }>;
    }
    return this.reporting.generateExecutiveDashboard(date) as Promise<{
      headcount?: { active: number };
      attendance?: { rate: number };
      payroll?: { totalNet: number };
      finance?: { net: number };
      workflows?: { pending: number };
      commission?: { onHold: number };
    }>;
  }
}
