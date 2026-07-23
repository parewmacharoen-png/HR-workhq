import { ExitChecklistService } from './exit-checklist.service';
import { DEFAULT_EXIT_CHECKLIST } from '../domain/constants/exit-checklist.constants';

describe('ExitChecklistService', () => {
  const prisma = {
    exitChecklistItem: {
      createMany: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
    employeeExitCase: {
      update: jest.fn(),
    },
  };

  let service: ExitChecklistService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new ExitChecklistService(prisma as never);
  });

  it('seeds default checklist items', async () => {
    await service.seedDefaultItems('case-1');
    expect(prisma.exitChecklistItem.createMany).toHaveBeenCalledWith({
      data: DEFAULT_EXIT_CHECKLIST.map((item) => ({
        exitCaseId: 'case-1',
        itemKey: item.itemKey,
        label: item.label,
        sortOrder: item.sortOrder,
      })),
      skipDuplicates: true,
    });
  });

  it('syncs legacy booleans when item completed', async () => {
    prisma.exitChecklistItem.findFirst.mockResolvedValue({
      id: 'item-1',
      exitCaseId: 'case-1',
      itemKey: 'return_laptop',
      label: 'Return laptop',
      sortOrder: 2,
      completed: false,
      completedBy: null,
      completedAt: null,
    });
    prisma.exitChecklistItem.update.mockResolvedValue({
      id: 'item-1',
      exitCaseId: 'case-1',
      itemKey: 'return_laptop',
      label: 'Return laptop',
      sortOrder: 2,
      completed: true,
      completedBy: 'user-1',
      completedAt: new Date('2026-06-23'),
    });
    prisma.exitChecklistItem.findMany.mockResolvedValue(
      DEFAULT_EXIT_CHECKLIST.map((item) => ({
        ...item,
        id: item.itemKey,
        exitCaseId: 'case-1',
        completed: item.itemKey === 'return_laptop',
        completedBy: null,
        completedAt: null,
      })),
    );

    await service.updateItem({ userId: 'user-1' } as never, 'case-1', 'item-1', true);

    expect(prisma.employeeExitCase.update).toHaveBeenCalledWith({
      where: { id: 'case-1' },
      data: expect.objectContaining({
        assetsReturned: false,
        accessRevoked: false,
        finalPayrollBuilt: false,
      }),
    });
  });
});
