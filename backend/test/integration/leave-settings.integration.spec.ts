// ============================================================================
// test/integration/leave-settings.integration.spec.ts
// ============================================================================

import { INestApplication } from '@nestjs/common';
import { PrismaService } from '../../src/shared/prisma/prisma.service';
import { authHeader, createTestApp, login, TestAgent } from '../helpers/bootstrap';
import {
  createTestEmployee,
  ensureLeaveBalance,
  ensureLeaveTypes,
  ensureWorkflowDefinitions,
  leavePeriodStart,
} from '../helpers/fixtures';
import { DEFAULT_LEAVE_RULES } from '../../src/modules/settings/domain/leave-settings.types';
import { drainOutbox } from '../helpers/outbox';

describe('Leave settings (integration)', () => {
  let app: INestApplication;
  let agent: TestAgent;
  let prisma: PrismaService;
  let adminToken: string;

  beforeAll(async () => {
    ({ app, agent } = await createTestApp());
    prisma = app.get(PrismaService);
    adminToken = await login(agent, 'admin', 'password');
    await ensureWorkflowDefinitions(prisma);
    await ensureLeaveTypes(prisma);
  });

  afterAll(async () => {
    await app.close();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('seeds system leave.rules defaults', async () => {
    const res = await agent
      .get('/api/v1/settings/leave')
      .set(authHeader(adminToken))
      .query({ companyId: 'system' })
      .expect(200);

    const rules = res.body.find((row: { key: string }) => row.key === 'rules');
    expect(rules?.value?.rescheduleNoticeDays).toBe(DEFAULT_LEAVE_RULES.rescheduleNoticeDays);
    expect(rules?.value?.unusedOffDayBonusAmount).toBe(600);
  });

  it('rejects invalid leave.rules payload', async () => {
    const employee = await createTestEmployee(prisma, { companyCode: 'KW' });
    await agent
      .put('/api/v1/settings/leave/rules')
      .set(authHeader(adminToken))
      .query({ companyId: employee.companyId })
      .send({
        value: {
          ...DEFAULT_LEAVE_RULES,
          monthlyOffDays: 1,
          minimumRecommendedOffDays: 4,
        },
      })
      .expect(400);
  });

  it('company reschedule notice override affects validation', async () => {
    const employee = await createTestEmployee(prisma, { companyCode: 'VB' });
    const { annualId } = await ensureLeaveTypes(prisma);
    const periodStart = leavePeriodStart(new Date('2026-09-01'));
    await ensureLeaveBalance(prisma, employee.employeeId, annualId, periodStart, 10);

    await agent
      .put('/api/v1/settings/leave/rules')
      .set(authHeader(adminToken))
      .query({ companyId: employee.companyId })
      .send({
        value: {
          ...DEFAULT_LEAVE_RULES,
          rescheduleNoticeDays: 14,
        },
      })
      .expect(200);

    jest.useFakeTimers({ advanceTimers: true });
    jest.setSystemTime(new Date('2026-09-10T12:00:00.000Z'));
    const token = await login(agent, 'admin', 'password');

    const created = await agent
      .post(`/api/v1/leave/employees/${employee.employeeId}/requests`)
      .set(authHeader(token))
      .send({
        companyId: employee.companyId,
        leaveTypeCode: 'annual',
        startDate: '2026-09-20',
        endDate: '2026-09-21',
        days: 2,
        reason: 'Planned leave',
      })
      .expect(201);

    await agent
      .post(`/api/v1/workflow/instances/${created.body.workflowInstanceId}/actions`)
      .set(authHeader(token))
      .send({ action: 'approve' })
      .expect(201);
    await drainOutbox(app);

    await agent
      .post(`/api/v1/leave/employees/${employee.employeeId}/reschedule-requests`)
      .set(authHeader(token))
      .send({
        companyId: employee.companyId,
        leaveRequestId: created.body.id,
        newStartDate: '2026-09-27',
        reason: 'Need more notice test',
      })
      .expect(422);

    const history = await agent
      .get('/api/v1/settings/history')
      .set(authHeader(token))
      .query({ companyId: employee.companyId, category: 'leave', key: 'rules' })
      .expect(200);
    expect(history.body.length).toBeGreaterThanOrEqual(1);

    const audits = await agent
      .get('/api/v1/settings/audit')
      .set(authHeader(token))
      .query({ companyId: employee.companyId, key: 'rules' })
      .expect(200);
    expect(audits.body.length).toBeGreaterThanOrEqual(1);
  });
});
