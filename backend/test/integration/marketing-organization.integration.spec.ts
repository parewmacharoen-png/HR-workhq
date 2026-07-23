// ============================================================================
// test/integration/marketing-organization.integration.spec.ts
// ============================================================================

import { randomUUID } from 'crypto';
import { INestApplication } from '@nestjs/common';
import { PrismaService } from '../../src/shared/prisma/prisma.service';
import { authHeader, createTestApp, login, TestAgent } from '../helpers/bootstrap';
import { enableMarketingForIntegrationTests } from '../helpers/marketing-test';
import {
  createMarketingTeamStructure,
  createTestEmployee,
  ensurePayrollCycle,
  grantPermissionsToRole,
} from '../helpers/fixtures';

describe('Marketing organization (integration)', () => {
  let app: INestApplication;
  let agent: TestAgent;
  let prisma: PrismaService;
  let adminToken: string;

  beforeAll(async () => {
    enableMarketingForIntegrationTests();
    ({ app, agent } = await createTestApp());
    prisma = app.get(PrismaService);
    await grantPermissionsToRole(prisma, 'employee', [
      'marketing:read',
      'marketing:write',
      'marketing:approve',
    ]);
    await grantPermissionsToRole(prisma, 'sub_leader', ['marketing:read']);
    adminToken = await login(agent, 'admin', 'password');
  });

  afterAll(async () => {
    await app.close();
  });

  it('creates team tree, assigns members, and transfers mid-cycle', async () => {
    const bigLeader = await createTestEmployee(prisma, { employmentStatus: 'active' });
    const subLeader = await createTestEmployee(prisma, {
      companyCode: bigLeader.companyCode,
      employmentStatus: 'active',
    });
    const member = await createTestEmployee(prisma, {
      companyCode: bigLeader.companyCode,
      employmentStatus: 'active',
    });

    const root = await agent
      .post('/api/v1/marketing/teams')
      .set(authHeader(adminToken))
      .send({
        companyId: bigLeader.companyId,
        code: 'SB',
        name: 'SB Root',
        level: 'root',
      })
      .expect(201);

    const subTeam = await agent
      .post('/api/v1/marketing/teams')
      .set(authHeader(adminToken))
      .send({
        companyId: bigLeader.companyId,
        code: 'SB1',
        name: 'SB1',
        level: 'sub_team',
        parentTeamId: root.body.id,
      })
      .expect(201);

    await agent
      .post(`/api/v1/marketing/teams/${root.body.id}/big-leader`)
      .set(authHeader(adminToken))
      .send({ employeeId: bigLeader.employeeId })
      .expect(201);

    await agent
      .post(`/api/v1/marketing/teams/${subTeam.body.id}/sub-leader`)
      .set(authHeader(adminToken))
      .send({ employeeId: subLeader.employeeId })
      .expect(201);

    await agent
      .post(`/api/v1/marketing/teams/${subTeam.body.id}/members`)
      .set(authHeader(adminToken))
      .send({ employeeId: member.employeeId })
      .expect(201);

    const sb2 = await agent
      .post('/api/v1/marketing/teams')
      .set(authHeader(adminToken))
      .send({
        companyId: bigLeader.companyId,
        code: 'SB2',
        name: 'SB2',
        level: 'sub_team',
        parentTeamId: root.body.id,
      })
      .expect(201);

    await agent
      .post(`/api/v1/marketing/teams/${subTeam.body.id}/members/${member.employeeId}/transfer`)
      .set(authHeader(adminToken))
      .send({ targetTeamId: sb2.body.id, effectiveFrom: '2026-06-15' })
      .expect(201);

    const history = await agent
      .get(`/api/v1/marketing/teams/employees/${member.employeeId}/history?companyId=${bigLeader.companyId}`)
      .set(authHeader(adminToken))
      .expect(200);

    expect(history.body.length).toBeGreaterThanOrEqual(2);

    const tree = await agent
      .get(`/api/v1/marketing/teams/tree?companyId=${bigLeader.companyId}`)
      .set(authHeader(adminToken))
      .expect(200);

    expect(tree.body[0].children.length).toBeGreaterThanOrEqual(2);
  });

  it('KPI rollup uses correct team by transfer date', async () => {
    const bigLeader = await createTestEmployee(prisma, { employmentStatus: 'active' });
    const employee = await createTestEmployee(prisma, {
      companyCode: bigLeader.companyCode,
      employmentStatus: 'active',
    });

    const { subTeamId: teamA } = await createMarketingTeamStructure(prisma, bigLeader.companyId, {
      subCode: `A-${randomUUID().slice(0, 4)}`,
      bigLeaderEmployeeId: bigLeader.employeeId,
      memberEmployeeIds: [employee.employeeId],
    });

    const teamB = await prisma.marketingTeam.create({
      data: {
        id: randomUUID(),
        companyId: bigLeader.companyId,
        code: `B-${randomUUID().slice(0, 4)}`,
        name: 'Team B',
        level: 'sub_team',
        parentTeamId: (await prisma.marketingTeam.findFirst({
          where: { companyId: bigLeader.companyId, level: 'root' },
        }))!.id,
        isActive: true,
      },
    });

    await prisma.marketingTeamMember.updateMany({
      where: { employeeId: employee.employeeId, teamId: teamA, effectiveTo: null },
      data: { effectiveTo: new Date('2026-06-14') },
    });
    await prisma.marketingTeamMember.create({
      data: {
        id: randomUUID(),
        companyId: bigLeader.companyId,
        teamId: teamB.id,
        employeeId: employee.employeeId,
        role: 'member',
        effectiveFrom: new Date('2026-06-15'),
        isPrimary: true,
      },
    });

    const earnCycleId = await ensurePayrollCycle(prisma, {
      companyId: bigLeader.companyId,
      periodStart: new Date('2026-06-01'),
      periodEnd: new Date('2026-06-30'),
      payDate: new Date('2026-07-05'),
    });

    await prisma.marketingDailyReport.create({
      data: {
        id: randomUUID(),
        companyId: bigLeader.companyId,
        employeeId: employee.employeeId,
        reportDate: new Date('2026-06-10'),
        contactedCount: 1,
        newMemberCount: 1,
        depositAmount: 100,
        startedWorkCount: 5,
        status: 'approved',
      },
    });
    await prisma.marketingDailyReport.create({
      data: {
        id: randomUUID(),
        companyId: bigLeader.companyId,
        employeeId: employee.employeeId,
        reportDate: new Date('2026-06-20'),
        contactedCount: 1,
        newMemberCount: 1,
        depositAmount: 100,
        startedWorkCount: 10,
        status: 'approved',
      },
    });

    const teamAKpi = await agent
      .get(`/api/v1/marketing/kpi/team?companyId=${bigLeader.companyId}&teamId=${teamA}&earnCycleId=${earnCycleId}`)
      .set(authHeader(adminToken))
      .expect(200);

    const memberA = teamAKpi.body.members.find((m: { employeeId: string }) => m.employeeId === employee.employeeId);
    expect(memberA.startedWorkCount).toBe(5);

    const teamBKpi = await agent
      .get(`/api/v1/marketing/kpi/team?companyId=${bigLeader.companyId}&teamId=${teamB.id}&earnCycleId=${earnCycleId}`)
      .set(authHeader(adminToken))
      .expect(200);

    const memberB = teamBKpi.body.members.find((m: { employeeId: string }) => m.employeeId === employee.employeeId);
    expect(memberB.startedWorkCount).toBe(10);
  });

  it('leader cannot view another team KPI', async () => {
    const bigLeader = await createTestEmployee(prisma, {
      employmentStatus: 'active',
      roleCodes: ['sub_leader'],
    });
    const otherLeader = await createTestEmployee(prisma, {
      companyCode: bigLeader.companyCode,
      employmentStatus: 'active',
      roleCodes: ['sub_leader'],
    });

    const structureA = await createMarketingTeamStructure(prisma, bigLeader.companyId, {
      subCode: `L1-${randomUUID().slice(0, 4)}`,
      subLeaderEmployeeId: bigLeader.employeeId,
    });
    const structureB = await createMarketingTeamStructure(prisma, bigLeader.companyId, {
      subCode: `L2-${randomUUID().slice(0, 4)}`,
      subLeaderEmployeeId: otherLeader.employeeId,
    });

    const leaderToken = await login(agent, bigLeader.username, bigLeader.password);

    await agent
      .get(`/api/v1/marketing/kpi/team?companyId=${bigLeader.companyId}&teamId=${structureA.subTeamId}`)
      .set(authHeader(leaderToken))
      .expect(200);

    await agent
      .get(`/api/v1/marketing/kpi/team?companyId=${bigLeader.companyId}&teamId=${structureB.subTeamId}`)
      .set(authHeader(leaderToken))
      .expect(403);
  });
});
