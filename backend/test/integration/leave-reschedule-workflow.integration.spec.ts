// ============================================================================
// test/integration/leave-reschedule-workflow.integration.spec.ts
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

describe('Leave reschedule workflow (integration)', () => {
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

  it('approves reschedule, moves leave dates forward, increments rescheduleCount', async () => {
    const employee = await createTestEmployee(prisma);
    const { annualId } = await ensureLeaveTypes(prisma);
    const periodStart = leavePeriodStart(new Date('2026-07-01'));
    await ensureLeaveBalance(prisma, employee.employeeId, annualId, periodStart, 10);

    const created = await agent
      .post(`/api/v1/leave/employees/${employee.employeeId}/requests`)
      .set(authHeader(adminToken))
      .send({
        companyId: employee.companyId,
        leaveTypeCode: 'annual',
        startDate: '2026-07-10',
        endDate: '2026-07-11',
        days: 2,
        reason: 'Original leave',
      })
      .expect(201);

    await agent
      .post(`/api/v1/workflow/instances/${created.body.workflowInstanceId}/actions`)
      .set(authHeader(adminToken))
      .send({ action: 'approve' })
      .expect(201);

    await drainOutbox(app);

    const reschedule = await agent
      .post(`/api/v1/leave/employees/${employee.employeeId}/reschedule-requests`)
      .set(authHeader(adminToken))
      .send({
        companyId: employee.companyId,
        leaveRequestId: created.body.id,
        newStartDate: '2026-07-17',
        reason: 'Project moved deadline',
      })
      .expect(201);

    expect(reschedule.body.status).toBe('pending');
    expect(reschedule.body.newStartDate).toBe('2026-07-17');
    expect(reschedule.body.newEndDate).toBe('2026-07-18');

    await agent
      .post(`/api/v1/workflow/instances/${reschedule.body.workflowInstanceId}/actions`)
      .set(authHeader(adminToken))
      .send({ action: 'approve' })
      .expect(201);

    await drainOutbox(app);

    const leave = await prisma.leaveRequest.findFirst({ where: { id: created.body.id } });
    expect(leave?.startDate.toISOString().slice(0, 10)).toBe('2026-07-17');
    expect(leave?.endDate.toISOString().slice(0, 10)).toBe('2026-07-18');
    expect(leave?.rescheduleCount).toBe(1);

    const rescheduleRow = await prisma.leaveRescheduleRequest.findFirst({
      where: { id: reschedule.body.id },
    });
    expect(rescheduleRow?.status).toBe('approved');
  });

  it('rejects a second reschedule attempt', async () => {
    const employee = await createTestEmployee(prisma);
    const { annualId } = await ensureLeaveTypes(prisma);
    const periodStart = leavePeriodStart(new Date('2026-08-01'));
    await ensureLeaveBalance(prisma, employee.employeeId, annualId, periodStart, 10);

    const created = await agent
      .post(`/api/v1/leave/employees/${employee.employeeId}/requests`)
      .set(authHeader(adminToken))
      .send({
        companyId: employee.companyId,
        leaveTypeCode: 'annual',
        startDate: '2026-08-10',
        endDate: '2026-08-10',
        days: 1,
        reason: 'One day leave',
      })
      .expect(201);

    await agent
      .post(`/api/v1/workflow/instances/${created.body.workflowInstanceId}/actions`)
      .set(authHeader(adminToken))
      .send({ action: 'approve' })
      .expect(201);
    await drainOutbox(app);

    await prisma.leaveRequest.update({
      where: { id: created.body.id },
      data: { rescheduleCount: 1 },
    });

    await agent
      .post(`/api/v1/leave/employees/${employee.employeeId}/reschedule-requests`)
      .set(authHeader(adminToken))
      .send({
        companyId: employee.companyId,
        leaveRequestId: created.body.id,
        newStartDate: '2026-08-17',
        reason: 'Trying again after first reschedule',
      })
      .expect(422);
  });
});
