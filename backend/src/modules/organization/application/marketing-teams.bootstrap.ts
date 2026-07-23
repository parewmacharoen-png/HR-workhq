import { randomUUID } from 'crypto';
import { PrismaClient } from '@prisma/client';

const MARKETING_FUNCTION_CODE = 'marketing';
const MARKETING_FUNCTION_NAME = 'Marketing';
const MARKETING_TEAM_COUNT = 9;

type OrgPrisma = Pick<PrismaClient, 'function' | 'team'>;

export async function ensureMarketingFunction(prisma: OrgPrisma) {
  const existing = await prisma.function.findFirst({
    where: { code: MARKETING_FUNCTION_CODE, deletedAt: null },
  });
  if (existing) return existing;
  return prisma.function.create({
    data: {
      id: randomUUID(),
      code: MARKETING_FUNCTION_CODE,
      name: MARKETING_FUNCTION_NAME,
    },
  });
}

/** Idempotent — creates Marketing Team 1..9 for a company when missing. */
export async function ensureMarketingTeamsForCompany(
  prisma: OrgPrisma,
  companyId: string,
): Promise<void> {
  const marketingFn = await ensureMarketingFunction(prisma);
  for (let i = 1; i <= MARKETING_TEAM_COUNT; i += 1) {
    const name = `Team ${i}`;
    const existing = await prisma.team.findFirst({
      where: { companyId, name, deletedAt: null },
    });
    if (existing) continue;
    await prisma.team.create({
      data: {
        id: randomUUID(),
        companyId,
        functionId: marketingFn.id,
        name,
        isActive: true,
      },
    });
  }
}

export function isMarketingDepartment(department: string | null | undefined): boolean {
  if (!department) return false;
  const normalized = department.trim().toLowerCase();
  return normalized === 'marketing' || normalized === 'การตลาด';
}
