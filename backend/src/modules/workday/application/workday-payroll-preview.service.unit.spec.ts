// ============================================================================
// modules/workday/application/workday-payroll-preview.service.unit.spec.ts
// ============================================================================

import { WorkDayPayrollPreviewService } from './workday-payroll-preview.service';
import { LateDeductionAggregatorService } from '../../payroll/application/late-deduction-aggregator.service';
import { BangkokTimeProvider } from '../../../shared/time/bangkok-time.provider';

describe('WorkDayPayrollPreviewService', () => {
  const periodStart = new Date('2026-06-01T00:00:00.000Z');
  const periodEnd = new Date('2026-06-30T00:00:00.000Z');

  function build(overrides: {
    ot?: Array<{ amount: number; status: string }>;
    needsRecalc?: number;
    salary?: number;
    leaves?: Array<{ code: string; start: string; end: string }>;
    manual?: Array<{ category: string; amount: number; from: string; until: string | null }>;
    lateTotal?: number;
  }) {
    const prisma = {
      salaryHistory: {
        findFirst: jest.fn().mockResolvedValue(
          overrides.salary != null ? { monthlySalary: overrides.salary } : null,
        ),
      },
      overtimeRecord: {
        findMany: jest.fn().mockImplementation(({ where }) => {
          if (where.status === 'approved') {
            return Promise.resolve(
              (overrides.ot ?? [])
                .filter((r) => r.status === 'approved')
                .map((r) => ({ amount: r.amount })),
            );
          }
          return Promise.resolve([]);
        }),
      },
      manualPayrollItemDefinition: {
        findMany: jest.fn().mockResolvedValue(
          (overrides.manual ?? []).map((m, i) => ({
            id: `def-${i}`,
            category: m.category,
            amount: m.amount,
            effectiveFrom: new Date(`${m.from}T00:00:00.000Z`),
            effectiveUntil: m.until ? new Date(`${m.until}T00:00:00.000Z`) : null,
            status: 'active',
          })),
        ),
      },
      attendanceRecord: {
        count: jest.fn().mockResolvedValue(overrides.needsRecalc ?? 0),
      },
      leaveRequest: {
        findMany: jest.fn().mockResolvedValue(
          (overrides.leaves ?? []).map((l, i) => ({
            id: `leave-${i}`,
            startDate: new Date(`${l.start}T00:00:00.000Z`),
            endDate: new Date(`${l.end}T00:00:00.000Z`),
            leaveType: { code: l.code },
          })),
        ),
      },
    };
    const lateDeductions = {
      aggregateForPeriod: jest.fn().mockResolvedValue({
        totalDeduction: overrides.lateTotal ?? 0,
        sources: [],
      }),
    } as unknown as LateDeductionAggregatorService;
    const time = {
      parseWorkDate: (s: string) => new Date(`${s}T00:00:00.000Z`),
    } as BangkokTimeProvider;
    const service = new WorkDayPayrollPreviewService(
      prisma as never,
      time,
      lateDeductions,
    );
    return { service, lateDeductions };
  }

  it('includes approved OT only', async () => {
    const { service } = build({
      salary: 30000,
      ot: [
        { amount: 500, status: 'approved' },
        { amount: 200, status: 'pending' },
        { amount: 100, status: 'rejected' },
      ],
    });
    const result = await service.preview('emp-1', 'co-1', '2026-06');
    expect(result.approvedOvertime).toBe(500);
    expect(result.netPreview).toBe(30500);
  });

  it('includes late deduction', async () => {
    const { service } = build({ salary: 30000, lateTotal: 150 });
    const result = await service.preview('emp-1', 'co-1', '2026-06');
    expect(result.lateDeduction).toBe(150);
    expect(result.netPreview).toBe(29850);
  });

  it('deducts unpaid leave days', async () => {
    const { service } = build({
      salary: 30000,
      leaves: [{ code: 'unpaid', start: '2026-06-10', end: '2026-06-10' }],
    });
    const result = await service.preview('emp-1', 'co-1', '2026-06');
    expect(result.unpaidLeaveDeduction).toBe(1000);
    expect(result.netPreview).toBe(29000);
  });

  it('sets needsRecalculation warning', async () => {
    const { service } = build({ salary: 30000, needsRecalc: +2 });
    const result = await service.preview('emp-1', 'co-1', '2026-06');
    expect(result.needsRecalculation).toBe(true);
    expect(result.needsRecalculationWarning).toContain('ต้องคำนวณใหม่');
  });
});
