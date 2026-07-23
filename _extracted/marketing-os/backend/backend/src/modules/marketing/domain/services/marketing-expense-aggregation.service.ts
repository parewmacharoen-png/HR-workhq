// ============================================================================
// MarketingExpenseAggregationService — pure expense metrics + commission buckets
// ============================================================================

import {
  CommissionExpenseTotals,
  MarketingExpenseCategory,
} from '../repositories/marketing-expense.repository';

export const COMMISSION_GENERAL_CATEGORIES: MarketingExpenseCategory[] = [
  'advertising',
  'deposit',
  'worker_payment',
  'worker_bonus',
  'team_operation',
  'shared_expense',
  'other',
];

export interface MarketingExpenseKpiTotals {
  contactedCount: number;
  newMemberCount: number;
  depositAmount: number;
  startedWorkCount: number;
}

export interface MarketingExpenseMetrics {
  totalExpense: number;
  costPerContact: number | null;
  costPerNewMember: number | null;
  costPerStartedWork: number | null;
  depositRoi: number | null;
  byCategory: Record<MarketingExpenseCategory, number>;
}

export function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

export function buildCommissionExpenseTotals(
  byCategory: Record<MarketingExpenseCategory, number>,
): CommissionExpenseTotals {
  const sum = (cats: MarketingExpenseCategory[]) =>
    roundMoney(cats.reduce((acc, c) => acc + (byCategory[c] ?? 0), 0));

  return {
    marketingExpense: sum(COMMISSION_GENERAL_CATEGORIES),
    lineExpense: byCategory.line_oa ?? 0,
    telesalesExpense: byCategory.telesales ?? 0,
    promotionExpense: byCategory.promotion ?? 0,
  };
}

export function buildExpenseMetrics(
  totalExpense: number,
  byCategory: Record<MarketingExpenseCategory, number>,
  kpi: MarketingExpenseKpiTotals,
): MarketingExpenseMetrics {
  const safeDiv = (numerator: number, denominator: number): number | null =>
    denominator > 0 ? roundMoney(numerator / denominator) : null;

  return {
    totalExpense: roundMoney(totalExpense),
    costPerContact: safeDiv(totalExpense, kpi.contactedCount),
    costPerNewMember: safeDiv(totalExpense, kpi.newMemberCount),
    costPerStartedWork: safeDiv(totalExpense, kpi.startedWorkCount),
    depositRoi: totalExpense > 0 ? roundMoney(kpi.depositAmount / totalExpense) : null,
    byCategory,
  };
}

export function emptyCategoryTotals(): Record<MarketingExpenseCategory, number> {
  return {
    advertising: 0,
    deposit: 0,
    worker_payment: 0,
    worker_bonus: 0,
    team_operation: 0,
    shared_expense: 0,
    line_oa: 0,
    telesales: 0,
    promotion: 0,
    other: 0,
  };
}
