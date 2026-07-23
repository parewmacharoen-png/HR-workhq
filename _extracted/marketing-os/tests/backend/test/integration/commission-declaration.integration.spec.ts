// ============================================================================
// test/integration/commission-declaration.integration.spec.ts
// ============================================================================

import { randomUUID } from 'crypto';
import { INestApplication } from '@nestjs/common';
import { PrismaService } from '../../src/shared/prisma/prisma.service';
import { CommissionDeclarationService } from '../../src/modules/commission/application/commission-declaration.service';
import { authHeader, createTestApp, login, TestAgent } from '../helpers/bootstrap';
import { createTestEmployee, ensureMarketingTeam } from '../helpers/fixtures';

const DECLARATION_PERMISSIONS = [
  'commission:declaration:review',
  'commission:declaration:approve',
  'commission:declaration:reject',
] as const;

async function ensureDeclarationPermissions(prisma: PrismaService): Promise<void> {
  const role = await prisma.role.findFirst({ where: { code: 'super_admin', deletedAt: null } });
  if (!role) return;

  for (const key of DECLARATION_PERMISSIONS) {
    const permission = await prisma.permission.upsert({
      where: { key },
      update: {},
      create: {
        id: randomUUID(),
        key,
        description: key,
        category: 'commission',
      },
    });
    await prisma.rolePermission.upsert({
      where: { roleId_permissionId: { roleId: role.id, permissionId: permission.id } },
      update: {},
      create: { id: randomUUID(), roleId: role.id, permissionId: permission.id },
    });
  }
}

describe('Commission declarations (integration)', () => {
  let app: INestApplication;
  let agent: TestAgent;
  let prisma: PrismaService;
  let adminToken: string;
  let service: CommissionDeclarationService;

  beforeAll(async () => {
    ({ app, agent } = await createTestApp());
    prisma = app.get(PrismaService);
    service = app.get(CommissionDeclarationService);
    await ensureDeclarationPermissions(prisma);
    adminToken = await login(agent, 'admin', 'password');
  });

  afterAll(async () => {
    await app.close();
  });

  it('creates submitted declaration with assignments', async () => {
    const employee = await createTestEmployee(prisma, { employmentStatus: 'active' });
    const { teamId } = await ensureMarketingTeam(prisma, employee.companyCode, `CD-${randomUUID().slice(0, 6)}`);

    const created = await service.createSubmittedDeclaration(
      employee.userId,
      employee.employeeId,
      employee.companyId,
      [{
        companyId: employee.companyId,
        teamId,
        assignmentType: 'primary',
        commissionMethod: 'big_leader_split',
        bigLeaderPercent: 5,
        employeePercent: 95,
      }],
    );

    expect(created.status).toBe('submitted');
    expect(created.assignments).toHaveLength(1);
    expect(created.assignments[0].commissionMethod).toBe('big_leader_split');
  });

  it('returns back-office summary with warnings', async () => {
    const employee = await createTestEmployee(prisma, { employmentStatus: 'active' });
    const { teamId } = await ensureMarketingTeam(prisma, employee.companyCode, `CD-${randomUUID().slice(0, 6)}`);

    await service.createSubmittedDeclaration(
      employee.userId,
      employee.employeeId,
      employee.companyId,
      [{
        companyId: employee.companyId,
        teamId,
        assignmentType: 'primary',
        commissionMethod: 'unsure',
      }],
    );

    const res = await agent
      .get(`/api/v1/commission/declarations/summary?companyId=${employee.companyId}`)
      .set(authHeader(adminToken))
      .expect(200);

    expect(res.body.groups.length).toBeGreaterThan(0);
    expect(res.body.groups.some((g: { unsure: unknown[] }) => g.unsure.length > 0)).toBe(true);
  });

  it('requires HR review before owner approve', async () => {
    const employee = await createTestEmployee(prisma, { employmentStatus: 'active' });
    const { teamId } = await ensureMarketingTeam(prisma, employee.companyCode, `CD-${randomUUID().slice(0, 6)}`);

    const created = await service.createSubmittedDeclaration(
      employee.userId,
      employee.employeeId,
      employee.companyId,
      [{
        companyId: employee.companyId,
        teamId,
        assignmentType: 'primary',
        commissionMethod: 'team_pool',
      }],
    );

    await agent
      .post(`/api/v1/commission/declarations/${created.id}/approve`)
      .set(authHeader(adminToken))
      .expect(400);

    await agent
      .post(`/api/v1/commission/declarations/${created.id}/hr-review`)
      .set(authHeader(adminToken))
      .expect(201);

    const approved = await agent
      .post(`/api/v1/commission/declarations/${created.id}/approve`)
      .set(authHeader(adminToken))
      .expect(201);

    expect(approved.body.status).toBe('approved');

    const map = await service.getApprovedAssignmentMap(
      employee.companyId,
      teamId,
      [employee.employeeId],
    );
    expect(map.get(employee.employeeId)?.commissionMethod).toBe('team_pool');
  });

  it('rejects with required reason and allows resubmission', async () => {
    const employee = await createTestEmployee(prisma, { employmentStatus: 'active' });
    const { teamId } = await ensureMarketingTeam(prisma, employee.companyCode, `CD-${randomUUID().slice(0, 6)}`);

    const created = await service.createSubmittedDeclaration(
      employee.userId,
      employee.employeeId,
      employee.companyId,
      [{
        companyId: employee.companyId,
        teamId,
        assignmentType: 'primary',
        commissionMethod: 'team_pool',
      }],
    );

    await agent
      .post(`/api/v1/commission/declarations/${created.id}/hr-review`)
      .set(authHeader(adminToken))
      .expect(201);

    await agent
      .post(`/api/v1/commission/declarations/${created.id}/reject`)
      .set(authHeader(adminToken))
      .send({ reason: '   ' })
      .expect(400);

    const rejected = await agent
      .post(`/api/v1/commission/declarations/${created.id}/reject`)
      .set(authHeader(adminToken))
      .send({ reason: 'Incorrect team assignment' })
      .expect(201);

    expect(rejected.body.status).toBe('rejected');
    expect(rejected.body.rejectReason).toBe('Incorrect team assignment');

    const resubmitted = await service.resubmitDeclaration(
      employee.userId,
      employee.employeeId,
      created.id,
      [{
        companyId: employee.companyId,
        teamId,
        assignmentType: 'primary',
        commissionMethod: 'none',
      }],
    );

    expect(resubmitted.status).toBe('submitted');
    expect(resubmitted.rejectReason).toBeNull();

    const audit = await prisma.auditLog.findMany({
      where: { entityType: 'CommissionDeclaration', entityId: created.id },
      orderBy: { occurredAt: 'asc' },
    });
    expect(audit.map((a) => a.action)).toEqual(
      expect.arrayContaining(['submit', 'status_hr_review', 'status_rejected', 'resubmit']),
    );
  });
});
