// ============================================================================
// test/integration/marketing-commission.integration.spec.ts
// ============================================================================

import { randomUUID } from 'crypto';
import { INestApplication } from '@nestjs/common';
import { PrismaService } from '../../src/shared/prisma/prisma.service';
import { authHeader, createTestApp, login, TestAgent } from '../helpers/bootstrap';
import { createMarketingTeamStructure, createTestEmployee, ensureApprovedCommissionDeclarations, ensurePayrollCycle } from '../helpers/fixtures';

describe('Marketing commission (integration)', () => {
  let app: INestApplication;
  let agent: TestAgent;
  let prisma: PrismaService;
  let adminToken: string;

  beforeAll(async () => {
    ({ app, agent } = await createTestApp());
    prisma = app.get(PrismaService);
    adminToken = await login(agent, 'admin', 'password');
  });

  afterAll(async () => {
    await app.close();
  });

  it('finalize creates payroll items and duplicate finalize is idempotent', async () => {
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
      periodStart: new Date('2026-04-25'),
      periodEnd: new Date('2026-05-23'),
      payDate: new Date('2026-05-25'),
    });
    await ensurePayrollCycle(prisma, {
      companyId: bigLeader.companyId,
      periodStart: new Date('2026-05-25'),
      periodEnd: new Date('2026-06-23'),
      payDate: new Date('2026-06-25'),
    });

    const calculated = await agent
      .post('/api/v1/commission/marketing/calculate')
      .set(authHeader(adminToken))
      .send({
        companyId: bigLeader.companyId,
        teamId,
        earnCycleId: earnCycleId,
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

    const cycleId = calculated.body.cycleId as string;
    expect(calculated.body.netProfit).toBeGreaterThan(0);
    expect(calculated.body.teamCommissionPool).toBeGreaterThan(0);
    expect(calculated.body.bigLeaderCommission).toBeGreaterThan(0);

    const finalized = await agent
      .post(`/api/v1/commission/marketing/${cycleId}/finalize`)
      .set(authHeader(adminToken))
      .expect(201);

    expect(finalized.body.payrollItemsCreated).toBeGreaterThan(0);

    const memberResults = await prisma.marketingCommissionMemberResult.findMany({
      where: { cycleId },
      select: { id: true },
    });
    const payrollItems = await prisma.payrollItem.findMany({
      where: {
        sourceRefType: 'marketing_commission',
        sourceRefId: { in: [cycleId, ...memberResults.map((m) => m.id)] },
        deletedAt: null,
      },
    });
    expect(payrollItems.length).toBeGreaterThanOrEqual(finalized.body.payrollItemsCreated);

    const duplicate = await agent
      .post(`/api/v1/commission/marketing/${cycleId}/finalize`)
      .set(authHeader(adminToken))
      .expect(201);

    expect(duplicate.body.payrollItemsCreated).toBe(0);

    const payrollItemsAfter = await prisma.payrollItem.findMany({
      where: {
        sourceRefType: 'marketing_commission',
        sourceRefId: { in: [cycleId, ...memberResults.map((m) => m.id)] },
        deletedAt: null,
      },
    });
    expect(payrollItemsAfter.length).toBe(payrollItems.length);
  });
});
