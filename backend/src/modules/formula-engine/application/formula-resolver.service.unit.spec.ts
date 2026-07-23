import { FormulaResolverService } from './formula-resolver.service';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { evaluateFormula } from '../../../shared/formula/safe-formula.evaluator';

describe('FormulaResolverService', () => {
  const prisma = {
    formulaDefinition: { findFirst: jest.fn() },
    formulaExecutionLog: { create: jest.fn().mockResolvedValue({ id: 'log-1' }) },
  } as unknown as PrismaService;

  const service = new FormulaResolverService(prisma);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('uses fallback when formula missing', async () => {
    (prisma.formulaDefinition.findFirst as jest.Mock).mockResolvedValue(null);
    const result = await service.resolveWithFallback(
      'attendance.late_deduction',
      { entityType: 'AttendanceRecord', entityId: 'e1', inputs: { lateHours: 1, hourlyRate: 100 } },
      () => 200,
    );
    expect(result.fallbackUsed).toBe(true);
    expect(result.value).toBe(200);
    expect(prisma.formulaExecutionLog.create).toHaveBeenCalled();
  });

  it('uses published formula when available', async () => {
    (prisma.formulaDefinition.findFirst as jest.Mock).mockResolvedValue({
      id: 'f1', configVersion: 1, expression: 'lateHours * hourlyRate * 2',
    });
    const result = await service.resolveWithFallback(
      'attendance.late_deduction',
      { entityType: 'AttendanceRecord', entityId: 'e1', inputs: { lateHours: 1, hourlyRate: 100 } },
      () => 0,
    );
    expect(result.fallbackUsed).toBe(false);
    expect(result.value).toBe(200);
  });

  it('falls back safely on invalid formula', async () => {
    (prisma.formulaDefinition.findFirst as jest.Mock).mockResolvedValue({
      id: 'f1', configVersion: 1, expression: 'broken + +',
    });
    const result = await service.resolveWithFallback(
      'attendance.late_deduction',
      { entityType: 'AttendanceRecord', entityId: 'e1', inputs: {} },
      () => 42,
    );
    expect(result.fallbackUsed).toBe(true);
    expect(result.value).toBe(42);
  });
});

describe('default formula expressions', () => {
  it('evaluates kpi weighted score', () => {
    const result = evaluateFormula(
      '(kpiScore * kpiWeight + leaderScore * leaderWeight + selfScore * selfWeight + feedback360Score * feedback360Weight) / totalWeight',
      { kpiScore: 80, leaderScore: 90, selfScore: 70, feedback360Score: 85, kpiWeight: 40, leaderWeight: 30, selfWeight: 20, feedback360Weight: 10, totalWeight: 100 },
    );
    expect(result).toBeCloseTo(81.5, 1);
  });
});
