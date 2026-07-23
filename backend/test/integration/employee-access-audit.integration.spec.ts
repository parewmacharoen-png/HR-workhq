// ============================================================================
// test/integration/employee-access-audit.integration.spec.ts
// SEC-001 — role-based access enforcement on employee endpoints.
// ============================================================================

import { INestApplication } from '@nestjs/common';
import { authHeader, createTestApp, login, TestAgent } from '../helpers/bootstrap';
import { createTestEmployee, grantPermissionsToRole } from '../helpers/fixtures';
import { PrismaService } from '../../src/shared/prisma/prisma.service';

const ACCESS_ROLE = 'employee_access_audit';

const ACCESS_PERMISSIONS = [
  'employee:read',
  'leave:read',
  'attendance:read',
  'payroll:read',
  'performance:read',
];

async function createRoleUser(
  prisma: PrismaService,
  label: string,
  businessRole: 'employee' | 'sub_leader' | 'big_leader' | 'secretary' | 'owner',
  scopeType: 'self' | 'company' | 'all',
  companyCode = 'SB',
) {
  return createTestEmployee(prisma, {
    companyCode,
    username: `${label}_${Date.now().toString(36)}`,
    businessRole,
    scopeType,
    roleCodes: [ACCESS_ROLE],
  });
}

describe('Employee access audit SEC-001 (integration)', () => {
  let app: INestApplication;
  let agent: TestAgent;
  let prisma: PrismaService;

  let sbTarget: Awaited<ReturnType<typeof createTestEmployee>>;
  let mbTarget: Awaited<ReturnType<typeof createTestEmployee>>;

  let employeeUser: Awaited<ReturnType<typeof createRoleUser>>;
  let subLeaderUser: Awaited<ReturnType<typeof createRoleUser>>;
  let bigLeaderUser: Awaited<ReturnType<typeof createRoleUser>>;
  let secretaryUser: Awaited<ReturnType<typeof createRoleUser>>;
  let ownerUser: Awaited<ReturnType<typeof createRoleUser>>;

  beforeAll(async () => {
    ({ app, agent } = await createTestApp());
    prisma = app.get(PrismaService);
    await grantPermissionsToRole(prisma, ACCESS_ROLE, ACCESS_PERMISSIONS);

    sbTarget = await createTestEmployee(prisma, { companyCode: 'SB', username: `sb_target_${Date.now()}` });
    mbTarget = await createTestEmployee(prisma, { companyCode: 'MB', username: `mb_target_${Date.now()}` });

    employeeUser = await createRoleUser(prisma, 'emp', 'employee', 'self', 'SB');
    subLeaderUser = await createRoleUser(prisma, 'sub', 'sub_leader', 'company', 'SB');
    bigLeaderUser = await createRoleUser(prisma, 'big', 'big_leader', 'company', 'SB');
    secretaryUser = await createRoleUser(prisma, 'sec', 'secretary', 'all', 'SB');
    ownerUser = await createRoleUser(prisma, 'own', 'owner', 'all', 'SB');

    employeeUser.token = await login(agent, employeeUser.username, employeeUser.password);
    subLeaderUser.token = await login(agent, subLeaderUser.username, subLeaderUser.password);
    bigLeaderUser.token = await login(agent, bigLeaderUser.username, bigLeaderUser.password);
    secretaryUser.token = await login(agent, secretaryUser.username, secretaryUser.password);
    ownerUser.token = await login(agent, ownerUser.username, ownerUser.password);
  });

  afterAll(async () => {
    await app.close();
  });

  it('employee (self scope) can read own profile but not other company employee', async () => {
    await agent
      .get(`/api/v1/employees/${employeeUser.employeeId}`)
      .set(authHeader(employeeUser.token))
      .expect(200);

    const cross = await agent
      .get(`/api/v1/employees/${mbTarget.employeeId}`)
      .set(authHeader(employeeUser.token));
    expect([403, 404]).toContain(cross.status);
  });

  it('sub leader (company scope) can read same-company employee', async () => {
    await agent
      .get(`/api/v1/employees/${sbTarget.employeeId}`)
      .set(authHeader(subLeaderUser.token))
      .expect(200);
  });

  it('sub leader cannot read other-company employee', async () => {
    const res = await agent
      .get(`/api/v1/employees/${mbTarget.employeeId}`)
      .set(authHeader(subLeaderUser.token));
    expect([403, 404]).toContain(res.status);
  });

  it('big leader (company scope) can read same-company employee', async () => {
    await agent
      .get(`/api/v1/employees/${sbTarget.employeeId}`)
      .set(authHeader(bigLeaderUser.token))
      .expect(200);
  });

  it('secretary (all scope) can read cross-company employee', async () => {
    await agent
      .get(`/api/v1/employees/${mbTarget.employeeId}`)
      .set(authHeader(secretaryUser.token))
      .expect(200);
  });

  it('owner (all scope) can read cross-company employee', async () => {
    await agent
      .get(`/api/v1/employees/${mbTarget.employeeId}`)
      .set(authHeader(ownerUser.token))
      .expect(200);
  });

  it('performance probation list enforces employee scope', async () => {
    const denied = await agent
      .get(`/api/v1/performance/employees/${mbTarget.employeeId}/probation`)
      .set(authHeader(subLeaderUser.token));
    expect([403, 404]).toContain(denied.status);

    await agent
      .get(`/api/v1/performance/employees/${sbTarget.employeeId}/probation`)
      .set(authHeader(subLeaderUser.token))
      .expect(200);
  });

  it('rehire enforces prior employee company scope', async () => {
    await prisma.employee.update({
      where: { id: mbTarget.employeeId },
      data: { employmentStatus: 'terminated', terminationDate: new Date() },
    });

    const denied = await agent
      .post('/api/v1/employees/rehire')
      .set(authHeader(subLeaderUser.token))
      .send({
        previousEmployeeId: mbTarget.employeeId,
        hireDate: '2026-07-01',
      });
    expect([403, 404]).toContain(denied.status);
  });

  it('disciplinary list enforces employee-in-company scope', async () => {
    const denied = await agent
      .get(`/api/v1/disciplinary/employees/${mbTarget.employeeId}`)
      .set(authHeader(subLeaderUser.token));
    expect([403, 404]).toContain(denied.status);
  });
});
