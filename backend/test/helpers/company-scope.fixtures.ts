// ============================================================================
// test/helpers/company-scope.fixtures.ts
// TEST-001c — cross-company scope fixtures
// ============================================================================

import { randomUUID } from 'crypto';
import { PrismaService } from '../../src/shared/prisma/prisma.service';
import { createTestEmployee, TestEmployee } from './fixtures';

export interface CompanyScopePair {
  companyA: TestEmployee;
  companyB: TestEmployee;
}

/** Two employees in different companies for cross-company denial tests. */
export async function createCrossCompanyPair(prisma: PrismaService): Promise<CompanyScopePair> {
  const companyA = await createTestEmployee(prisma);
  const companyB = await createTestEmployee(prisma, {
    companyCode: `XCO-${randomUUID().slice(0, 6).toUpperCase()}`,
    phone: `088${Math.floor(Math.random() * 1_000_0000)}`,
  });
  return { companyA, companyB };
}

export async function assertCrossCompanyDenied(
  statusCode: number,
  body: { message?: string; statusCode?: number },
): Promise<void> {
  expect(statusCode).toBeGreaterThanOrEqual(403);
  expect(body.message ?? body.statusCode).toBeTruthy();
}
