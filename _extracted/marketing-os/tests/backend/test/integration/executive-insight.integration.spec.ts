// ============================================================================
// test/integration/executive-insight.integration.spec.ts
// ============================================================================

import { randomUUID } from 'crypto';
import { INestApplication } from '@nestjs/common';
import { PrismaService } from '../../src/shared/prisma/prisma.service';
import { ToolExecutor } from '../../src/modules/ai/application/tool-executor.service';
import { authHeader, createTestApp, login, TestAgent } from '../helpers/bootstrap';
import {
  createMarketingTeamStructure,
  createTestEmployee,
  grantPermissionsToRole,
} from '../helpers/fixtures';

describe('Executive Copilot (integration)', () => {
  let app: INestApplication;
  let agent: TestAgent;
  let prisma: PrismaService;
  let executor: ToolExecutor;
  let adminToken: string;

  beforeAll(async () => {
    ({ app, agent } = await createTestApp());
    prisma = app.get(PrismaService);
    executor = app.get(ToolExecutor);
    await grantPermissionsToRole(prisma, 'employee', ['marketing:read', 'ai:chat']);
    adminToken = await login(agent, 'admin', 'password');
  });

  afterAll(async () => {
    await app.close();
  });

  it('admin can fetch executive summary via AI tool', async () => {
    const admin = await prisma.user.findFirst({ where: { username: 'admin', deletedAt: null } });
    expect(admin).toBeTruthy();

    const result = await executor.execute(
      { userId: admin!.id, impersonatorUserId: null, companyId: null },
      'get_executive_summary',
      {},
    );

    expect(result.ok).toBe(true);
    const data = result.data as { headline?: { financeNet?: number }; finance?: unknown };
    expect(data.headline).toBeDefined();
    expect(data.finance).toBeDefined();
  });

  it('admin can fetch executive risks and forecast tools', async () => {
    const admin = await prisma.user.findFirst({ where: { username: 'admin', deletedAt: null } });
    expect(admin).toBeTruthy();

    const risks = await executor.execute(
      { userId: admin!.id, impersonatorUserId: null, companyId: null },
      'get_executive_risks',
      {},
    );
    expect(risks.ok).toBe(true);

    const forecast = await executor.execute(
      { userId: admin!.id, impersonatorUserId: null, companyId: null },
      'get_executive_forecast',
      {},
    );
    expect(forecast.ok).toBe(true);
    const forecastData = forecast.data as { forecast?: { projectedNetProfit?: number | null } };
    expect(forecastData.forecast).toBeDefined();
  });

  it('employee without executive access is denied', async () => {
    const employee = await createTestEmployee(prisma);

    const result = await executor.execute(
      { userId: employee.userId, impersonatorUserId: null, companyId: employee.companyId },
      'get_executive_recommendations',
      { companyId: employee.companyId },
    );

    expect(result.ok).toBe(false);
  });

  it('marketing leader receives scoped executive recommendations', async () => {
    await grantPermissionsToRole(prisma, 'employee', ['reporting:owner']);
    const leader = await createTestEmployee(prisma, { scopeType: 'company' });
    await createMarketingTeamStructure(prisma, leader.companyId, {
      subCode: `EX-${randomUUID().slice(0, 6)}`,
      subLeaderEmployeeId: leader.employeeId,
    });

    const result = await executor.execute(
      { userId: leader.userId, impersonatorUserId: null, companyId: leader.companyId },
      'get_executive_recommendations',
      { companyId: leader.companyId },
    );

    expect(result.ok).toBe(true);
    const data = result.data as { scope?: { scope?: string; teamId?: string | null } };
    expect(data.scope?.scope).toBe('leader');
    expect(data.scope?.teamId).toBeTruthy();
  });

  it('HTTP executive endpoints return summary, risks, forecast, recommendations, and brief', async () => {
    const company = await prisma.company.findFirst({ where: { code: 'SB', deletedAt: null } });
    expect(company).toBeTruthy();

    await agent.get(`/api/v1/executive?companyId=${company!.id}`).set(authHeader(adminToken)).expect(200);
    await agent.get(`/api/v1/executive/risks?companyId=${company!.id}`).set(authHeader(adminToken)).expect(200);
    await agent.get(`/api/v1/executive/forecast?companyId=${company!.id}`).set(authHeader(adminToken)).expect(200);
    await agent
      .get(`/api/v1/executive/recommendations?companyId=${company!.id}`)
      .set(authHeader(adminToken))
      .expect(200);

    const brief = await agent
      .get(`/api/v1/executive/brief?companyId=${company!.id}`)
      .set(authHeader(adminToken))
      .expect(200);
    expect(brief.body.today).toBeDefined();
    expect(brief.body.yesterday).toBeDefined();
    expect(brief.body.mtd).toBeDefined();
  });
});
