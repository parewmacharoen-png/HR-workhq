import { KpiTemplateBuilderService } from './kpi-template-builder.service';
import { KpiInvalidStatusError } from '../domain/errors/kpi.errors';

describe('KpiTemplateBuilderService', () => {
  const prisma = {
    kpiTemplate: {
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
    },
  };
  const access = { assertCanManageTemplates: jest.fn(), assertCanViewTemplates: jest.fn() };
  const audit = { record: jest.fn() };
  const templates = {
    getOrThrow: jest.fn(),
  };

  let service: KpiTemplateBuilderService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new KpiTemplateBuilderService(
      prisma as never,
      access as never,
      audit as never,
    );
  });

  it('clones a template as draft with source metadata', async () => {
    prisma.kpiTemplate.findFirst.mockResolvedValue({
      id: 'tpl-1',
      companyId: 'co-1',
      rootId: null,
      name: 'Sales KPI',
      metrics: [{ name: 'Revenue', weight: 1, targetType: 'number', scoringMethod: 'manual', sortOrder: 0 }],
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    prisma.kpiTemplate.create.mockResolvedValue({
      id: 'tpl-2',
      name: 'Sales KPI (Copy)',
      companyId: 'co-1',
      metrics: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const result = await service.cloneTemplate({ userId: 'u1' } as never, 'tpl-1');

    expect(access.assertCanManageTemplates).toHaveBeenCalledWith({ userId: 'u1' }, 'co-1');
    expect(prisma.kpiTemplate.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        sourceId: 'tpl-1',
        rootId: 'tpl-1',
        status: 'draft',
      }),
    }));
    expect(result.id).toBe('tpl-2');
  });

  it('archives a template', async () => {
    prisma.kpiTemplate.findFirst.mockResolvedValue({ id: 'tpl-1', companyId: 'co-1', metrics: [] });
    prisma.kpiTemplate.update.mockResolvedValue({
      id: 'tpl-1',
      name: 'Sales KPI',
      status: 'archived',
      metrics: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await service.archiveTemplate({ userId: 'u1' } as never, 'tpl-1');

    expect(prisma.kpiTemplate.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'tpl-1' },
      data: { status: 'archived' },
    }));
  });

  it('prevents deleting active templates', async () => {
    prisma.kpiTemplate.findFirst.mockResolvedValue({
      id: 'tpl-1',
      companyId: 'co-1',
      status: 'active',
      metrics: [],
    });

    await expect(service.deleteTemplate({ userId: 'u1' } as never, 'tpl-1'))
      .rejects.toBeInstanceOf(KpiInvalidStatusError);
  });

  it('creates a new version and archives active siblings', async () => {
    prisma.kpiTemplate.findFirst
      .mockResolvedValueOnce({
        id: 'tpl-1',
        companyId: 'co-1',
        rootId: 'root-1',
        version: 2,
        name: 'Sales KPI',
        metrics: [],
      })
      .mockResolvedValueOnce({ version: 2 });
    prisma.kpiTemplate.create.mockResolvedValue({
      id: 'tpl-3',
      name: 'Sales KPI',
      version: 3,
      metrics: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await service.createTemplateVersion({ userId: 'u1' } as never, 'tpl-1');

    expect(prisma.kpiTemplate.updateMany).toHaveBeenCalled();
    expect(prisma.kpiTemplate.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ version: 3, rootId: 'root-1', sourceId: 'tpl-1' }),
    }));
  });

  it('finds templates by position', async () => {
    prisma.kpiTemplate.findMany.mockResolvedValue([{
      id: 'tpl-1',
      name: 'Role KPI',
      metrics: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    }]);

    const rows = await service.findTemplatesByPosition(
      { userId: 'u1' } as never,
      'co-1',
      'pos-1',
    );

    expect(access.assertCanViewTemplates).toHaveBeenCalledWith({ userId: 'u1' }, 'co-1');
    expect(rows).toHaveLength(1);
  });
});
