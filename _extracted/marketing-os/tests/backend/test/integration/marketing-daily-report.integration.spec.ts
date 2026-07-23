// ============================================================================
// test/integration/marketing-daily-report.integration.spec.ts
// ============================================================================

import { INestApplication } from '@nestjs/common';
import { PrismaService } from '../../src/shared/prisma/prisma.service';
import { ToolExecutor } from '../../src/modules/ai/application/tool-executor.service';
import { authHeader, createTestApp, login, TestAgent } from '../helpers/bootstrap';
import { createTestEmployee, ensureMarketingEarnCycle, grantPermissionsToRole } from '../helpers/fixtures';

describe('Marketing daily reports (integration)', () => {
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
    ]);
    adminToken = await login(agent, 'admin', 'password');
  });

  afterAll(async () => {
    await app.close();
  });

  it('submitted report counts for projected KPI; rejected excluded; approved for commission', async () => {
    const marketer = await createTestEmployee(prisma, {
      employmentStatus: 'active',
      scopeType: 'company',
    });

    const earnCycleId = await ensureMarketingEarnCycle(prisma, marketer.companyId);

    const marketerToken = await login(agent, marketer.username, marketer.password);

    const draft = await agent
      .post('/api/v1/marketing/daily-reports')
      .set(authHeader(marketerToken))
      .send({
        companyId: marketer.companyId,
        reportDate: '2026-06-21',
        contactedCount: 100,
        newMemberCount: 15,
        depositAmount: 8500,
        startedWorkCount: 3,
      })
      .expect(201);

    const reportId = draft.body.id as string;
    await agent
      .post(`/api/v1/marketing/daily-reports/${reportId}/submit`)
      .set(authHeader(marketerToken))
      .expect(201);

    const kpiAfterSubmit = await agent
      .get(`/api/v1/marketing/kpi/me?earnCycleId=${earnCycleId}`)
      .set(authHeader(marketerToken))
      .expect(200);

    expect(kpiAfterSubmit.body.startedWorkCount).toBe(3);
    expect(kpiAfterSubmit.body.remainingCount).toBe(21);

    const rejectedDraft = await agent
      .post('/api/v1/marketing/daily-reports')
      .set(authHeader(marketerToken))
      .send({
        companyId: marketer.companyId,
        reportDate: '2026-06-22',
        contactedCount: 50,
        newMemberCount: 5,
        depositAmount: 1000,
        startedWorkCount: 10,
      })
      .expect(201);

    await agent
      .post(`/api/v1/marketing/daily-reports/${rejectedDraft.body.id}/submit`)
      .set(authHeader(marketerToken))
      .expect(201);

    await agent
      .post(`/api/v1/marketing/daily-reports/${rejectedDraft.body.id}/reject`)
      .set(authHeader(adminToken))
      .send({ rejectedReason: 'invalid data' })
      .expect(201);

    const kpiAfterReject = await agent
      .get(`/api/v1/marketing/kpi/me?earnCycleId=${earnCycleId}`)
      .set(authHeader(marketerToken))
      .expect(200);

    expect(kpiAfterReject.body.startedWorkCount).toBe(3);

    await agent
      .post(`/api/v1/marketing/daily-reports/${reportId}/approve`)
      .set(authHeader(adminToken))
      .expect(201);

    const approvedSum = await prisma.marketingDailyReport.aggregate({
      where: {
        employeeId: marketer.employeeId,
        companyId: marketer.companyId,
        status: 'approved',
        deletedAt: null,
      },
      _sum: { startedWorkCount: true },
    });
    expect(approvedSum._sum.startedWorkCount).toBe(3);
  });

  it('get_my_marketing_kpi AI tool returns daily report KPI', async () => {
    const marketer = await createTestEmployee(prisma, {
      employmentStatus: 'active',
      scopeType: 'company',
    });
    await grantPermissionsToRole(prisma, 'employee', ['marketing:read', 'marketing:write']);

    const earnCycleId = await ensureMarketingEarnCycle(prisma, marketer.companyId);

    const created = await agent
      .post('/api/v1/marketing/daily-reports')
      .set(authHeader(await login(agent, marketer.username, marketer.password)))
      .send({
        companyId: marketer.companyId,
        reportDate: '2026-06-23',
        contactedCount: 80,
        newMemberCount: 12,
        depositAmount: 6000,
        startedWorkCount: 4,
      })
      .expect(201);

    await agent
      .post(`/api/v1/marketing/daily-reports/${created.body.id}/submit`)
      .set(authHeader(await login(agent, marketer.username, marketer.password)))
      .expect(201);

    const result = await executor.execute(
      { userId: marketer.userId, impersonatorUserId: null, companyId: marketer.companyId },
      'get_my_marketing_kpi',
      { earnCycleId },
    );

    expect(result.ok).toBe(true);
    const data = result.data as { startedWorkCount: number; targetCount: number };
    expect(data.startedWorkCount).toBeGreaterThanOrEqual(4);
    expect(data.targetCount).toBe(24);
  });
});
