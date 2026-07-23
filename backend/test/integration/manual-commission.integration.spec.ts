// ============================================================================
// test/integration/manual-commission.integration.spec.ts
// ============================================================================

import { INestApplication } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../src/shared/prisma/prisma.service';
import { authHeader, createTestApp, login, TestAgent } from '../helpers/bootstrap';
import { createTestEmployee } from '../helpers/fixtures';

describe('Manual commission entry (integration)', () => {
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

  it('creates payroll item and appears on payslip', async () => {
    const employee = await createTestEmployee(prisma, {
      withSalary: true,
      salaryAmount: 20000,
      salaryEffectiveFrom: new Date('2020-01-01'),
    });

    const month = Math.floor(Math.random() * 11) + 1;
    const periodStart = `2021-${String(month).padStart(2, '0')}-25`;
    const periodEnd = `2021-${String(month + 1).padStart(2, '0')}-23`;
    const payDate = `2021-${String(month + 1).padStart(2, '0')}-25`;

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

    await agent
      .post('/api/v1/payroll/cycles/' + cycleId + '/salary')
      .set(authHeader(adminToken))
      .send({ employeeId: employee.employeeId })
      .expect(201);

    const created = await agent
      .post('/api/v1/payroll/manual-commissions')
      .set(authHeader(adminToken))
      .send({
        employeeId: employee.employeeId,
        companyId: employee.companyId,
        payrollCycleId: cycleId,
        amount: 3500,
        commissionType: 'marketing_manual',
        description: 'June marketing commission from external sheet',
        reason: 'Approved by finance — calculated in MarketingOS spreadsheet',
        idempotencyKey: `manual-${randomUUID()}`,
      })
      .expect(201);

    expect(created.body.amount).toBe(3500);
    expect(created.body.commissionType).toBe('marketing_manual');
    expect(created.body.payrollItemId).toBeTruthy();

    const payrollItem = await prisma.payrollItem.findFirst({
      where: { id: created.body.payrollItemId as string, deletedAt: null },
    });
    expect(payrollItem?.itemType).toBe('commission');
    expect(payrollItem?.sourceRefType).toBe('manual_commission');
    expect(Number(payrollItem?.amount)).toBe(3500);

    await agent
      .post(`/api/v1/payroll/cycles/${cycleId}/lock`)
      .set(authHeader(adminToken))
      .expect(201);

    const payslip = await agent
      .post(`/api/v1/payroll/cycles/${cycleId}/payslips/${employee.employeeId}`)
      .set(authHeader(adminToken))
      .expect(201);

    expect(payslip.body.breakdown.commission).toBe(3500);
  });

  it('bulk import returns per-row success and failure', async () => {
    const employee = await createTestEmployee(prisma);
    const stranger = await createTestEmployee(prisma, { companyCode: 'MB' });

    const opened = await agent
      .post('/api/v1/payroll/cycles')
      .set(authHeader(adminToken))
      .send({
        companyId: employee.companyId,
        periodStart: '2022-03-25',
        periodEnd: '2022-04-23',
        payDate: '2022-04-25',
      })
      .expect(201);

    const res = await agent
      .post('/api/v1/payroll/manual-commissions/bulk')
      .set(authHeader(adminToken))
      .send({
        payrollCycleId: opened.body.id,
        companyId: employee.companyId,
        rows: [
          {
            employeeId: employee.employeeId,
            amount: 1200,
            commissionType: 'sales_manual',
            reason: 'External sales commission',
          },
          {
            employeeId: stranger.employeeId,
            amount: 500,
            commissionType: 'other_manual',
            reason: 'Wrong company employee',
          },
        ],
      })
      .expect(201);

    expect(res.body.successCount).toBe(1);
    expect(res.body.failureCount).toBe(1);
    expect(res.body.results[0].success).toBe(true);
    expect(res.body.results[1].success).toBe(false);
  });
});
