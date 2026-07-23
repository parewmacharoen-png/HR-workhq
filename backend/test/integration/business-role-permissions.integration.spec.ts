// ============================================================================
// test/integration/business-role-permissions.integration.spec.ts
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

describe('Business role permissions (integration)', () => {
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

  it('lists business role templates', async () => {
    const res = await agent
      .get('/api/v1/permissions/business-roles')
      .set(authHeader(adminToken))
      .expect(200);
    expect(res.body.length).toBeGreaterThanOrEqual(7);
    expect(res.body.some((r: { code: string }) => r.code === 'owner')).toBe(true);
  });

  it('assigns business role, scopes, override, and records audit', async () => {
    const user = await createTestEmployee(prisma, {
      username: `perm_${randomUUID().slice(0, 8)}`,
      businessRole: 'admin',
      scopeType: 'company',
    });

    await agent
      .put(`/api/v1/permissions/users/${user.userId}/business-role`)
      .set(authHeader(adminToken))
      .send({ role: 'admin_manager', reason: 'promotion test' })
      .expect(200);

    await agent
      .put(`/api/v1/permissions/users/${user.userId}/scopes`)
      .set(authHeader(adminToken))
      .send({
        scopes: [{ scopeType: 'company', companyId: user.companyId }],
      })
      .expect(200);

    const override = await agent
      .post(`/api/v1/permissions/users/${user.userId}/overrides`)
      .set(authHeader(adminToken))
      .send({ permission: 'salary:read', effect: 'allow', reason: 'payroll duty' })
      .expect(201);

    const access = await agent
      .get(`/api/v1/permissions/users/${user.userId}/access`)
      .set(authHeader(adminToken))
      .expect(200);

    expect(access.body.businessRole).toBe('admin_manager');
    expect(access.body.effectivePermissions).toContain('salary:read');
    expect(access.body.overrides.length).toBeGreaterThan(0);

    await agent
      .delete(`/api/v1/permissions/users/${user.userId}/overrides/${override.body.id}`)
      .set(authHeader(adminToken))
      .expect(200);

    const audit = await agent
      .get(`/api/v1/permissions/users/${user.userId}/audit`)
      .set(authHeader(adminToken))
      .expect(200);

    expect(audit.body.some((row: { action: string }) => row.action === 'assign_business_role')).toBe(true);
    expect(audit.body.some((row: { action: string }) => row.action === 'add_override')).toBe(true);
  });

  it('denies payslip access for admin without salary override', async () => {
    const target = await createTestEmployee(prisma, {
      withSalary: true,
      username: `target_${randomUUID().slice(0, 8)}`,
    });
    const admin = await createTestEmployee(prisma, {
      username: `adminview_${randomUUID().slice(0, 8)}`,
      businessRole: 'admin',
      scopeType: 'company',
      companyCode: target.companyCode,
    });
    await grantPermissionsToRole(prisma, 'admin', ['payroll:read', 'payroll:write']);

    const month = Math.floor(Math.random() * 12) + 1;
    const periodStart = `2019-${String(month).padStart(2, '0')}-25`;
    const periodEnd = `2019-${String(Math.min(month + 1, 12)).padStart(2, '0')}-23`;
    const payDate = `2019-${String(Math.min(month + 1, 12)).padStart(2, '0')}-25`;

    const opened = await agent
      .post('/api/v1/payroll/cycles')
      .set(authHeader(adminToken))
      .send({
        companyId: target.companyId,
        periodStart,
        periodEnd,
        payDate,
      })
      .expect(201);
    const cycleId = opened.body.id as string;

    await agent
      .post(`/api/v1/payroll/cycles/${cycleId}/salary`)
      .set(authHeader(adminToken))
      .send({ employeeId: target.employeeId })
      .expect(201);

    await agent
      .post(`/api/v1/payroll/cycles/${cycleId}/lock`)
      .set(authHeader(adminToken))
      .expect(201);

    await agent
      .post(`/api/v1/payroll/cycles/${cycleId}/payslips/${target.employeeId}`)
      .set(authHeader(adminToken))
      .expect(201);

    const adminUserToken = await login(agent, admin.username, admin.password);
    await agent
      .get(`/api/v1/payroll/cycles/${cycleId}/payslips/${target.employeeId}`)
      .set(authHeader(adminUserToken))
      .expect(403);

    await agent
      .get(`/api/v1/employees/${target.employeeId}/salary-history`)
      .query({ companyId: target.companyId })
      .set(authHeader(adminUserToken))
      .expect(403);
  });

  it('previews salary visibility for big leader in scope', async () => {
    const viewer = await createTestEmployee(prisma, {
      businessRole: 'big_leader',
      scopeType: 'company',
      username: `bl_${randomUUID().slice(0, 8)}`,
    });
    const target = await createTestEmployee(prisma, {
      companyCode: viewer.companyCode,
      username: `emp_${randomUUID().slice(0, 8)}`,
    });

    const preview = await agent
      .get('/api/v1/permissions/salary-visibility/preview')
      .query({ viewerUserId: viewer.userId, targetEmployeeId: target.employeeId })
      .set(authHeader(adminToken))
      .expect(200);

    expect(preview.body.canView).toBe(true);
  });

  it('returns effective access for current user', async () => {
    const res = await agent
      .get('/api/v1/permissions/me/effective')
      .set(authHeader(adminToken))
      .expect(200);
    expect(res.body.businessRole).toBeTruthy();
    expect(res.body.effectivePermissions.length).toBeGreaterThan(0);
  });
});
