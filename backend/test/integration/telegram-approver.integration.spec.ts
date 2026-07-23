// ============================================================================
// test/integration/telegram-approver.integration.spec.ts
// Telegram approvers only see and act on workflows assigned to them.
// ============================================================================

import { randomUUID } from 'crypto';
import { INestApplication } from '@nestjs/common';
import { PrismaService } from '../../src/shared/prisma/prisma.service';
import { TelegramBotService } from '../../src/modules/telegram/application/telegram-bot.service';
import { TelegramGatewayService } from '../../src/modules/telegram/infrastructure/telegram-gateway.service';
import { authHeader, createTestApp, login, TestAgent } from '../helpers/bootstrap';
import { mockTelegramGateway } from '../helpers/mock-telegram-gateway';
import {
  createTeam,
  createTelegramAccount,
  createTestEmployee,
  ensureLeaveBalance,
  ensureLeaveTypes,
  ensureWorkflowDefinitions,
  ensureWorkflowWithApproverRule,
  leavePeriodStart,
} from '../helpers/fixtures';

function uniqueTelegramIds(): { telegramUserId: number; chatId: number } {
  const id = Math.floor(Math.random() * 900_000) + 100_000;
  return { telegramUserId: id, chatId: id };
}

function callbackUpdate(telegramUserId: number, chatId: number, data: string) {
  return {
    update_id: Math.floor(Math.random() * 1_000_000),
    callback_query: {
      id: `cb_${Math.random()}`,
      from: { id: telegramUserId, username: 'leader' },
      data,
      message: { message_id: 1, chat: { id: chatId } },
    },
  };
}

function collectCallbackData(): string[] {
  const gateway = mockTelegramGateway;
  return gateway.sendMessage.mock.calls.flatMap((call) => {
    const keyboard = call[0].replyMarkup?.inline_keyboard ?? [];
    return keyboard.flat().map((btn: { callback_data?: string }) => btn.callback_data as string);
  });
}

function lastMessageText(): string | undefined {
  const calls = mockTelegramGateway.sendMessage.mock.calls;
  return calls.at(-1)?.[0].text as string | undefined;
}

describe('Telegram approver matching (integration)', () => {
  let app: INestApplication;
  let agent: TestAgent;
  let prisma: PrismaService;
  let bot: TelegramBotService;
  let adminToken: string;

  let teamAId: string;
  let teamBId: string;
  let leaderA: Awaited<ReturnType<typeof createTestEmployee>>;
  let leaderB: Awaited<ReturnType<typeof createTestEmployee>>;
  let employeeA: Awaited<ReturnType<typeof createTestEmployee>>;
  let employeeB: Awaited<ReturnType<typeof createTestEmployee>>;
  let leaveInstanceA: string;
  let leaveInstanceB: string;

  let leaderATg: { telegramUserId: number; chatId: number };
  let leaderBTg: { telegramUserId: number; chatId: number };

  beforeAll(async () => {
    ({ app, agent } = await createTestApp());
    prisma = app.get(PrismaService);
    bot = app.get(TelegramBotService);
    adminToken = await login(agent, 'admin', 'password');

    await ensureLeaveTypes(prisma);
    await ensureWorkflowWithApproverRule(prisma, 'leave', 'sub_leader');

    const company = await prisma.company.findFirstOrThrow({
      where: { code: 'SB', deletedAt: null },
    });
    teamAId = await createTeam(prisma, company.id, `Team A ${randomUUID().slice(0, 6)}`);
    teamBId = await createTeam(prisma, company.id, `Team B ${randomUUID().slice(0, 6)}`);

    leaderA = await createTestEmployee(prisma, {
      roleCodes: ['sub_leader'],
      scopeType: 'company',
      teamId: teamAId,
      assignmentRoleLevel: 'sub_leader',
    });
    leaderB = await createTestEmployee(prisma, {
      roleCodes: ['sub_leader'],
      scopeType: 'company',
      teamId: teamBId,
      assignmentRoleLevel: 'sub_leader',
    });
    employeeA = await createTestEmployee(prisma, { teamId: teamAId });
    employeeB = await createTestEmployee(prisma, { teamId: teamBId });

    leaderATg = uniqueTelegramIds();
    leaderBTg = uniqueTelegramIds();
    await createTelegramAccount(prisma, leaderA.userId, leaderATg.telegramUserId, leaderATg.chatId);
    await createTelegramAccount(prisma, leaderB.userId, leaderBTg.telegramUserId, leaderBTg.chatId);

    const { annualId } = await ensureLeaveTypes(prisma);
    const periodStart = leavePeriodStart(new Date('2026-07-01'));
    await ensureLeaveBalance(prisma, employeeA.employeeId, annualId, periodStart, 10);
    await ensureLeaveBalance(prisma, employeeB.employeeId, annualId, periodStart, 10);

    const leaveA = await agent
      .post(`/api/v1/leave/employees/${employeeA.employeeId}/requests`)
      .set(authHeader(adminToken))
      .send({
        companyId: employeeA.companyId,
        leaveTypeCode: 'annual',
        startDate: '2026-07-10',
        endDate: '2026-07-10',
        days: 1,
        reason: 'Team A leave',
      })
      .expect(201);
    leaveInstanceA = leaveA.body.workflowInstanceId as string;

    const leaveB = await agent
      .post(`/api/v1/leave/employees/${employeeB.employeeId}/requests`)
      .set(authHeader(adminToken))
      .send({
        companyId: employeeB.companyId,
        leaveTypeCode: 'annual',
        startDate: '2026-07-11',
        endDate: '2026-07-11',
        days: 1,
        reason: 'Team B leave',
      })
      .expect(201);
    leaveInstanceB = leaveB.body.workflowInstanceId as string;
  });

  afterAll(async () => {
    await ensureWorkflowDefinitions(prisma);
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('Leader A cannot see Leader B leave approvals', async () => {
    await bot.handleUpdate(
      callbackUpdate(leaderATg.telegramUserId, leaderATg.chatId, 'approvals:leave'),
    );

    const callbacks = collectCallbackData();
    expect(callbacks).toContain(`approve:leave:${leaveInstanceA}`);
    expect(callbacks).not.toContain(`approve:leave:${leaveInstanceB}`);
    expect(callbacks).not.toContain(`reject:leave:${leaveInstanceB}`);
  });

  it('Leader A cannot approve Leader B workflow', async () => {
    await bot.handleUpdate(
      callbackUpdate(leaderATg.telegramUserId, leaderATg.chatId, `approve:leave:${leaveInstanceB}`),
    );

    expect(lastMessageText()).toContain('ไม่มีสิทธิ์');

    const inst = await prisma.workflowInstance.findUnique({ where: { id: leaveInstanceB } });
    expect(inst?.status).toBe('pending');
  });

  it('Leader A cannot reject Leader B workflow', async () => {
    await bot.handleUpdate(
      callbackUpdate(leaderATg.telegramUserId, leaderATg.chatId, `reject:leave:${leaveInstanceB}`),
    );

    expect(lastMessageText()).toContain('ไม่มีสิทธิ์');
  });

  it('Owner can see owner-assigned workflows', async () => {
    await ensureWorkflowWithApproverRule(prisma, 'leave', 'owner');

    const owner = await createTestEmployee(prisma, {
      roleCodes: ['owner'],
      scopeType: 'all',
    });
    const ownerTg = uniqueTelegramIds();
    await createTelegramAccount(prisma, owner.userId, ownerTg.telegramUserId, ownerTg.chatId);

    const employee = await createTestEmployee(prisma, { teamId: teamAId });
    const { annualId } = await ensureLeaveTypes(prisma);
    const periodStart = leavePeriodStart(new Date('2026-08-01'));
    await ensureLeaveBalance(prisma, employee.employeeId, annualId, periodStart, 10);

    const created = await agent
      .post(`/api/v1/leave/employees/${employee.employeeId}/requests`)
      .set(authHeader(adminToken))
      .send({
        companyId: employee.companyId,
        leaveTypeCode: 'annual',
        startDate: '2026-08-05',
        endDate: '2026-08-05',
        days: 1,
        reason: 'Owner approval test',
      })
      .expect(201);
    const ownerInstanceId = created.body.workflowInstanceId as string;

    jest.clearAllMocks();
    await bot.handleUpdate(
      callbackUpdate(ownerTg.telegramUserId, ownerTg.chatId, 'approvals:leave'),
    );

    const callbacks = collectCallbackData();
    expect(callbacks).toContain(`approve:leave:${ownerInstanceId}`);

    await ensureWorkflowWithApproverRule(prisma, 'leave', 'sub_leader');
  });
});
