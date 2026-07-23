// ============================================================================
// test/helpers/marketing-test.ts
// ============================================================================

import { PrismaService } from '../../src/shared/prisma/prisma.service';

/** Opt-in marketing APIs/surfaces for integration tests that exercise MarketingOS. */
export function enableMarketingForIntegrationTests(): void {
  process.env.MARKETING_ENABLED = 'true';
}

export async function unlockAllMarketingCycles(prisma: PrismaService): Promise<void> {
  await prisma.marketingCycleLock.updateMany({
    where: { status: 'locked' },
    data: {
      status: 'unlocked',
      unlockedAt: new Date(),
      unlockReason: 'integration cleanup',
    },
  });
}
