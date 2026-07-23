import { apiGet } from '../api/client';
import type { CompanyOption } from '../api/client';
import type { AssetListItem, BorrowSummaryEmployee, BorrowSummaryResponse } from '../api/assets';
import type { CompensationDashboard } from '../api/compensation-review';
import type { KpiCycle, KpiDashboard } from '../api/kpi';
import type { OnboardingDashboardStats } from '../api/employee-onboarding';
import type { PayrollCycle } from '../api/payroll';

export async function fetchForEachCompany<T>(
  companyIds: string[],
  fetcher: (companyId: string) => Promise<T>,
): Promise<Array<{ companyId: string; result: T }>> {
  const settled = await Promise.all(
    companyIds.map(async (companyId) => {
      try {
        const result = await fetcher(companyId);
        return { companyId, result };
      } catch {
        return { companyId, result: null as T };
      }
    }),
  );
  return settled.filter((row): row is { companyId: string; result: T } => row.result !== null);
}

/** Fetch the same list endpoint for each company and merge rows (optional company label). */
export async function apiGetMergedForCompanies<T>(
  path: string,
  companyIds: string[],
  companies: CompanyOption[],
  params?: Record<string, string | undefined>,
): Promise<Array<T & { companyId: string; companyName: string }>> {
  const rows = await fetchForEachCompany(companyIds, (companyId) =>
    apiGet<T[]>(path, { ...params, companyId }),
  );
  return rows.flatMap(({ companyId, result }) =>
    result.map((row) => ({
      ...row,
      companyId,
      companyName: companies.find((c) => c.id === companyId)?.name ?? companyId,
    })),
  );
}

export function mergeCompensationDashboards(rows: CompensationDashboard[]): CompensationDashboard {
  return {
    companyId: 'all',
    pendingSalaryReviews: rows.flatMap((r) => r.pendingSalaryReviews),
    pendingPromotionReviews: rows.flatMap((r) => r.pendingPromotionReviews),
    upcomingSalaryChanges: rows.flatMap((r) => r.upcomingSalaryChanges),
    upcomingPromotionChanges: rows.flatMap((r) => r.upcomingPromotionChanges),
  };
}

export function mergePayrollCycles(
  rows: Array<{ companyId: string; companyLabel?: string; result: PayrollCycle[] }>,
): Array<PayrollCycle & { companyLabel?: string }> {
  return rows
    .flatMap((row) => row.result.map((cycle) => ({
      ...cycle,
      companyLabel: row.companyLabel,
    })))
    .sort((a, b) => b.periodStart.localeCompare(a.periodStart));
}

export function companyNameOf(companies: CompanyOption[], companyId: string): string {
  return companies.find((company) => company.id === companyId)?.name ?? companyId;
}

export function mergeBorrowSummaries(
  rows: Array<{ companyId: string; result: BorrowSummaryResponse }>,
  companies: CompanyOption[],
): {
  totalActive: number;
  byEmployee: Array<BorrowSummaryEmployee & { companyId: string; companyName: string }>;
} {
  const byEmployee = rows.flatMap(({ companyId, result }) =>
    result.byEmployee.map((employee) => ({
      ...employee,
      companyId,
      companyName: companyNameOf(companies, companyId),
    })),
  );
  return {
    totalActive: rows.reduce((sum, row) => sum + row.result.totalActive, 0),
    byEmployee,
  };
}

export function mergeAssetLists(
  rows: Array<{ companyId: string; result: AssetListItem[] }>,
  companies: CompanyOption[],
): Array<AssetListItem & { companyName: string }> {
  return rows.flatMap(({ companyId, result }) =>
    result.map((asset) => ({
      ...asset,
      companyName: companyNameOf(companies, companyId),
    })),
  );
}

export function mergeKpiCycles(
  rows: Array<{ companyId: string; result: KpiCycle[] }>,
  companies: CompanyOption[],
): Array<KpiCycle & { companyName: string }> {
  return rows
    .flatMap(({ companyId, result }) =>
      result.map((cycle) => ({
        ...cycle,
        companyName: companyNameOf(companies, companyId),
      })),
    )
    .sort((a, b) => b.periodStart.localeCompare(a.periodStart));
}

export function mergeKpiDashboards(rows: KpiDashboard[]): KpiDashboard {
  return {
    companyId: 'all',
    activeCycles: rows.flatMap((row) => row.activeCycles),
    pendingAssignments: rows.flatMap((row) => row.pendingAssignments),
    submittedAssignments: rows.flatMap((row) => row.submittedAssignments),
    recentlyFinalized: rows.flatMap((row) => row.recentlyFinalized),
  };
}

export function sumOnboardingStats(rows: OnboardingDashboardStats[]): OnboardingDashboardStats {
  return rows.reduce(
    (acc, s) => ({
      notConnected: acc.notConnected + s.notConnected,
      invitePending: acc.invitePending + s.invitePending,
      inviteExpired: acc.inviteExpired + s.inviteExpired,
      inProgress: acc.inProgress + s.inProgress,
      pendingReview: acc.pendingReview + s.pendingReview,
      pendingDocuments: acc.pendingDocuments + s.pendingDocuments,
    }),
    {
      notConnected: 0,
      invitePending: 0,
      inviteExpired: 0,
      inProgress: 0,
      pendingReview: 0,
      pendingDocuments: 0,
    },
  );
}
