import { reconcileStaleDraftSubmissions } from './onboarding-reconcile.util';

function createPrismaMock(drafts: Array<{ id: string; employeeId: string }>) {
  const updates: Array<{ id: string; data: { status: string } }> = [];
  return {
    employeeSelfOnboardingSubmission: {
      findMany: jest.fn().mockResolvedValue(drafts),
      findFirst: jest.fn().mockImplementation(({ where }: { where: { employeeId: string; id: { not: string } } }) => {
        if (where.employeeId === 'emp-with-finished') {
          return Promise.resolve({ id: 'finished-1' });
        }
        return Promise.resolve(null);
      }),
      update: jest.fn().mockImplementation(({ where, data }: { where: { id: string }; data: { status: string } }) => {
        updates.push({ id: where.id, data });
        return Promise.resolve({});
      }),
    },
    _updates: updates,
  } as never;
}

describe('reconcileStaleDraftSubmissions', () => {
  it('cancels draft when employee already has submitted/approved record', async () => {
    const prisma = createPrismaMock([
      { id: 'draft-1', employeeId: 'emp-with-finished' },
      { id: 'draft-2', employeeId: 'emp-only-draft' },
    ]);

    const cancelled = await reconcileStaleDraftSubmissions(prisma, 'company-1');
    expect(cancelled).toBe(1);
    expect(prisma.employeeSelfOnboardingSubmission.update).toHaveBeenCalledWith({
      where: { id: 'draft-1' },
      data: { status: 'cancelled' },
    });
  });
});
