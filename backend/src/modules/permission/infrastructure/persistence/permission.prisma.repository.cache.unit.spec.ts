import { RequestContextService } from '../../../../common/context/request-context';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { PrismaAuthContextRepository } from './permission.prisma.repository';

describe('PrismaAuthContextRepository per-request cache', () => {
  const findFirst = jest.fn(async () => null);
  const repo = new PrismaAuthContextRepository({ user: { findFirst } } as unknown as PrismaService);
  const ctx = new RequestContextService();
  const inRequest = <T>(fn: () => Promise<T>) => ctx.run(
    { requestId: 'r1', actor: { userId: 'actor', impersonatorUserId: null, companyId: null }, startedAt: 0 },
    fn,
  );

  beforeEach(() => findFirst.mockClear());

  it("loads the acting user's context once per request", async () => {
    await inRequest(async () => {
      await repo.loadForUser('actor');
      await repo.loadForUser('actor');
    });
    expect(findFirst).toHaveBeenCalledTimes(1);
  });

  it('always reads other users fresh, and does not share across requests', async () => {
    await inRequest(async () => {
      await repo.loadForUser('someone-else');
      await repo.loadForUser('someone-else');
    });
    await inRequest(() => repo.loadForUser('actor'));
    await inRequest(() => repo.loadForUser('actor'));
    expect(findFirst).toHaveBeenCalledTimes(4);
  });
});
