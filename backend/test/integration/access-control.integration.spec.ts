// ============================================================================
// test/integration/access-control.integration.spec.ts — HR-13 validation rules
// ============================================================================

import { INestApplication } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../src/shared/prisma/prisma.service';
import { authHeader, createTestApp, login, TestAgent } from '../helpers/bootstrap';
import { createTestEmployee } from '../helpers/fixtures';

describe('Access control (HR-13 integration)', () => {
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

  it('lists role templates with business language', async () => {
    const res = await agent
      .get('/api/v1/access-control/role-templates')
      .set(authHeader(adminToken))
      .expect(200);

    expect(res.body.some((r: { name: string }) => r.name === 'Secretary (HR / Payroll)')).toBe(true);
    expect(res.body.find((r: { code: string }) => r.code === 'big_leader').requiresCompanyScope).toBe(true);
    expect(res.body.find((r: { code: string }) => r.code === 'sub_leader').requiresTeamScope).toBe(true);
  });

  it('assigns big leader with company scope and returns readable preview', async () => {
    const user = await createTestEmployee(prisma, {
      username: `bl_${randomUUID().slice(0, 8)}`,
      businessRole: 'employee',
    });

    const res = await agent
      .patch(`/api/v1/access-control/users/${user.userId}/business-role`)
      .set(authHeader(adminToken))
      .send({
        role: 'big_leader',
        companyScopeIds: [user.companyId],
        teamScopeIds: [],
      })
      .expect(200);

    expect(res.body.businessRole).toBe('big_leader');
    expect(res.body.preview.can.some((line: string) => line.includes('scoped companies'))).toBe(true);
  });

  it('rejects big leader without company scope', async () => {
    const user = await createTestEmployee(prisma, {
      username: `blbad_${randomUUID().slice(0, 8)}`,
    });

    await agent
      .patch(`/api/v1/access-control/users/${user.userId}/business-role`)
      .set(authHeader(adminToken))
      .send({ role: 'big_leader', companyScopeIds: [], teamScopeIds: [] })
      .expect(422);
  });

  it('rejects scope on owner role', async () => {
    const user = await createTestEmployee(prisma, {
      username: `ownscope_${randomUUID().slice(0, 8)}`,
    });

    await agent
      .patch(`/api/v1/access-control/users/${user.userId}/business-role`)
      .set(authHeader(adminToken))
      .send({
        role: 'owner',
        companyScopeIds: [user.companyId],
        teamScopeIds: [],
      })
      .expect(422);
  });

  it('blocks salary override for employee (HARD_SELF_ONLY)', async () => {
    const user = await createTestEmployee(prisma, {
      username: `empov_${randomUUID().slice(0, 8)}`,
      businessRole: 'employee',
    });

    await agent
      .post(`/api/v1/access-control/users/${user.userId}/overrides`)
      .set(authHeader(adminToken))
      .send({ permission: 'salary:read', effect: 'allow' })
      .expect(422);
  });

  it('allows owner to add salary override for admin', async () => {
    const user = await createTestEmployee(prisma, {
      username: `admov_${randomUUID().slice(0, 8)}`,
      businessRole: 'admin',
    });

    const created = await agent
      .post(`/api/v1/access-control/users/${user.userId}/overrides`)
      .set(authHeader(adminToken))
      .send({ permission: 'salary:read', effect: 'allow', reason: 'payroll backup' })
      .expect(201);

    await agent
      .delete(`/api/v1/access-control/users/${user.userId}/overrides/${created.body.id}`)
      .set(authHeader(adminToken))
      .expect(204);
  });

  it('resolves effective access by employee id', async () => {
    const user = await createTestEmployee(prisma, {
      username: `empacc_${randomUUID().slice(0, 8)}`,
      businessRole: 'employee',
    });

    const res = await agent
      .get(`/api/v1/access-control/employees/${user.employeeId}/effective-access`)
      .set(authHeader(adminToken))
      .expect(200);

    expect(res.body.userId).toBe(user.userId);
    expect(res.body.preview.can).toContain('View own profile');
  });
});
