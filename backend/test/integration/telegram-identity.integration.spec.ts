// ============================================================================
// test/integration/telegram-identity.integration.spec.ts
// ============================================================================

import { INestApplication } from '@nestjs/common';
import { PrismaService } from '../../src/shared/prisma/prisma.service';
import { TelegramBotService } from '../../src/modules/telegram/application/telegram-bot.service';
import { authHeader, createTestApp, login, TestAgent } from '../helpers/bootstrap';
import { createTestEmployee } from '../helpers/fixtures';

function messageUpdate(telegramUserId: number, chatId: number, text: string) {
  return {
    update_id: Math.floor(Math.random() * 1_000_000),
    message: {
      message_id: Math.floor(Math.random() * 1_000_000),
      from: { id: telegramUserId, username: 'secuser' },
      chat: { id: chatId },
      text,
    },
  };
}

describe('Telegram identity security (integration)', () => {
  let app: INestApplication;
  let agent: TestAgent;
  let prisma: PrismaService;
  let bot: TelegramBotService;
  let adminToken: string;

  beforeAll(async () => {
    ({ app, agent } = await createTestApp());
    prisma = app.get(PrismaService);
    bot = app.get(TelegramBotService);
    adminToken = await login(agent, 'admin', 'password');
  });

  afterAll(async () => {
    await app.close();
  });

  it('auto-approves matching employee code and phone', async () => {
    const phone = '0890012345';
    const employee = await createTestEmployee(prisma, { phone, companyCode: 'KW' });
    const telegramUserId = Math.floor(Math.random() * 900_000) + 100_000;
    const chatId = telegramUserId;

    await bot.handleUpdate(messageUpdate(telegramUserId, chatId, '/start'));
    await bot.handleUpdate(messageUpdate(telegramUserId, chatId, employee.globalId));
    await bot.handleUpdate(messageUpdate(telegramUserId, chatId, phone));

    const identity = await prisma.telegramIdentity.findFirst({
      where: { telegramUserId: BigInt(telegramUserId), status: 'ACTIVE', deletedAt: null },
    });
    expect(identity?.employeeId).toBe(employee.employeeId);
  });

  it('creates pending registration on phone mismatch', async () => {
    const employee = await createTestEmployee(prisma, { phone: '0890099999', companyCode: 'MB' });
    const telegramUserId = Math.floor(Math.random() * 900_000) + 200_000;
    const chatId = telegramUserId;

    await bot.handleUpdate(messageUpdate(telegramUserId, chatId, '/start'));
    await bot.handleUpdate(messageUpdate(telegramUserId, chatId, employee.globalId));
    await bot.handleUpdate(messageUpdate(telegramUserId, chatId, '0890000000'));

    const pending = await prisma.registrationRequest.findFirst({
      where: { telegramUserId: BigInt(telegramUserId), requestStatus: 'PENDING' },
    });
    expect(pending).toBeTruthy();

    const requestType = await prisma.requestType.findFirst({
      where: { key: 'telegram_registration_review', deletedAt: null },
    });
    expect(requestType).toBeTruthy();

    const webRequest = await prisma.requestInstance.findFirst({
      where: {
        requesterEmployeeId: employee.employeeId,
        requestTypeId: requestType!.id,
        deletedAt: null,
      },
      orderBy: { createdAt: 'desc' },
    });
    expect(webRequest).toBeTruthy();
    expect(webRequest!.status).toBe('in_review');
    expect(webRequest!.status).not.toBe('draft');
    expect(pending!.requestInstanceId).toBe(webRequest!.id);
  });

  it('lists telegram registration review in pending approval for owner', async () => {
    const employee = await createTestEmployee(prisma, { phone: '0890077777', companyCode: 'SB' });
    const telegramUserId = Math.floor(Math.random() * 900_000) + 400_000;
    const chatId = telegramUserId;

    await bot.handleUpdate(messageUpdate(telegramUserId, chatId, '/start'));
    await bot.handleUpdate(messageUpdate(telegramUserId, chatId, employee.globalId));
    await bot.handleUpdate(messageUpdate(telegramUserId, chatId, '0890000002'));

    const res = await agent
      .get('/api/v1/requests/pending-approval')
      .set(authHeader(adminToken))
      .expect(200);

    const rows = res.body as Array<{ id: string; status: string; requesterEmployeeId?: string }>;
    expect(rows.some((r) => r.status === 'in_review')).toBe(true);
  });

  it('HR can approve pending registration', async () => {
    const phone = '0890088888';
    const employee = await createTestEmployee(prisma, { phone, companyCode: 'VB' });
    const telegramUserId = Math.floor(Math.random() * 900_000) + 300_000;
    const chatId = telegramUserId;

    await bot.handleUpdate(messageUpdate(telegramUserId, chatId, '/start'));
    await bot.handleUpdate(messageUpdate(telegramUserId, chatId, employee.globalId));
    await bot.handleUpdate(messageUpdate(telegramUserId, chatId, '0890000001'));

    const pending = await prisma.registrationRequest.findFirst({
      where: { telegramUserId: BigInt(telegramUserId), requestStatus: 'PENDING' },
    });
    expect(pending).toBeTruthy();

    await agent
      .post(`/api/v1/security/registrations/${pending!.id}/approve`)
      .set(authHeader(adminToken))
      .send({ employeeId: employee.employeeId })
      .expect(201);

    const identity = await prisma.telegramIdentity.findFirst({
      where: { employeeId: employee.employeeId, status: 'ACTIVE', deletedAt: null },
    });
    expect(identity?.telegramUserId).toBe(BigInt(telegramUserId));
  });

  it('revoked identity blocks HR admin revoke endpoint', async () => {
    const employee = await createTestEmployee(prisma, { companyCode: 'HH' });
    await prisma.telegramIdentity.create({
      data: {
        employeeId: employee.employeeId,
        telegramUserId: BigInt(999888777),
        status: 'ACTIVE',
      },
    });

    await agent
      .post(`/api/v1/employees/${employee.employeeId}/telegram-identity/revoke`)
      .set(authHeader(adminToken))
      .expect(201);

    const revoked = await prisma.telegramIdentity.findFirst({
      where: { employeeId: employee.employeeId, status: 'REVOKED' },
    });
    expect(revoked).toBeTruthy();
  });
});
