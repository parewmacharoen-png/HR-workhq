// ============================================================================
// test/integration/ot-workflow.integration.spec.ts
// ============================================================================

import { INestApplication } from '@nestjs/common';
import { PrismaService } from '../../src/shared/prisma/prisma.service';
import { authHeader, createTestApp, login, TestAgent } from '../helpers/bootstrap';
import { drainOutbox } from '../helpers/outbox';
import {
  createTestEmployee,
  ensureWorkflowDefinitions,
  openPayrollCycle,
} from '../helpers/fixtures';

describe('OT workflow (integration)', () => {
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

  afterEach(() => {
    jest.useRealTimers();
  });

  async function checkoutWithOvertime(employee: { employeeId: string; companyId: string }) {
    jest.useFakeTimers({ advanceTimers: true });
    jest.setSystemTime(new Date('2026-06-20T02:00:00.000Z'));
    let token = await login(agent, 'admin', 'password');
    await agent
      .post(`/api/v1/attendance/employees/${employee.employeeId}/check-in`)
      .set(authHeader(token))
      .send({ companyId: employee.companyId })
      .expect(201);

    jest.setSystemTime(new Date('2026-06-20T15:30:00.000Z'));
    token = await login(agent, 'admin', 'password');
    const checkOut = await agent
      .post(`/api/v1/attendance/employees/${employee.employeeId}/check-out`)
      .set(authHeader(token))
      .send({ companyId: employee.companyId })
      .expect(201);
    jest.useRealTimers();
    return checkOut.body.overtime;
  }

  it('approves overtime and creates payroll item', async () => {
    const employee = await createTestEmployee(prisma);
    await openPayrollCycle(prisma, employee.companyId);

    const overtime = await checkoutWithOvertime(employee);
    expect(overtime?.workflowInstanceId).toBeTruthy();

    await agent
      .post(`/api/v1/workflow/instances/${overtime.workflowInstanceId}/actions`)
      .set(authHeader(adminToken))
      .send({ action: 'approve' })
      .expect(201);

    await drainOutbox(app);

    const otRecord = await prisma.overtimeRecord.findFirst({
      where: { employeeId: employee.employeeId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    expect(otRecord?.status).toBe('approved');
    expect(otRecord?.payrollItemId).toBeTruthy();

    const payrollItem = await prisma.payrollItem.findFirst({
      where: { id: otRecord!.payrollItemId!, deletedAt: null },
    });
    expect(payrollItem?.itemType).toBe('ot');
  });

  it('rejects overtime without payroll item', async () => {
    const employee = await createTestEmployee(prisma, { companyCode: 'KW' });
    const overtime = await checkoutWithOvertime(employee);
    expect(overtime?.workflowInstanceId).toBeTruthy();

    await agent
      .post(`/api/v1/workflow/instances/${overtime.workflowInstanceId}/actions`)
      .set(authHeader(adminToken))
      .send({ action: 'reject' })
      .expect(201);

    await drainOutbox(app);

    const otRecord = await prisma.overtimeRecord.findFirst({
      where: { employeeId: employee.employeeId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    expect(otRecord?.status).toBe('rejected');
    expect(otRecord?.payrollItemId).toBeNull();
  });
});
