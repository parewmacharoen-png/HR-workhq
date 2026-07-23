// ============================================================================
// test/integration/payroll.integration.spec.ts
// ============================================================================

import { INestApplication } from '@nestjs/common';
import { PrismaService } from '../../src/shared/prisma/prisma.service';
import { authHeader, createTestApp, login, TestAgent } from '../helpers/bootstrap';
import { createTestEmployee } from '../helpers/fixtures';

describe('Payroll (integration)', () => {
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

  it('opens cycle, adds items, locks cycle, generates payslip', async () => {
    const employee = await createTestEmployee(prisma, {
      withSalary: true,
      salaryAmount: 25000,
      salaryEffectiveFrom: new Date('2020-01-01'),
    });

    const month = Math.floor(Math.random() * 12) + 1;
    const periodStart = `2020-${String(month).padStart(2, '0')}-25`;
    const periodEnd = `2020-${String(Math.min(month + 1, 12)).padStart(2, '0')}-23`;
    const payDate = `2020-${String(Math.min(month + 1, 12)).padStart(2, '0')}-25`;

    const opened = await agent
      .post('/api/v1/payroll/cycles')
      .set(authHeader(adminToken))
      .send({
        companyId: employee.companyId,
        periodStart,
        periodEnd,
        payDate,
      })
      .expect(201);
    const cycleId = opened.body.id as string;
    expect(opened.body.status).toBe('open');

    await agent
      .post(`/api/v1/payroll/cycles/${cycleId}/salary`)
      .set(authHeader(adminToken))
      .send({ employeeId: employee.employeeId })
      .expect(201);

    await agent
      .post(`/api/v1/payroll/cycles/${cycleId}/items`)
      .set(authHeader(adminToken))
      .send({
        employeeId: employee.employeeId,
        itemType: 'bonus',
        amount: 1000,
        note: 'integration bonus',
      })
      .expect(201);

    const locked = await agent
      .post(`/api/v1/payroll/cycles/${cycleId}/lock`)
      .set(authHeader(adminToken))
      .expect(201);
    expect(locked.body.status).toBe('locked');

    const payslip = await agent
      .post(`/api/v1/payroll/cycles/${cycleId}/payslips/${employee.employeeId}`)
      .set(authHeader(adminToken))
      .expect(201);

    expect(payslip.body.employeeId).toBe(employee.employeeId);
    expect(payslip.body.net).toBeGreaterThan(0);

    const fetched = await agent
      .get(`/api/v1/payroll/cycles/${cycleId}/payslips/${employee.employeeId}`)
      .set(authHeader(adminToken))
      .expect(200);
    expect(fetched.body.id).toBe(payslip.body.id);
  });
});
