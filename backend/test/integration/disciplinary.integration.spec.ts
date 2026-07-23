// ============================================================================
// test/integration/disciplinary.integration.spec.ts
// POL-025
// ============================================================================

import { INestApplication } from '@nestjs/common';
import { PrismaService } from '../../src/shared/prisma/prisma.service';
import { authHeader, createTestApp, login, TestAgent } from '../helpers/bootstrap';
import {
  assignBusinessRole,
  createTestEmployee,
  grantPermissionsToRole,
} from '../helpers/fixtures';
import { BUSINESS_ROLE_BUNDLES } from '../../src/modules/permission/domain/entities/business-role-bundles';

describe('Disciplinary actions (POL-025)', () => {
  let app: INestApplication;
  let agent: TestAgent;
  let prisma: PrismaService;
  let adminToken: string;
  let ownerUserId: string;
  let companyId: string;

  beforeAll(async () => {
    ({ app, agent } = await createTestApp());
    prisma = app.get(PrismaService);
    adminToken = await login(agent, 'admin', 'password');
    const adminUser = await prisma.user.findFirst({ where: { username: 'admin', deletedAt: null } });
    ownerUserId = adminUser!.id;
    const company = await prisma.company.findFirst({ where: { deletedAt: null } });
    companyId = company!.id;
    await grantPermissionsToRole(prisma, 'owner', BUSINESS_ROLE_BUNDLES.owner);
    await assignBusinessRole(prisma, ownerUserId, 'owner', ownerUserId);
  });

  afterAll(async () => {
    await app.close();
  });

  it('creates warning ladder actions and acknowledges', async () => {
    const employee = await createTestEmployee(prisma);
    await prisma.employee.update({ where: { id: employee.id }, data: { department: 'hr' } });

    for (const actionType of ['verbal_warning', 'warning_1', 'warning_2'] as const) {
      const res = await agent
        .post(`/api/v1/employees/${employee.id}/disciplinary`)
        .set(authHeader(adminToken))
        .send({ companyId, actionType, reason: `Test ${actionType}` });
      expect(res.status).toBe(201);
      expect(res.body.actionType).toBe(actionType);
    }

    const listRes = await agent
      .get(`/api/v1/employees/${employee.id}/disciplinary`)
      .set(authHeader(adminToken));
    expect(listRes.status).toBe(200);
    expect(listRes.body.items).toHaveLength(3);
    expect(listRes.body.summary.warningsNeverExpire).toBe(true);
    expect(listRes.body.summary.verbalWarningCount).toBe(1);
  });

  it('creates termination with reason fields', async () => {
    const employee = await createTestEmployee(prisma);
    await prisma.employee.update({ where: { id: employee.id }, data: { department: 'finance' } });
    const res = await agent
      .post(`/api/v1/employees/${employee.id}/disciplinary`)
      .set(authHeader(adminToken))
      .send({
        companyId,
        actionType: 'termination',
        reason: 'Theft',
        terminationReason: 'Confirmed theft',
        terminationNote: 'Skip levels',
      });
    expect(res.status).toBe(201);
    expect(res.body.terminationReason).toBe('Confirmed theft');
  });

  it('rejects termination without terminationReason', async () => {
    const employee = await createTestEmployee(prisma);
    await prisma.employee.update({ where: { id: employee.id }, data: { department: 'hr' } });
    const res = await agent
      .post(`/api/v1/employees/${employee.id}/disciplinary`)
      .set(authHeader(adminToken))
      .send({ companyId, actionType: 'termination', reason: 'Theft' });
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it('stores actions without expiry fields', async () => {
    const employee = await createTestEmployee(prisma);
    await prisma.employee.update({ where: { id: employee.id }, data: { department: 'hr' } });
    await agent
      .post(`/api/v1/employees/${employee.id}/disciplinary`)
      .set(authHeader(adminToken))
      .send({ companyId, actionType: 'warning_1', reason: 'Permanent record' });

    const row = await prisma.disciplinaryAction.findFirst({
      where: { employeeId: employee.id, deletedAt: null },
    });
    expect(row).toBeTruthy();
    const keys = Object.keys(row ?? {});
    expect(keys.some((k) => k.toLowerCase().includes('expir'))).toBe(false);
  });
});
