// ============================================================================
// marketing-expense-aggregation.service.unit.spec.ts
// ============================================================================

import {
  buildCommissionExpenseTotals,
  buildExpenseMetrics,
  emptyCategoryTotals,
} from './marketing-expense-aggregation.service';

describe('MarketingExpenseAggregationService', () => {
  it('maps approved categories into commission buckets', () => {
    const byCategory = {
      ...emptyCategoryTotals(),
      advertising: 10_000,
      worker_payment: 5_000,
      line_oa: 2_000,
      telesales: 1_500,
      promotion: 500,
    };

    expect(buildCommissionExpenseTotals(byCategory)).toEqual({
      marketingExpense: 15_000,
      lineExpense: 2_000,
      telesalesExpense: 1_500,
      promotionExpense: 500,
    });
  });

  it('computes cost per contact, member, started work, and deposit ROI', () => {
    const byCategory = { ...emptyCategoryTotals(), advertising: 20_000 };
    const metrics = buildExpenseMetrics(20_000, byCategory, {
      contactedCount: 100,
      newMemberCount: 40,
      depositAmount: 60_000,
      startedWorkCount: 20,
    });

    expect(metrics.costPerContact).toBe(200);
    expect(metrics.costPerNewMember).toBe(500);
    expect(metrics.costPerStartedWork).toBe(1000);
    expect(metrics.depositRoi).toBe(3);
  });

  it('returns null ratios when denominators are zero', () => {
    const metrics = buildExpenseMetrics(5_000, emptyCategoryTotals(), {
      contactedCount: 0,
      newMemberCount: 0,
      depositAmount: 0,
      startedWorkCount: 0,
    });

    expect(metrics.costPerContact).toBeNull();
    expect(metrics.costPerNewMember).toBeNull();
    expect(metrics.costPerStartedWork).toBeNull();
    expect(metrics.depositRoi).toBe(0);
  });
});
