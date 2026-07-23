// ============================================================================
// test/integration/hierarchy.integration.spec.ts
// HR-14 Organization Hierarchy & Reporting Lines
// ============================================================================

import { INestApplication } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../src/shared/prisma/prisma.service';
import { authHeader, createTestApp, login, TestAgent } from '../helpers/bootstrap';
import { createTestEmployee } from '../helpers/fixtures';

describe('Employee hierarchy (HR-14 integration)', () => {
  let app: INestApplication;
  let agent: TestAgent;
  let prisma: PrismaService;
  let adminToken: string;
  let companyId: string;
  let companyIdB: string;

  beforeAll(async () => {
    ({ app, agent } = await createTestApp());
    prisma = app.get(PrismaService);
    adminToken = await login(agent, 'admin', 'password');
    const companies = await agent
      .get('/api/v1/organization/companies')
      .set(authHeader(adminToken))
      .expect(200);
    companyId = companies.body[0].id;
    companyIdB = companies.body[1]?.id ?? companies.body[0].id;
  });

  afterAll(async () => {
    await app.close();
  });

  function setReportingLine(
    employeeId: string,
    managerEmployeeId: string | null,
    targetCompanyId?: string,
    token = adminToken,
  ) {
    return agent
      .patch(`/api/v1/employees/${employeeId}/reporting-line`)
      .query({ companyId: targetCompanyId ?? companyId })
      .set(authHeader(token))
      .send({ managerEmployeeId });
  }

  it('blocks self reporting', async () => {
    const emp = await createTestEmployee(prisma, { companyCode: 'SB' });
    const res = await setReportingLine(emp.employeeId, emp.employeeId, emp.companyId).expect(422);
    expect(res.body.code).toBe('SELF_REPORTING_NOT_ALLOWED');
  });

  it('blocks circular hierarchy', async () => {
    const a = await createTestEmployee(prisma, { companyCode: 'SB' });
    const b = await createTestEmployee(prisma, { companyCode: 'SB' });
    const c = await createTestEmployee(prisma, { companyCode: 'SB' });

    await setReportingLine(b.employeeId, a.employeeId, a.companyId).expect(200);
    await setReportingLine(c.employeeId, b.employeeId, a.companyId).expect(200);

    const res = await setReportingLine(a.employeeId, c.employeeId, a.companyId).expect(422);
    expect(res.body.code).toBe('CIRCULAR_HIERARCHY_NOT_ALLOWED');
  });

  it('blocks owner from having a manager', async () => {
    const manager = await createTestEmployee(prisma, { companyCode: 'SB', businessRole: 'big_leader' });
    const adminUser = await prisma.user.findFirst({
      where: { username: 'admin', deletedAt: null },
      select: { employeeId: true },
    });
    expect(adminUser?.employeeId).toBeTruthy();

    const res = await setReportingLine(adminUser!.employeeId!, manager.employeeId, manager.companyId).expect(422);
    expect(res.body.code).toBe('OWNER_CANNOT_HAVE_MANAGER');
  });

  it('blocks cross-company reporting without shared company', async () => {
    const sb = await createTestEmployee(prisma, { companyCode: 'SB' });
    const mb = await createTestEmployee(prisma, { companyCode: 'MB' });

    const res = await agent
      .patch(`/api/v1/employees/${sb.employeeId}/reporting-line`)
      .query({ companyId })
      .set(authHeader(adminToken))
      .send({ managerEmployeeId: mb.employeeId })
      .expect(422);

    expect(res.body.code).toBe('COMPANY_SCOPE_CONSISTENCY');
  });

  it('returns reporting path top-down', async () => {
    const leader = await createTestEmployee(prisma, {
      companyCode: 'SB',
      businessRole: 'big_leader',
      assignmentRoleLevel: 'big_leader',
    });
    const sub = await createTestEmployee(prisma, {
      companyCode: 'SB',
      businessRole: 'sub_leader',
      assignmentRoleLevel: 'sub_leader',
    });
    const emp = await createTestEmployee(prisma, { companyCode: 'SB' });

    await setReportingLine(sub.employeeId, leader.employeeId, leader.companyId).expect(200);
    await setReportingLine(emp.employeeId, sub.employeeId, leader.companyId).expect(200);

    const res = await agent
      .get(`/api/v1/employees/${emp.employeeId}/reporting-path`)
      .set(authHeader(adminToken))
      .expect(200);

    expect(res.body.path.length).toBe(3);
    expect(res.body.path[0].employeeId).toBe(leader.employeeId);
    expect(res.body.path[2].employeeId).toBe(emp.employeeId);
  });

  it('returns direct reports', async () => {
    const manager = await createTestEmployee(prisma, { companyCode: 'SB', businessRole: 'sub_leader' });
    const report = await createTestEmployee(prisma, { companyCode: 'SB' });
    await setReportingLine(report.employeeId, manager.employeeId, manager.companyId).expect(200);

    const res = await agent
      .get(`/api/v1/employees/${manager.employeeId}/direct-reports`)
      .set(authHeader(adminToken))
      .expect(200);

    expect(res.body.total).toBe(1);
    expect(res.body.items[0].employeeId).toBe(report.employeeId);
  });

  it('builds organization tree for company', async () => {
    const root = await createTestEmployee(prisma, {
      companyCode: 'KW',
      username: `root_${randomUUID().slice(0, 8)}`,
      businessRole: 'big_leader',
    });
    const child = await createTestEmployee(prisma, { companyCode: 'KW' });
    await agent
      .patch(`/api/v1/employees/${child.employeeId}/reporting-line`)
      .query({ companyId: root.companyId })
      .set(authHeader(adminToken))
      .send({ managerEmployeeId: root.employeeId })
      .expect(200);

    const res = await agent
      .get('/api/v1/organization/tree')
      .query({ companyId: root.companyId })
      .set(authHeader(adminToken))
      .expect(200);

    expect(Array.isArray(res.body.nodes)).toBe(true);
    const rootNode = res.body.nodes.find((n: { employeeId: string }) => n.employeeId === root.employeeId);
    expect(rootNode).toBeTruthy();
    expect(rootNode.children.some((c: { employeeId: string }) => c.employeeId === child.employeeId)).toBe(true);
  });

  it('returns hierarchy summary for dashboard prep', async () => {
    const manager = await createTestEmployee(prisma, { companyCode: 'VB', businessRole: 'sub_leader' });
    const report = await createTestEmployee(prisma, { companyCode: 'VB' });
    await agent
      .patch(`/api/v1/employees/${report.employeeId}/reporting-line`)
      .query({ companyId: manager.companyId })
      .set(authHeader(adminToken))
      .send({ managerEmployeeId: manager.employeeId })
      .expect(200);

    const res = await agent
      .get(`/api/v1/employees/${manager.employeeId}/hierarchy-summary`)
      .query({ companyId: manager.companyId })
      .set(authHeader(adminToken))
      .expect(200);

    expect(res.body.directReportCount).toBe(1);
    expect(typeof res.body.teamSize).toBe('number');
    expect(typeof res.body.pendingLeaveCount).toBe('number');
  });
});
