// ============================================================================
// test/integration/employee-exit-deposit.integration.spec.ts
// POL-004 Phase 4a
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

describe('Employee exit + deposit (POL-004 Phase 4a)', () => {
  let app: INestApplication;
  let agent: TestAgent;
  let prisma: PrismaService;
  let adminToken: string;
  let ownerUserId: string;

  beforeAll(async () => {
    ({ app, agent } = await createTestApp());
    prisma = app.get(PrismaService);
    adminToken = await login(agent, 'admin', 'password');
    const adminUser = await prisma.user.findFirst({ where: { username: 'admin', deletedAt: null } });
    ownerUserId = adminUser!.id;
    await grantPermissionsToRole(prisma, 'owner', BUSINESS_ROLE_BUNDLES.owner);
    await assignBusinessRole(prisma, ownerUserId, 'owner', ownerUserId);
  });

  afterAll(async () => {
    await app.close();
  });

  async function seedDeposits(
    employeeId: string,
    entries: Array<{ companyCode: string; amount: number }>,
  ): Promise<void> {
    let running = 0;
    for (const entry of entries) {
      const company = await prisma.company.findFirst({
        where: { code: entry.companyCode, deletedAt: null },
      });
      if (!company) throw new Error(`Company ${entry.companyCode} not found`);
      running += entry.amount;
      await prisma.deposit.create({
        data: {
          id: randomUUID(),
          employeeId,
          owningCompanyId: company.id,
          amount: entry.amount,
          runningTotal: running,
        },
      });
    }
  }

  async function runExitWorkflow(input: {
    employeeId: string;
    companyId: string;
    exitReason: string;
    department?: string;
    claims?: Array<{ amount: number }>;
    completeChecklist?: boolean;
    leaderRole: 'big_leader' | 'secretary';
  }) {
    if (input.department) {
      await prisma.employee.update({
        where: { id: input.employeeId },
        data: { department: input.department },
      });
    }

    const createRes = await agent
      .post(`/api/v1/employees/${input.employeeId}/exit`)
      .set(authHeader(adminToken))
      .send({
        companyId: input.companyId,
        exitReason: input.exitReason,
        effectiveTerminationDate: '2026-06-30',
      })
      .expect(201);

    const exitCaseId = createRes.body.id;

    const leader = await createTestEmployee(prisma, {
      companyCode: 'SB',
      businessRole: input.leaderRole,
      scopeType: 'all',
      username: `leader_${randomUUID().slice(0, 8)}`,
    });
    const leaderToken = await login(agent, leader.username, leader.password);

    await agent
      .post(`/api/v1/exit-cases/${exitCaseId}/leader-review`)
      .set(authHeader(leaderToken))
      .send({ notes: 'ตรวจสอบแล้ว' })
      .expect(201);

    await agent
      .post(`/api/v1/exit-cases/${exitCaseId}/owner-review`)
      .set(authHeader(adminToken))
      .send({ notes: 'อนุมัติ' })
      .expect(201);

    if (input.claims?.length) {
      for (const claim of input.claims) {
        await prisma.depositLossClaim.create({
          data: {
            id: randomUUID(),
            exitCaseId,
            employeeId: input.employeeId,
            companyId: input.companyId,
            amount: claim.amount,
            category: 'other',
            description: 'test claim',
            status: 'approved',
            authorizedBy: ownerUserId,
          },
        });
      }
    }

    if (input.completeChecklist) {
      await agent
        .patch(`/api/v1/exit-cases/${exitCaseId}/checklist`)
        .set(authHeader(adminToken))
        .send({
          assetsReturned: true,
          debtsCleared: true,
          finalPayrollBuilt: true,
          accessRevoked: true,
        })
        .expect(200);
    }

    const preview = await agent
      .post(`/api/v1/exit-cases/${exitCaseId}/settlement/preview`)
      .set(authHeader(adminToken))
      .expect(201);

    return { exitCaseId, preview: preview.body };
  }

  it('proper resignation refund preview minus approved claims', async () => {
    const emp = await createTestEmployee(prisma, { companyCode: 'SB', department: 'HR' });
    await seedDeposits(emp.employeeId, [{ companyCode: 'SB', amount: 3000 }]);

    const { preview } = await runExitWorkflow({
      employeeId: emp.employeeId,
      companyId: emp.companyId,
      exitReason: 'proper_resignation',
      claims: [{ amount: 500 }],
      completeChecklist: true,
      leaderRole: 'secretary',
    });

    expect(preview.depositBalance).toBe(3000);
    expect(preview.refundAmount).toBe(2500);
    expect(preview.forfeitAmount).toBe(500);
    expect(preview.outcome).toBe('partial_refund');
  });

  it('performance failure refund preview — full balance', async () => {
    const emp = await createTestEmployee(prisma, { companyCode: 'SB', department: 'HR' });
    await seedDeposits(emp.employeeId, [{ companyCode: 'SB', amount: 3000 }]);

    const { preview } = await runExitWorkflow({
      employeeId: emp.employeeId,
      companyId: emp.companyId,
      exitReason: 'performance_failure',
      leaderRole: 'secretary',
    });

    expect(preview.refundAmount).toBe(3000);
    expect(preview.forfeitAmount).toBe(0);
    expect(preview.outcome).toBe('full_refund');
  });

  it('absconding zero refund', async () => {
    const emp = await createTestEmployee(prisma, { companyCode: 'SB', department: 'HR' });
    await seedDeposits(emp.employeeId, [{ companyCode: 'SB', amount: 2500 }]);

    const { preview } = await runExitWorkflow({
      employeeId: emp.employeeId,
      companyId: emp.companyId,
      exitReason: 'absconding',
      leaderRole: 'secretary',
    });

    expect(preview.refundAmount).toBe(0);
    expect(preview.forfeitAmount).toBe(2500);
    expect(preview.legalReviewRequired).toBe(false);
  });

  it('gross misconduct zero refund with LEGAL_REVIEW_REQUIRED', async () => {
    const emp = await createTestEmployee(prisma, { companyCode: 'SB', department: 'HR' });
    await seedDeposits(emp.employeeId, [{ companyCode: 'SB', amount: 3000 }]);

    const { preview } = await runExitWorkflow({
      employeeId: emp.employeeId,
      companyId: emp.companyId,
      exitReason: 'gross_misconduct',
      leaderRole: 'secretary',
    });

    expect(preview.refundAmount).toBe(0);
    expect(preview.forfeitAmount).toBe(3000);
    expect(preview.legalReviewRequired).toBe(true);
    expect(preview.policyRules).toContain('DISC-002d');
  });

  it('tracks multi-company deposit collector breakdown', async () => {
    const emp = await createTestEmployee(prisma, { companyCode: 'SB', department: 'HR' });
    await seedDeposits(emp.employeeId, [
      { companyCode: 'SB', amount: 2000 },
      { companyCode: 'KW', amount: 1000 },
    ]);

    const balance = await agent
      .get(`/api/v1/employees/${emp.employeeId}/deposit/balance`)
      .set(authHeader(adminToken))
      .expect(200);

    expect(balance.body.balance).toBe(3000);
    expect(balance.body.collectorBreakdown).toHaveLength(2);
    const sb = balance.body.collectorBreakdown.find((c: { companyCode: string }) => c.companyCode === 'SB');
    const kw = balance.body.collectorBreakdown.find((c: { companyCode: string }) => c.companyCode === 'KW');
    expect(sb.collectedAmount).toBe(2000);
    expect(kw.collectedAmount).toBe(1000);
  });

  it('rehire starts new deposit cycle — prior deposits excluded', async () => {
    const prev = await createTestEmployee(prisma, { companyCode: 'SB' });
    await seedDeposits(prev.employeeId, [{ companyCode: 'SB', amount: 3000 }]);
    await prisma.employee.update({
      where: { id: prev.employeeId },
      data: { employmentStatus: 'terminated' },
    });

    const rehireRes = await agent
      .post('/api/v1/employees/rehire')
      .set(authHeader(adminToken))
      .send({
        previousEmployeeId: prev.employeeId,
        hireDate: '2026-03-01',
      })
      .expect(201);

    const newEmployeeId = rehireRes.body.id;
    await seedDeposits(newEmployeeId, [{ companyCode: 'SB', amount: 500 }]);

    const balance = await agent
      .get(`/api/v1/employees/${newEmployeeId}/deposit/balance`)
      .set(authHeader(adminToken))
      .expect(200);

    expect(balance.body.balance).toBe(500);

    const prevBalance = await agent
      .get(`/api/v1/employees/${prev.employeeId}/deposit/balance`)
      .set(authHeader(adminToken))
      .expect(200);
    expect(prevBalance.body.balance).toBe(3000);
  });

  it('unauthorized role cannot approve leader review', async () => {
    const emp = await createTestEmployee(prisma, { companyCode: 'SB', department: 'Marketing' });
    const createRes = await agent
      .post(`/api/v1/employees/${emp.employeeId}/exit`)
      .set(authHeader(adminToken))
      .send({
        companyId: emp.companyId,
        exitReason: 'proper_resignation',
        effectiveTerminationDate: '2026-06-30',
      })
      .expect(201);

    const wrongLeader = await createTestEmployee(prisma, {
      businessRole: 'secretary',
      scopeType: 'all',
      username: `sec_${randomUUID().slice(0, 8)}`,
    });
    const wrongToken = await login(agent, wrongLeader.username, wrongLeader.password);

    await agent
      .post(`/api/v1/exit-cases/${createRes.body.id}/leader-review`)
      .set(authHeader(wrongToken))
      .send({ notes: 'ไม่ควรผ่าน' })
      .expect(403);
  });

  it('close exit case updates employee status to terminated', async () => {
    const emp = await createTestEmployee(prisma, { companyCode: 'SB', department: 'HR' });
    await seedDeposits(emp.employeeId, [{ companyCode: 'SB', amount: 1000 }]);

    const { exitCaseId } = await runExitWorkflow({
      employeeId: emp.employeeId,
      companyId: emp.companyId,
      exitReason: 'performance_failure',
      leaderRole: 'secretary',
    });

    await agent
      .post(`/api/v1/exit-cases/${exitCaseId}/settle`)
      .set(authHeader(adminToken))
      .expect(201);

    await agent
      .post(`/api/v1/exit-cases/${exitCaseId}/close`)
      .set(authHeader(adminToken))
      .send({})
      .expect(201);

    const employee = await prisma.employee.findFirst({ where: { id: emp.employeeId } });
    expect(employee?.employmentStatus).toBe('terminated');

    const exitCase = await prisma.employeeExitCase.findFirst({ where: { id: exitCaseId } });
    expect(exitCase?.status).toBe('closed');
  });
});
