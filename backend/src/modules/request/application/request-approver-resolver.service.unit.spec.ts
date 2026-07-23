import { RequestApproverResolverService } from './request-approver-resolver.service';

describe('RequestApproverResolverService', () => {
  const prisma = {
    employeeAssignment: { findFirst: jest.fn() },
    employee: { findUnique: jest.fn() },
    user: { findFirst: jest.fn() },
    businessRoleAssignment: { findMany: jest.fn() },
  };
  const hierarchy = {
    getBigLeader: jest.fn(),
    getDirectManager: jest.fn(),
  };

  let service: RequestApproverResolverService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new RequestApproverResolverService(prisma as never, hierarchy as never);
  });

  it('falls back to owner when no secretary is assigned', async () => {
    prisma.businessRoleAssignment.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          userId: 'owner-user',
          user: {
            employee: { id: 'emp-owner', firstName: 'Owner', lastName: 'User' },
          },
        },
      ]);

    const approvers = await service.resolve(
      'secretary',
      'emp-1',
      'co-1',
      {},
    );

    expect(approvers).toHaveLength(1);
    expect(approvers[0].employeeId).toBe('emp-owner');
    expect(prisma.businessRoleAssignment.findMany).toHaveBeenCalledTimes(2);
  });
});
