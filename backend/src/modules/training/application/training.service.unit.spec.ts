// ============================================================================
// modules/training/application/training.service.unit.spec.ts
// TRAIN-001 tests
// ============================================================================

import { TrainingService } from './training.service';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { AuditService } from '../../../shared/audit/audit.service';
import { TrainingAccessService } from './training-access.service';
import { DateProvider } from '../../../shared/time/date.provider';

describe('TrainingService', () => {
  const actor = { userId: 'user-1', impersonatorUserId: null, companyId: 'co-1' };

  let prisma: jest.Mocked<Pick<PrismaService, 'trainingAssignment' | 'trainingCourse'>>;
  let service: TrainingService;

  beforeEach(() => {
    prisma = {
      trainingAssignment: {
        count: jest
          .fn()
          .mockResolvedValueOnce(3)
          .mockResolvedValueOnce(10)
          .mockResolvedValueOnce(7),
      } as unknown as PrismaService['trainingAssignment'],
      trainingCourse: {
        count: jest.fn().mockResolvedValue(2),
        create: jest.fn(),
      } as unknown as PrismaService['trainingCourse'],
    };
    service = new TrainingService(
      prisma as unknown as PrismaService,
      { record: jest.fn() } as unknown as AuditService,
      { assertCanView: jest.fn(), assertCanManage: jest.fn() } as unknown as TrainingAccessService,
      { now: () => new Date() } as DateProvider,
    );
  });

  it('computes dashboard completion rate', async () => {
    const dash = await service.getDashboard(actor, 'co-1');
    expect(dash.overdue).toBe(3);
    expect(dash.completionRate).toBe(70);
    expect(dash.draftCourses).toBe(2);
  });
});
