// ============================================================================
// test/integration/rule-config.integration.spec.ts
// ============================================================================

import { INestApplication } from '@nestjs/common';
import { PrismaService } from '../../src/shared/prisma/prisma.service';
import { authHeader, createTestApp, login, TestAgent } from '../helpers/bootstrap';
import { createTestEmployee } from '../helpers/fixtures';

describe('Rule config (integration)', () => {
  let app: INestApplication;
  let agent: TestAgent;
  let prisma: PrismaService;
  let adminToken: string;
  let companyId: string;

  beforeAll(async () => {
    ({ app, agent } = await createTestApp());
    prisma = app.get(PrismaService);
    adminToken = await login(agent, 'admin', 'password');
    const employee = await createTestEmployee(prisma, { employmentStatus: 'active' });
    companyId = employee.companyId;
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns default marketing commission config', async () => {
    const res = await agent
      .get(`/api/v1/settings/commission/marketing?companyId=${companyId}`)
      .set(authHeader(adminToken))
      .expect(200);

    expect(res.body.config.kpiTargetDefault).toBe(24);
    expect(res.body.config.teamPoolPercent).toBe(10);
    expect(res.body.activeVersion).toBeNull();
  });

  it('creates versioned config with audit reason', async () => {
    const res = await agent
      .put(`/api/v1/settings/commission/marketing?companyId=${companyId}`)
      .set(authHeader(adminToken))
      .send({
        reason: 'UAT test update',
        config: { kpiTargetDefault: 26, teamPoolPercent: 12 },
      })
      .expect(200);

    expect(res.body.activeVersion).toBe(1);
    expect(res.body.config.kpiTargetDefault).toBe(26);
    expect(res.body.config.teamPoolPercent).toBe(12);
    expect(res.body.config.bigLeaderPercent).toBe(5);
    expect(res.body.versions).toHaveLength(1);
    expect(res.body.versions[0].reason).toBe('UAT test update');

    const audit = await prisma.auditLog.findFirst({
      where: { entityType: 'RuleConfigProfile', action: 'update_config' },
      orderBy: { occurredAt: 'desc' },
    });
    expect(audit).toBeTruthy();
  });

  it('rejects invalid percentage values', async () => {
    await agent
      .put(`/api/v1/settings/commission/marketing?companyId=${companyId}`)
      .set(authHeader(adminToken))
      .send({
        reason: 'bad values',
        config: { teamPoolPercent: 150 },
      })
      .expect(400);
  });

  it('returns default admin commission config', async () => {
    const res = await agent
      .get(`/api/v1/settings/commission/admin?companyId=${companyId}`)
      .set(authHeader(adminToken))
      .expect(200);

    expect(res.body.config.poolAPercent).toBe(1);
    expect(res.body.config.normalLeaveAllowanceDays).toBe(4);
    expect(res.body.config.leavePenaltyTiers.length).toBeGreaterThan(0);
  });
});
