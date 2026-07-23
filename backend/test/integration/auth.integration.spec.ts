// ============================================================================
// test/integration/auth.integration.spec.ts
// ============================================================================

import { INestApplication } from '@nestjs/common';
import { PrismaService } from '../../src/shared/prisma/prisma.service';
import { authHeader, createTestApp, login, TestAgent } from '../helpers/bootstrap';
import { createTestEmployee, grantPermissionsToRole } from '../helpers/fixtures';
import { randomUUID } from 'crypto';

describe('Authentication (integration)', () => {
  let app: INestApplication;
  let agent: TestAgent;
  let prisma: PrismaService;

  beforeAll(async () => {
    ({ app, agent } = await createTestApp());
    prisma = app.get(PrismaService);
    await grantPermissionsToRole(prisma, 'employee', [
      'attendance:read', 'attendance:write', 'leave:read', 'leave:write',
    ]);
  });

  afterAll(async () => {
    await app.close();
  });

  it('logs in with valid credentials', async () => {
    const token = await login(agent, 'admin', 'password');
    expect(token).toBeTruthy();

    const me = await agent
      .get('/api/v1/auth/me')
      .set(authHeader(token))
      .expect(200);
    expect(me.body.username).toBe('admin');
    expect(me.body.permissions).toContain('marketing:read');

    const res = await agent
      .get('/api/v1/health')
      .set(authHeader(token))
      .expect(200);
    expect(res.body.status).toBeDefined();
  });

  it('rejects login for inactive users', async () => {
    const inactive = await createTestEmployee(prisma, {
      username: `inactive_${randomUUID().slice(0, 8)}`,
    });
    await prisma.user.update({
      where: { id: inactive.userId },
      data: { isActive: false },
    });

    await agent
      .post('/api/v1/auth/login')
      .send({ username: inactive.username, password: inactive.password })
      .expect(401);
  });

  it('enforces permission guard on protected routes', async () => {
    const limited = await createTestEmployee(prisma, {
      roleCodes: ['employee'],
      scopeType: 'self',
    });

    const token = await login(agent, limited.username, limited.password);

    await agent
      .post('/api/v1/payroll/cycles')
      .set(authHeader(token))
      .send({
        companyId: limited.companyId,
        periodStart: '2025-12-25',
        periodEnd: '2026-01-23',
        payDate: '2026-01-25',
      })
      .expect(403);
  });
});
