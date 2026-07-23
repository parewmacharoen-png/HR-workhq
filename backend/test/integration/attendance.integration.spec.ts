// ============================================================================
// test/integration/attendance.integration.spec.ts
// ============================================================================

import { INestApplication } from '@nestjs/common';
import { PrismaService } from '../../src/shared/prisma/prisma.service';
import { authHeader, createTestApp, login, TestAgent } from '../helpers/bootstrap';
import { createTestEmployee, ensureWorkflowDefinitions, grantPermissionsToRole } from '../helpers/fixtures';

describe('Attendance (integration)', () => {
  let app: INestApplication;
  let agent: TestAgent;
  let prisma: PrismaService;

  beforeAll(async () => {
    ({ app, agent } = await createTestApp());
    prisma = app.get(PrismaService);
    await grantPermissionsToRole(prisma, 'employee', [
      'attendance:read', 'attendance:write',
    ]);
    await ensureWorkflowDefinitions(prisma);
  });

  afterAll(async () => {
    await app.close();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('check in, break start, break end, check out', async () => {
    const employee = await createTestEmployee(prisma, { companyCode: 'SB' });

    jest.useFakeTimers({ advanceTimers: true });
    jest.setSystemTime(new Date('2026-06-20T02:00:00.000Z')); // 09:00 ICT
    let token = await login(agent, 'admin', 'password');

    const checkIn = await agent
      .post(`/api/v1/attendance/employees/${employee.employeeId}/check-in`)
      .set(authHeader(token))
      .send({ companyId: employee.companyId, hourlyRate: 100 })
      .expect(201);
    expect(checkIn.body.checkInAt).toBeTruthy();

    await agent
      .post(`/api/v1/attendance/employees/${employee.employeeId}/break/start`)
      .set(authHeader(token))
      .expect(201);

    await agent
      .post(`/api/v1/attendance/employees/${employee.employeeId}/break/end`)
      .set(authHeader(token))
      .expect(201);

    jest.setSystemTime(new Date('2026-06-20T10:00:00.000Z')); // 17:00 ICT — no OT
    token = await login(agent, 'admin', 'password');

    const checkOut = await agent
      .post(`/api/v1/attendance/employees/${employee.employeeId}/check-out`)
      .set(authHeader(token))
      .send({ companyId: employee.companyId })
      .expect(201);

    expect(checkOut.body.checkOutAt).toBeTruthy();
    expect(checkOut.body.overtime).toBeNull();
  });

  it('detects overtime on late check-out', async () => {
    const employee = await createTestEmployee(prisma, { companyCode: 'MB' });

    jest.useFakeTimers({ advanceTimers: true });
    jest.setSystemTime(new Date('2026-06-20T02:00:00.000Z'));
    let token = await login(agent, 'admin', 'password');

    await agent
      .post(`/api/v1/attendance/employees/${employee.employeeId}/check-in`)
      .set(authHeader(token))
      .send({ companyId: employee.companyId })
      .expect(201);

    jest.setSystemTime(new Date('2026-06-20T15:30:00.000Z')); // 22:30 ICT
    token = await login(agent, 'admin', 'password');

    const checkOut = await agent
      .post(`/api/v1/attendance/employees/${employee.employeeId}/check-out`)
      .set(authHeader(token))
      .send({ companyId: employee.companyId })
      .expect(201);

    expect(checkOut.body.overtime).toMatchObject({
      otHours: expect.any(Number),
      amount: expect.any(Number),
      workflowInstanceId: expect.any(String),
    });
    expect(checkOut.body.overtime.otHours).toBeGreaterThanOrEqual(1);
  });
});
