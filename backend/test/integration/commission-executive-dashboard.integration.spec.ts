// ============================================================================
// test/integration/commission-executive-dashboard.integration.spec.ts
// ============================================================================

import { INestApplication } from '@nestjs/common';
import { PrismaService } from '../../src/shared/prisma/prisma.service';
import { authHeader, createTestApp, login, TestAgent } from '../helpers/bootstrap';
import { enableMarketingForIntegrationTests } from '../helpers/marketing-test';

describe('Commission Executive Dashboard (integration)', () => {
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

  it('owner dashboard includes commissionDashboard block', async () => {
    const owner = await agent
      .post('/api/v1/reporting/owner/dashboard/generate')
      .set(authHeader(adminToken))
      .send({})
      .expect(201);

    expect(owner.body.commissionDashboard).toBeDefined();
    expect(owner.body.commissionDashboard.executiveSummary).toBeDefined();
    expect(owner.body.commissionDashboard.marketing).toBeDefined();
    expect(owner.body.commissionDashboard.admin).toBeDefined();
    expect(owner.body.commissionDashboard.referral).toBeDefined();
    expect(owner.body.commissionDashboard.recruitment).toBeDefined();
  });

  it('GET commission dashboard returns unified view', async () => {
    const company = await prisma.company.findFirst({ where: { deletedAt: null, isActive: true } });
    expect(company).toBeTruthy();

    const res = await agent
      .get(`/api/v1/reporting/commission/dashboard?companyId=${company!.id}`)
      .set(authHeader(adminToken))
      .expect(200);

    expect(res.body.executiveSummary).toBeDefined();
    expect(res.body.marketing.overview).toBeDefined();
  });
});
