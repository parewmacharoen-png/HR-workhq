// ============================================================================
// test/integration/final-settlement-pay005c.integration.spec.ts
// PAY-005c — final settlement workflow + employee self-service
// ============================================================================

import { INestApplication } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../src/shared/prisma/prisma.service';
import { authHeader, createTestApp, login, TestAgent } from '../helpers/bootstrap';
import {
  assignBusinessRole,
  createTestEmployee,
  grantPermissionsToRole,
} from '../helpers/fixtures';
import { BUSINESS_ROLE_BUNDLES } from '../../src/modules/permission/domain/entities/business-role-bundles';

describe('Final settlement PAY-005c workflow', () => {
  let app: INestApplication;
  let agent: TestAgent;
  let prisma: PrismaService;
  let ownerToken: string;

  beforeAll(async () => {
    ({ app, agent } = await createTestApp());
    prisma = app.get(PrismaService);
    ownerToken = await login(agent, 'admin', 'password');
    const ownerUser = await prisma.user.findFirst({ where: { username: 'admin', deletedAt: null } });
    await grantPermissionsToRole(prisma, 'owner', BUSINESS_ROLE_BUNDLES.owner);
    await grantPermissionsToRole(prisma, 'secretary', BUSINESS_ROLE_BUNDLES.secretary);
    await grantPermissionsToRole(prisma, 'employee', BUSINESS_ROLE_BUNDLES.employee);
    await assignBusinessRole(prisma, ownerUser!.id, 'owner', ownerUser!.id);
  });

  afterAll(async () => {
    await app.close();
  });

  async function advanceExitCase(employeeId: string, companyId: string) {
    const createRes = await agent
      .post(`/api/v1/employees/${employeeId}/exit`)
      .set(authHeader(ownerToken))
      .send({
        companyId,
        exitReason: 'proper_resignation',
        effectiveTerminationDate: '2026-06-30',
      })
      .expect(201);

    const exitCaseId = createRes.body.id as string;

    const secretary = await createTestEmployee(prisma, {
      businessRole: 'secretary',
      scopeType: 'all',
      username: `sec_${randomUUID().slice(0, 8)}`,
    });
    const secToken = await login(agent, secretary.username, secretary.password);

    await agent.post(`/api/v1/exit-cases/${exitCaseId}/leader-review`).set(authHeader(secToken)).send({}).expect(201);
    await agent.post(`/api/v1/exit-cases/${exitCaseId}/owner-review`).set(authHeader(ownerToken)).send({}).expect(201);

    return { exitCaseId, secToken };
  }

  it('runs draft → submit → approve → paid, completes checklist, employee self-service', async () => {
    const emp = await createTestEmployee(prisma, {
      companyCode: 'SB',
      businessRole: 'employee',
      scopeType: 'self',
      username: `emp_${randomUUID().slice(0, 8)}`,
      withSalary: true,
      salaryAmount: 20000,
    });
    const empToken = await login(agent, emp.username, emp.password);

    const { exitCaseId, secToken } = await advanceExitCase(emp.employeeId, emp.companyId);

    const draftRes = await agent
      .post(`/api/v1/exit-cases/${exitCaseId}/final-settlement/draft`)
      .set(authHeader(secToken))
      .expect(201);
    const settlementId = draftRes.body.id as string;
    expect(draftRes.body.status).toBe('draft');
    expect(draftRes.body.depositSettlementStatus).toBeDefined();

    await agent
      .get(`/api/v1/exit-cases/${exitCaseId}/final-settlement`)
      .set(authHeader(empToken))
      .expect(403);

    await agent
      .post(`/api/v1/final-settlements/${settlementId}/recalculate`)
      .set(authHeader(secToken))
      .expect(201);

    await agent
      .post(`/api/v1/final-settlements/${settlementId}/submit`)
      .set(authHeader(secToken))
      .expect(201);

    await agent
      .post(`/api/v1/final-settlements/${settlementId}/approve`)
      .set(authHeader(ownerToken))
      .expect(201);

    const paidRes = await agent
      .post(`/api/v1/final-settlements/${settlementId}/mark-paid`)
      .set(authHeader(secToken))
      .expect(201);
    expect(paidRes.body.status).toBe('paid');
    expect(paidRes.body.paidAt).toBeTruthy();

    const checklist = await prisma.exitChecklistItem.findFirst({
      where: { exitCaseId, itemKey: 'payroll_settlement_completed' },
    });
    expect(checklist?.completed).toBe(true);

    const summary = await agent
      .get(`/api/v1/employees/${emp.employeeId}/final-settlement/paid-summary`)
      .set(authHeader(empToken))
      .expect(200);
    expect(summary.body.netPaidAmount).toBe(paidRes.body.netPayableAmount);
    expect(summary.body.paidAt).toBeTruthy();
    expect(summary.body.notes).toBeUndefined();
  });
});
