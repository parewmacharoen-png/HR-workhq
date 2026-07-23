// ============================================================================
// test/integration/leave-workflow.integration.spec.ts
// ============================================================================

import { INestApplication } from '@nestjs/common';
import { PrismaService } from '../../src/shared/prisma/prisma.service';
import { authHeader, createTestApp, login, TestAgent } from '../helpers/bootstrap';
import { drainOutbox } from '../helpers/outbox';
import {
  createTestEmployee,
  ensureLeaveBalance,
  ensureLeaveTypes,
  ensureWorkflowDefinitions,
  leavePeriodStart,
} from '../helpers/fixtures';

describe('Leave workflow (integration)', () => {
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

  it('creates leave request, approves workflow, updates leave status', async () => {
    const employee = await createTestEmployee(prisma);
    const { annualId } = await ensureLeaveTypes(prisma);
    const periodStart = leavePeriodStart(new Date('2026-06-01'));
    await ensureLeaveBalance(prisma, employee.employeeId, annualId, periodStart, 10);

    const created = await agent
      .post(`/api/v1/leave/employees/${employee.employeeId}/requests`)
      .set(authHeader(adminToken))
      .send({
        companyId: employee.companyId,
        leaveTypeCode: 'annual',
        startDate: '2026-06-10',
        endDate: '2026-06-11',
        days: 1,
        reason: 'Integration test leave',
      })
      .expect(201);

    expect(created.body.status).toBe('pending');
    expect(created.body.workflowInstanceId).toBeTruthy();

    const acted = await agent
      .post(`/api/v1/workflow/instances/${created.body.workflowInstanceId}/actions`)
      .set(authHeader(adminToken))
      .send({ action: 'approve' })
      .expect(201);
    expect(acted.body.status).toBe('approved');

    await drainOutbox(app);

    const leave = await agent
      .get(`/api/v1/leave/requests/${created.body.id}`)
      .set(authHeader(adminToken))
      .expect(200);
    expect(leave.body.status).toBe('approved');

    const balance = await prisma.leaveBalance.findFirst({
      where: {
        employeeId: employee.employeeId,
        leaveTypeId: annualId,
        periodStart,
        deletedAt: null,
      },
    });
    expect(Number(balance?.used)).toBeGreaterThanOrEqual(1);
  });
});
