// ============================================================================
// Admin commission pure calculation (COM-ADM-001 … COM-ADM-011)
// ============================================================================

export const ADMIN_POOL_RATE = 0.02;
export const ADMIN_POOL_A_RATE = 0.01;
export const ADMIN_POOL_B_RATE = 0.01;
export const ADMIN_NORMAL_MONTHLY_DAYS_OFF = 4;

export type AdminOfficeType = 'front_office' | 'back_office';
export type AdminShiftType = 'day' | 'night';

/** Deduction rate by extra leave days (COM-ADM-009). Nearest lower tier applies. */
export const ADMIN_LEAVE_PENALTY_TIERS: ReadonlyArray<{ minExtraDays: number; deductionRate: number }> = [
  { minExtraDays: 10, deductionRate: 1.0 },
  { minExtraDays: 9, deductionRate: 0.8 },
  { minExtraDays: 8, deductionRate: 0.7 },
  { minExtraDays: 7, deductionRate: 0.6 },
  { minExtraDays: 6, deductionRate: 0.5 },
  { minExtraDays: 3, deductionRate: 0.4 },
  { minExtraDays: 2, deductionRate: 0.3 },
];

export interface AdminShiftSegmentInput {
  shift: AdminShiftType;
  segmentStart: Date;
  segmentEnd: Date;
  segmentDays: number;
}

export interface AdminMemberInput {
  employeeId: string;
  officeType: AdminOfficeType;
  shiftSegments: AdminShiftSegmentInput[];
  daysWorkedInCycle: number;
  cycleDays: number;
  extraLeaveDays: number;
  resignedBeforePayout: boolean;
}

export interface AdminCommissionCalculationInput {
  netProfit: number;
  members: AdminMemberInput[];
}

export interface AdminPoolTrace {
  netProfit: number;
  adminPool: number;
  poolA: number;
  poolB: number;
  frontOfficeCount: number;
  backOfficeCount: number;
  poolAShareEach: number;
  poolBShareEach: number;
}

export interface AdminShiftSegmentCalculation {
  shift: AdminShiftType;
  segmentDays: number;
  segmentBase: number;
  penaltyRate: number;
  penaltyDeduction: number;
  amountAfterPenalty: number;
}

export interface AdminRedistributionLine {
  shift: AdminShiftType;
  recipientEmployeeId: string;
  sourceEmployeeId: string;
  amount: number;
}

export interface AdminPenaltyLine {
  employeeId: string;
  extraLeaveDays: number;
  penaltyRate: number;
  deductedAmount: number;
}

export interface AdminMemberCalculation {
  employeeId: string;
  officeType: AdminOfficeType;
  poolAShare: number;
  poolBShare: number;
  basePoolAmount: number;
  prorateFactor: number;
  proratedBase: number;
  extraLeaveDays: number;
  penaltyRate: number;
  penaltyDeduction: number;
  redistributionBonus: number;
  finalPayout: number;
  daysWorkedInCycle: number;
  cycleDays: number;
  status: 'pending_pay' | 'no_payout';
  shiftSegments: AdminShiftSegmentCalculation[];
  trace: Record<string, unknown>;
}

export interface AdminCommissionCalculationResult {
  trace: AdminPoolTrace;
  netProfit: number;
  adminPool: number;
  poolA: number;
  poolB: number;
  frontOfficeTotal: number;
  backOfficeTotal: number;
  totalPenalties: number;
  totalRedistributed: number;
  totalPayable: number;
  members: AdminMemberCalculation[];
  penalties: AdminPenaltyLine[];
  redistributions: AdminRedistributionLine[];
}

export class AdminCommissionCalculationService {
  calculate(input: AdminCommissionCalculationInput): AdminCommissionCalculationResult {
    const netProfit = roundMoney(input.netProfit);
    const adminPool = roundMoney(netProfit * ADMIN_POOL_RATE);
    const poolA = roundMoney(netProfit * ADMIN_POOL_A_RATE);
    const poolB = roundMoney(netProfit * ADMIN_POOL_B_RATE);

    const activeMembers = input.members.filter((m) => !m.resignedBeforePayout);
    const frontMembers = activeMembers.filter((m) => m.officeType === 'front_office');
    const backMembers = activeMembers.filter((m) => m.officeType === 'back_office');
    const frontCount = frontMembers.length;
    const backCount = backMembers.length;
    const poolMemberCount = frontCount + backCount;

    const poolAShareEach = poolMemberCount > 0 ? roundMoney(poolA / poolMemberCount) : 0;
    const poolBShareEach = frontCount > 0 ? roundMoney(poolB / frontCount) : 0;

    const trace: AdminPoolTrace = {
      netProfit,
      adminPool,
      poolA,
      poolB,
      frontOfficeCount: frontCount,
      backOfficeCount: backCount,
      poolAShareEach,
      poolBShareEach,
    };

    interface SegmentWork {
      employeeId: string;
      shift: AdminShiftType;
      segmentBase: number;
      penaltyRate: number;
      penaltyDeduction: number;
      amountAfterPenalty: number;
    }

    const segmentWorks: SegmentWork[] = [];
    const memberCalcs: AdminMemberCalculation[] = [];
    const penalties: AdminPenaltyLine[] = [];

    for (const member of input.members) {
      const poolAShare = poolAShareEach;
      const poolBShare = member.officeType === 'front_office' ? poolBShareEach : 0;
      const basePoolAmount = roundMoney(poolAShare + poolBShare);

      if (member.resignedBeforePayout) {
        memberCalcs.push({
          employeeId: member.employeeId,
          officeType: member.officeType,
          poolAShare,
          poolBShare,
          basePoolAmount,
          prorateFactor: 0,
          proratedBase: 0,
          extraLeaveDays: member.extraLeaveDays,
          penaltyRate: 0,
          penaltyDeduction: 0,
          redistributionBonus: 0,
          finalPayout: 0,
          daysWorkedInCycle: member.daysWorkedInCycle,
          cycleDays: member.cycleDays,
          status: 'no_payout',
          shiftSegments: [],
          trace: { resignedBeforePayout: true },
        });
        continue;
      }

      const prorateFactor = member.cycleDays > 0
        ? roundMoney(Math.min(1, member.daysWorkedInCycle / member.cycleDays))
        : 0;
      const proratedBase = roundMoney(basePoolAmount * prorateFactor);
      const penaltyRate = resolveLeavePenaltyRate(member.extraLeaveDays);
      const totalSegmentDays = member.shiftSegments.reduce((s, seg) => s + seg.segmentDays, 0)
        || member.daysWorkedInCycle
        || member.cycleDays;

      const shiftSegmentCalcs: AdminShiftSegmentCalculation[] = [];
      let memberPenaltyDeduction = 0;

      for (const seg of member.shiftSegments) {
        const segmentBase = roundMoney(proratedBase * (seg.segmentDays / totalSegmentDays));
        const penaltyDeduction = roundMoney(segmentBase * penaltyRate);
        const amountAfterPenalty = roundMoney(segmentBase - penaltyDeduction);
        memberPenaltyDeduction = roundMoney(memberPenaltyDeduction + penaltyDeduction);

        shiftSegmentCalcs.push({
          shift: seg.shift,
          segmentDays: seg.segmentDays,
          segmentBase,
          penaltyRate,
          penaltyDeduction,
          amountAfterPenalty,
        });

        segmentWorks.push({
          employeeId: member.employeeId,
          shift: seg.shift,
          segmentBase,
          penaltyRate,
          penaltyDeduction,
          amountAfterPenalty,
        });
      }

      if (memberPenaltyDeduction > 0) {
        penalties.push({
          employeeId: member.employeeId,
          extraLeaveDays: member.extraLeaveDays,
          penaltyRate,
          deductedAmount: memberPenaltyDeduction,
        });
      }

      memberCalcs.push({
        employeeId: member.employeeId,
        officeType: member.officeType,
        poolAShare,
        poolBShare,
        basePoolAmount,
        prorateFactor,
        proratedBase,
        extraLeaveDays: member.extraLeaveDays,
        penaltyRate,
        penaltyDeduction: memberPenaltyDeduction,
        redistributionBonus: 0,
        finalPayout: 0,
        daysWorkedInCycle: member.daysWorkedInCycle,
        cycleDays: member.cycleDays,
        status: 'pending_pay',
        shiftSegments: shiftSegmentCalcs,
        trace: {
          totalSegmentDays,
          daysWorkedInCycle: member.daysWorkedInCycle,
          cycleDays: member.cycleDays,
        },
      });
    }

    const redistributions: AdminRedistributionLine[] = [];
    const bonusByEmployee = new Map<string, number>();

    for (const shift of ['day', 'night'] as AdminShiftType[]) {
      const shiftPenalties = segmentWorks.filter((s) => s.shift === shift && s.penaltyDeduction > 0);
      const totalDeducted = roundMoney(shiftPenalties.reduce((s, x) => s + x.penaltyDeduction, 0));
      if (totalDeducted <= 0) continue;

      const penalizedIds = new Set(shiftPenalties.map((s) => s.employeeId));
      const recipients = activeMembers.filter((m) => {
        if (penalizedIds.has(m.employeeId)) return false;
        return m.shiftSegments.some((seg) => seg.shift === shift);
      });

      if (recipients.length === 0) continue;

      const bonusEach = roundMoney(totalDeducted / recipients.length);
      let allocated = 0;
      for (let i = 0; i < recipients.length; i += 1) {
        const recipient = recipients[i]!;
        const amount = i === recipients.length - 1
          ? roundMoney(totalDeducted - allocated)
          : bonusEach;
        allocated = roundMoney(allocated + amount);
        bonusByEmployee.set(
          recipient.employeeId,
          roundMoney((bonusByEmployee.get(recipient.employeeId) ?? 0) + amount),
        );

        const primarySource = shiftPenalties[0]?.employeeId ?? recipient.employeeId;
        redistributions.push({
          shift,
          recipientEmployeeId: recipient.employeeId,
          sourceEmployeeId: primarySource,
          amount,
        });
      }
    }

    let frontOfficeTotal = 0;
    let backOfficeTotal = 0;
    let totalPenalties = 0;
    let totalPayable = 0;

    for (const m of memberCalcs) {
      const afterPenalty = roundMoney(
        m.shiftSegments.reduce((s, seg) => s + seg.amountAfterPenalty, 0),
      );
      const bonus = bonusByEmployee.get(m.employeeId) ?? 0;
      m.redistributionBonus = bonus;
      m.finalPayout = roundMoney(afterPenalty + bonus);
      if (m.finalPayout <= 0) {
        m.status = 'no_payout';
        m.finalPayout = 0;
      }
      totalPenalties = roundMoney(totalPenalties + m.penaltyDeduction);
      totalPayable = roundMoney(totalPayable + m.finalPayout);
      if (m.officeType === 'front_office') frontOfficeTotal = roundMoney(frontOfficeTotal + m.finalPayout);
      else backOfficeTotal = roundMoney(backOfficeTotal + m.finalPayout);
    }

    const totalRedistributed = roundMoney(
      redistributions.reduce((s, r) => s + r.amount, 0),
    );

    return {
      trace,
      netProfit,
      adminPool,
      poolA,
      poolB,
      frontOfficeTotal,
      backOfficeTotal,
      totalPenalties,
      totalRedistributed,
      totalPayable,
      members: memberCalcs,
      penalties,
      redistributions,
    };
  }

  resolveLeavePenaltyRate(extraLeaveDays: number): number {
    return resolveLeavePenaltyRate(extraLeaveDays);
  }

  computeExtraLeaveDays(
    totalLeaveDays: number,
    exemptLeaveDays: number,
    normalAllowance = ADMIN_NORMAL_MONTHLY_DAYS_OFF,
  ): number {
    const chargeable = Math.max(0, totalLeaveDays - exemptLeaveDays);
    return Math.max(0, chargeable - normalAllowance);
  }
}

export function resolveLeavePenaltyRate(extraLeaveDays: number): number {
  if (extraLeaveDays < 2) return 0;
  for (const tier of ADMIN_LEAVE_PENALTY_TIERS) {
    if (extraLeaveDays >= tier.minExtraDays) return tier.deductionRate;
  }
  return 0;
}

export function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}
