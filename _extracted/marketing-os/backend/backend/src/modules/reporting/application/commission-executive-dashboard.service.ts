// ============================================================================
// CommissionExecutiveDashboardService — unified executive commission view
// ============================================================================

import { Inject, Injectable } from '@nestjs/common';
import {
  COMMISSION_EXECUTIVE_DASHBOARD_REPOSITORY,
  CommissionExecutiveDashboardRepository,
} from '../domain/repositories/commission-executive-dashboard.repository';
import {
  CommissionDashboardQuery,
  CommissionDashboardDateRange,
  CommissionExecutiveDashboard,
  CommissionDashboardBlock,
} from '../domain/entities/commission-executive-dashboard.types';
import {
  aggregateCompanyMetrics,
  buildExecutiveSummary,
} from '../domain/services/commission-executive-dashboard.builder';
import { ActorContext } from '../../../shared/kernel/actor-context';
import { CompanyAccessService } from '../../../shared/kernel/company-access.service';
import { MarketingExpenseService } from '../../marketing/application/marketing-expense.service';

@Injectable()
export class CommissionExecutiveDashboardService {
  constructor(
    @Inject(COMMISSION_EXECUTIVE_DASHBOARD_REPOSITORY)
    private readonly repo: CommissionExecutiveDashboardRepository,
    private readonly companyAccess: CompanyAccessService,
    private readonly marketingExpenses: MarketingExpenseService,
  ) {}

  async getDashboard(
    actor: ActorContext,
    query: CommissionDashboardQuery = {},
  ): Promise<CommissionExecutiveDashboard> {
    const range = this.resolveDateRange(query.from, query.to);
    const companyIds = await this.resolveCompanyIds(actor, query.companyId);
    const companies = await this.repo.listActiveCompanies();
    const companyNameById = new Map(companies.map((c) => [c.id, c.name]));

    const rows = await Promise.all(
      companyIds.map((id) => this.repo.fetchCompanyMetrics(
        id,
        companyNameById.get(id) ?? id,
        range.from,
        range.to,
        query.earnCycleId,
      )),
    );

    const aggregated = aggregateCompanyMetrics(rows);
    const executiveSummary = buildExecutiveSummary(
      aggregated.marketing,
      aggregated.admin,
      aggregated.referral,
      aggregated.recruitment,
      aggregated.tops,
    );

    let previousMonth: CommissionExecutiveDashboard['previousMonth'];
    if (query.comparePreviousMonth) {
      const prevRange = this.previousMonthRange(range.to);
      const prevRows = await Promise.all(
        companyIds.map((id) => this.repo.fetchCompanyMetrics(
          id,
          companyNameById.get(id) ?? id,
          prevRange.from,
          prevRange.to,
          query.earnCycleId,
        )),
      );
      const prevAgg = aggregateCompanyMetrics(prevRows);
      previousMonth = buildExecutiveSummary(
        prevAgg.marketing,
        prevAgg.admin,
        prevAgg.referral,
        prevAgg.recruitment,
        prevAgg.tops,
      );
    }

    const singleCompany = companyIds.length === 1 ? companyIds[0]! : null;

    let marketingExpenses: CommissionExecutiveDashboard['marketingExpenses'] = null;
    if (singleCompany) {
      const summary = await this.marketingExpenses.getCompanyExpenseSummaryForAi(
        actor,
        singleCompany,
        query.earnCycleId ?? undefined,
      );
      marketingExpenses = {
        totalExpense: summary.totalExpense,
        costPerContact: summary.costPerContact,
        costPerNewMember: summary.costPerNewMember,
        costPerStartedWork: summary.costPerStartedWork,
        depositRoi: summary.depositRoi,
        byCategory: summary.byCategory,
      };
    }

    return {
      meta: {
        generatedAt: new Date().toISOString(),
        from: range.from.toISOString().slice(0, 10),
        to: range.to.toISOString().slice(0, 10),
        companyId: singleCompany,
        companyName: singleCompany ? (companyNameById.get(singleCompany) ?? null) : null,
        earnCycleId: query.earnCycleId ?? null,
        dateRangeLabel: range.label,
      },
      marketing: aggregated.marketing,
      admin: aggregated.admin,
      referral: aggregated.referral,
      recruitment: aggregated.recruitment,
      executiveSummary,
      marketingExpenses,
      ...(previousMonth ? { previousMonth } : {}),
    };
  }

  resolveDateRange(from?: Date, to?: Date): CommissionDashboardDateRange {
    if (from && to) {
      return { from, to, label: 'custom' };
    }
    const now = new Date();
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999));
    return { from: start, to: end, label: 'month_to_date' };
  }

  previousMonthRange(asOf: Date): CommissionDashboardDateRange {
    const start = new Date(Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth() - 1, 1));
    const end = new Date(Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth(), 0, 23, 59, 59, 999));
    return { from: start, to: end, label: 'previous_month' };
  }

  async getOwnerDashboardBlock(_date = new Date()): Promise<CommissionDashboardBlock> {
    const range = this.resolveDateRange(undefined, undefined);
    const companies = await this.repo.listActiveCompanies();
    const rows = await Promise.all(
      companies.map((c) => this.repo.fetchCompanyMetrics(c.id, c.name, range.from, range.to)),
    );
    const aggregated = aggregateCompanyMetrics(rows);
    const executiveSummary = buildExecutiveSummary(
      aggregated.marketing,
      aggregated.admin,
      aggregated.referral,
      aggregated.recruitment,
      aggregated.tops,
    );
    return {
      marketing: aggregated.marketing,
      admin: aggregated.admin,
      referral: aggregated.referral,
      recruitment: aggregated.recruitment,
      executiveSummary,
    };
  }

  private async resolveCompanyIds(actor: ActorContext, companyId?: string): Promise<string[]> {
    if (companyId) {
      await this.companyAccess.assertCompanyAccess(actor, companyId);
      return [companyId];
    }
    if (await this.companyAccess.hasAllScope(actor.userId)) {
      return (await this.repo.listActiveCompanies()).map((c) => c.id);
    }
    const granted = await this.repo.listGrantedCompanyIds(actor.userId);
    if (granted.length > 0) return granted;
    if (actor.companyId) {
      await this.companyAccess.assertCompanyAccess(actor, actor.companyId);
      return [actor.companyId];
    }
    throw new Error('No accessible companies for commission dashboard');
  }
}
