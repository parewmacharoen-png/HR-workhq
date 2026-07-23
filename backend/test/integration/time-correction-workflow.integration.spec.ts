// ============================================================================
// test/integration/time-correction-workflow.integration.spec.ts
// TEST-001 — Time correction end-to-end lifecycle
// ============================================================================

import { INestApplication } from '@nestjs/common';
import { PrismaService } from '../../src/shared/prisma/prisma.service';
import { authHeader, createTestApp, login, TestAgent } from '../helpers/bootstrap';
import { drainOutbox } from '../helpers/outbox';
import { createTestEmployee, ensureWorkflowDefinitions } from '../helpers/fixtures';

describe('Time correction workflow (integration)', () => {
  let app: INestApplication;
  let agent: TestAgent;
  let prisma: PrismaService;
  let adminToken: string;

  beforeAll(async () => {
    ({ app, agent } = await createTestApp());
    prisma = app.get(PrismaService);
    await ensureWorkflowDefinitions(prisma);
    adminToken = await login(agent, 'admin', 'password');
  });

  afterAll(async () => {
    await app.close();
  });

  it('submits correction, approves workflow, and updates attendance record', async () => {
    const employee = await createTestEmployee(prisma);

    const submit = await agent
      .post(`/api/v1/attendance/employees/${employee.employeeId}/corrections`)
      .set(authHeader(adminToken))
      .send({
        companyId: employee.companyId,
        field: 'checkInAt',
        correctedAt: '2026-06-20T02:00:00.000Z',
        reason: 'Forgot to check in',
        workDate: '2026-06-20',
      })
      .expect(201);

    expect(submit.body.workflowInstanceId).toBeTruthy();
    expect(submit.body.status).toBe('pending');

    await agent
      .post(`/api/v1/workflow/instances/${submit.body.workflowInstanceId}/actions`)
      .set(authHeader(adminToken))
      .send({ action: 'approve' })
      .expect(201);

    await drainOutbox(app);

    const correction = await prisma.attendanceCorrection.findFirst({
      where: { id: submit.body.id },
    });
    expect(correction?.status).toBe('approved');

    const record = await prisma.attendanceRecord.findFirst({
      where: { employeeId: employee.employeeId, workDate: new Date('2026-06-20T00:00:00.000Z') },
    });
    expect(record?.checkInAt).toBeTruthy();
    expect(record?.status).toBe('corrected');
  });
});
