// ============================================================================
// MarketingCommissionCalculationService unit tests (COM-MKT-002 … COM-MKT-012)
// ============================================================================

import {
  MarketingCommissionCalculationService,
  MARKETING_KPI_TARGET,
  roundMoney,
} from './marketing-commission-calculation.service';

describe('MarketingCommissionCalculationService', () => {
  const svc = new MarketingCommissionCalculationService();
  const cycleEnd = new Date('2026-06-23');

  const baseFinancial = {
    grossProfit: 1_000_000,
    employeeSalaryExpense: 200_000,
    marketingExpense: 50_000,
    lineExpense: 10_000,
    telesalesExpense: 5_000,
    promotionExpense: 20_000,
  };

  function hireMonthsAgo(months: number): Date {
    const d = new Date(cycleEnd);
    d.setMonth(d.getMonth() - (months - 1));
    return d;
  }

  function member(
    id: string,
    opts: Partial<{
      hireDate: Date;
      achieved: number;
      rampOverridePercent: number | null;
      includeInTeamPool: boolean;
      kpiExempt: boolean;
    }> = {},
  ) {
    return {
      employeeId: id,
      roleLevel: 'employee' as const,
      hireDate: opts.hireDate ?? hireMonthsAgo(12),
      achievedCandidates: opts.achieved ?? 30,
      includeInTeamPool: opts.includeInTeamPool ?? true,
      kpiExempt: opts.kpiExempt ?? false,
      rampOverridePercent: opts.rampOverridePercent ?? null,
    };
  }

  describe('COM-MKT-002 net profit', () => {
    it('applies promotion expense when grossProfit > 500000', () => {
      const trace = svc.calculateNetProfit(baseFinancial);
      expect(trace.promotionExpenseApplied).toBe(20_000);
      expect(trace.profitAfterExpenses).toBe(715_000);
      expect(trace.companyHeadDeduction).toBe(roundMoney(715_000 * 0.4));
      expect(trace.netProfit).toBe(roundMoney(715_000 * 0.6));
    });

    it('skips promotion expense when grossProfit <= 500000', () => {
      const trace = svc.calculateNetProfit({
        ...baseFinancial,
        grossProfit: 400_000,
      });
      expect(trace.promotionExpenseApplied).toBe(0);
      expect(trace.promotionExpenseSkipped).toBe(true);
    });
  });

  describe('COM-MKT-003 team pool 10%', () => {
    it('teamCommissionPool = netProfit × 10%', () => {
      const result = svc.calculate({
        cyclePeriodEnd: cycleEnd,
        financial: baseFinancial,
        members: [member('a')],
        pendingCarries: [],
        bigLeaderEmployeeId: null,
      });
      expect(result.teamCommissionPool).toBe(roundMoney(result.netProfit * 0.1));
    });
  });

  describe('COM-MKT-012 big leader 5%', () => {
    it('matches worked example', () => {
      const netProfit = 545_717.95;
      const teamPool = roundMoney(netProfit * 0.1);
      const leaderBase = roundMoney(netProfit - teamPool);
      const bigLeader = roundMoney(leaderBase * 0.05);

      expect(teamPool).toBe(54_571.80);
      expect(leaderBase).toBe(491_146.15);
      expect(bigLeader).toBe(24_557.31);

      const grossNeeded = netProfit / 0.6;
      const result = svc.calculate({
        cyclePeriodEnd: cycleEnd,
        financial: {
          grossProfit: grossNeeded,
          employeeSalaryExpense: 0,
          marketingExpense: 0,
          lineExpense: 0,
          telesalesExpense: 0,
          promotionExpense: 0,
        },
        members: [member('e1', { includeInTeamPool: false })],
        pendingCarries: [],
        bigLeaderEmployeeId: 'leader-1',
      });
      expect(result.netProfit).toBeCloseTo(netProfit, 0);
      expect(result.bigLeaderCommission).toBeCloseTo(24_557.31, 0);
    });
  });

  describe('COM-MKT-005 new hire ramp', () => {
    it('month 1 = 0%, month 2 = 20%, month 6+ = 100%', () => {
      expect(svc.resolveRampPercent(1)).toBe(0);
      expect(svc.resolveRampPercent(2)).toBe(0.2);
      expect(svc.resolveRampPercent(3)).toBe(0.2);
      expect(svc.resolveRampPercent(4)).toBe(0.3);
      expect(svc.resolveRampPercent(5)).toBe(0.4);
      expect(svc.resolveRampPercent(6)).toBe(1);
    });

    it('override replaces default ramp', () => {
      const result = svc.calculate({
        cyclePeriodEnd: cycleEnd,
        financial: baseFinancial,
        members: [member('a', { hireDate: hireMonthsAgo(2), rampOverridePercent: 50 })],
        pendingCarries: [],
        bigLeaderEmployeeId: null,
      });
      expect(result.members[0].rampPercent).toBe(0.5);
    });
  });

  describe('COM-MKT-006 ramp redistribution to 100% members', () => {
    it('matches A/B/C/D example', () => {
      const teamPool = 100_000;
      const netProfit = teamPool / 0.1;
      const result = svc.calculate({
        cyclePeriodEnd: cycleEnd,
        financial: {
          grossProfit: netProfit / 0.6,
          employeeSalaryExpense: 0,
          marketingExpense: 0,
          lineExpense: 0,
          telesalesExpense: 0,
          promotionExpense: 0,
        },
        members: [
          member('A', { achieved: 30 }),
          member('B', { achieved: 30 }),
          member('C', { achieved: 30, hireDate: hireMonthsAgo(2) }),
          member('D', { achieved: 30, hireDate: hireMonthsAgo(5) }),
        ],
        pendingCarries: [],
        bigLeaderEmployeeId: null,
      });

      expect(result.teamCommissionPool).toBe(100_000);
      expect(result.baseShare).toBe(25_000);

      const byId = Object.fromEntries(result.members.map((m) => [m.employeeId, m]));
      expect(byId.A.finalPayout).toBe(42_500);
      expect(byId.B.finalPayout).toBe(42_500);
      expect(byId.C.finalPayout).toBe(5_000);
      expect(byId.D.finalPayout).toBe(10_000);
      expect(result.members.reduce((s, m) => s + m.finalPayout, 0)).toBe(100_000);
    });
  });

  describe('COM-MKT-007 KPI requirement', () => {
    it('qualified when achieved >= 24', () => {
      const result = svc.calculate({
        cyclePeriodEnd: cycleEnd,
        financial: baseFinancial,
        members: [member('a', { achieved: 24 })],
        pendingCarries: [],
        bigLeaderEmployeeId: null,
      });
      expect(result.members[0].kpiQualified).toBe(true);
    });

    it('not qualified when achieved < 24', () => {
      const result = svc.calculate({
        cyclePeriodEnd: cycleEnd,
        financial: baseFinancial,
        members: [member('a', { achieved: 10 })],
        pendingCarries: [],
        bigLeaderEmployeeId: null,
      });
      expect(result.members[0].kpiQualified).toBe(false);
    });

    it('big leader exempt via kpiExempt flag', () => {
      const result = svc.calculate({
        cyclePeriodEnd: cycleEnd,
        financial: baseFinancial,
        members: [member('leader', { achieved: 0, kpiExempt: true })],
        pendingCarries: [],
        bigLeaderEmployeeId: 'leader',
      });
      expect(result.members[0].kpiQualified).toBe(true);
    });
  });

  describe('COM-MKT-008 carry forward', () => {
    it('fully eligible KPI miss carries pool payout forward', () => {
      const result = svc.calculate({
        cyclePeriodEnd: cycleEnd,
        financial: baseFinancial,
        members: [member('a', { achieved: 5 })],
        pendingCarries: [],
        bigLeaderEmployeeId: null,
      });
      expect(result.members[0].status).toBe('carried_forward');
      expect(result.members[0].finalPayout).toBe(0);
      expect(result.members[0].carryForwardOut).toBeGreaterThan(0);
      expect(result.newCarryForwards).toHaveLength(1);
    });

    it('new hire ramp does not carry forward on KPI miss', () => {
      const result = svc.calculate({
        cyclePeriodEnd: cycleEnd,
        financial: baseFinancial,
        members: [member('a', { achieved: 5, hireDate: hireMonthsAgo(2) })],
        pendingCarries: [],
        bigLeaderEmployeeId: null,
      });
      expect(result.members[0].status).toBe('pending_pay');
      expect(result.newCarryForwards).toHaveLength(0);
    });
  });

  describe('COM-MKT-009 recovery', () => {
    it('pays carried amount plus current when KPI met', () => {
      const first = svc.calculate({
        cyclePeriodEnd: cycleEnd,
        financial: baseFinancial,
        members: [member('a', { achieved: 5 })],
        pendingCarries: [],
        bigLeaderEmployeeId: null,
      });
      const carryAmount = first.newCarryForwards[0].amount;

      const second = svc.calculate({
        cyclePeriodEnd: new Date('2026-07-23'),
        financial: baseFinancial,
        members: [member('a', { achieved: 30 })],
        pendingCarries: [{ employeeId: 'a', amount: carryAmount, sourceCycleId: 'cycle-1' }],
        bigLeaderEmployeeId: null,
      });

      expect(second.members[0].carryForwardIn).toBe(carryAmount);
      expect(second.members[0].finalPayout).toBe(roundMoney(carryAmount + second.members[0].poolPayout));
      expect(second.recoveredCarryEmployeeIds).toContain('a');
    });
  });

  describe('COM-MKT-010 expiration redistribution', () => {
    it('expires prior carry and redistributes to eligible members', () => {
      const poolMembers = [
        member('A', { achieved: 30 }),
        member('B', { achieved: 5 }),
      ];
      const first = svc.calculate({
        cyclePeriodEnd: cycleEnd,
        financial: baseFinancial,
        members: poolMembers,
        pendingCarries: [],
        bigLeaderEmployeeId: null,
      });
      const carryB = first.newCarryForwards.find((c) => c.employeeId === 'B')!.amount;

      const second = svc.calculate({
        cyclePeriodEnd: new Date('2026-07-23'),
        financial: baseFinancial,
        members: poolMembers.map((m) => ({
          ...m,
          achievedCandidates: m.employeeId === 'A' ? 30 : 5,
        })),
        pendingCarries: [{ employeeId: 'B', amount: carryB, sourceCycleId: 'cycle-1' }],
        bigLeaderEmployeeId: null,
      });

      const a = second.members.find((m) => m.employeeId === 'A')!;
      const b = second.members.find((m) => m.employeeId === 'B')!;
      expect(b.carryExpired).toBe(carryB);
      expect(second.expiredCarryEmployeeIds).toContain('B');
      expect(a.expiredCarryBonus).toBeGreaterThan(0);
      expect(second.redistributions.some((r) => r.type === 'expired_carry')).toBe(true);
    });
  });

  describe('COM-MKT-001 sub leader same as employee', () => {
    it('sub leader receives equal base share', () => {
      const result = svc.calculate({
        cyclePeriodEnd: cycleEnd,
        financial: baseFinancial,
        members: [
          { ...member('emp'), roleLevel: 'employee' },
          { ...member('sub'), roleLevel: 'sub_leader' },
        ],
        pendingCarries: [],
        bigLeaderEmployeeId: null,
      });
      expect(result.members[0].baseShare).toBe(result.members[1].baseShare);
    });
  });
});
