// ============================================================================
// test/integration/deposit-deferral.integration.spec.ts
// POL-004 Phase 4b — PAY-004b deposit deferral
// ============================================================================

import { INestApplication } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../src/shared/prisma/prisma.service';
import { authHeader, createTestApp, login, TestAgent } from '../helpers/bootstrap';
import {
  assignBusinessRole,
  createTestEmployee,
  grantPermissionsToRole,
  openPayrollCycle,
} from '../helpers/fixtures';
import { BUSINESS_ROLE_BUNDLES } from '../../src/modules/permission/domain/entities/business-role-bundles';
import { DEPOSIT_DEFERRAL_WARNING_TH } from '../../src/modules/payroll/domain/services/deposit-deferral.service';

describe('Deposit deferral (POL-004 Phase 4b)', () => {
  let app: INestApplication;
  let agent: TestAgent;
  let prisma: PrismaService;
  let adminToken: string;

  beforeAll(async () => {
    ({ app, agent } = await createTestApp());
    prisma = app.get(PrismaService);
    adminToken = await login(agent, 'admin', 'password');
    const adminUser = await prisma.user.findFirst({ where: { username: 'admin', deletedAt: null } });
    await grantPermissionsToRole(prisma, 'owner', BUSINESS_ROLE_BUNDLES.owner);
    if (adminUser) {
      await assignBusinessRole(prisma, adminUser.id, 'owner', adminUser.id);
    }
  });

  afterAll(async () => {
    await app.close();
  });

  it('defers deposit when net pay would fall below minimum', async () => {
    const emp = await createTestEmployee(prisma, {
      companyCode: 'SB',
      withSalary: true,
      salaryAmount: 8500,
    });

    await agent
      .put('/api/v1/settings/deposit/rules')
      .set(authHeader(adminToken))
      .query({ companyId: emp.companyId })
      .send({
        value: {
          enabled: true,
          monthlyDeductionAmount: 500,
          maximumBalanceAmount: 3000,
          minimumNetPayAfterDeposit: 8500,
          deductionItemType: 'deposit',
          refundOnProperResignation: true,
          allowPartialRefund: true,
          refundRequiresApproval: true,
        },
      })
      .expect(200);

    const cycle = await openPayrollCycle(prisma, emp.companyId);

    const preview = await agent
      .get(`/api/v1/payroll/cycles/${cycle}/build-preview`)
      .set(authHeader(adminToken))
      .expect(200);

    const row = preview.body.employees.find((e: { employeeId: string }) => e.employeeId === emp.employeeId);
    expect(row.deposit).toBe(0);
    expect(row.depositDeferred).toBe(true);
    expect(row.warnings.some((w: string) => w.includes(DEPOSIT_DEFERRAL_WARNING_TH))).toBe(true);
  });

  it('retries deferred deposit in next cycle when net pay is sufficient', async () => {
    const emp = await createTestEmployee(prisma, {
      companyCode: 'SB',
      withSalary: true,
      salaryAmount: 20000,
    });

    await agent
      .put('/api/v1/settings/deposit/rules')
      .set(authHeader(adminToken))
      .query({ companyId: emp.companyId })
      .send({
        value: {
          enabled: true,
          monthlyDeductionAmount: 500,
          maximumBalanceAmount: 3000,
          minimumNetPayAfterDeposit: 8500,
          deductionItemType: 'deposit',
          refundOnProperResignation: true,
          allowPartialRefund: true,
          refundRequiresApproval: true,
        },
      })
      .expect(200);

    const cycle = await openPayrollCycle(prisma, emp.companyId);

    const preview = await agent
      .get(`/api/v1/payroll/cycles/${cycle}/build-preview`)
      .set(authHeader(adminToken))
      .expect(200);

    const row = preview.body.employees.find((e: { employeeId: string }) => e.employeeId === emp.employeeId);
    expect(row.deposit).toBe(500);
    expect(row.depositDeferred).toBe(false);
  });
});
