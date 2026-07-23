// ============================================================================
// Commission Executive Dashboard — Prisma data access
// ============================================================================

import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import {
  CommissionExecutiveDashboardRepository,
} from '../../domain/repositories/commission-executive-dashboard.repository';
import {
  RawCompanyCommissionMetrics,
  TopEarnerEntry,
} from '../../domain/entities/commission-executive-dashboard.types';
import {
  finalizeAdminAggregates,
  finalizeMarketingAggregates,
  finalizeReferralAggregates,
  round2,
} from '../../domain/services/commission-executive-dashboard.builder';

@Injectable()
export class PrismaCommissionExecutiveDashboardRepository implements CommissionExecutiveDashboardRepository {
  constructor(private readonly prisma: PrismaService) {}

  async listActiveCompanies() {
    return this.prisma.company.findMany({
      where: { isActive: true, deletedAt: null },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
  }

  async listGrantedCompanyIds(userId: string): Promise<string[]> {
    const grants = await this.prisma.scopeGrant.findMany({
      where: { userId, deletedAt: null, scopeType: 'company', companyId: { not: null } },
      select: { companyId: true },
    });
    return grants.map((g) => g.companyId!).filter(Boolean);
  }

  async fetchCompanyMetrics(
    companyId: string,
    companyName: string,
    from: Date,
    to: Date,
    earnCycleId?: string,
  ): Promise<RawCompanyCommissionMetrics> {
    const cycleFilter = earnCycleId
      ? { earnCycleId }
      : { earnCycle: { periodEnd: { gte: from, lte: to } } };

    const [
      marketing,
      admin,
      referral,
      recruitment,
      topMarketing,
      topRecruiters,
      topAdmin,
      topReferral,
    ] = await Promise.all([
      this.fetchMarketing(companyId, cycleFilter, from, to),
      this.fetchAdmin(companyId, cycleFilter, from, to),
      this.fetchReferral(companyId, from, to),
      this.fetchRecruitment(companyId, cycleFilter, from, to),
      this.topMarketingEarners(companyId, cycleFilter, 10),
      this.topRecruiters(companyId, cycleFilter, 10),
      this.topAdminEarners(companyId, cycleFilter, 10),
      this.topReferralEarners(companyId, from, to, 10),
    ]);

    const enrich = (rows: TopEarnerEntry[]) => rows.map((r) => ({
      ...r,
      companyId,
      companyName,
    }));

    return {
      companyId,
      companyName,
      marketing: finalizeMarketingAggregates(marketing),
      admin: finalizeAdminAggregates(admin),
      referral: finalizeReferralAggregates(referral),
      recruitment,
      topMarketingEarners: enrich(topMarketing),
      topRecruiters: enrich(topRecruiters),
      highestAdminCommission: enrich(topAdmin),
      highestReferralEarners: enrich(topReferral),
    };
  }

  private async fetchMarketing(
    companyId: string,
    cycleFilter: Prisma.MarketingCommissionCycleWhereInput,
    from: Date,
    to: Date,
  ) {
    const cycles = await this.prisma.marketingCommissionCycle.findMany({
      where: { companyId, deletedAt: null, ...cycleFilter },
      include: { memberResults: true },
    });

    const cycleIds = cycles.map((c) => c.id);
    const members = cycles.flatMap((c) => c.memberResults);

    const [carried, recovered, expired, redistributed] = await Promise.all([
      this.prisma.marketingCommissionCarryForward.findMany({
        where: { companyId, status: 'pending', deletedAt: null },
        select: { amount: true },
      }),
      this.prisma.marketingCommissionCarryForward.findMany({
        where: {
          companyId,
          status: 'recovered',
          deletedAt: null,
          updatedAt: { gte: from, lte: to },
        },
        select: { amount: true },
      }),
      this.prisma.marketingCommissionCarryForward.findMany({
        where: {
          companyId,
          status: 'expired',
          deletedAt: null,
          updatedAt: { gte: from, lte: to },
        },
        select: { amount: true },
      }),
      cycleIds.length
        ? this.prisma.marketingCommissionRedistribution.findMany({
          where: { cycleId: { in: cycleIds } },
          select: { amount: true },
        })
        : Promise.resolve([]),
    ]);

    const paidCommission = sum(members.filter((m) => m.status === 'paid').map((m) => Number(m.finalPayout)));
    const holdAmount = sum(members.filter((m) => m.status === 'carried_forward').map((m) => Number(m.carryForwardOut)));
    const qualifiedMembers = members.filter((m) => m.kpiQualified).length;
    const holdMembers = members.filter((m) => m.status === 'carried_forward').length;
    const newHireMembers = members.filter((m) => Number(m.rampPercent) < 1).length;
    const passedKpi = members.filter((m) => m.kpiQualified && !m.kpiExempt).length;
    const failedKpi = members.filter((m) => !m.kpiQualified && !m.kpiExempt).length;

    return {
      overview: {
        netProfit: sum(cycles.map((c) => Number(c.netProfit))),
        teamCommissionPool: sum(cycles.map((c) => Number(c.teamCommissionPool))),
        paidCommission,
        holdAmount,
        carryForwardAmount: sum(carried.map((c) => Number(c.amount))),
        recoveryAmount: sum(recovered.map((c) => Number(c.amount))),
        expiredAmount: sum(expired.map((c) => Number(c.amount))),
        redistributedAmount: sum(redistributed.map((r) => Number(r.amount))),
        bigLeaderCommission: sum(cycles.map((c) => Number(c.bigLeaderCommission))),
      },
      teamStatistics: {
        totalMembers: members.length,
        qualifiedMembers,
        holdMembers,
        newHireMembers,
        averageCommission: 0,
      },
      kpiStatistics: {
        passedKpi,
        failedKpi,
        successRatePercent: 0,
      },
    };
  }

  private async fetchAdmin(
    companyId: string,
    cycleFilter: Prisma.AdminCommissionCycleWhereInput,
    from: Date,
    to: Date,
  ) {
    const cycles = await this.prisma.adminCommissionCycle.findMany({
      where: { companyId, deletedAt: null, ...cycleFilter },
      include: { memberResults: true, penalties: true },
    });

    const members = cycles.flatMap((c) => c.memberResults);
    let dayShiftTotal = 0;
    let nightShiftTotal = 0;
    for (const m of members) {
      const segments = m.shiftSegments as Array<{ shift?: string; amountAfterPenalty?: number; segmentBase?: number }>;
      if (!Array.isArray(segments)) continue;
      for (const seg of segments) {
        const amt = Number(seg.amountAfterPenalty ?? seg.segmentBase ?? 0);
        if (seg.shift === 'night') nightShiftTotal += amt;
        else dayShiftTotal += amt;
      }
    }

    const shiftTransferRows = await this.prisma.adminCommissionShiftSegment.groupBy({
      by: ['employeeId', 'earnCycleId'],
      where: {
        companyId,
        deletedAt: null,
        ...(cycleFilter.earnCycleId ? { earnCycleId: cycleFilter.earnCycleId as string } : {
          earnCycle: { periodEnd: { gte: from, lte: to } },
        }),
      },
      _count: { id: true },
    });
    const shiftTransfers = shiftTransferRows.filter((r) => r._count.id > 1).length;

    const penalized = new Set(cycles.flatMap((c) => c.penalties.map((p) => p.employeeId))).size;
    const totalPenalties = sum(cycles.map((c) => Number(c.totalPenalties)));

    return {
      overview: {
        adminPool: sum(cycles.map((c) => Number(c.adminPool))),
        poolA: sum(cycles.map((c) => Number(c.poolA))),
        poolB: sum(cycles.map((c) => Number(c.poolB))),
        totalPayable: sum(cycles.map((c) => Number(c.totalPayable))),
        totalPenalties,
        totalRedistributed: sum(cycles.map((c) => Number(c.totalRedistributed))),
      },
      employeeBreakdown: {
        frontOfficeTotal: sum(cycles.map((c) => Number(c.frontOfficeTotal))),
        backOfficeTotal: sum(cycles.map((c) => Number(c.backOfficeTotal))),
        employeesPenalized: penalized,
        averagePenaltyPercent: 0,
      },
      shiftStatistics: {
        dayShiftTotal: round2(dayShiftTotal),
        nightShiftTotal: round2(nightShiftTotal),
        shiftTransfers,
      },
    };
  }

  private async fetchReferral(companyId: string, from: Date, to: Date) {
    const base = {
      companyId,
      deletedAt: null,
      createdAt: { gte: from, lte: to },
    };

    const [pending, qualified, paid, pendingSum, qualifiedSum, paidSum] = await Promise.all([
      this.prisma.referral.count({ where: { ...base, status: 'pending' } }),
      this.prisma.referral.count({ where: { ...base, status: 'qualified' } }),
      this.prisma.referral.count({ where: { ...base, status: 'paid' } }),
      this.prisma.referral.aggregate({
        where: { ...base, status: 'pending' },
        _sum: { rewardAmount: true },
      }),
      this.prisma.referral.aggregate({
        where: { ...base, status: 'qualified' },
        _sum: { rewardAmount: true },
      }),
      this.prisma.referral.aggregate({
        where: { ...base, status: 'paid' },
        _sum: { rewardAmount: true },
      }),
    ]);

    const pendingRewards = Number(pendingSum._sum.rewardAmount ?? 0);
    const qualifiedRewards = Number(qualifiedSum._sum.rewardAmount ?? 0);
    const paidRewards = Number(paidSum._sum.rewardAmount ?? 0);

    return {
      overview: { pendingReferrals: pending, qualifiedReferrals: qualified, paidReferrals: paid },
      financial: {
        pendingRewards,
        qualifiedRewards,
        paidRewards,
        totalReferralCost: round2(paidRewards + qualifiedRewards),
      },
      conversion: { referralToQualifiedPercent: 0, qualifiedToPaidPercent: 0 },
    };
  }

  private async fetchRecruitment(
    companyId: string,
    cycleFilter: { earnCycleId?: string; earnCycle?: { periodEnd: { gte: Date; lte: Date } } },
    from: Date,
    to: Date,
  ) {
    const recordWhere: Prisma.CommissionRecordWhereInput = {
      companyId,
      deletedAt: null,
      ...(cycleFilter.earnCycleId
        ? { earnCycleId: cycleFilter.earnCycleId }
        : { earnCycle: { periodEnd: { gte: from, lte: to } } }),
    };

    const records = await this.prisma.commissionRecord.findMany({
      where: recordWhere,
      select: { status: true, grossAmount: true, achievedValue: true, targetValue: true, qualified: true },
    });

    const qualified = records.filter((r) => r.status === 'accrued' || r.status === 'paid');
    const onHold = records.filter((r) => r.status === 'hold');
    const failed = records.filter((r) =>
      !r.qualified && r.status !== 'hold');

    const [candidates, hired] = await Promise.all([
      this.prisma.candidate.count({
        where: {
          companyId,
          deletedAt: null,
          createdAt: { gte: from, lte: to },
        },
      }),
      this.prisma.candidate.count({
        where: {
          companyId,
          deletedAt: null,
          stage: 'hired',
          updatedAt: { gte: from, lte: to },
        },
      }),
    ]);

    return {
      overview: {
        recruitersQualified: qualified.length,
        recruitersOnHold: onHold.length,
        recruitersFailedTarget: failed.length,
      },
      candidateMetrics: {
        totalCandidates: candidates,
        qualifiedCandidates: candidates,
        hiredCandidates: hired,
      },
      commissionMetrics: {
        qualifiedCommission: sum(qualified.map((r) => Number(r.grossAmount))),
        holdCommission: sum(onHold.map((r) => Number(r.grossAmount))),
        paidCommission: sum(records.filter((r) => r.status === 'paid').map((r) => Number(r.grossAmount))),
      },
    };
  }

  private async topMarketingEarners(
    companyId: string,
    cycleFilter: Prisma.MarketingCommissionCycleWhereInput,
    limit: number,
  ): Promise<TopEarnerEntry[]> {
    const rows = await this.prisma.marketingCommissionMemberResult.groupBy({
      by: ['employeeId'],
      where: {
        cycle: { companyId, deletedAt: null, ...cycleFilter },
        finalPayout: { gt: 0 },
      },
      _sum: { finalPayout: true },
    });
    return this.enrichEmployeeNames(
      rows
        .map((r) => ({ employeeId: r.employeeId, amount: Number(r._sum.finalPayout ?? 0) }))
        .sort((a, b) => b.amount - a.amount)
        .slice(0, limit),
    );
  }

  private async topRecruiters(
    companyId: string,
    cycleFilter: { earnCycleId?: string; earnCycle?: { periodEnd: { gte: Date; lte: Date } } },
    limit: number,
  ): Promise<TopEarnerEntry[]> {
    const rows = await this.prisma.commissionRecord.groupBy({
      by: ['employeeId'],
      where: {
        companyId,
        deletedAt: null,
        ...(cycleFilter.earnCycleId
          ? { earnCycleId: cycleFilter.earnCycleId }
          : cycleFilter.earnCycle
            ? { earnCycle: cycleFilter.earnCycle }
            : {}),
      },
      _sum: { grossAmount: true },
    });
    return this.enrichEmployeeNames(
      rows
        .map((r) => ({ employeeId: r.employeeId, amount: Number(r._sum.grossAmount ?? 0) }))
        .sort((a, b) => b.amount - a.amount)
        .slice(0, limit),
    );
  }

  private async topAdminEarners(
    companyId: string,
    cycleFilter: Prisma.AdminCommissionCycleWhereInput,
    limit: number,
  ): Promise<TopEarnerEntry[]> {
    const rows = await this.prisma.adminCommissionMemberResult.groupBy({
      by: ['employeeId'],
      where: {
        cycle: { companyId, deletedAt: null, ...cycleFilter },
        finalPayout: { gt: 0 },
      },
      _sum: { finalPayout: true },
    });
    return this.enrichEmployeeNames(
      rows
        .map((r) => ({ employeeId: r.employeeId, amount: Number(r._sum.finalPayout ?? 0) }))
        .sort((a, b) => b.amount - a.amount)
        .slice(0, limit),
    );
  }

  private async topReferralEarners(
    companyId: string,
    from: Date,
    to: Date,
    limit: number,
  ): Promise<TopEarnerEntry[]> {
    const rows = await this.prisma.referral.groupBy({
      by: ['referrerEmployeeId'],
      where: {
        companyId,
        deletedAt: null,
        status: 'paid',
        createdAt: { gte: from, lte: to },
      },
      _sum: { rewardAmount: true },
    });
    return this.enrichEmployeeNames(
      rows
        .map((r) => ({ employeeId: r.referrerEmployeeId, amount: Number(r._sum.rewardAmount ?? 0) }))
        .sort((a, b) => b.amount - a.amount)
        .slice(0, limit),
    );
  }

  private async enrichEmployeeNames(rows: Array<{ employeeId: string; amount: number }>): Promise<TopEarnerEntry[]> {
    if (rows.length === 0) return [];
    const employees = await this.prisma.employee.findMany({
      where: { id: { in: rows.map((r) => r.employeeId) }, deletedAt: null },
      select: { id: true, firstName: true, lastName: true, nickname: true },
    });
    const nameById = new Map(employees.map((e) => [
      e.id,
      e.nickname ?? `${e.firstName} ${e.lastName}`.trim(),
    ]));
    return rows.map((r) => ({
      employeeId: r.employeeId,
      employeeName: nameById.get(r.employeeId) ?? r.employeeId.slice(0, 8),
      amount: round2(r.amount),
    }));
  }
}

function sum(values: number[]): number {
  return round2(values.reduce((a, b) => a + b, 0));
}
