// ============================================================================
// test/integration/leave-emergency-entitlement.integration.spec.ts
// ============================================================================

import { INestApplication } from '@nestjs/common';
import { PrismaService } from '../../src/shared/prisma/prisma.service';
import { authHeader, createTestApp, login, TestAgent } from '../helpers/bootstrap';
import {
  createTestEmployee,
  ensureLeaveTypes,
  ensureWorkflowDefinitions,
} from '../helpers/fixtures';

describe('Emergency leave entitlement (integration)', () => {
  let app: INestApplication;
  let agent: TestAgent;
  let prisma: PrismaService;
  let adminToken: string;

  beforeAll(async () => {
    ({ app, agent } = await createTestApp());
    prisma = app.get(PrismaService);
    await ensureWorkflowDefinitions(prisma);
    await ensureLeaveTypes(prisma);
    adminToken = await login(agent, 'admin', 'password');
  });

  afterAll(async () => {
    await app.close();
  });

  it('allows active employees to request emergency leave within half-year entitlement', async () => {
    const employee = await createTestEmployee(prisma, {
      employmentStatus: 'active',
      probationEndDate: new Date('2020-01-01'),
      hireDate: new Date('2020-01-01'),
    });

    const created = await agent
      .post(`/api/v1/leave/employees/${employee.employeeId}/requests`)
      .set(authHeader(adminToken))
      .send({
        companyId: employee.companyId,
        leaveTypeCode: 'emergency',
        startDate: '2026-03-10',
        endDate: '2026-03-10',
        days: 1,
        reason: 'Family emergency',
      })
      .expect(201);

    expect(created.body.status).toBe('pending');

    const balance = await prisma.leaveBalance.findFirst({
      where: {
        employeeId: employee.employeeId,
        deletedAt: null,
        leaveType: { code: 'emergency' },
      },
      include: { leaveType: true },
    });
    expect(balance).toBeTruthy();
    expect(Number(balance?.entitled)).toBe(4);
    expect(Number(balance?.remaining)).toBe(4);
  });

  it('rejects emergency leave for employees still on probation', async () => {
    const employee = await createTestEmployee(prisma, {
      employmentStatus: 'probation',
      probationEndDate: new Date('2026-12-01'),
    });

    await agent
      .post(`/api/v1/leave/employees/${employee.employeeId}/requests`)
      .set(authHeader(adminToken))
      .send({
        companyId: employee.companyId,
        leaveTypeCode: 'emergency',
        startDate: '2026-03-10',
        endDate: '2026-03-10',
        days: 1,
        reason: 'Family emergency',
      })
      .expect(400);
  });

  it('rejects emergency leave above half-year balance', async () => {
    const employee = await createTestEmployee(prisma, {
      employmentStatus: 'active',
      probationEndDate: new Date('2020-01-01'),
      hireDate: new Date('2020-01-01'),
    });

    await agent
      .post(`/api/v1/leave/employees/${employee.employeeId}/requests`)
      .set(authHeader(adminToken))
      .send({
        companyId: employee.companyId,
        leaveTypeCode: 'emergency',
        startDate: '2026-03-10',
        endDate: '2026-03-14',
        days: 5,
        reason: 'Extended emergency',
      })
      .expect(400);
  });
});
