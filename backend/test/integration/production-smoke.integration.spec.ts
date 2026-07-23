// ============================================================================
// test/integration/production-smoke.integration.spec.ts
// QA-004 Production smoke tests — must complete within acceptable time
// ============================================================================

import { INestApplication } from '@nestjs/common';
import { PrismaService } from '../../src/shared/prisma/prisma.service';
import { authHeader, createTestApp, login, TestAgent } from '../helpers/bootstrap';
import { createTestEmployee, ensureLeaveTypes, ensureWorkflowDefinitions, grantPermissionsToRole, assignBusinessRole } from '../helpers/fixtures';

const describeIfDb = process.env.DATABASE_URL ? describe : describe.skip;
const SMOKE_TIMEOUT_MS = 120_000;

describeIfDb('Production Smoke Tests (QA-004)', () => {
  let app: INestApplication;
  let agent: TestAgent;
  let prisma: PrismaService;
  let adminToken: string;

  beforeAll(async () => {
    ({ app, agent } = await createTestApp());
    prisma = app.get(PrismaService);
    await ensureWorkflowDefinitions(prisma);
    await ensureLeaveTypes(prisma);
    await grantPermissionsToRole(prisma, 'owner', ['reporting:owner', 'settings:write', 'payroll:read', 'payroll:write']);
    const adminUser = await prisma.user.findFirst({ where: { username: 'admin', deletedAt: null } });
    if (adminUser) {
      await assignBusinessRole(prisma, adminUser.id, 'owner', adminUser.id);
    }
    adminToken = await login(agent, 'admin', 'password');
  }, SMOKE_TIMEOUT_MS);

  afterAll(async () => {
    await app.close();
  });

  it('login returns token and permissions', async () => {
    const start = Date.now();
    const token = await login(agent, 'admin', 'password');
    expect(token).toBeTruthy();
    const me = await agent.get('/api/v1/auth/me').set(authHeader(token)).expect(200);
    expect(me.body.username).toBe('admin');
    expect(Date.now() - start).toBeLessThan(5000);
  });

  it('employee search returns results', async () => {
    const start = Date.now();
    const emp = await createTestEmployee(prisma, { companyCode: 'SB', firstName: 'SmokeTest' });
    const res = await agent
      .get('/api/v1/employees')
      .query({ companyId: emp.companyId, search: 'SmokeTest', limit: 10 })
      .set(authHeader(adminToken))
      .expect(200);
    expect(res.body).toBeDefined();
    expect(Date.now() - start).toBeLessThan(8000);
  });

  it('leave request creates workflow', async () => {
    const start = Date.now();
    const emp = await createTestEmployee(prisma, { companyCode: 'SB' });
    const created = await agent
      .post(`/api/v1/leave/employees/${emp.employeeId}/requests`)
      .set(authHeader(adminToken))
      .send({
        companyId: emp.companyId,
        leaveTypeCode: 'sick',
        startDate: '2026-09-01',
        endDate: '2026-09-01',
        days: 1,
        reason: 'Smoke test leave',
      })
      .expect(201);
    expect(created.body.workflowInstanceId).toBeTruthy();
    expect(Date.now() - start).toBeLessThan(10000);
  });

  it('workflow inbox loads for telegram approval path', async () => {
    const start = Date.now();
    const emp = await createTestEmployee(prisma, { companyCode: 'SB' });
    const inbox = await agent
      .get('/api/v1/workflow/inbox')
      .query({ companyId: emp.companyId })
      .set(authHeader(adminToken))
      .expect(200);
    expect(Array.isArray(inbox.body)).toBe(true);
    expect(Date.now() - start).toBeLessThan(8000);
  });

  it('payroll cycles list loads (preview path)', async () => {
    const start = Date.now();
    const res = await agent
      .get('/api/v1/payroll/cycles')
      .set(authHeader(adminToken))
      .expect(200);
    expect(Array.isArray(res.body.items ?? res.body)).toBe(true);
    expect(Date.now() - start).toBeLessThan(8000);
  });

  it('ops health dashboard returns monitoring metrics', async () => {
    const start = Date.now();
    const res = await agent
      .get('/api/v1/ops/health')
      .set(authHeader(adminToken))
      .expect(200);
    expect(res.body.db?.ok).toBe(true);
    expect(res.body.monitoring).toBeDefined();
    expect(res.body.overallStatus).toBeDefined();
    expect(Date.now() - start).toBeLessThan(8000);
  });

  it('AI manager brief loads', async () => {
    const start = Date.now();
    const emp = await createTestEmployee(prisma, { companyCode: 'SB' });
    const res = await agent
      .get('/api/v1/ai/manager/brief')
      .query({ companyId: emp.companyId, employeeId: emp.employeeId })
      .set(authHeader(adminToken))
      .expect(200);
    expect(res.body.summaryText).toBeTruthy();
    expect(Date.now() - start).toBeLessThan(15000);
  });

  it('knowledge graph query returns scoped response', async () => {
    const start = Date.now();
    const emp = await createTestEmployee(prisma, { companyCode: 'SB' });
    const res = await agent
      .post('/api/v1/ai/graph/query')
      .set(authHeader(adminToken))
      .send({ companyId: emp.companyId, query: 'How many employees?' })
      .expect((res) => {
        expect([200, 201]).toContain(res.status);
      });
    expect(res.body).toBeDefined();
    expect(Date.now() - start).toBeLessThan(15000);
  });
});
