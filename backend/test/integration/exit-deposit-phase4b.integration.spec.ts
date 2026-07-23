// ============================================================================
// test/integration/exit-deposit-phase4b.integration.spec.ts
// POL-004 Phase 4b — claims, asset gate, settlement
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

describe('Exit deposit Phase 4b (claims + asset gate)', () => {
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

  async function seedDeposits(employeeId: string, companyId: string, amount: number) {
    await prisma.deposit.create({
      data: {
        id: randomUUID(),
        employeeId,
        owningCompanyId: companyId,
        amount,
        runningTotal: amount,
      },
    });
  }

  async function advanceToSettlement(employeeId: string, companyId: string) {
    const createRes = await agent
      .post(`/api/v1/employees/${employeeId}/exit`)
      .set(authHeader(adminToken))
      .send({
        companyId,
        exitReason: 'proper_resignation',
        effectiveTerminationDate: '2026-06-30',
      })
      .expect(201);

    const exitCaseId = createRes.body.id;

    const secretary = await createTestEmployee(prisma, {
      businessRole: 'secretary',
      scopeType: 'all',
      username: `sec_${randomUUID().slice(0, 8)}`,
    });
    const secToken = await login(agent, secretary.username, secretary.password);

    await agent.post(`/api/v1/exit-cases/${exitCaseId}/leader-review`).set(authHeader(secToken)).send({}).expect(201);
    await agent.post(`/api/v1/exit-cases/${exitCaseId}/owner-review`).set(authHeader(adminToken)).send({}).expect(201);

    return exitCaseId;
  }

  it('claim CRUD and owner approval required for settlement', async () => {
    const emp = await createTestEmployee(prisma, { companyCode: 'SB', department: 'HR' });
    await seedDeposits(emp.employeeId, emp.companyId, 3000);
    const exitCaseId = await advanceToSettlement(emp.employeeId, emp.companyId);

    const createClaim = await agent
      .post(`/api/v1/exit-cases/${exitCaseId}/loss-claims`)
      .set(authHeader(adminToken))
      .send({
        category: 'property_damage',
        amount: 500,
        description: 'เสียหายอุปกรณ์',
      })
      .expect(201);
    expect(createClaim.body.status).toBe('pending');

    let preview = await agent
      .post(`/api/v1/exit-cases/${exitCaseId}/settlement/preview`)
      .set(authHeader(adminToken))
      .expect(201);
    expect(preview.body.refundAmount).toBe(3000);

    await agent
      .post(`/api/v1/exit-cases/${exitCaseId}/loss-claims/${createClaim.body.id}/approve`)
      .set(authHeader(adminToken))
      .expect(201);

    preview = await agent
      .post(`/api/v1/exit-cases/${exitCaseId}/settlement/preview`)
      .set(authHeader(adminToken))
      .expect(201);
    expect(preview.body.refundAmount).toBe(2500);
    expect(preview.body.approvedClaimsTotal).toBe(500);
  });

  it('excess claim flagged as owner case-by-case', async () => {
    const emp = await createTestEmployee(prisma, { companyCode: 'SB', department: 'HR' });
    await seedDeposits(emp.employeeId, emp.companyId, 2000);
    const exitCaseId = await advanceToSettlement(emp.employeeId, emp.companyId);

    const claim = await agent
      .post(`/api/v1/exit-cases/${exitCaseId}/loss-claims`)
      .set(authHeader(adminToken))
      .send({ category: 'cash_shortage', amount: 3500, description: 'เกินยอดประกัน' })
      .expect(201);

    await agent
      .post(`/api/v1/exit-cases/${exitCaseId}/loss-claims/${claim.body.id}/approve`)
      .set(authHeader(adminToken))
      .expect(201);

    const preview = await agent
      .post(`/api/v1/exit-cases/${exitCaseId}/settlement/preview`)
      .set(authHeader(adminToken))
      .expect(201);

    expect(preview.body.ownerCaseByCase).toBe(true);
    expect(preview.body.claimShortfallWarning).toBe(1500);
    expect(preview.body.refundAmount).toBe(0);
  });

  it('unresolved asset blocks settlement', async () => {
    const emp = await createTestEmployee(prisma, { companyCode: 'SB', department: 'HR' });
    await seedDeposits(emp.employeeId, emp.companyId, 1000);

    const asset = await prisma.asset.create({
      data: {
        id: randomUUID(),
        companyId: emp.companyId,
        assetTag: `NB-${randomUUID().slice(0, 6)}`,
        name: 'Notebook Test',
        status: 'assigned',
      },
    });
    const assignment = await prisma.assetAssignment.create({
      data: {
        id: randomUUID(),
        assetId: asset.id,
        employeeId: emp.employeeId,
      },
    });

    const exitCaseId = await advanceToSettlement(emp.employeeId, emp.companyId);

    const preview = await agent
      .post(`/api/v1/exit-cases/${exitCaseId}/settlement/preview`)
      .set(authHeader(adminToken))
      .expect(201);
    expect(preview.body.assetsBlockingSettlement).toBe(true);
    expect(preview.body.unresolvedAssetCount).toBeGreaterThan(0);

    await agent
      .patch(`/api/v1/exit-cases/${exitCaseId}/assets/${assignment.id}`)
      .set(authHeader(adminToken))
      .send({ status: 'returned' })
      .expect(200);

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

    await agent
      .post(`/api/v1/exit-cases/${exitCaseId}/settle`)
      .set(authHeader(adminToken))
      .expect(201);
  });

  it('absconding zero refund preserved', async () => {
    const emp = await createTestEmployee(prisma, { companyCode: 'SB', department: 'HR' });
    await seedDeposits(emp.employeeId, emp.companyId, 3000);

    const createRes = await agent
      .post(`/api/v1/employees/${emp.employeeId}/exit`)
      .set(authHeader(adminToken))
      .send({
        companyId: emp.companyId,
        exitReason: 'absconding',
        effectiveTerminationDate: '2026-06-30',
      })
      .expect(201);

    const secretary = await createTestEmployee(prisma, {
      businessRole: 'secretary',
      scopeType: 'all',
      username: `sec2_${randomUUID().slice(0, 8)}`,
    });
    const secToken = await login(agent, secretary.username, secretary.password);
    const exitCaseId = createRes.body.id;

    await agent.post(`/api/v1/exit-cases/${exitCaseId}/leader-review`).set(authHeader(secToken)).send({}).expect(201);
    await agent.post(`/api/v1/exit-cases/${exitCaseId}/owner-review`).set(authHeader(adminToken)).send({}).expect(201);

    const preview = await agent
      .post(`/api/v1/exit-cases/${exitCaseId}/settlement/preview`)
      .set(authHeader(adminToken))
      .expect(201);

    expect(preview.body.refundAmount).toBe(0);
    expect(preview.body.forfeitAmount).toBe(3000);
  });
});
