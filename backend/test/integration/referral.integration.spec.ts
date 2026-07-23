// ============================================================================
// test/integration/referral.integration.spec.ts
// ============================================================================

import { INestApplication } from '@nestjs/common';
import { PrismaService } from '../../src/shared/prisma/prisma.service';
import { authHeader, createTestApp, login, TestAgent } from '../helpers/bootstrap';
import { createTestEmployee, openPayrollCycle } from '../helpers/fixtures';

describe('Referral (integration)', () => {
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

  it('registers, qualifies, detects duplicates, and pays payroll reward', async () => {
    const referrer = await createTestEmployee(prisma, {
      hireDate: new Date('2024-01-01'),
      employmentStatus: 'active',
      probationEndDate: new Date('2024-04-01'),
    });
    const referred = await createTestEmployee(prisma, {
      companyCode: referrer.companyCode,
      phone: '0899990001',
      hireDate: new Date('2024-01-01'),
      employmentStatus: 'active',
      probationEndDate: new Date('2024-04-01'),
    });
    await createTestEmployee(prisma, {
      companyCode: referrer.companyCode,
      phone: '0899990001',
    });

    await openPayrollCycle(prisma, referrer.companyId);

    const registered = await agent
      .post('/api/v1/referrals')
      .set(authHeader(adminToken))
      .send({
        referrerEmployeeId: referrer.employeeId,
        referredEmployeeId: referred.employeeId,
        companyId: referrer.companyId,
      })
      .expect(201);
    expect(registered.body.status).toBe('pending');

    await agent
      .post(`/api/v1/referrals/${registered.body.id}/qualify`)
      .set(authHeader(adminToken))
      .send({})
      .expect(409);

    const dupChecks = await agent
      .get(`/api/v1/referrals/${registered.body.id}/duplicate-checks`)
      .set(authHeader(adminToken))
      .expect(200);
    const phoneMatch = (dupChecks.body as Array<{ signal: string; matchFound: boolean }>)
      .find((c) => c.signal === 'phone');
    expect(phoneMatch?.matchFound).toBe(true);

    const qualified = await agent
      .post(`/api/v1/referrals/${registered.body.id}/qualify`)
      .set(authHeader(adminToken))
      .send({ overrideDuplicateBlock: true, overrideEligibility: true })
      .expect(201);
    expect(qualified.body.status).toBe('qualified');

    const paid = await agent
      .post(`/api/v1/referrals/${registered.body.id}/pay`)
      .set(authHeader(adminToken))
      .expect(201);
    expect(paid.body.status).toBe('paid');
    expect(paid.body.payrollItemId).toBeTruthy();

    const payrollItem = await prisma.payrollItem.findFirst({
      where: { id: paid.body.payrollItemId, deletedAt: null },
    });
    expect(payrollItem?.itemType).toBe('referral');
    expect(Number(payrollItem?.amount)).toBeGreaterThan(0);
  });

  it('rejects duplicate referral registration for same referred employee', async () => {
    const referrer = await createTestEmployee(prisma, { companyCode: 'VB' });
    const referred = await createTestEmployee(prisma, { companyCode: 'VB' });

    await agent
      .post('/api/v1/referrals')
      .set(authHeader(adminToken))
      .send({
        referrerEmployeeId: referrer.employeeId,
        referredEmployeeId: referred.employeeId,
        companyId: referrer.companyId,
      })
      .expect(201);

    await agent
      .post('/api/v1/referrals')
      .set(authHeader(adminToken))
      .send({
        referrerEmployeeId: referrer.employeeId,
        referredEmployeeId: referred.employeeId,
        companyId: referrer.companyId,
      })
      .expect(409);
  });
});
