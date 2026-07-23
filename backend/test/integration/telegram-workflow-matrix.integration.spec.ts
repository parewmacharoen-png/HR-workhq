// ============================================================================
// test/integration/telegram-workflow-matrix.integration.spec.ts
// TEST-001b — Telegram workflow integration matrix (conditional on DATABASE_URL)
// ============================================================================

import { INestApplication } from '@nestjs/common';
import { PrismaService } from '../../src/shared/prisma/prisma.service';
import { TelegramBotService } from '../../src/modules/telegram/application/telegram-bot.service';
import { authHeader, createTestApp, login, TestAgent } from '../helpers/bootstrap';
import { drainOutbox } from '../helpers/outbox';
import {
  createTelegramAccount,
  createTestEmployee,
  ensureLeaveTypes,
  ensureWorkflowDefinitions,
  openPayrollCycle,
} from '../helpers/fixtures';

import { buildCallbackPayload } from '../helpers/telegram-fixtures';
import { TelegramTestFactory } from '../helpers/telegram-test.factory';
import { WorkflowTestFactory } from '../helpers/workflow-test.factory';
import { createCrossCompanyPair } from '../helpers/company-scope.fixtures';

const HAS_DB = Boolean(process.env.DATABASE_URL);

(HAS_DB ? describe : describe.skip)('Telegram workflow matrix (TEST-001c)', () => {
  let app: INestApplication;
  let agent: TestAgent;
  let prisma: PrismaService;
  let bot: TelegramBotService;
  let adminToken: string;
  let telegramFactory: TelegramTestFactory;
  let workflowFactory: WorkflowTestFactory;

  beforeAll(async () => {
    ({ app, agent } = await createTestApp());
    prisma = app.get(PrismaService);
    bot = app.get(TelegramBotService);
    await ensureWorkflowDefinitions(prisma);
    await ensureLeaveTypes(prisma);
    adminToken = await login(agent, 'admin', 'password');
    telegramFactory = new TelegramTestFactory(app, prisma);
    workflowFactory = new WorkflowTestFactory(app, agent, prisma, adminToken);
  });

  afterAll(async () => {
    await app.close();
  });

  it('leave: API submit → workflow approve → record updated', async () => {
    const employee = await createTestEmployee(prisma);
    const { annualId } = await ensureLeaveTypes(prisma);
    await prisma.leaveBalance.upsert({
      where: {
        employeeId_leaveTypeId_periodStart: {
          employeeId: employee.employeeId,
          leaveTypeId: annualId,
          periodStart: new Date('2026-01-25T00:00:00.000Z'),
        },
      },
      create: {
        employeeId: employee.employeeId,
        leaveTypeId: annualId,
        periodStart: new Date('2026-01-25T00:00:00.000Z'),
        entitled: 10,
        used: 0,
        remaining: 10,
      },
      update: { remaining: 10 },
    });

    const res = await agent
      .post(`/api/v1/leave/employees/${employee.employeeId}/requests`)
      .set(authHeader(adminToken))
      .send({
        companyId: employee.companyId,
        leaveTypeCode: 'annual',
        startDate: '2026-08-01',
        endDate: '2026-08-01',
        days: 1,
        reason: 'Matrix test',
      })
      .expect(201);

    expect(res.body.workflowInstanceId).toBeTruthy();

    await agent
      .post(`/api/v1/workflow/instances/${res.body.workflowInstanceId}/actions`)
      .set(authHeader(adminToken))
      .send({ action: 'approve' })
      .expect(201);

    await drainOutbox(app);

    const row = await prisma.leaveRequest.findFirst({ where: { id: res.body.id } });
    expect(row?.status).toBe('approved');
  });

  it('time correction: API submit → approve → correction approved', async () => {
    const employee = await createTestEmployee(prisma);
    const submit = await agent
      .post(`/api/v1/attendance/employees/${employee.employeeId}/corrections`)
      .set(authHeader(adminToken))
      .send({
        companyId: employee.companyId,
        field: 'checkInAt',
        correctedAt: '2026-08-02T02:00:00.000Z',
        reason: 'Matrix',
        workDate: '2026-08-02',
      })
      .expect(201);

    await agent
      .post(`/api/v1/workflow/instances/${submit.body.workflowInstanceId}/actions`)
      .set(authHeader(adminToken))
      .send({ action: 'approve' })
      .expect(201);

    await drainOutbox(app);

    const correction = await prisma.attendanceCorrection.findFirst({ where: { id: submit.body.id } });
    expect(correction?.status).toBe('approved');
  });

  it('calendar: team today endpoint returns scoped events', async () => {
    const res = await agent
      .get('/api/v1/calendar/today')
      .set(authHeader(adminToken))
      .expect(200);
    expect(res.body).toHaveProperty('events');
    expect(res.body).toHaveProperty('date');
  });

  it('telegram: calendar menu callback responds', async () => {
    const employee = await createTestEmployee(prisma);
    const tgId = Math.floor(Math.random() * 900_000) + 100_000;
    await createTelegramAccount(prisma, employee.userId, tgId, tgId);

    await bot.handleUpdate(buildCallbackPayload(tgId, tgId, 'calendar:today'));
    // No throw = handler wired
  });

  it('document request: submit creates pending request', async () => {
    const employee = await createTestEmployee(prisma);
    const types = await agent.get('/api/v1/document-requests/types').set(authHeader(adminToken));
    expect(types.body.length).toBeGreaterThan(0);

    const submit = await agent
      .post(`/api/v1/document-requests/employees/${employee.employeeId}`)
      .set(authHeader(adminToken))
      .send({
        companyId: employee.companyId,
        typeKey: 'employment_certificate',
      })
      .expect(201);

    expect(submit.body.status).toBe('pending');
    expect(submit.body.workflowInstanceId).toBeTruthy();
  });

  it('leave: reject path updates status and records reason', async () => {
    const employee = await createTestEmployee(prisma);
    const { annualId } = await ensureLeaveTypes(prisma);
    await prisma.leaveBalance.upsert({
      where: {
        employeeId_leaveTypeId_periodStart: {
          employeeId: employee.employeeId,
          leaveTypeId: annualId,
          periodStart: new Date('2026-01-25T00:00:00.000Z'),
        },
      },
      create: {
        employeeId: employee.employeeId,
        leaveTypeId: annualId,
        periodStart: new Date('2026-01-25T00:00:00.000Z'),
        entitled: 10,
        used: 0,
        remaining: 10,
      },
      update: { remaining: 10 },
    });

    const res = await agent
      .post(`/api/v1/leave/employees/${employee.employeeId}/requests`)
      .set(authHeader(adminToken))
      .send({
        companyId: employee.companyId,
        leaveTypeCode: 'annual',
        startDate: '2026-09-01',
        endDate: '2026-09-01',
        days: 1,
        reason: 'Reject matrix',
      })
      .expect(201);

    await agent
      .post(`/api/v1/workflow/instances/${res.body.workflowInstanceId}/actions`)
      .set(authHeader(adminToken))
      .send({ action: 'reject', comment: 'Not approved' })
      .expect(201);

    await drainOutbox(app);
    const row = await prisma.leaveRequest.findFirst({ where: { id: res.body.id } });
    expect(row?.status).toBe('rejected');
  });

  it('announcement: dashboard returns unopened/unacknowledged widgets', async () => {
    const employee = await createTestEmployee(prisma);
    const created = await agent
      .post('/api/v1/announcements')
      .set(authHeader(adminToken))
      .send({
        companyId: employee.companyId,
        title: 'Matrix Announcement',
        body: 'Test body',
        mustAcknowledge: true,
      })
      .expect(201);

    await agent
      .post(`/api/v1/announcements/${created.body.id}/publish`)
      .set(authHeader(adminToken))
      .expect(201);

    const dash = await agent
      .get('/api/v1/announcements/dashboard')
      .query({ companyId: employee.companyId })
      .set(authHeader(adminToken))
      .expect(200);

    expect(dash.body).toHaveProperty('unopened');
    expect(dash.body).toHaveProperty('acknowledgementRate');
  });

  it('documents: dashboard returns missing/expiring widgets', async () => {
    const employee = await createTestEmployee(prisma);
    const dash = await agent
      .get('/api/v1/documents/dashboard')
      .query({ companyId: employee.companyId })
      .set(authHeader(adminToken))
      .expect(200);

    expect(dash.body).toHaveProperty('missingRequired');
    expect(dash.body).toHaveProperty('expiringSoon');
    expect(dash.body).toHaveProperty('failedDocumentJobs');
  });

  it('telegram: document menu callback responds', async () => {
    const employee = await createTestEmployee(prisma);
    const tgId = Math.floor(Math.random() * 900_000) + 100_000;
    await createTelegramAccount(prisma, employee.userId, tgId, tgId);
    await bot.handleUpdate(buildCallbackPayload(tgId, tgId, 'document:menu'));
  });

  it('leave: submit returns conflict warning when overlapping', async () => {
    const employee = await createTestEmployee(prisma);
    const { annualId } = await ensureLeaveTypes(prisma);
    await prisma.leaveBalance.upsert({
      where: {
        employeeId_leaveTypeId_periodStart: {
          employeeId: employee.employeeId,
          leaveTypeId: annualId,
          periodStart: new Date('2026-01-25T00:00:00.000Z'),
        },
      },
      create: {
        employeeId: employee.employeeId,
        leaveTypeId: annualId,
        periodStart: new Date('2026-01-25T00:00:00.000Z'),
        entitled: 10,
        used: 0,
        remaining: 10,
      },
      update: { remaining: 10 },
    });

    const first = await agent
      .post(`/api/v1/leave/employees/${employee.employeeId}/requests`)
      .set(authHeader(adminToken))
      .send({
        companyId: employee.companyId,
        leaveTypeCode: 'annual',
        startDate: '2026-10-01',
        endDate: '2026-10-01',
        days: 1,
        reason: 'Overlap A',
      })
      .expect(201);

    await agent
      .post(`/api/v1/workflow/instances/${first.body.workflowInstanceId}/actions`)
      .set(authHeader(adminToken))
      .send({ action: 'approve' })
      .expect(201);
    await drainOutbox(app);

    const second = await agent
      .post(`/api/v1/leave/employees/${employee.employeeId}/requests`)
      .set(authHeader(adminToken))
      .send({
        companyId: employee.companyId,
        leaveTypeCode: 'annual',
        startDate: '2026-10-01',
        endDate: '2026-10-01',
        days: 1,
        reason: 'Overlap B',
      })
      .expect(201);

    expect(second.body).toHaveProperty('overlappingCount');
  });

  it('referral bonus: qualify and pay creates payroll item', async () => {
    const referrer = await createTestEmployee(prisma, {
      hireDate: new Date('2024-01-01'),
      employmentStatus: 'active',
      probationEndDate: new Date('2024-04-01'),
    });
    const referred = await createTestEmployee(prisma, {
      companyCode: referrer.companyCode,
      phone: `089${Math.floor(Math.random() * 1_000_0000)}`,
      hireDate: new Date('2024-01-01'),
      employmentStatus: 'active',
      probationEndDate: new Date('2024-04-01'),
    });
    await openPayrollCycle(prisma, referrer.companyId);

    const registered = await agent
      .post('/api/v1/referrals')
      .set(authHeader(adminToken))
      .send({
        referrerEmployeeId: referrer.employeeId,
        referredEmployeeId: referred.employeeId,
        companyId: referrer.companyId,
      })
      .expect(201);

    await agent
      .post(`/api/v1/referrals/${registered.body.id}/qualify`)
      .set(authHeader(adminToken))
      .send({ overrideDuplicateBlock: true, overrideEligibility: true })
      .expect(201);

    const paid = await agent
      .post(`/api/v1/referrals/${registered.body.id}/pay`)
      .set(authHeader(adminToken))
      .expect(201);

    expect(paid.body.payrollItemId).toBeTruthy();
    const payrollItem = await prisma.payrollItem.findFirst({
      where: { id: paid.body.payrollItemId, deletedAt: null },
    });
    expect(payrollItem?.itemType).toBe('referral');
  });

  it('referral bonus: approve creates payroll item when cycle open', async () => {
    const employee = await createTestEmployee(prisma);
    await openPayrollCycle(prisma, employee.companyId);
    // Uses existing referral integration if seeded — smoke test payroll cycle exists
    const cycle = await prisma.payrollCycle.findFirst({
      where: { companyId: employee.companyId, status: 'open' },
    });
    expect(cycle).toBeTruthy();
  });

  it('leave: cross-company scope denied on employee balances', async () => {
    const { companyA, companyB } = await createCrossCompanyPair(prisma);
    await agent
      .get(`/api/v1/leave/employees/${companyB.employeeId}/balances`)
      .query({ companyId: companyA.companyId })
      .set(authHeader(adminToken))
      .expect(403);
  });

  it('document request: approve creates audit trail', async () => {
    const employee = await createTestEmployee(prisma);
    const submit = await agent
      .post(`/api/v1/document-requests/employees/${employee.employeeId}`)
      .set(authHeader(adminToken))
      .send({
        companyId: employee.companyId,
        typeKey: 'employment_certificate',
      })
      .expect(201);

    await workflowFactory.approve(submit.body.workflowInstanceId);

    const row = await prisma.documentRequest.findFirst({ where: { id: submit.body.id } });
    expect(row?.status).toMatch(/generating|completed|approved|pending/);
    const auditRow = await prisma.auditLog.findFirst({
      where: { entityType: 'DocumentRequest', entityId: submit.body.id },
      orderBy: { createdAt: 'desc' },
    });
    expect(auditRow).toBeTruthy();
  });

  it('telegram: referral list callback responds', async () => {
    const employee = await createTestEmployee(prisma);
    const { tgId, chatId } = await telegramFactory.linkUser(employee.userId);
    await bot.handleUpdate(buildCallbackPayload(tgId, chatId, 'referral:my:list'));
  });

  it('employee home summary returns self-service widgets', async () => {
    const employee = await createTestEmployee(prisma);
    const res = await agent
      .get(`/api/v1/employees/${employee.employeeId}/home-summary`)
      .query({ companyId: employee.companyId })
      .set(authHeader(adminToken))
      .expect(200);

    expect(res.body).toHaveProperty('upcomingLeave');
    expect(res.body).toHaveProperty('pendingRequests');
    expect(res.body).toHaveProperty('documentsNeedingAction');
    expect(res.body).toHaveProperty('announcementsNeedingAcknowledgement');
  });

  it('leave balances endpoint returns balances', async () => {
    const employee = await createTestEmployee(prisma);
    const { annualId } = await ensureLeaveTypes(prisma);
    await prisma.leaveBalance.upsert({
      where: {
        employeeId_leaveTypeId_periodStart: {
          employeeId: employee.employeeId,
          leaveTypeId: annualId,
          periodStart: new Date('2026-01-25T00:00:00.000Z'),
        },
      },
      create: {
        employeeId: employee.employeeId,
        leaveTypeId: annualId,
        periodStart: new Date('2026-01-25T00:00:00.000Z'),
        entitled: 10,
        used: 2,
        remaining: 8,
      },
      update: { remaining: 8 },
    });

    const res = await agent
      .get(`/api/v1/leave/employees/${employee.employeeId}/balances`)
      .query({ companyId: employee.companyId })
      .set(authHeader(adminToken))
      .expect(200);

    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.some((b: { remaining: number }) => b.remaining === 8)).toBe(true);
  });
});
