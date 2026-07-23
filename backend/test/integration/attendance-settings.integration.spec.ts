// ============================================================================
// test/integration/attendance-settings.integration.spec.ts
// ============================================================================

import { INestApplication } from '@nestjs/common';
import { PrismaService } from '../../src/shared/prisma/prisma.service';
import { authHeader, createTestApp, login, TestAgent } from '../helpers/bootstrap';
import { createTestEmployee, ensureWorkflowDefinitions } from '../helpers/fixtures';
import { DEFAULT_ATTENDANCE_RULES } from '../../src/modules/settings/domain/attendance-settings.types';

describe('Attendance settings (integration)', () => {
  let app: INestApplication;
  let agent: TestAgent;
  let prisma: PrismaService;
  let adminToken: string;

  beforeAll(async () => {
    ({ app, agent } = await createTestApp());
    prisma = app.get(PrismaService);
    adminToken = await login(agent, 'admin', 'password');
    await ensureWorkflowDefinitions(prisma);
  });

  afterAll(async () => {
    await app.close();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('seeds system attendance.rules defaults', async () => {
    const res = await agent
      .get('/api/v1/settings/attendance')
      .set(authHeader(adminToken))
      .query({ companyId: 'system' })
      .expect(200);

    const rules = res.body.find((row: { key: string }) => row.key === 'rules');
    expect(rules?.value?.graceMinutes).toBe(DEFAULT_ATTENDANCE_RULES.graceMinutes);
    expect(rules?.value?.breakMinutes).toBe(60);
  });

  it('company override changes late grace behavior', async () => {
    const employee = await createTestEmployee(prisma, { companyCode: 'VB' });

    await agent
      .put('/api/v1/settings/attendance/rules')
      .set(authHeader(adminToken))
      .query({ companyId: employee.companyId })
      .send({
        value: {
          ...DEFAULT_ATTENDANCE_RULES,
          graceMinutes: 30,
        },
      })
      .expect(200);

    jest.useFakeTimers({ advanceTimers: true });
    jest.setSystemTime(new Date('2026-06-20T02:25:00.000Z')); // 09:25 ICT
    const token = await login(agent, 'admin', 'password');

    const checkIn = await agent
      .post(`/api/v1/attendance/employees/${employee.employeeId}/check-in`)
      .set(authHeader(token))
      .send({ companyId: employee.companyId, hourlyRate: 100 })
      .expect(201);

    expect(checkIn.body.lateMinutes).toBe(0);

    const history = await agent
      .get('/api/v1/settings/history')
      .set(authHeader(adminToken))
      .query({ companyId: employee.companyId, category: 'attendance', key: 'rules' })
      .expect(200);

    expect(history.body.length).toBeGreaterThanOrEqual(1);

    const audits = await agent
      .get('/api/v1/settings/audit')
      .set(authHeader(adminToken))
      .query({ companyId: employee.companyId, key: 'rules' })
      .expect(200);

    expect(audits.body.length).toBeGreaterThanOrEqual(1);
  });

  it('disabling OT via settings prevents overtime on check-out', async () => {
    const employee = await createTestEmployee(prisma, { companyCode: 'HH' });

    await agent
      .put('/api/v1/settings/attendance/rules')
      .set(authHeader(adminToken))
      .query({ companyId: employee.companyId })
      .send({
        value: {
          ...DEFAULT_ATTENDANCE_RULES,
          overtimeEnabled: false,
        },
      })
      .expect(200);

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

    expect(checkOut.body.overtime).toBeNull();
  });
});
