import { CompensationReviewAccessService } from './compensation-review-access.service';
import { CompensationReviewForbiddenError } from '../domain/errors/salary-review.errors';

describe('CompensationReviewAccessService', () => {
  const companyAccess = { assertCompanyAccess: jest.fn().mockResolvedValue(undefined) };
  const permissions = { findUserAccess: jest.fn() };

  let service: CompensationReviewAccessService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new CompensationReviewAccessService(
      companyAccess as never,
      permissions as never,
    );
  });

  it('allows owner to approve', async () => {
    permissions.findUserAccess.mockResolvedValue({ businessRole: 'owner' });
    await expect(service.assertCanApprove({ userId: 'u1' } as never, 'co-1'))
      .resolves.toBeUndefined();
  });

  it('denies secretary approval', async () => {
    permissions.findUserAccess.mockResolvedValue({ businessRole: 'secretary' });
    await expect(service.assertCanApprove({ userId: 'u1' } as never, 'co-1'))
      .rejects.toBeInstanceOf(CompensationReviewForbiddenError);
  });

  it('allows big leader to propose', async () => {
    permissions.findUserAccess.mockResolvedValue({ businessRole: 'big_leader' });
    await expect(service.assertCanPropose({ userId: 'u1' } as never, 'co-1'))
      .resolves.toBeUndefined();
  });

  it('denies big leader edit', async () => {
    permissions.findUserAccess.mockResolvedValue({ businessRole: 'big_leader' });
    await expect(service.assertCanEdit({ userId: 'u1' } as never, 'co-1'))
      .rejects.toBeInstanceOf(CompensationReviewForbiddenError);
  });

  it('allows employee to view own timeline', async () => {
    permissions.findUserAccess.mockResolvedValue({ employeeId: 'emp-1', businessRole: 'employee' });
    await expect(service.assertCanViewTimeline({ userId: 'u1' } as never, 'emp-1', 'co-1'))
      .resolves.toBeUndefined();
    expect(companyAccess.assertCompanyAccess).not.toHaveBeenCalled();
  });

  it('denies employee viewing another timeline', async () => {
    permissions.findUserAccess.mockResolvedValue({ employeeId: 'emp-1', businessRole: 'employee' });
    await expect(service.assertCanViewTimeline({ userId: 'u1' } as never, 'emp-2', 'co-1'))
      .rejects.toBeInstanceOf(CompensationReviewForbiddenError);
  });
});
