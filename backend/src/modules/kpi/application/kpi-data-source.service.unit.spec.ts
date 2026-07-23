import {
  KpiDataSourceService,
  MetricForScoring,
  MetricScoreContext,
  safeEvalNumericExpression,
} from './kpi-data-source.service';

describe('KpiDataSourceService', () => {
  const prisma = {
    attendanceRecord: { count: jest.fn() },
    kpiAssignment: { findFirst: jest.fn() },
  };

  let service: KpiDataSourceService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new KpiDataSourceService(prisma as never);
  });

  describe('normalizeScoringMethod', () => {
    it('maps imported to system', () => {
      expect(service.normalizeScoringMethod('imported')).toBe('system');
    });

    it('preserves known methods', () => {
      expect(service.normalizeScoringMethod('formula')).toBe('formula');
      expect(service.normalizeScoringMethod('api')).toBe('api');
    });
  });

  describe('resolveMetricScore', () => {
    const context: MetricScoreContext = {
      employeeId: 'emp-1',
      companyId: 'co-1',
      target: 100,
      actual: 80,
    };

    it('returns null for manual scoring', async () => {
      const result = await service.resolveMetricScore(
        { scoringMethod: 'manual' },
        context,
      );
      expect(result.score).toBeNull();
      expect(result.note).toContain('Manual');
    });

    it('evaluates formula with target and actual placeholders', async () => {
      const result = await service.resolveMetricScore(
        {
          scoringMethod: 'formula',
          formulaExpression: '({actual}/{target})*100',
        },
        context,
      );
      expect(result.score).toBe(80);
    });

    it('resolves attendance.present_days from system source', async () => {
      prisma.attendanceRecord.count.mockResolvedValue(18);
      const result = await service.resolveMetricScore(
        {
          scoringMethod: 'system',
          systemSourceKey: 'attendance.present_days',
        },
        context,
      );
      expect(result.score).toBe(18);
      expect(prisma.attendanceRecord.count).toHaveBeenCalled();
    });

    it('maps imported scoring to system resolution', async () => {
      prisma.kpiAssignment.findFirst.mockResolvedValue({
        score: { totalScore: 85 },
      });
      const result = await service.resolveMetricScore(
        {
          scoringMethod: 'imported',
          systemSourceKey: 'kpi.prior_score',
        },
        context,
      );
      expect(result.score).toBe(85);
    });

    it('returns stub note for api scoring', async () => {
      const result = await service.resolveMetricScore(
        {
          scoringMethod: 'api',
          apiEndpoint: 'https://example.com/metrics',
          apiFieldPath: 'score',
        },
        context,
      );
      expect(result.score).toBeNull();
      expect(result.note).toContain('API');
    });
  });

  describe('safeEvalNumericExpression', () => {
    it('evaluates basic arithmetic', () => {
      expect(safeEvalNumericExpression('(80/100)*100')).toBe(80);
    });

    it('rejects non-numeric expressions', () => {
      expect(safeEvalNumericExpression('process.exit()')).toBeNull();
      expect(safeEvalNumericExpression('abc')).toBeNull();
    });
  });
});
