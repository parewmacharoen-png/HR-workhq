// ============================================================================
// test/integration/marketing-expense.integration.spec.ts
// ============================================================================

import { INestApplication } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../src/shared/prisma/prisma.service';
import { ToolExecutor } from '../../src/modules/ai/application/tool-executor.service';
import { authHeader, createTestApp, login, TestAgent } from '../helpers/bootstrap';
import {
  createMarketingTeamStructure,
  createTestEmployee,
  ensureApprovedCommissionDeclarations,
  ensurePayrollCycle,
  grantPermissionsToRole,
} from '../helpers/fixtures';

describe('Marketing expenses (integration)', () => {
  let app: INestApplication;
  let agent: TestAgent;
  let prisma: PrismaService;
  let executor: ToolExecutor;
  let adminToken: string;

  beforeAll(async () => {
    ({ app, agent } = await createTestApp());
    prisma = app.get(PrismaService);
    executor = app.get(ToolExecutor);
    await grantPermissionsToRole(prisma, 'employee', [
      'marketing:read',
      'marketing:write',
      'marketing:approve',
      'ai:chat',
    ]);
    adminToken = await login(agent, 'admin', 'password');
  });

  afterAll(async () => {
    await app.close();
  });

  it('create → submit → approve expense and aggregate summary', async () => {
    const marketer = await createTestEmployee(prisma, { scopeType: 'company' });
    const earnCycleId = await ensurePayrollCycle(prisma, {
      companyId: marketer.companyId,
      periodStart: new Date('2026-06-01'),
      periodEnd: new Date('2026-06-30'),
      payDate: new Date('2026-07-05'),
    });
    const marketerToken = await login(agent, marketer.username, marketer.password);

    const uniqueDay = 10 + Math.floor(Math.random() * 18);
    const created = await agent
      .post('/api/v1/marketing/expenses')
      .set(authHeader(marketerToken))
      .send({
        companyId: marketer.companyId,
        earnCycleId,
        expenseDate: `2026-06-${String(uniqueDay).padStart(2, '0')}`,
        category: 'advertising',
        amount: 12_000,
        description: `Facebook ads ${randomUUID().slice(0, 8)}`,
      })
      .expect(201);

    const expenseId = created.body.id as string;
    expect(created.body.status).toBe('draft');

    await agent
      .post(`/api/v1/marketing/expenses/${expenseId}/submit`)
      .set(authHeader(marketerToken))
      .expect(201);

    const approved = await agent
      .post(`/api/v1/marketing/expenses/${expenseId}/approve`)
      .set(authHeader(adminToken))
      .expect(201);

    expect(approved.body.status).toBe('approved');

    const summary = await agent
      .get(`/api/v1/marketing/expenses/summary?companyId=${marketer.companyId}&earnCycleId=${earnCycleId}`)
      .set(authHeader(adminToken))
      .expect(200);

    expect(summary.body.totalExpense).toBe(12_000);
    expect(summary.body.byCategory.advertising).toBe(12_000);
  });

  it('reject expense excludes it from approved totals', async () => {
    const marketer = await createTestEmployee(prisma, { scopeType: 'company' });
    const earnCycleId = await ensurePayrollCycle(prisma, {
      companyId: marketer.companyId,
      periodStart: new Date('2026-05-01'),
      periodEnd: new Date('2026-05-31'),
      payDate: new Date('2026-06-05'),
    });
    const marketerToken = await login(agent, marketer.username, marketer.password);

    const created = await agent
      .post('/api/v1/marketing/expenses')
      .set(authHeader(marketerToken))
      .send({
        companyId: marketer.companyId,
        earnCycleId,
        expenseDate: '2026-05-10',
        category: 'promotion',
        amount: 3_000,
      })
      .expect(201);

    await agent
      .post(`/api/v1/marketing/expenses/${created.body.id}/submit`)
      .set(authHeader(marketerToken))
      .expect(201);

    await agent
      .post(`/api/v1/marketing/expenses/${created.body.id}/reject`)
      .set(authHeader(adminToken))
      .send({ reason: 'missing receipt' })
      .expect(201);

    const summary = await agent
      .get(`/api/v1/marketing/expenses/summary?companyId=${marketer.companyId}&earnCycleId=${earnCycleId}`)
      .set(authHeader(adminToken))
      .expect(200);

    expect(summary.body.byCategory.promotion).toBe(0);
  });

  it('commission calculate uses approved marketing expenses', async () => {
    const marketer = await createTestEmployee(prisma, {
      scopeType: 'company',
      hireDate: new Date('2020-01-01'),
      employmentStatus: 'active',
    });
    const { subTeamId: teamId } = await createMarketingTeamStructure(prisma, marketer.companyId, {
      subCode: 'MKT-EXP',
      memberEmployeeIds: [marketer.employeeId],
    });
    await ensureApprovedCommissionDeclarations(prisma, marketer.companyId, teamId, [marketer]);

    const earnCycleId = await ensurePayrollCycle(prisma, {
      companyId: marketer.companyId,
      periodStart: new Date('2026-03-01'),
      periodEnd: new Date('2026-03-31'),
      payDate: new Date('2026-04-05'),
    });
    const marketerToken = await login(agent, marketer.username, marketer.password);

    const expense = await agent
      .post('/api/v1/marketing/expenses')
      .set(authHeader(marketerToken))
      .send({
        companyId: marketer.companyId,
        teamId,
        earnCycleId,
        expenseDate: '2026-03-15',
        category: 'line_oa',
        amount: 8_000,
      })
      .expect(201);

    await agent.post(`/api/v1/marketing/expenses/${expense.body.id}/submit`).set(authHeader(marketerToken)).expect(201);
    await agent.post(`/api/v1/marketing/expenses/${expense.body.id}/approve`).set(authHeader(adminToken)).expect(201);

    const calculated = await agent
      .post('/api/v1/commission/marketing/calculate')
      .set(authHeader(adminToken))
      .send({
        companyId: marketer.companyId,
        teamId,
        earnCycleId,
        financial: {
          grossProfit: 500_000,
          employeeSalaryExpense: 100_000,
        },
      })
      .expect(201);

    const cycle = await prisma.marketingCommissionCycle.findFirst({
      where: { id: calculated.body.cycleId },
    });
    expect(Number(cycle?.lineExpense)).toBe(8_000);
    expect(Number(cycle?.marketingExpense)).toBe(0);
  });

  it('AI tool get_my_marketing_expenses returns expense data', async () => {
    const employee = await createTestEmployee(prisma, { scopeType: 'self' });
    await grantPermissionsToRole(prisma, 'employee', ['marketing:read', 'ai:chat']);

    const result = await executor.execute(
      { userId: employee.userId, impersonatorUserId: null, companyId: employee.companyId },
      'get_my_marketing_expenses',
      {},
    );

    expect(result.ok).toBe(true);
    const data = result.data as { expenses: unknown[]; summary: { totalExpense: number } };
    expect(Array.isArray(data.expenses)).toBe(true);
    expect(typeof data.summary.totalExpense).toBe('number');
  });
});
