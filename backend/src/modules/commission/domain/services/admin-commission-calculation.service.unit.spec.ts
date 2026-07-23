// ============================================================================
// AdminCommissionCalculationService unit tests (COM-ADM-001 … COM-ADM-011)
// ============================================================================

import {
  AdminCommissionCalculationService,
  ADMIN_POOL_A_RATE,
  ADMIN_POOL_B_RATE,
  ADMIN_POOL_RATE,
  resolveLeavePenaltyRate,
  roundMoney,
} from './admin-commission-calculation.service';

describe('AdminCommissionCalculationService', () => {
  const svc = new AdminCommissionCalculationService();
  const netProfit = 1_000_000;
  const cycleDays = 30;

  function segment(
    shift: 'day' | 'night',
    days: number,
    start = new Date('2026-01-01'),
  ) {
    const end = new Date(start);
    end.setDate(end.getDate() + days - 1);
    return { shift, segmentStart: start, segmentEnd: end, segmentDays: days };
  }

  function member(
    id: string,
    office: 'front_office' | 'back_office',
    opts: Partial<{
      daysWorked: number;
      extraLeaveDays: number;
      resignedBeforePayout: boolean;
      shiftSegments: ReturnType<typeof segment>[];
    }> = {},
  ) {
    return {
      employeeId: id,
      officeType: office,
      shiftSegments: opts.shiftSegments ?? [segment('day', opts.daysWorked ?? cycleDays)],
      daysWorkedInCycle: opts.daysWorked ?? cycleDays,
      cycleDays,
      extraLeaveDays: opts.extraLeaveDays ?? 0,
      resignedBeforePayout: opts.resignedBeforePayout ?? false,
    };
  }

  describe('COM-ADM-001 admin pool', () => {
    it('adminPool = netProfit × 2%', () => {
      const result = svc.calculate({ netProfit, members: [member('f1', 'front_office')] });
      expect(result.adminPool).toBe(roundMoney(netProfit * ADMIN_POOL_RATE));
    });
  });

  describe('COM-ADM-002 / COM-ADM-003 pools', () => {
    it('poolA and poolB each = netProfit × 1%', () => {
      const result = svc.calculate({
        netProfit,
        members: [member('f1', 'front_office'), member('b1', 'back_office')],
      });
      expect(result.poolA).toBe(roundMoney(netProfit * ADMIN_POOL_A_RATE));
      expect(result.poolB).toBe(roundMoney(netProfit * ADMIN_POOL_B_RATE));
    });
  });

  describe('COM-ADM-004 front gets A+B, back gets A only', () => {
    it('splits pool shares correctly for 1 front + 1 back', () => {
      const result = svc.calculate({
        netProfit,
        members: [member('front', 'front_office'), member('back', 'back_office')],
      });

      const poolAEach = roundMoney(result.poolA / 2);
      const poolBEach = roundMoney(result.poolB / 1);
      const front = result.members.find((m) => m.employeeId === 'front')!;
      const back = result.members.find((m) => m.employeeId === 'back')!;

      expect(front.poolAShare).toBe(poolAEach);
      expect(front.poolBShare).toBe(poolBEach);
      expect(front.basePoolAmount).toBe(roundMoney(poolAEach + poolBEach));
      expect(back.poolAShare).toBe(poolAEach);
      expect(back.poolBShare).toBe(0);
      expect(back.basePoolAmount).toBe(poolAEach);
    });
  });

  describe('COM-ADM-005 new hire prorate', () => {
    it('prorates by days worked in cycle', () => {
      const result = svc.calculate({
        netProfit,
        members: [member('f1', 'front_office', { daysWorked: 15 })],
      });
      const m = result.members[0]!;
      expect(m.prorateFactor).toBe(0.5);
      expect(m.proratedBase).toBe(roundMoney(m.basePoolAmount * 0.5));
    });
  });

  describe('COM-ADM-006 resignation before payout', () => {
    it('pays zero when resigned before payout', () => {
      const result = svc.calculate({
        netProfit,
        members: [member('f1', 'front_office', { resignedBeforePayout: true })],
      });
      expect(result.members[0]!.finalPayout).toBe(0);
      expect(result.members[0]!.status).toBe('no_payout');
    });
  });

  describe('COM-ADM-009 leave penalty table', () => {
    it.each([
      [1, 0],
      [2, 0.3],
      [3, 0.4],
      [4, 0.4],
      [5, 0.4],
      [6, 0.5],
      [7, 0.6],
      [8, 0.7],
      [9, 0.8],
      [10, 1.0],
      [12, 1.0],
    ])('extraLeaveDays=%i → penaltyRate=%s', (days, rate) => {
      expect(resolveLeavePenaltyRate(days)).toBe(rate);
    });

    it('applies 30% deduction for 2 extra leave days', () => {
      const result = svc.calculate({
        netProfit,
        members: [member('f1', 'front_office', { extraLeaveDays: 2 })],
      });
      const m = result.members[0]!;
      expect(m.penaltyRate).toBe(0.3);
      expect(m.penaltyDeduction).toBe(roundMoney(m.proratedBase * 0.3));
    });
  });

  describe('COM-ADM-010 redistribution to same shift', () => {
    it('redistributes deducted amount equally to other eligible shift members', () => {
      const result = svc.calculate({
        netProfit,
        members: [
          member('penalized', 'front_office', { extraLeaveDays: 2 }),
          member('r1', 'front_office'),
          member('r2', 'front_office'),
          member('r3', 'front_office'),
          member('r4', 'front_office'),
        ],
      });

      const penalized = result.members.find((m) => m.employeeId === 'penalized')!;
      const totalDeducted = penalized.penaltyDeduction;
      const totalBonus = ['r1', 'r2', 'r3', 'r4'].reduce(
        (s, id) => s + (result.members.find((m) => m.employeeId === id)?.redistributionBonus ?? 0),
        0,
      );

      expect(totalDeducted).toBeGreaterThan(0);
      expect(totalBonus).toBeCloseTo(totalDeducted, 2);
      expect(result.members.find((m) => m.employeeId === 'r1')!.redistributionBonus)
        .toBeCloseTo(totalDeducted / 4, 2);
    });

    it('does not return deducted commission to company', () => {
      const result = svc.calculate({
        netProfit,
        members: [
          member('penalized', 'front_office', { extraLeaveDays: 2 }),
          member('r1', 'front_office'),
          member('r2', 'front_office'),
        ],
      });
      expect(result.totalRedistributed).toBe(result.totalPenalties);
    });
  });

  describe('COM-ADM-011 shift transfer split', () => {
    it('splits commission by actual days in each shift', () => {
      const result = svc.calculate({
        netProfit,
        members: [
          member('transfer', 'front_office', {
            shiftSegments: [
              segment('day', 15, new Date('2026-01-01')),
              segment('night', 15, new Date('2026-01-16')),
            ],
          }),
        ],
      });

      const m = result.members[0]!;
      expect(m.shiftSegments).toHaveLength(2);
      expect(m.shiftSegments[0]!.segmentBase).toBeCloseTo(m.proratedBase / 2, 2);
      expect(m.shiftSegments[1]!.segmentBase).toBeCloseTo(m.proratedBase / 2, 2);
    });
  });

  describe('computeExtraLeaveDays helper', () => {
    it('allows 4 normal days off without penalty', () => {
      expect(svc.computeExtraLeaveDays(4, 0)).toBe(0);
    });

    it('exempt leave does not count toward penalty', () => {
      expect(svc.computeExtraLeaveDays(10, 3)).toBe(3); // 10 - 3 - 4 = 3 extra
    });
  });
});
