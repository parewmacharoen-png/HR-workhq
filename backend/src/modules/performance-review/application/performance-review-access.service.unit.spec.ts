import { PerformanceReviewAccessService } from './performance-review-access.service';
import { PerformanceReviewForbiddenError } from '../domain/errors/performance-review.errors';

describe('PerformanceReviewAccessService', () => {
  const companyAccess = { assertCompanyAccess: jest.fn().mockResolvedValue(undefined) };
  const hierarchy = { getDescendantEmployeeIds: jest.fn().mockResolvedValue(['emp-2']) };
  const permissions = { findUserAccess: jest.fn() };

  let service: PerformanceReviewAccessService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new PerformanceReviewAccessService(
      companyAccess as never,
      hierarchy as never,
      permissions as never,
    );
  });

  it('allows owner to finalize', async () => {
    permissions.findUserAccess.mockResolvedValue({ businessRole: 'owner' });
    await expect(service.assertCanFinalize({ userId: 'u1' } as never, 'co-1'))
      .resolves.toBeUndefined();
  });

  it('allows secretary to manage profiles', async () => {
    permissions.findUserAccess.mockResolvedValue({ businessRole: 'secretary' });
    await expect(service.assertCanManageProfiles({ userId: 'u1' } as never, 'co-1'))
      .resolves.toBeUndefined();
  });

  it('denies big leader profile management', async () => {
    permissions.findUserAccess.mockResolvedValue({ businessRole: 'big_leader' });
    await expect(service.assertCanManageProfiles({ userId: 'u1' } as never, 'co-1'))
      .rejects.toBeInstanceOf(PerformanceReviewForbiddenError);
  });

  it('allows employee to view own reviews', async () => {
    permissions.findUserAccess.mockResolvedValue({ employeeId: 'emp-1', businessRole: 'employee' });
    await expect(service.assertCanViewEmployeeReviews({ userId: 'u1' } as never, 'emp-1', 'co-1'))
      .resolves.toBeUndefined();
    expect(companyAccess.assertCompanyAccess).not.toHaveBeenCalled();
  });

  it('allows sub leader to update team member scores', async () => {
    permissions.findUserAccess.mockResolvedValue({ businessRole: 'sub_leader', employeeId: 'sub-1' });
    await expect(service.assertCanUpdateScores({ userId: 'u1' } as never, {
      employeeId: 'emp-2',
      reviewerId: null,
      companyId: 'co-1',
    })).resolves.toBeUndefined();
  });
});
