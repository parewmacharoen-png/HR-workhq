// ============================================================================
// test/integration/admin-commission.integration.spec.ts
// ============================================================================

import { randomUUID } from 'crypto';
import { INestApplication } from '@nestjs/common';
import { PrismaService } from '../../src/shared/prisma/prisma.service';
import { authHeader, createTestApp, login, TestAgent } from '../helpers/bootstrap';
import { createTestEmployee, ensurePayrollCycle } from '../helpers/fixtures';

async function createAdminProfile(
  prisma: PrismaService,
  companyId: string,
  employeeId: string,
  officeType: 'front_office' | 'back_office',
): Promise<void> {
  await prisma.adminCommissionEmployeeProfile.create({
    data: {
      id: randomUUID(),
      companyId,
      employeeId,
      officeType,
      defaultShift: 'day',
      isActive: true,
    },
  });
}

describe('Admin commission (integration)', () => {
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

  it('finalize creates payroll items and duplicate finalize is idempotent', async () => {
    const front = await createTestEmployee(prisma, {
      hireDate: new Date('2020-01-01'),
      employmentStatus: 'active',
    });
    const back = await createTestEmployee(prisma, {
      companyCode: front.companyCode,
      hireDate: new Date('2020-01-01'),
      employmentStatus: 'active',
    });
    const recipient = await createTestEmployee(prisma, {
      companyCode: front.companyCode,
      hireDate: new Date('2020-01-01'),
      employmentStatus: 'active',
    });

    await createAdminProfile(prisma, front.companyId, front.employeeId, 'front_office');
    await createAdminProfile(prisma, front.companyId, back.employeeId, 'back_office');
    await createAdminProfile(prisma, front.companyId, recipient.employeeId, 'front_office');

    const earnCycleId = await ensurePayrollCycle(prisma, {
      companyId: front.companyId,
      periodStart: new Date('2026-07-25'),
      periodEnd: new Date('2026-08-23'),
      payDate: new Date('2026-08-25'),
    });
    const payCycleId = await ensurePayrollCycle(prisma, {
      companyId: front.companyId,
      periodStart: new Date('2026-08-25'),
      periodEnd: new Date('2026-09-23'),
      payDate: new Date('2026-09-25'),
    });

    const calculated = await agent
      .post('/api/v1/commission/admin/calculate')
      .set(authHeader(adminToken))
      .send({
        companyId: front.companyId,
        earnCycleId: earnCycleId,
        netProfit: 500_000,
        extraLeaveOverrides: {
          [front.employeeId]: 2,
        },
      })
      .expect(201);

    const cycleId = calculated.body.cycleId as string;
    expect(calculated.body.adminPool).toBeGreaterThan(0);
    expect(calculated.body.totalPenalties).toBeGreaterThan(0);
    expect(calculated.body.totalRedistributed).toBeGreaterThan(0);

    const finalized = await agent
      .post(`/api/v1/commission/admin/${cycleId}/finalize`)
      .set(authHeader(adminToken))
      .expect(201);

    expect(finalized.body.payrollItemsCreated).toBeGreaterThan(0);

    const payrollItems = await prisma.payrollItem.findMany({
      where: {
        sourceRefType: 'admin_commission',
        payrollCycleId: payCycleId,
        deletedAt: null,
      },
    });
    expect(payrollItems.length).toBeGreaterThanOrEqual(finalized.body.payrollItemsCreated);

    const duplicate = await agent
      .post(`/api/v1/commission/admin/${cycleId}/finalize`)
      .set(authHeader(adminToken))
      .expect(201);

    expect(duplicate.body.payrollItemsCreated).toBe(0);

    const payrollItemsAfter = await prisma.payrollItem.findMany({
      where: {
        sourceRefType: 'admin_commission',
        payrollCycleId: payCycleId,
        deletedAt: null,
      },
    });
    expect(payrollItemsAfter.length).toBe(payrollItems.length);
  });
});
