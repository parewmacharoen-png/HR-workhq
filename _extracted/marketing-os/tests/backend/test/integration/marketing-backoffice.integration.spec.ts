// ============================================================================
// test/integration/marketing-backoffice.integration.spec.ts
// ============================================================================

import { INestApplication } from '@nestjs/common';
import { PrismaService } from '../../src/shared/prisma/prisma.service';
import { PayrollCycleResolverService } from '../../src/shared/payroll/payroll-cycle-resolver.service';
import { authHeader, createTestApp, login, TestAgent } from '../helpers/bootstrap';
import { createTestEmployee, grantPermissionsToRole, ensurePayrollCycle } from '../helpers/fixtures';

describe('Marketing back office (integration)', () => {
  let app: INestApplication;
  let agent: TestAgent;
  let prisma: PrismaService;
  let cycleResolver: PayrollCycleResolverService;
  let adminToken: string;

  beforeAll(async () => {
    ({ app, agent } = await createTestApp());
    prisma = app.get(PrismaService);
    cycleResolver = app.get(PayrollCycleResolverService);
    await grantPermissionsToRole(prisma, 'employee', [
      'marketing:read',
      'marketing:write',
      'marketing:approve',
      'marketing:audit',
      'marketing:lock',
    ]);
    adminToken = await login(agent, 'admin', 'password');
  });

  afterAll(async () => {
    await app.close();
  });

  it('employee edits draft; leader edit requires reason; locked cycle blocks patch; void excludes KPI', async () => {
    const marketer = await createTestEmployee(prisma, {
      employmentStatus: 'active',
      scopeType: 'company',
    });
    const earnCycleId = await ensurePayrollCycle(prisma, {
      companyId: marketer.companyId,
      periodStart: new Date('2026-06-01'),
      periodEnd: new Date('2026-06-30'),
      payDate: new Date('2026-07-05'),
    });

    const marketerToken = await login(agent, marketer.username, marketer.password);

    const draft = await agent
      .post('/api/v1/marketing/daily-reports')
      .set(authHeader(marketerToken))
      .send({
        companyId: marketer.companyId,
        reportDate: '2026-06-22',
        contactedCount: 50,
        newMemberCount: 10,
        depositAmount: 5000,
        startedWorkCount: 4,
      })
      .expect(201);

    const reportId = draft.body.id as string;

    await agent
      .patch(`/api/v1/marketing/daily-reports/${reportId}`)
      .set(authHeader(marketerToken))
      .send({ contactedCount: 55 })
      .expect(200);

    await agent
      .post(`/api/v1/marketing/daily-reports/${reportId}/submit`)
      .set(authHeader(marketerToken))
      .expect(201);

    await agent
      .patch(`/api/v1/marketing/reports/${reportId}`)
      .set(authHeader(adminToken))
      .send({ reason: 'admin correction', startedWorkCount: 5 })
      .expect(200);

    const audit = await agent
      .get(`/api/v1/marketing/reports/${reportId}/audit`)
      .set(authHeader(adminToken))
      .expect(200);

    expect(audit.body.some((row: { action: string }) => row.action === 'update')).toBe(true);

    await agent
      .post(`/api/v1/marketing/daily-reports/${reportId}/approve`)
      .set(authHeader(adminToken))
      .expect(201);

    await agent
      .patch(`/api/v1/marketing/daily-reports/${reportId}`)
      .set(authHeader(marketerToken))
      .send({ contactedCount: 99 })
      .expect(422);

    const voidable = await agent
      .post('/api/v1/marketing/daily-reports')
      .set(authHeader(marketerToken))
      .send({
        companyId: marketer.companyId,
        reportDate: '2026-06-23',
        contactedCount: 20,
        newMemberCount: 5,
        depositAmount: 2000,
        startedWorkCount: 2,
      })
      .expect(201);

    const voidId = voidable.body.id as string;
    await agent
      .post(`/api/v1/marketing/daily-reports/${voidId}/submit`)
      .set(authHeader(marketerToken))
      .expect(201);
    await agent
      .post(`/api/v1/marketing/daily-reports/${voidId}/approve`)
      .set(authHeader(adminToken))
      .expect(201);
    await agent
      .post(`/api/v1/marketing/daily-reports/${voidId}/void`)
      .set(authHeader(adminToken))
      .send({ voidReason: 'duplicate entry' })
      .expect(201);

    const kpiBeforeLock = await agent
      .get(`/api/v1/marketing/kpi/me?earnCycleId=${earnCycleId}`)
      .set(authHeader(marketerToken))
      .expect(200);

    expect(kpiBeforeLock.body.startedWorkCount).toBe(5);

    const lockTarget = await agent
      .post('/api/v1/marketing/daily-reports')
      .set(authHeader(marketerToken))
      .send({
        companyId: marketer.companyId,
        reportDate: '2026-06-24',
        contactedCount: 10,
        newMemberCount: 2,
        depositAmount: 1000,
        startedWorkCount: 1,
      })
      .expect(201);
    const lockReportId = lockTarget.body.id as string;
    await agent
      .post(`/api/v1/marketing/daily-reports/${lockReportId}/submit`)
      .set(authHeader(marketerToken))
      .expect(201);

    const lockEarnCycleId = await cycleResolver.resolveEarnCycleId(
      marketer.companyId,
      new Date('2026-06-24'),
    );
    expect(lockEarnCycleId).toBeTruthy();

    await agent
      .post(`/api/v1/marketing/cycles/${lockEarnCycleId}/lock`)
      .set(authHeader(adminToken))
      .send({ companyId: marketer.companyId, reason: 'finalize month' })
      .expect(201);

    await agent
      .patch(`/api/v1/marketing/reports/${lockReportId}`)
      .set(authHeader(adminToken))
      .send({ reason: 'should fail', contactedCount: 1 })
      .expect(409);
  });
});
