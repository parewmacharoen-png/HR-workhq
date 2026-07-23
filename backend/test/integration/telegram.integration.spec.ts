// ============================================================================
// test/integration/telegram.integration.spec.ts
// ============================================================================

import { randomUUID } from 'crypto';
import { INestApplication } from '@nestjs/common';
import { PrismaService } from '../../src/shared/prisma/prisma.service';
import { TelegramBotService } from '../../src/modules/telegram/application/telegram-bot.service';
import { TelegramGatewayService } from '../../src/modules/telegram/infrastructure/telegram-gateway.service';
import { createTestApp } from '../helpers/bootstrap';
import { mockTelegramGateway } from '../helpers/mock-telegram-gateway';
import {
  createTelegramAccount,
  createTestEmployee,
  ensureLeaveBalance,
  ensureLeaveTypes,
  ensureMarketingTeam,
  ensureWorkflowDefinitions,
  leavePeriodStart,
} from '../helpers/fixtures';

function uniqueTelegramIds(): { telegramUserId: number; chatId: number } {
  const id = Math.floor(Math.random() * 900_000) + 100_000;
  return { telegramUserId: id, chatId: id };
}

function messageUpdate(telegramUserId: number, chatId: number, text: string) {
  return {
    update_id: Math.floor(Math.random() * 1_000_000),
    message: {
      message_id: Math.floor(Math.random() * 1_000_000),
      from: { id: telegramUserId, username: 'testuser' },
      chat: { id: chatId },
      text,
    },
  };
}

function callbackUpdate(telegramUserId: number, chatId: number, data: string) {
  return {
    update_id: Math.floor(Math.random() * 1_000_000),
    callback_query: {
      id: `cb_${Math.random()}`,
      from: { id: telegramUserId, username: 'testuser' },
      data,
      message: { message_id: 1, chat: { id: chatId } },
    },
  };
}

describe('Telegram (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let bot: TelegramBotService;

  beforeAll(async () => {
    ({ app } = await createTestApp());
    prisma = app.get(PrismaService);
    bot = app.get(TelegramBotService);
    await ensureWorkflowDefinitions(prisma);
    await ensureLeaveTypes(prisma);
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterAll(async () => {
    await app.close();
  });

  it('completes identity verification for a pre-seeded employee', async () => {
    const phone = `08${randomUUID().replace(/\D/g, '').slice(0, 8)}`;
    const employee = await createTestEmployee(prisma, { phone, companyCode: 'SB' });
    const { telegramUserId, chatId } = uniqueTelegramIds();

    await bot.handleUpdate(messageUpdate(telegramUserId, chatId, '/start'));
    await bot.handleUpdate(messageUpdate(telegramUserId, chatId, employee.globalId));
    await bot.handleUpdate(messageUpdate(telegramUserId, chatId, phone));

    const identity = await prisma.telegramIdentity.findFirst({
      where: { telegramUserId: BigInt(telegramUserId), status: 'ACTIVE', deletedAt: null },
    });
    expect(identity?.employeeId).toBe(employee.employeeId);

    const sentTexts = (app.get(TelegramGatewayService) as typeof mockTelegramGateway)
      .sendMessage.mock.calls.map((c) => c[0].text as string);
    expect(sentTexts.some((t) => t.includes('ยืนยันตัวตนสำเร็จ'))).toBe(true);
  });

  it('submits a leave request through the telegram flow', async () => {
    const employee = await createTestEmployee(prisma);
    const { annualId } = await ensureLeaveTypes(prisma);
    const periodStart = leavePeriodStart(new Date('2026-07-01'));
    await ensureLeaveBalance(prisma, employee.employeeId, annualId, periodStart, 10);

    const { telegramUserId, chatId } = uniqueTelegramIds();
    const accountId = await createTelegramAccount(prisma, employee.userId, telegramUserId, chatId);

    await prisma.telegramSession.deleteMany({ where: { telegramAccountId: accountId } });
    await prisma.telegramSession.create({
      data: {
        id: randomUUID(),
        telegramAccountId: accountId,
        state: 'leave:select_type',
        context: { draft: {} },
      },
    });

    await bot.handleUpdate(callbackUpdate(telegramUserId, chatId, 'leave:type:annual'));
    await bot.handleUpdate(messageUpdate(telegramUserId, chatId, '2026-07-10'));
    await bot.handleUpdate(messageUpdate(telegramUserId, chatId, '2026-07-11'));
    await bot.handleUpdate(messageUpdate(telegramUserId, chatId, 'Family trip'));
    await bot.handleUpdate(callbackUpdate(telegramUserId, chatId, 'leave:submit'));

    const leave = await prisma.leaveRequest.findFirst({
      where: { employeeId: employee.employeeId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    expect(leave?.status).toBe('pending');
    expect(leave?.workflowInstanceId).toBeTruthy();
  });

  it('handles /report command and shows report menu', async () => {
    const employee = await createTestEmployee(prisma);
    const { telegramUserId, chatId } = uniqueTelegramIds();
    await createTelegramAccount(prisma, employee.userId, telegramUserId, chatId);

    await bot.handleUpdate(messageUpdate(telegramUserId, chatId, '/report'));

    const gateway = app.get(TelegramGatewayService) as typeof mockTelegramGateway;
    expect(gateway.sendMessage).toHaveBeenCalled();
    const lastText = gateway.sendMessage.mock.calls.at(-1)?.[0].text as string;
    expect(lastText).toContain('รายงาน');
  });
});
