import { PromotionPathValidationService } from './promotion-path-validation.service';

describe('PromotionPathValidationService', () => {
  const companyId = 'co-1';
  const employeeId = 'emp-1';
  const currentPositionId = 'pos-junior';
  const targetPositionId = 'pos-senior';
  const skipTargetId = 'pos-director';

  const prisma = {
    employee: { findFirst: jest.fn() },
    employeeAssignment: { findFirst: jest.fn() },
  };
  const access = { assertCanView: jest.fn().mockResolvedValue(undefined) };
  const careerPaths = { list: jest.fn() };
  const promotionPaths = { list: jest.fn() };
  const positionDefinitions = { list: jest.fn() };

  let service: PromotionPathValidationService;

  const positions = [
    { id: currentPositionId, companyId, code: 'JR', name: 'Junior', familyId: null, levelId: null, description: null, status: 'active' as const, version: 1, rootId: null, sourceId: null, createdAt: '2026-01-01', updatedAt: '2026-01-01' },
    { id: targetPositionId, companyId, code: 'SR', name: 'Senior', familyId: null, levelId: null, description: null, status: 'active' as const, version: 1, rootId: null, sourceId: null, createdAt: '2026-01-01', updatedAt: '2026-01-01' },
    { id: skipTargetId, companyId, code: 'DR', name: 'Director', familyId: null, levelId: null, description: null, status: 'active' as const, version: 1, rootId: null, sourceId: null, createdAt: '2026-01-01', updatedAt: '2026-01-01' },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    service = new PromotionPathValidationService(
      prisma as never,
      access as never,
      careerPaths as never,
      promotionPaths as never,
      positionDefinitions as never,
    );

    prisma.employee.findFirst.mockResolvedValue({
      id: employeeId,
      positionDefinitionId: currentPositionId,
    });
    prisma.employeeAssignment.findFirst.mockResolvedValue({ employeeId, companyId });
    positionDefinitions.list.mockResolvedValue(positions);
    careerPaths.list.mockResolvedValue([
      {
        id: 'cp-1',
        companyId,
        code: 'ENG',
        name: 'Engineering',
        description: null,
        status: 'active',
        version: 1,
        rootId: null,
        sourceId: null,
        createdAt: '2026-01-01',
        updatedAt: '2026-01-01',
        steps: [
          { id: 's1', positionDefinitionId: currentPositionId, stepOrder: 0, notes: null },
          { id: 's2', positionDefinitionId: targetPositionId, stepOrder: 1, notes: null },
        ],
      },
    ]);
  });

  it('returns valid when a direct active promotion path exists', async () => {
    promotionPaths.list.mockResolvedValue([
      {
        id: 'pp-1',
        companyId,
        code: 'JR-SR',
        name: 'Junior to Senior',
        description: null,
        fromPositionId: currentPositionId,
        toPositionId: targetPositionId,
        requirements: null,
        status: 'active',
        version: 1,
        rootId: null,
        sourceId: null,
        createdAt: '2026-01-01',
        updatedAt: '2026-01-01',
      },
    ]);

    const result = await service.validate(
      { userId: 'u1' } as never,
      { employeeId, companyId, targetPositionDefinitionId: targetPositionId },
    );

    expect(result.valid).toBe(true);
    expect(result.warning).toBeNull();
    expect(result.currentPosition?.id).toBe(currentPositionId);
    expect(result.nextPositions).toHaveLength(1);
    expect(result.suggestedPaths).toHaveLength(1);
  });

  it('returns invalid with warning when target skips the next career step', async () => {
    promotionPaths.list.mockResolvedValue([
      {
        id: 'pp-1',
        companyId,
        code: 'JR-SR',
        name: 'Junior to Senior',
        description: null,
        fromPositionId: currentPositionId,
        toPositionId: targetPositionId,
        requirements: null,
        status: 'active',
        version: 1,
        rootId: null,
        sourceId: null,
        createdAt: '2026-01-01',
        updatedAt: '2026-01-01',
      },
    ]);

    const result = await service.validate(
      { userId: 'u1' } as never,
      { employeeId, companyId, targetPositionDefinitionId: skipTargetId },
    );

    expect(result.valid).toBe(false);
    expect(result.warning).toContain('not the next step');
    expect(result.suggestedPaths).toHaveLength(1);
    expect(result.suggestedPaths[0].toPositionId).toBe(targetPositionId);
  });
});
