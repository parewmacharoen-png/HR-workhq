// ============================================================================
// Commission Executive Dashboard builder unit tests
// ============================================================================

import {
  aggregateCompanyMetrics,
  buildExecutiveSummary,
  finalizeReferralAggregates,
  mergeTopEarners,
  pct,
  sumMarketing,
} from './commission-executive-dashboard.builder';
import {
  AdminCommissionDashboardMetrics,
  MarketingCommissionDashboardMetrics,
  RawCompanyCommissionMetrics,
  RecruitmentCommissionDashboardMetrics,
  ReferralCommissionDashboardMetrics,
} from '../entities/commission-executive-dashboard.types';

const zeroMarketing = (): MarketingCommissionDashboardMetrics => ({
  overview: {
    netProfit: 0, teamCommissionPool: 0, paidCommission: 0, holdAmount: 0,
    carryForwardAmount: 0, recoveryAmount: 0, expiredAmount: 0, redistributedAmount: 0, bigLeaderCommission: 0,
  },
  teamStatistics: {
    totalMembers: 0, qualifiedMembers: 0, holdMembers: 0, newHireMembers: 0, averageCommission: 0,
  },
  kpiStatistics: { passedKpi: 0, failedKpi: 0, successRatePercent: 0 },
});

const zeroAdmin = (): AdminCommissionDashboardMetrics => ({
  overview: {
    adminPool: 0, poolA: 0, poolB: 0, totalPayable: 0, totalPenalties: 0, totalRedistributed: 0,
  },
  employeeBreakdown: {
    frontOfficeTotal: 0, backOfficeTotal: 0, employeesPenalized: 0, averagePenaltyPercent: 0,
  },
  shiftStatistics: { dayShiftTotal: 0, nightShiftTotal: 0, shiftTransfers: 0 },
});

const zeroReferral = (): ReferralCommissionDashboardMetrics => ({
  overview: { pendingReferrals: 0, qualifiedReferrals: 0, paidReferrals: 0 },
  financial: { pendingRewards: 0, qualifiedRewards: 0, paidRewards: 0, totalReferralCost: 0 },
  conversion: { referralToQualifiedPercent: 0, qualifiedToPaidPercent: 0 },
});

const zeroRecruitment = (): RecruitmentCommissionDashboardMetrics => ({
  overview: { recruitersQualified: 0, recruitersOnHold: 0, recruitersFailedTarget: 0 },
  candidateMetrics: { totalCandidates: 0, qualifiedCandidates: 0, hiredCandidates: 0 },
  commissionMetrics: { qualifiedCommission: 0, holdCommission: 0, paidCommission: 0 },
});

describe('CommissionExecutiveDashboard builder', () => {
  describe('pct', () => {
    it('calculates percentage', () => {
      expect(pct(3, 4)).toBe(75);
    });

    it('returns 0 when denominator is 0', () => {
      expect(pct(5, 0)).toBe(0);
    });
  });

  describe('sumMarketing', () => {
    it('aggregates marketing overview across companies', () => {
      const a = zeroMarketing();
      a.overview.teamCommissionPool = 1000;
      a.kpiStatistics.passedKpi = 2;
      const b = zeroMarketing();
      b.overview.teamCommissionPool = 500;
      b.kpiStatistics.passedKpi = 1;
      const merged = sumMarketing(a, b);
      expect(merged.overview.teamCommissionPool).toBe(1500);
      expect(merged.kpiStatistics.passedKpi).toBe(3);
    });
  });

  describe('finalizeReferralAggregates', () => {
    it('computes conversion percentages', () => {
      const result = finalizeReferralAggregates({
        overview: { pendingReferrals: 1, qualifiedReferrals: 2, paidReferrals: 1 },
        financial: { pendingRewards: 0, qualifiedRewards: 100, paidRewards: 50, totalReferralCost: 150 },
        conversion: { referralToQualifiedPercent: 0, qualifiedToPaidPercent: 0 },
      });
      expect(result.conversion.referralToQualifiedPercent).toBe(75);
      expect(result.conversion.qualifiedToPaidPercent).toBe(33.33);
    });
  });

  describe('mergeTopEarners', () => {
    it('sorts by amount descending and limits to 10', () => {
      const merged = mergeTopEarners([
        [{ employeeId: 'a', employeeName: 'A', amount: 100 }],
        [{ employeeId: 'b', employeeName: 'B', amount: 500 }],
        [{ employeeId: 'a', employeeName: 'A', amount: 50 }],
      ]);
      expect(merged[0]!.employeeId).toBe('b');
      expect(merged[1]!.amount).toBe(150);
    });
  });

  describe('buildExecutiveSummary', () => {
    it('totals paid, pending, hold, and referral cost', () => {
      const marketing = zeroMarketing();
      marketing.overview.paidCommission = 1000;
      marketing.overview.holdAmount = 200;
      marketing.overview.carryForwardAmount = 150;
      marketing.overview.redistributedAmount = 50;

      const admin = zeroAdmin();
      admin.overview.totalPayable = 300;
      admin.overview.totalRedistributed = 25;

      const referral = zeroReferral();
      referral.financial.paidRewards = 400;
      referral.financial.qualifiedRewards = 100;
      referral.financial.totalReferralCost = 500;

      const recruitment = zeroRecruitment();
      recruitment.commissionMetrics.paidCommission = 600;
      recruitment.commissionMetrics.qualifiedCommission = 50;

      const summary = buildExecutiveSummary(
        marketing,
        admin,
        referral,
        recruitment,
        {
          topMarketingEarners: [],
          topRecruiters: [],
          highestAdminCommission: [],
          highestReferralEarners: [],
        },
      );

      expect(summary.totalPaid).toBe(2300);
      expect(summary.totalPending).toBe(150);
      expect(summary.totalHold).toBe(200);
      expect(summary.totalCarryForward).toBe(150);
      expect(summary.totalRedistributed).toBe(75);
      expect(summary.totalReferralCost).toBe(500);
    });
  });

  describe('aggregateCompanyMetrics', () => {
    it('aggregates multi-company rows', () => {
      const row = (pool: number): RawCompanyCommissionMetrics => ({
        companyId: 'c1',
        companyName: 'Co',
        marketing: { ...zeroMarketing(), overview: { ...zeroMarketing().overview, teamCommissionPool: pool } },
        admin: zeroAdmin(),
        referral: zeroReferral(),
        recruitment: zeroRecruitment(),
        topMarketingEarners: [{ employeeId: 'e1', employeeName: 'E1', amount: pool }],
        topRecruiters: [],
        highestAdminCommission: [],
        highestReferralEarners: [],
      });

      const agg = aggregateCompanyMetrics([row(100), row(200)]);
      expect(agg.marketing.overview.teamCommissionPool).toBe(300);
      expect(agg.tops.topMarketingEarners[0]!.amount).toBe(300);
    });

    it('returns empty aggregates for no companies', () => {
      const agg = aggregateCompanyMetrics([]);
      expect(agg.marketing.overview.teamCommissionPool).toBe(0);
    });
  });
});
