// ============================================================================
// Pure aggregation helpers for Commission Executive Dashboard (unit-testable)
// ============================================================================

import {
  AdminCommissionDashboardMetrics,
  CommissionExecutiveSummary,
  MarketingCommissionDashboardMetrics,
  RawCompanyCommissionMetrics,
  RecruitmentCommissionDashboardMetrics,
  ReferralCommissionDashboardMetrics,
  TopEarnerEntry,
} from '../entities/commission-executive-dashboard.types';

export function pct(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0;
  return round2((numerator / denominator) * 100);
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function sumMarketing(a: MarketingCommissionDashboardMetrics, b: MarketingCommissionDashboardMetrics): MarketingCommissionDashboardMetrics {
  return {
    overview: {
      netProfit: round2(a.overview.netProfit + b.overview.netProfit),
      teamCommissionPool: round2(a.overview.teamCommissionPool + b.overview.teamCommissionPool),
      paidCommission: round2(a.overview.paidCommission + b.overview.paidCommission),
      holdAmount: round2(a.overview.holdAmount + b.overview.holdAmount),
      carryForwardAmount: round2(a.overview.carryForwardAmount + b.overview.carryForwardAmount),
      recoveryAmount: round2(a.overview.recoveryAmount + b.overview.recoveryAmount),
      expiredAmount: round2(a.overview.expiredAmount + b.overview.expiredAmount),
      redistributedAmount: round2(a.overview.redistributedAmount + b.overview.redistributedAmount),
      bigLeaderCommission: round2(a.overview.bigLeaderCommission + b.overview.bigLeaderCommission),
    },
    teamStatistics: {
      totalMembers: a.teamStatistics.totalMembers + b.teamStatistics.totalMembers,
      qualifiedMembers: a.teamStatistics.qualifiedMembers + b.teamStatistics.qualifiedMembers,
      holdMembers: a.teamStatistics.holdMembers + b.teamStatistics.holdMembers,
      newHireMembers: a.teamStatistics.newHireMembers + b.teamStatistics.newHireMembers,
      averageCommission: 0,
    },
    kpiStatistics: {
      passedKpi: a.kpiStatistics.passedKpi + b.kpiStatistics.passedKpi,
      failedKpi: a.kpiStatistics.failedKpi + b.kpiStatistics.failedKpi,
      successRatePercent: 0,
    },
  };
}

export function finalizeMarketingAggregates(m: MarketingCommissionDashboardMetrics): MarketingCommissionDashboardMetrics {
  const totalKpi = m.kpiStatistics.passedKpi + m.kpiStatistics.failedKpi;
  const paidCount = m.teamStatistics.totalMembers > 0
    ? m.teamStatistics.qualifiedMembers + m.teamStatistics.holdMembers
    : 0;
  return {
    ...m,
    teamStatistics: {
      ...m.teamStatistics,
      averageCommission: paidCount > 0
        ? round2(m.overview.paidCommission / paidCount)
        : 0,
    },
    kpiStatistics: {
      ...m.kpiStatistics,
      successRatePercent: pct(m.kpiStatistics.passedKpi, totalKpi),
    },
  };
}

export function sumAdmin(a: AdminCommissionDashboardMetrics, b: AdminCommissionDashboardMetrics): AdminCommissionDashboardMetrics {
  const penalized = a.employeeBreakdown.employeesPenalized + b.employeeBreakdown.employeesPenalized;
  return {
    overview: {
      adminPool: round2(a.overview.adminPool + b.overview.adminPool),
      poolA: round2(a.overview.poolA + b.overview.poolA),
      poolB: round2(a.overview.poolB + b.overview.poolB),
      totalPayable: round2(a.overview.totalPayable + b.overview.totalPayable),
      totalPenalties: round2(a.overview.totalPenalties + b.overview.totalPenalties),
      totalRedistributed: round2(a.overview.totalRedistributed + b.overview.totalRedistributed),
    },
    employeeBreakdown: {
      frontOfficeTotal: round2(a.employeeBreakdown.frontOfficeTotal + b.employeeBreakdown.frontOfficeTotal),
      backOfficeTotal: round2(a.employeeBreakdown.backOfficeTotal + b.employeeBreakdown.backOfficeTotal),
      employeesPenalized: penalized,
      averagePenaltyPercent: 0,
    },
    shiftStatistics: {
      dayShiftTotal: round2(a.shiftStatistics.dayShiftTotal + b.shiftStatistics.dayShiftTotal),
      nightShiftTotal: round2(a.shiftStatistics.nightShiftTotal + b.shiftStatistics.nightShiftTotal),
      shiftTransfers: a.shiftStatistics.shiftTransfers + b.shiftStatistics.shiftTransfers,
    },
  };
}

export function finalizeAdminAggregates(a: AdminCommissionDashboardMetrics): AdminCommissionDashboardMetrics {
  const poolBase = a.overview.adminPool;
  return {
    ...a,
    employeeBreakdown: {
      ...a.employeeBreakdown,
      averagePenaltyPercent: poolBase > 0
        ? pct(a.overview.totalPenalties, poolBase)
        : 0,
    },
  };
}

export function sumReferral(a: ReferralCommissionDashboardMetrics, b: ReferralCommissionDashboardMetrics): ReferralCommissionDashboardMetrics {
  const merged = {
    overview: {
      pendingReferrals: a.overview.pendingReferrals + b.overview.pendingReferrals,
      qualifiedReferrals: a.overview.qualifiedReferrals + b.overview.qualifiedReferrals,
      paidReferrals: a.overview.paidReferrals + b.overview.paidReferrals,
    },
    financial: {
      pendingRewards: round2(a.financial.pendingRewards + b.financial.pendingRewards),
      qualifiedRewards: round2(a.financial.qualifiedRewards + b.financial.qualifiedRewards),
      paidRewards: round2(a.financial.paidRewards + b.financial.paidRewards),
      totalReferralCost: round2(a.financial.totalReferralCost + b.financial.totalReferralCost),
    },
    conversion: { referralToQualifiedPercent: 0, qualifiedToPaidPercent: 0 },
  };
  return finalizeReferralAggregates(merged);
}

export function finalizeReferralAggregates(r: ReferralCommissionDashboardMetrics): ReferralCommissionDashboardMetrics {
  const total = r.overview.pendingReferrals + r.overview.qualifiedReferrals + r.overview.paidReferrals;
  const qualifiedOrPaid = r.overview.qualifiedReferrals + r.overview.paidReferrals;
  return {
    ...r,
    conversion: {
      referralToQualifiedPercent: pct(qualifiedOrPaid, total),
      qualifiedToPaidPercent: pct(r.overview.paidReferrals, r.overview.qualifiedReferrals + r.overview.paidReferrals),
    },
  };
}

export function sumRecruitment(a: RecruitmentCommissionDashboardMetrics, b: RecruitmentCommissionDashboardMetrics): RecruitmentCommissionDashboardMetrics {
  return {
    overview: {
      recruitersQualified: a.overview.recruitersQualified + b.overview.recruitersQualified,
      recruitersOnHold: a.overview.recruitersOnHold + b.overview.recruitersOnHold,
      recruitersFailedTarget: a.overview.recruitersFailedTarget + b.overview.recruitersFailedTarget,
    },
    candidateMetrics: {
      totalCandidates: a.candidateMetrics.totalCandidates + b.candidateMetrics.totalCandidates,
      qualifiedCandidates: a.candidateMetrics.qualifiedCandidates + b.candidateMetrics.qualifiedCandidates,
      hiredCandidates: a.candidateMetrics.hiredCandidates + b.candidateMetrics.hiredCandidates,
    },
    commissionMetrics: {
      qualifiedCommission: round2(a.commissionMetrics.qualifiedCommission + b.commissionMetrics.qualifiedCommission),
      holdCommission: round2(a.commissionMetrics.holdCommission + b.commissionMetrics.holdCommission),
      paidCommission: round2(a.commissionMetrics.paidCommission + b.commissionMetrics.paidCommission),
    },
  };
}

export function mergeTopEarners(lists: TopEarnerEntry[][], limit = 10): TopEarnerEntry[] {
  const byKey = new Map<string, TopEarnerEntry>();
  for (const list of lists) {
    for (const entry of list) {
      const key = `${entry.companyId ?? ''}:${entry.employeeId}`;
      const existing = byKey.get(key);
      if (existing) {
        existing.amount = round2(existing.amount + entry.amount);
      } else {
        byKey.set(key, { ...entry });
      }
    }
  }
  return [...byKey.values()].sort((a, b) => b.amount - a.amount).slice(0, limit);
}

export function buildExecutiveSummary(
  marketing: MarketingCommissionDashboardMetrics,
  admin: AdminCommissionDashboardMetrics,
  referral: ReferralCommissionDashboardMetrics,
  recruitment: RecruitmentCommissionDashboardMetrics,
  tops: {
    topMarketingEarners: TopEarnerEntry[];
    topRecruiters: TopEarnerEntry[];
    highestAdminCommission: TopEarnerEntry[];
    highestReferralEarners: TopEarnerEntry[];
  },
): CommissionExecutiveSummary {
  const totalPaid = round2(
    marketing.overview.paidCommission
    + admin.overview.totalPayable
    + referral.financial.paidRewards
    + recruitment.commissionMetrics.paidCommission,
  );
  const totalPending = round2(
    referral.financial.pendingRewards
    + referral.financial.qualifiedRewards
    + recruitment.commissionMetrics.qualifiedCommission,
  );
  const totalHold = round2(marketing.overview.holdAmount + recruitment.commissionMetrics.holdCommission);
  const totalCarryForward = marketing.overview.carryForwardAmount;
  const totalRedistributed = round2(
    marketing.overview.redistributedAmount + admin.overview.totalRedistributed,
  );

  const totalCommissionExpense = round2(
    marketing.overview.teamCommissionPool
    + marketing.overview.bigLeaderCommission
    + admin.overview.adminPool
    + referral.financial.totalReferralCost
    + recruitment.commissionMetrics.qualifiedCommission
    + recruitment.commissionMetrics.holdCommission
    + recruitment.commissionMetrics.paidCommission,
  );

  return {
    totalCommissionExpense,
    totalPaid,
    totalPending,
    totalHold,
    totalCarryForward,
    totalRedistributed: round2(totalRedistributed),
    totalReferralCost: referral.financial.totalReferralCost,
    topMarketingEarners: tops.topMarketingEarners,
    topRecruiters: tops.topRecruiters,
    highestAdminCommission: tops.highestAdminCommission,
    highestReferralEarners: tops.highestReferralEarners,
  };
}

export function aggregateCompanyMetrics(rows: RawCompanyCommissionMetrics[]): {
  marketing: MarketingCommissionDashboardMetrics;
  admin: AdminCommissionDashboardMetrics;
  referral: ReferralCommissionDashboardMetrics;
  recruitment: RecruitmentCommissionDashboardMetrics;
  tops: {
    topMarketingEarners: TopEarnerEntry[];
    topRecruiters: TopEarnerEntry[];
    highestAdminCommission: TopEarnerEntry[];
    highestReferralEarners: TopEarnerEntry[];
  };
} {
  if (rows.length === 0) {
    return emptyAggregates();
  }

  let marketing = rows[0]!.marketing;
  let admin = rows[0]!.admin;
  let referral = rows[0]!.referral;
  let recruitment = rows[0]!.recruitment;

  for (let i = 1; i < rows.length; i += 1) {
    const row = rows[i]!;
    marketing = sumMarketing(marketing, row.marketing);
    admin = sumAdmin(admin, row.admin);
    referral = sumReferral(referral, row.referral);
    recruitment = sumRecruitment(recruitment, row.recruitment);
  }

  return {
    marketing: finalizeMarketingAggregates(marketing),
    admin: finalizeAdminAggregates(admin),
    referral,
    recruitment,
    tops: {
      topMarketingEarners: mergeTopEarners(rows.map((r) => r.topMarketingEarners)),
      topRecruiters: mergeTopEarners(rows.map((r) => r.topRecruiters)),
      highestAdminCommission: mergeTopEarners(rows.map((r) => r.highestAdminCommission)),
      highestReferralEarners: mergeTopEarners(rows.map((r) => r.highestReferralEarners)),
    },
  };
}

export function emptyAggregates() {
  const zeroMarketing: MarketingCommissionDashboardMetrics = {
    overview: {
      netProfit: 0, teamCommissionPool: 0, paidCommission: 0, holdAmount: 0,
      carryForwardAmount: 0, recoveryAmount: 0, expiredAmount: 0, redistributedAmount: 0, bigLeaderCommission: 0,
    },
    teamStatistics: {
      totalMembers: 0, qualifiedMembers: 0, holdMembers: 0, newHireMembers: 0, averageCommission: 0,
    },
    kpiStatistics: { passedKpi: 0, failedKpi: 0, successRatePercent: 0 },
  };
  const zeroAdmin: AdminCommissionDashboardMetrics = {
    overview: {
      adminPool: 0, poolA: 0, poolB: 0, totalPayable: 0, totalPenalties: 0, totalRedistributed: 0,
    },
    employeeBreakdown: {
      frontOfficeTotal: 0, backOfficeTotal: 0, employeesPenalized: 0, averagePenaltyPercent: 0,
    },
    shiftStatistics: { dayShiftTotal: 0, nightShiftTotal: 0, shiftTransfers: 0 },
  };
  const zeroReferral: ReferralCommissionDashboardMetrics = {
    overview: { pendingReferrals: 0, qualifiedReferrals: 0, paidReferrals: 0 },
    financial: { pendingRewards: 0, qualifiedRewards: 0, paidRewards: 0, totalReferralCost: 0 },
    conversion: { referralToQualifiedPercent: 0, qualifiedToPaidPercent: 0 },
  };
  const zeroRecruitment: RecruitmentCommissionDashboardMetrics = {
    overview: { recruitersQualified: 0, recruitersOnHold: 0, recruitersFailedTarget: 0 },
    candidateMetrics: { totalCandidates: 0, qualifiedCandidates: 0, hiredCandidates: 0 },
    commissionMetrics: { qualifiedCommission: 0, holdCommission: 0, paidCommission: 0 },
  };
  return {
    marketing: zeroMarketing,
    admin: zeroAdmin,
    referral: zeroReferral,
    recruitment: zeroRecruitment,
    tops: {
      topMarketingEarners: [],
      topRecruiters: [],
      highestAdminCommission: [],
      highestReferralEarners: [],
    },
  };
}
