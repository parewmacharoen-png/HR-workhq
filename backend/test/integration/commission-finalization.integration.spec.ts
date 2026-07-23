// ============================================================================
// test/integration/commission-finalization.integration.spec.ts
// ============================================================================

import { randomUUID } from 'crypto';
import { INestApplication } from '@nestjs/common';
import { PrismaService } from '../../src/shared/prisma/prisma.service';
import { authHeader, createTestApp, login, TestAgent } from '../helpers/bootstrap';
import { enableMarketingForIntegrationTests } from '../helpers/marketing-test';
import { createMarketingTeamStructure, createTestEmployee, ensureApprovedCommissionDeclarations, ensurePayrollCycle } from '../helpers/fixtures';

describe('Commission finalization workflow (integration)', () => {
  let app: INestApplication;
  let agent: TestAgent;
  let prisma: PrismaService;
  let adminToken: string;

  beforeAll(async () => {
    enableMarketingForIntegrationTests();
    ({ app, agent } = await createTestApp());
    prisma = app.get(PrismaService);
    adminToken = await login(agent, 'admin', 'password');
  });

  afterAll(async () => {
    await app.close();
  });

  afterEach(async () => {
    await prisma.marketingCycleLock.updateMany({
      where: { status: 'locked' },
      data: { status: 'unlocked', unlockedAt: new Date(), unlockReason: 'integration cleanup' },
    });
  });

  it('approve → finalize → lock with payroll and lock enforcement', async () => {
    const bigLeader = await createTestEmployee(prisma, {
      hireDate: new Date('2020-01-01'),
      employmentStatus: 'active',
    });
    const employeeA = await createTestEmployee(prisma, {
      companyCode: bigLeader.companyCode,
      hireDate: new Date('2020-01-01'),
      employmentStatus: 'active',
    });
    const employeeB = await createTestEmployee(prisma, {
      companyCode: bigLeader.companyCode,
      hireDate: new Date('2020-01-01'),
      employmentStatus: 'active',
    });

    const { subTeamId: teamId } = await createMarketingTeamStructure(prisma, bigLeader.companyId, {
      subCode: `MKT-${randomUUID().slice(0, 8)}`,
      bigLeaderEmployeeId: bigLeader.employeeId,
      memberEmployeeIds: [employeeA.employeeId, employeeB.employeeId],
    });
    await ensureApprovedCommissionDeclarations(prisma, bigLeader.companyId, teamId, [
      bigLeader,
      employeeA,
      employeeB,
    ]);

    const earnCycleId = await ensurePayrollCycle(prisma, {
      companyId: bigLeader.companyId,
      periodStart: new Date('2026-09-25'),
      periodEnd: new Date('2026-10-23'),
      payDate: new Date('2026-10-25'),
    });
    await ensurePayrollCycle(prisma, {
      companyId: bigLeader.companyId,
      periodStart: new Date('2026-10-25'),
      periodEnd: new Date('2026-11-23'),
      payDate: new Date('2026-11-25'),
    });

    const calculated = await agent
      .post('/api/v1/commission/marketing/calculate')
      .set(authHeader(adminToken))
      .send({
        companyId: bigLeader.companyId,
        teamId,
        earnCycleId,
        financial: {
          grossProfit: 1_000_000,
          employeeSalaryExpense: 200_000,
          marketingExpense: 50_000,
          lineExpense: 10_000,
          telesalesExpense: 5_000,
          promotionExpense: 20_000,
        },
      })
      .expect(201);

    const sourceCycleId = calculated.body.cycleId as string;
    const unified = await prisma.commissionCycle.findFirst({
      where: { sourceCycleId, deletedAt: null },
    });
    expect(unified).toBeTruthy();
    expect(unified?.status).toBe('draft');

    const preview = await agent
      .get(`/api/v1/commission/cycles/${unified!.id}/preview`)
      .set(authHeader(adminToken))
      .expect(200);
    expect(preview.body.totals.totalCommission).toBeGreaterThan(0);

    await agent
      .post(`/api/v1/commission/cycles/${unified!.id}/approve`)
      .set(authHeader(adminToken))
      .expect(201);

    const finalized = await agent
      .post(`/api/v1/commission/cycles/${unified!.id}/finalize`)
      .set(authHeader(adminToken))
      .expect(201);
    expect(finalized.body.payrollItemsCreated).toBeGreaterThan(0);

    const duplicateFinalize = await agent
      .post(`/api/v1/commission/cycles/${unified!.id}/finalize`)
      .set(authHeader(adminToken))
      .expect(201);
    expect(duplicateFinalize.body.payrollItemsCreated).toBe(0);

    await agent
      .post(`/api/v1/commission/cycles/${unified!.id}/lock`)
      .set(authHeader(adminToken))
      .expect(201);

    await agent
      .post('/api/v1/commission/marketing/calculate')
      .set(authHeader(adminToken))
      .send({
        companyId: bigLeader.companyId,
        teamId,
        earnCycleId,
        financial: {
          grossProfit: 900_000,
          employeeSalaryExpense: 200_000,
          marketingExpense: 50_000,
          lineExpense: 10_000,
          telesalesExpense: 5_000,
          promotionExpense: 20_000,
        },
      })
      .expect(409);

    const audits = await prisma.commissionCycleAudit.findMany({
      where: { commissionCycleId: unified!.id },
      orderBy: { createdAt: 'asc' },
    });
    expect(audits.map((a) => a.action)).toEqual(['approve', 'finalize', 'lock']);
  });
});
