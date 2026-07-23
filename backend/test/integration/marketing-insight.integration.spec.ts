// ============================================================================
// test/integration/marketing-insight.integration.spec.ts
// ============================================================================

import { randomUUID } from 'crypto';
import { INestApplication } from '@nestjs/common';
import { PrismaService } from '../../src/shared/prisma/prisma.service';
import { ToolExecutor } from '../../src/modules/ai/application/tool-executor.service';
import { authHeader, createTestApp, login, TestAgent } from '../helpers/bootstrap';
import { enableMarketingForIntegrationTests } from '../helpers/marketing-test';
import {
  createMarketingTeamStructure,
  createTestEmployee,
  grantPermissionsToRole,
} from '../helpers/fixtures';

describe('Marketing insight AI tools (integration)', () => {
  let app: INestApplication;
  let agent: TestAgent;
  let prisma: PrismaService;
  let executor: ToolExecutor;
  let adminToken: string;

  beforeAll(async () => {
    enableMarketingForIntegrationTests();
    ({ app, agent } = await createTestApp());
    prisma = app.get(PrismaService);
    executor = app.get(ToolExecutor);
    await grantPermissionsToRole(prisma, 'employee', ['marketing:read', 'marketing:write', 'ai:chat']);
    adminToken = await login(agent, 'admin', 'password');
  });

  afterAll(async () => {
    await app.close();
  });

  it('owner can access company marketing performance insights', async () => {
    const admin = await prisma.user.findFirst({ where: { username: 'admin', deletedAt: null } });
    expect(admin).toBeTruthy();
    const company = await prisma.company.findFirst({ where: { code: 'SB', deletedAt: null } });
    expect(company).toBeTruthy();

    const result = await executor.execute(
      { userId: admin!.id, impersonatorUserId: null, companyId: null },
      'get_marketing_performance_insights',
      { companyId: company!.id },
    );

    expect(result.ok).toBe(true);
    const data = result.data as {
      teamRanking: unknown[];
      expenseSummary: { totalExpense: number };
      recommendations: string[];
    };
    expect(Array.isArray(data.teamRanking)).toBe(true);
    expect(data.expenseSummary.totalExpense).toBeGreaterThanOrEqual(0);
    expect(data.recommendations.length).toBeGreaterThan(0);
  });

  it('leader receives scoped team insights', async () => {
    const leader = await createTestEmployee(prisma, { scopeType: 'company' });
    const member = await createTestEmployee(prisma, { companyCode: leader.companyCode });
    const otherTeamLeader = await createTestEmployee(prisma, { companyCode: leader.companyCode });

    const teamA = await createMarketingTeamStructure(prisma, leader.companyId, {
      subCode: `A-${randomUUID().slice(0, 6)}`,
      subLeaderEmployeeId: leader.employeeId,
      memberEmployeeIds: [member.employeeId],
    });
    await createMarketingTeamStructure(prisma, leader.companyId, {
      subCode: `B-${randomUUID().slice(0, 6)}`,
      subLeaderEmployeeId: otherTeamLeader.employeeId,
    });

    const result = await executor.execute(
      { userId: leader.userId, impersonatorUserId: null, companyId: leader.companyId },
      'get_marketing_team_comparison',
      { companyId: leader.companyId },
    );

    expect(result.ok).toBe(true);
    const data = result.data as { scope: { teamId: string | null }; teams: Array<{ teamId: string }> };
    expect(data.scope.teamId).toBe(teamA.subTeamId);
    expect(data.teams.every((t) => t.teamId === teamA.subTeamId)).toBe(true);
  });

  it('employee without leader scope is denied marketing insights', async () => {
    const employee = await createTestEmployee(prisma, { scopeType: 'company' });

    const result = await executor.execute(
      { userId: employee.userId, impersonatorUserId: null, companyId: employee.companyId },
      'get_marketing_performance_insights',
      { companyId: employee.companyId },
    );

    expect(result.ok).toBe(false);
  });

  it('HTTP insights endpoint returns alerts and forecast for admin', async () => {
    const company = await prisma.company.findFirst({ where: { code: 'SB', deletedAt: null } });
    expect(company).toBeTruthy();

    const insights = await agent
      .get(`/api/v1/marketing/insights?companyId=${company!.id}`)
      .set(authHeader(adminToken))
      .expect(200);
    expect(insights.body.recommendations).toBeTruthy();

    await agent
      .get(`/api/v1/marketing/insights/alerts?companyId=${company!.id}`)
      .set(authHeader(adminToken))
      .expect(200);

    await agent
      .get(`/api/v1/marketing/insights/forecast?companyId=${company!.id}`)
      .set(authHeader(adminToken))
      .expect(200);
  });
});
