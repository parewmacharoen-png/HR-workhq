// ============================================================================
// test/integration/commission-adjustment.integration.spec.ts
// ============================================================================

import { randomUUID } from 'crypto';
import { INestApplication } from '@nestjs/common';
import { PrismaService } from '../../src/shared/prisma/prisma.service';
import { authHeader, createTestApp, login, TestAgent } from '../helpers/bootstrap';
import { enableMarketingForIntegrationTests } from '../helpers/marketing-test';
import { drainOutbox } from '../helpers/outbox';
import {
  createMarketingTeamStructure,
  createTestEmployee,
  ensureApprovedCommissionDeclarations,
  ensurePayrollCycle,
  ensureWorkflowDefinitions,
} from '../helpers/fixtures';

describe('Commission adjustment workflow (integration)', () => {
  let app: INestApplication;
  let agent: TestAgent;
  let prisma: PrismaService;
  let adminToken: string;

  beforeAll(async () => {
    enableMarketingForIntegrationTests();
    ({ app, agent } = await createTestApp());
    prisma = app.get(PrismaService);
    await ensureWorkflowDefinitions(prisma);
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

  async function lockMarketingCycle(companyId: string, teamId: string, earnCycleId: string) {
    const calculated = await agent
      .post('/api/v1/commission/marketing/calculate')
      .set(authHeader(adminToken))
      .send({
        companyId,
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

    const unified = await prisma.commissionCycle.findFirst({
      where: { sourceCycleId: calculated.body.cycleId as string, deletedAt: null },
    });
    expect(unified).toBeTruthy();

    await agent.post(`/api/v1/commission/cycles/${unified!.id}/approve`).set(authHeader(adminToken)).expect(201);
    await agent.post(`/api/v1/commission/cycles/${unified!.id}/finalize`).set(authHeader(adminToken)).expect(201);
    await agent.post(`/api/v1/commission/cycles/${unified!.id}/lock`).set(authHeader(adminToken)).expect(201);

    return { unified: unified!, sourceCycleId: calculated.body.cycleId as string };
  }

  it('create → submit → approve → apply with payroll adjustment and audit history', async () => {
    const bigLeader = await createTestEmployee(prisma, {
      hireDate: new Date('2020-01-01'),
      employmentStatus: 'active',
    });
    const employeeA = await createTestEmployee(prisma, {
      companyCode: bigLeader.companyCode,
      hireDate: new Date('2020-01-01'),
      employmentStatus: 'active',
    });

    const { subTeamId: teamId } = await createMarketingTeamStructure(prisma, bigLeader.companyId, {
      subCode: `MKT-${randomUUID().slice(0, 8)}`,
      bigLeaderEmployeeId: bigLeader.employeeId,
      memberEmployeeIds: [employeeA.employeeId],
    });
    await ensureApprovedCommissionDeclarations(prisma, bigLeader.companyId, teamId, [
      bigLeader,
      employeeA,
    ]);

    const earnCycleId = await ensurePayrollCycle(prisma, {
      companyId: bigLeader.companyId,
      periodStart: new Date('2026-11-25'),
      periodEnd: new Date('2026-12-23'),
      payDate: new Date('2026-12-25'),
    });
    await ensurePayrollCycle(prisma, {
      companyId: bigLeader.companyId,
      periodStart: new Date('2026-12-25'),
      periodEnd: new Date('2027-01-23'),
      payDate: new Date('2027-01-25'),
    });

    const { unified, sourceCycleId } = await lockMarketingCycle(bigLeader.companyId, teamId, earnCycleId);

    const member = await prisma.marketingCommissionMemberResult.findFirst({
      where: { employeeId: employeeA.employeeId, cycleId: sourceCycleId },
    });
    expect(member).toBeTruthy();

    const draft = await agent
      .post('/api/v1/commission/adjustments')
      .set(authHeader(adminToken))
      .send({
        companyId: bigLeader.companyId,
        earnCycleId,
        type: 'marketing',
        teamId,
        employeeId: employeeA.employeeId,
        sourceResultId: member!.id,
        reason: 'KPI miscount correction',
        adjustmentAmount: 1500,
        direction: 'increase',
      })
      .expect(201);
    expect(draft.body.status).toBe('draft');

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

    const submitted = await agent
      .post(`/api/v1/commission/adjustments/${draft.body.id}/submit`)
      .set(authHeader(adminToken))
      .expect(201);
    expect(submitted.body.status).toBe('submitted');
    expect(submitted.body.workflowInstanceId).toBeTruthy();

    await agent
      .post(`/api/v1/commission/adjustments/${draft.body.id}/approve`)
      .set(authHeader(adminToken))
      .expect(201);

    await drainOutbox(app);

    const detail = await agent
      .get(`/api/v1/commission/adjustments/${draft.body.id}`)
      .set(authHeader(adminToken))
      .expect(200);
    expect(detail.body.status).toBe('applied');
    expect(detail.body.entry).toBeTruthy();
    expect(detail.body.entry.netAmount).toBe(Number(member!.finalPayout) + 1500);
    expect(detail.body.audits.map((a: { action: string }) => a.action)).toEqual(
      expect.arrayContaining(['submit', 'approve', 'apply']),
    );

    const payrollItem = await prisma.payrollItem.findFirst({
      where: {
        sourceRefType: 'commission_adjustment',
        sourceRefId: draft.body.id,
        deletedAt: null,
      },
    });
    expect(payrollItem).toBeTruthy();
    expect(payrollItem?.itemType).toBe('commission_adjustment');
    expect(Number(payrollItem?.amount)).toBe(1500);

    const list = await agent
      .get('/api/v1/commission/adjustments')
      .query({ companyId: bigLeader.companyId, earnCycleId, status: 'applied' })
      .set(authHeader(adminToken))
      .expect(200);
    expect(list.body.some((row: { id: string }) => row.id === draft.body.id)).toBe(true);

    const lockedCycle = await prisma.commissionCycle.findFirst({ where: { id: unified.id } });
    expect(lockedCycle?.status).toBe('locked');
  });

  it('rejects adjustment when cycle is not locked', async () => {
    const employee = await createTestEmployee(prisma);
    const earnCycleId = await ensurePayrollCycle(prisma, {
      companyId: employee.companyId,
      periodStart: new Date('2027-02-25'),
      periodEnd: new Date('2027-03-23'),
      payDate: new Date('2027-03-25'),
    });

    await agent
      .post('/api/v1/commission/adjustments')
      .set(authHeader(adminToken))
      .send({
        companyId: employee.companyId,
        earnCycleId,
        type: 'admin',
        employeeId: employee.employeeId,
        reason: 'Should fail',
        adjustmentAmount: 100,
        direction: 'increase',
      })
      .expect(422);
  });
});
