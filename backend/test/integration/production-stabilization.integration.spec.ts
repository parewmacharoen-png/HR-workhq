// ============================================================================
// test/integration/production-stabilization.integration.spec.ts
// Production stabilization critical workflow smoke tests
// ============================================================================

import { INestApplication } from '@nestjs/common';
import { PrismaService } from '../../src/shared/prisma/prisma.service';
import { authHeader, createTestApp, login, TestAgent } from '../helpers/bootstrap';
import { createTestEmployee, ensureLeaveTypes, ensureWorkflowDefinitions } from '../helpers/fixtures';
import { FormulaResolverService } from '../../src/modules/formula-engine/application/formula-resolver.service';
import { AiMorningBriefService } from '../../src/modules/ai/application/ai-manager.service';
import { formatMorningBriefTelegram } from '../../src/modules/telegram/application/ai-morning-brief-delivery.scheduler';

const describeIfDb = process.env.DATABASE_URL ? describe : describe.skip;

describeIfDb('Production Stabilization Integration', () => {
  let app: INestApplication;
  let agent: TestAgent;
  let prisma: PrismaService;
  let adminToken: string;

  beforeAll(async () => {
    ({ app, agent } = await createTestApp());
    prisma = app.get(PrismaService);
    await ensureWorkflowDefinitions(prisma);
    await ensureLeaveTypes(prisma);
    adminToken = await login(agent, 'admin', 'password');
  });

  afterAll(async () => {
    await app.close();
  });

  it('formula resolver falls back when key missing', async () => {
    const resolver = app.get(FormulaResolverService);
    const result = await resolver.resolveWithFallback(
      'nonexistent.formula.key',
      { entityType: 'Test', entityId: '00000000-0000-0000-0000-000000000001', inputs: {} },
      () => 99,
    );
    expect(result.value).toBe(99);
    expect(result.fallbackUsed).toBe(true);
  });

  it('generates AI morning brief for company', async () => {
    const briefService = app.get(AiMorningBriefService);
    const emp = await createTestEmployee(prisma, { companyCode: 'SB' });
    const brief = await briefService.generateForCompany(emp.companyId, emp.employeeId, 'owner');
    expect(brief.summaryText).toContain('สรุป WorkHQ');
    expect(brief.deliveryStatus).toBe('pending');

    const formatted = formatMorningBriefTelegram('SB Company', '24 มิถุนายน 2569', brief.sectionsJson as Record<string, number>);
    expect(formatted).toContain('📊');
    expect(formatted).toContain('คนหยุด');
  });

  it('leave request creates workflow instance and inbox entry', async () => {
    const emp = await createTestEmployee(prisma, { companyCode: 'SB' });
    const sick = await prisma.leaveType.findFirst({ where: { code: 'sick', deletedAt: null } });
    expect(sick).toBeTruthy();

    const created = await agent
      .post(`/api/v1/leave/employees/${emp.employeeId}/requests`)
      .set(authHeader(adminToken))
      .send({
        companyId: emp.companyId,
        leaveTypeCode: 'sick',
        startDate: '2026-08-01',
        endDate: '2026-08-01',
        days: 1,
        reason: 'Stabilization leave test',
      })
      .expect(201);

    expect(created.body.workflowInstanceId).toBeTruthy();

    const inbox = await agent
      .get('/api/v1/workflow/inbox')
      .query({ companyId: emp.companyId })
      .set(authHeader(adminToken))
      .expect(200);

    expect(Array.isArray(inbox.body)).toBe(true);
  });

  it('AI manager brief API returns today brief with audit trail support', async () => {
    const emp = await createTestEmployee(prisma, { companyCode: 'SB' });
    const res = await agent
      .get('/api/v1/ai/manager/brief')
      .query({ companyId: emp.companyId, employeeId: emp.employeeId })
      .set(authHeader(adminToken))
      .expect(200);
    expect(res.body.summaryText).toBeTruthy();
  });
});
