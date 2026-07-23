// ============================================================================
// test/integration/referral-deposit-settings.integration.spec.ts
// ============================================================================

import { INestApplication } from '@nestjs/common';
import { PrismaService } from '../../src/shared/prisma/prisma.service';
import { authHeader, createTestApp, login, TestAgent } from '../helpers/bootstrap';
import { createTestEmployee, openPayrollCycle } from '../helpers/fixtures';
import { DEFAULT_REFERRAL_RULES } from '../../src/modules/settings/domain/referral-settings.types';
import { DEFAULT_DEPOSIT_RULES } from '../../src/modules/settings/domain/deposit-settings.types';

describe('Referral and deposit settings (integration)', () => {
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

  it('seeds system referral.rules and deposit.rules defaults', async () => {
    const referralRes = await agent
      .get('/api/v1/settings/referral')
      .set(authHeader(adminToken))
      .query({ companyId: 'system' })
      .expect(200);
    const referralRules = referralRes.body.find((row: { key: string }) => row.key === 'rules');
    expect(referralRules?.value?.rewardAmount).toBe(DEFAULT_REFERRAL_RULES.rewardAmount);
    expect(referralRules?.value?.requiredEmploymentDays).toBe(90);

    const depositRes = await agent
      .get('/api/v1/settings/deposit')
      .set(authHeader(adminToken))
      .query({ companyId: 'system' })
      .expect(200);
    const depositRules = depositRes.body.find((row: { key: string }) => row.key === 'rules');
    expect(depositRules?.value?.monthlyDeductionAmount).toBe(500);
    expect(depositRules?.value?.maximumBalanceAmount).toBe(3000);
  });

  it('rejects invalid referral.rules payload', async () => {
    const employee = await createTestEmployee(prisma, { companyCode: 'KW' });
    await agent
      .put('/api/v1/settings/referral/rules')
      .set(authHeader(adminToken))
      .query({ companyId: employee.companyId })
      .send({
        value: {
          ...DEFAULT_REFERRAL_RULES,
          rewardAmount: -100,
        },
      })
      .expect(400);
  });

  it('rejects invalid deposit.rules payload', async () => {
    const employee = await createTestEmployee(prisma, { companyCode: 'MB' });
    await agent
      .put('/api/v1/settings/deposit/rules')
      .set(authHeader(adminToken))
      .query({ companyId: employee.companyId })
      .send({
        value: {
          ...DEFAULT_DEPOSIT_RULES,
          enabled: true,
          monthlyDeductionAmount: 800,
          maximumBalanceAmount: 500,
        },
      })
      .expect(400);
  });

  it('company referral reward override flows to payroll item', async () => {
    const referrer = await createTestEmployee(prisma, {
      companyCode: 'HH',
      hireDate: new Date('2024-01-01'),
      employmentStatus: 'active',
      probationEndDate: new Date('2024-04-01'),
    });
    const referred = await createTestEmployee(prisma, {
      companyCode: 'HH',
      hireDate: new Date('2024-01-01'),
      employmentStatus: 'active',
      probationEndDate: new Date('2024-04-01'),
    });

    await agent
      .put('/api/v1/settings/referral/rules')
      .set(authHeader(adminToken))
      .query({ companyId: referrer.companyId })
      .send({
        value: {
          ...DEFAULT_REFERRAL_RULES,
          rewardAmount: 2500,
        },
      })
      .expect(200);

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
    expect(registered.body.rewardAmount).toBe(2500);

    await agent
      .post(`/api/v1/referrals/${registered.body.id}/qualify`)
      .set(authHeader(adminToken))
      .send({ overrideEligibility: true })
      .expect(201);

    const paid = await agent
      .post(`/api/v1/referrals/${registered.body.id}/pay`)
      .set(authHeader(adminToken))
      .expect(201);

    const payrollItem = await prisma.payrollItem.findFirst({
      where: { id: paid.body.payrollItemId, deletedAt: null },
    });
    expect(Number(payrollItem?.amount)).toBe(2500);

    const history = await agent
      .get('/api/v1/settings/history')
      .set(authHeader(adminToken))
      .query({ companyId: referrer.companyId, category: 'referral', key: 'rules' })
      .expect(200);
    expect(history.body.length).toBeGreaterThanOrEqual(1);

    const audits = await agent
      .get('/api/v1/settings/audit')
      .set(authHeader(adminToken))
      .query({ companyId: referrer.companyId, key: 'rules' })
      .expect(200);
    expect(audits.body.length).toBeGreaterThanOrEqual(1);
  });

  it('company deposit override applies cap and deduction amount', async () => {
    const employee = await createTestEmployee(prisma, { companyCode: 'SB' });

    await agent
      .put('/api/v1/settings/deposit/rules')
      .set(authHeader(adminToken))
      .query({ companyId: employee.companyId })
      .send({
        value: {
          ...DEFAULT_DEPOSIT_RULES,
          monthlyDeductionAmount: 400,
          maximumBalanceAmount: 800,
        },
      })
      .expect(200);

    const cycleId = await openPayrollCycle(prisma, employee.companyId);

    await agent
      .post(`/api/v1/payroll/cycles/${cycleId}/deposit`)
      .set(authHeader(adminToken))
      .send({
        employeeId: employee.employeeId,
        companyId: employee.companyId,
      })
      .expect(201);

    await agent
      .post(`/api/v1/payroll/cycles/${cycleId}/deposit`)
      .set(authHeader(adminToken))
      .send({
        employeeId: employee.employeeId,
        companyId: employee.companyId,
      })
      .expect(201);

    await agent
      .post(`/api/v1/payroll/cycles/${cycleId}/deposit`)
      .set(authHeader(adminToken))
      .send({
        employeeId: employee.employeeId,
        companyId: employee.companyId,
      })
      .expect(422);

    const items = await prisma.payrollItem.findMany({
      where: {
        payrollCycleId: cycleId,
        employeeId: employee.employeeId,
        itemType: 'deposit',
        deletedAt: null,
      },
    });
    expect(items).toHaveLength(2);
    expect(items.every((item) => Number(item.amount) === -400)).toBe(true);
  });
});
