// ============================================================================
// test/integration/employee-onboard.integration.spec.ts
// ============================================================================

import { INestApplication } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../src/shared/prisma/prisma.service';
import { authHeader, createTestApp, login, TestAgent } from '../helpers/bootstrap';
import { createTestEmployee } from '../helpers/fixtures';

describe('Employee onboard (HR-13.5 integration)', () => {
  let app: INestApplication;
  let agent: TestAgent;
  let prisma: PrismaService;
  let adminToken: string;
  let companyId: string;

  beforeAll(async () => {
    ({ app, agent } = await createTestApp());
    prisma = app.get(PrismaService);
    adminToken = await login(agent, 'admin', 'password');
    const companies = await agent
      .get('/api/v1/organization/companies')
      .set(authHeader(adminToken))
      .expect(200);
    companyId = companies.body[0].id;
  });

  afterAll(async () => {
    await app.close();
  });

  it('onboards employee without linked user', async () => {
    const suffix = randomUUID().slice(0, 8);
    const res = await agent
      .post('/api/v1/employees/onboard')
      .set(authHeader(adminToken))
      .send({
        firstName: 'Plain',
        lastName: `Hire${suffix}`,
        companyId,
        startDate: '2026-02-01',
        monthlySalary: 15000,
        createLogin: false,
      })
      .expect(201);

    expect(res.body.globalId).toMatch(/^EMP/);
    expect(res.body.userId).toBeNull();
  });

  it('onboards employee with linked user', async () => {
    const suffix = randomUUID().slice(0, 8);
    const res = await agent
      .post('/api/v1/employees/onboard')
      .set(authHeader(adminToken))
      .send({
        firstName: 'New',
        lastName: `Hire${suffix}`,
        companyId,
        department: 'HR',
        position: 'Officer',
        employmentType: 'probation',
        startDate: '2026-01-01',
        monthlySalary: 20000,
        createLogin: true,
        username: `hire_${suffix}`,
        password: 'testpass123',
        businessRole: 'employee',
      })
      .expect(201);

    expect(res.body.globalId).toMatch(/^EMP/);
    expect(res.body.userId).toBeTruthy();
    expect(res.body.username).toBe(`hire_${suffix}`);

    const list = await agent
      .get('/api/v1/employees')
      .query({ companyId })
      .set(authHeader(adminToken))
      .expect(200);

    expect(list.body.items.some((row: { id: string }) => row.id === res.body.id)).toBe(true);
  });

  it('forbids onboard for non-owner/non-secretary roles', async () => {
    const user = await createTestEmployee(prisma, {
      username: `emp_${randomUUID().slice(0, 8)}`,
      businessRole: 'employee',
    });
    const token = await login(agent, user.username, user.password);

    await agent
      .post('/api/v1/employees/onboard')
      .set(authHeader(token))
      .send({
        firstName: 'Blocked',
        lastName: 'User',
        companyId: user.companyId,
        startDate: '2026-01-01',
      })
      .expect(403);
  });
});
