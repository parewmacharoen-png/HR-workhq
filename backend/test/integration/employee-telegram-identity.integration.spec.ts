// ============================================================================
// test/integration/employee-telegram-identity.integration.spec.ts
// ============================================================================

import { INestApplication } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../src/shared/prisma/prisma.service';
import { authHeader, createTestApp, login, TestAgent } from '../helpers/bootstrap';
import { createTestEmployee } from '../helpers/fixtures';

describe('Employee telegram identity API (integration)', () => {
  let app: INestApplication;
  let agent: TestAgent;
  let prisma: PrismaService;
  let adminToken: string;

  beforeAll(async () => {
    ({ app, agent } = await createTestApp());
    prisma = app.get(PrismaService);
    adminToken = await login(agent, 'admin', 'password');
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns JSON null when telegram is not linked', async () => {
    const user = await createTestEmployee(prisma, {
      username: `tg_${randomUUID().slice(0, 8)}`,
    });

    const res = await agent
      .get(`/api/v1/employees/${user.employeeId}/telegram-identity`)
      .set(authHeader(adminToken))
      .expect(200);

    expect(res.text).toBe('null');
    expect(res.body).toBeNull();
  });
});
