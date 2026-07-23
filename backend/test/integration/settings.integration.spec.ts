// ============================================================================
// test/integration/settings.integration.spec.ts
// ============================================================================

import { INestApplication } from '@nestjs/common';
import { PrismaService } from '../../src/shared/prisma/prisma.service';
import { authHeader, createTestApp, login, TestAgent } from '../helpers/bootstrap';
import { createTestEmployee } from '../helpers/fixtures';

describe('Settings engine (integration)', () => {
  let app: INestApplication;
  let agent: TestAgent;
  let prisma: PrismaService;
  let adminToken: string;
  let companyId: string;

  beforeAll(async () => {
    ({ app, agent } = await createTestApp());
    prisma = app.get(PrismaService);
    adminToken = await login(agent, 'admin', 'password');
    const employee = await createTestEmployee(prisma);
    companyId = employee.companyId;
  });

  afterAll(async () => {
    await app.close();
  });

  it('creates and updates a company setting with version and audit', async () => {
    const created = await agent
      .put('/api/v1/settings/referral/reward_amount')
      .set(authHeader(adminToken))
      .query({ companyId })
      .send({ value: 2500, reason: 'integration test create' })
      .expect(200);

    expect(created.body.key).toBe('reward_amount');
    expect(created.body.value).toBe(2500);
    expect(created.body.category).toBe('referral');

    const updated = await agent
      .put('/api/v1/settings/referral/reward_amount')
      .set(authHeader(adminToken))
      .query({ companyId })
      .send({ value: 3000 })
      .expect(200);

    expect(updated.body.value).toBe(3000);

    const history = await agent
      .get('/api/v1/settings/history')
      .set(authHeader(adminToken))
      .query({ companyId, category: 'referral', key: 'reward_amount' })
      .expect(200);

    expect(history.body.length).toBeGreaterThanOrEqual(2);
    expect(history.body[0].newValue).toBe(3000);

    const audits = await agent
      .get('/api/v1/settings/audit')
      .set(authHeader(adminToken))
      .query({ companyId, key: 'reward_amount' })
      .expect(200);

    expect(audits.body.length).toBeGreaterThanOrEqual(2);
  });

  it('company override wins over system in effective resolution via service', async () => {
    await agent
      .put('/api/v1/settings/deposit/monthly_deduction')
      .set(authHeader(adminToken))
      .query({ companyId: 'system' })
      .send({ value: 500 })
      .expect(200);

    await agent
      .put('/api/v1/settings/deposit/monthly_deduction')
      .set(authHeader(adminToken))
      .query({ companyId })
      .send({ value: 400 })
      .expect(200);

    const byCategory = await agent
      .get('/api/v1/settings/deposit')
      .set(authHeader(adminToken))
      .query({ companyId })
      .expect(200);

    const companyRow = byCategory.body.find(
      (row: { key: string }) => row.key === 'monthly_deduction',
    );
    expect(companyRow.value).toBe(400);
  });

  it('lists settings and categories', async () => {
    const res = await agent
      .get('/api/v1/settings')
      .set(authHeader(adminToken))
      .query({ companyId })
      .expect(200);

    expect(res.body.categories).toContain('attendance');
    expect(Array.isArray(res.body.settings)).toBe(true);
  });

  it('enforces settings:write permission', async () => {
    const employee = await createTestEmployee(prisma, {
      roleCodes: ['employee'],
      scopeType: 'company',
    });
    const token = await login(agent, employee.username, employee.password);

    await agent
      .put('/api/v1/settings/payroll/meal_allowance_per_day')
      .set(authHeader(token))
      .query({ companyId: employee.companyId })
      .send({ value: 120 })
      .expect(403);
  });
});
