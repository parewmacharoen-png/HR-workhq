// ============================================================================
// test/integration/approval-inbox.integration.spec.ts
// HR-15 Approvals Inbox, History, Timeline, Delegation
// ============================================================================

import { INestApplication } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../src/shared/prisma/prisma.service';
import { authHeader, createTestApp, login, TestAgent } from '../helpers/bootstrap';
import {
  createTestEmployee,
  ensureLeaveBalance,
  ensureLeaveTypes,
  ensureWorkflowDefinitions,
  leavePeriodStart,
} from '../helpers/fixtures';

describe('Approval Inbox (HR-15 completion)', () => {
  let app: INestApplication;
  let agent: TestAgent;
  let prisma: PrismaService;
  let adminToken: string;

  beforeAll(async () => {
    ({ app, agent } = await createTestApp());
    prisma = app.get(PrismaService);
    await ensureWorkflowDefinitions(prisma);
    await ensureLeaveTypes(prisma);
    let sick = await prisma.leaveType.findFirst({ where: { code: 'sick', deletedAt: null } });
    if (!sick) {
      sick = await prisma.leaveType.create({
        data: {
          id: randomUUID(),
          code: 'sick',
          name: 'Sick Leave',
          accrualPeriod: 'year',
          defaultQuota: 30,
          allowBorrowFuture: false,
        },
      });
    }
    adminToken = await login(agent, 'admin', 'password');
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns inbox, history, and timeline with web channel', async () => {
    const emp = await createTestEmployee(prisma, { companyCode: 'SB' });
    const sick = await prisma.leaveType.findFirst({ where: { code: 'sick', deletedAt: null } });
    expect(sick).toBeTruthy();
    const periodStart = leavePeriodStart(new Date('2026-07-01'));
    await ensureLeaveBalance(prisma, emp.employeeId, sick!.id, periodStart, 30);

    const created = await agent
      .post(`/api/v1/leave/employees/${emp.employeeId}/requests`)
      .set(authHeader(adminToken))
      .send({
        companyId: emp.companyId,
        leaveTypeCode: 'sick',
        startDate: '2026-07-10',
        endDate: '2026-07-10',
        days: 1,
        reason: 'Inbox test sick leave',
      })
      .expect(201);

    const instanceId = created.body.workflowInstanceId as string;

    const inbox = await agent
      .get('/api/v1/workflow/inbox')
      .query({ companyId: emp.companyId })
      .set(authHeader(adminToken))
      .expect(200);
    expect(Array.isArray(inbox.body)).toBe(true);
    expect(inbox.body.some((i: { instanceId: string }) => i.instanceId === instanceId)).toBe(true);

    await agent
      .post(`/api/v1/workflow/instances/${instanceId}/actions`)
      .set(authHeader(adminToken))
      .send({ action: 'approve', comment: 'Web test approve' })
      .expect(201);

    const timeline = await agent
      .get(`/api/v1/workflow/instances/${instanceId}/timeline`)
      .set(authHeader(adminToken))
      .expect(200);
    expect(timeline.body.timeline.length).toBeGreaterThanOrEqual(2);
    const approveEntry = timeline.body.timeline.find((e: { action: string }) => e.action === 'approve');
    expect(approveEntry?.channel).toBe('web');

    const history = await agent
      .get('/api/v1/workflow/history')
      .query({ companyId: emp.companyId, status: 'approved' })
      .set(authHeader(adminToken))
      .expect(200);
    expect(history.body.some((h: { instanceId: string }) => h.instanceId === instanceId)).toBe(true);
    const row = history.body.find((h: { instanceId: string }) => h.instanceId === instanceId);
    expect(row?.lastChannel).toBe('web');
  });

  it('creates and lists temporary delegation', async () => {
    const delegator = await createTestEmployee(prisma, { companyCode: 'SB', businessRole: 'big_leader' });
    const delegate = await createTestEmployee(prisma, { companyCode: 'SB' });
    const delegatorToken = await login(agent, delegator.username, delegator.password);

    const validFrom = new Date();
    const validTo = new Date();
    validTo.setDate(validTo.getDate() + 7);

    const created = await agent
      .post('/api/v1/workflow/delegations')
      .set(authHeader(delegatorToken))
      .send({
        delegateUserId: delegate.userId,
        companyId: delegator.companyId,
        validFrom: validFrom.toISOString(),
        validTo: validTo.toISOString(),
        reason: 'ลาพักร้อน',
      })
      .expect(201);

    expect(created.body.delegateUserId).toBe(delegate.userId);

    const list = await agent
      .get('/api/v1/workflow/delegations')
      .set(authHeader(delegatorToken))
      .expect(200);
    expect(list.body.some((d: { id: string }) => d.id === created.body.id)).toBe(true);
  });
});
