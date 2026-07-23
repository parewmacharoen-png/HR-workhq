// ============================================================================
// test/integration/employee-recognition.integration.spec.ts
// ============================================================================

import { INestApplication } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { authHeader, createTestApp, login, TestAgent } from '../helpers/bootstrap';
import { createTelegramAccount, createTestEmployee } from '../helpers/fixtures';
import { PrismaService } from '../../src/shared/prisma/prisma.service';
import { EmployeeRecognitionScheduler } from '../../src/modules/telegram/application/employee-recognition.scheduler';
import { TelegramGatewayService } from '../../src/modules/telegram/infrastructure/telegram-gateway.service';
import { mockTelegramGateway } from '../helpers/mock-telegram-gateway';

describe('Employee recognition (integration)', () => {
  let app: INestApplication;
  let agent: TestAgent;
  let adminToken: string;
  let companyId: string;
  let prisma: PrismaService;

  beforeAll(async () => {
    ({ app, agent } = await createTestApp());
    prisma = app.get(PrismaService);
    adminToken = await login(agent, 'admin', 'password');
    const companies = await agent
      .get('/api/v1/organization/companies')
      .set(authHeader(adminToken))
      .expect(200);
    companyId = companies.body[0].id;
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /employees/:id returns profile date fields', async () => {
    const employee = await createTestEmployee(prisma, {
      hireDate: new Date('2024-01-15'),
    });

    await prisma.employee.update({
      where: { id: employee.employeeId },
      data: { dateOfBirth: new Date('1992-08-06') },
    });

    const res = await agent
      .get(`/api/v1/employees/${employee.employeeId}`)
      .set(authHeader(adminToken))
      .expect(200);

    expect(res.body.dateOfBirth).toBe('1992-08-06');
    expect(res.body.hireDate).toBe('2024-01-15');
    expect(typeof res.body.ageYears).toBe('number');
    expect(typeof res.body.tenureYears).toBe('number');
    expect(typeof res.body.tenureMonths).toBe('number');
    expect(typeof res.body.tenureDays).toBe('number');
    expect(res.body.tenureDisplay).toMatch(/ปี|เดือน|วัน/);
    expect(res.body.probationStatusCode).toBeDefined();
  });

  it('GET /employees/dashboard/recognition-events returns birthday and anniversary widgets', async () => {
    const now = new Date();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');

    const birthdayEmp = await createTestEmployee(prisma, { hireDate: new Date('2020-01-01') });
    await prisma.employee.update({
      where: { id: birthdayEmp.employeeId },
      data: { dateOfBirth: new Date(`${now.getFullYear() - 20}-${month}-${day}`) },
    });

    const anniversaryEmp = await createTestEmployee(prisma, {
      hireDate: new Date(`${now.getFullYear() - 1}-${month}-${day}`),
    });

    const res = await agent
      .get('/api/v1/employees/dashboard/recognition-events')
      .query({ companyId })
      .set(authHeader(adminToken))
      .expect(200);

    expect(Array.isArray(res.body.birthdaysThisMonth)).toBe(true);
    expect(Array.isArray(res.body.anniversariesThisMonth)).toBe(true);
    expect(
      res.body.birthdaysThisMonth.some((r: { employeeId: string }) => r.employeeId === birthdayEmp.employeeId),
    ).toBe(true);
    expect(
      res.body.anniversariesThisMonth.some((r: { employeeId: string }) => r.employeeId === anniversaryEmp.employeeId),
    ).toBe(true);
  });

  it('GET /employees/dashboard/tenure-insights returns longest tenure', async () => {
    const res = await agent
      .get('/api/v1/employees/dashboard/tenure-insights')
      .query({ companyId })
      .set(authHeader(adminToken))
      .expect(200);

    expect(res.body).toHaveProperty('longestTenure');
    expect(res.body).toHaveProperty('probationEndingSoon');
    expect(Array.isArray(res.body.probationEndingSoon.within30Days)).toBe(true);
  });

  it('scheduler sends birthday and anniversary Telegram notifications', async () => {
    jest.clearAllMocks();
    const now = new Date();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const tgBase = Math.floor(Math.random() * 900_000) + 100_000;

    const birthdayEmp = await createTestEmployee(prisma, {
      hireDate: new Date('2019-01-01'),
      username: `bday-${day}${month}-${randomUUID().slice(0, 6)}`,
    });
    await prisma.employee.update({
      where: { id: birthdayEmp.employeeId },
      data: { dateOfBirth: new Date(`${now.getFullYear() - 25}-${month}-${day}`) },
    });
    await createTelegramAccount(prisma, birthdayEmp.userId, tgBase, tgBase);

    const anniversaryEmp = await createTestEmployee(prisma, {
      hireDate: new Date(`${now.getFullYear() - 5}-${month}-${day}`),
      username: `ann-${day}${month}-${randomUUID().slice(0, 6)}`,
    });
    await createTelegramAccount(prisma, anniversaryEmp.userId, tgBase + 1, tgBase + 1);

    const scheduler = app.get(EmployeeRecognitionScheduler);
    await scheduler.runDaily(now);

    const gateway = app.get(TelegramGatewayService) as typeof mockTelegramGateway;
    const texts = gateway.sendMessage.mock.calls.map((call) => call[0].text as string);
    expect(texts.some((t) => t.includes('สุขสันต์วันเกิด'))).toBe(true);
    expect(texts.some((t) => t.includes('วันครบรอบการทำงาน'))).toBe(true);
    expect(texts.some((t) => t.includes('ประกาศวันเกิด'))).toBe(true);
  });

  it('POST birthday-gift creates recognition and updates dashboard gift status', async () => {
    const emp = await createTestEmployee(prisma, { hireDate: new Date('2020-01-01') });
    const now = new Date();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    await prisma.employee.update({
      where: { id: emp.employeeId },
      data: { dateOfBirth: new Date(`${now.getFullYear() - 25}-${month}-${day}`) },
    });

    const markRes = await agent
      .post(`/api/v1/employees/${emp.employeeId}/recognitions/birthday-gift`)
      .set(authHeader(adminToken))
      .send({ companyId })
      .expect(201);

    expect(markRes.body.recognitionType).toBe('BIRTHDAY_GIFT');

    const timeline = await agent
      .get(`/api/v1/employees/${emp.employeeId}/recognitions`)
      .query({ companyId })
      .set(authHeader(adminToken))
      .expect(200);

    expect(timeline.body.items.some((r: { id: string }) => r.id === markRes.body.id)).toBe(true);

    const dashboard = await agent
      .get('/api/v1/employees/dashboard/recognition-events')
      .query({ companyId })
      .set(authHeader(adminToken))
      .expect(200);

    const row = dashboard.body.birthdaysThisMonth.find(
      (r: { employeeId: string }) => r.employeeId === emp.employeeId,
    );
    expect(row?.birthdayGiftGivenThisYear).toBe(true);
  });

  it('rejects duplicate birthday gift in same year', async () => {
    const emp = await createTestEmployee(prisma, { hireDate: new Date('2020-01-01') });

    await agent
      .post(`/api/v1/employees/${emp.employeeId}/recognitions/birthday-gift`)
      .set(authHeader(adminToken))
      .send({ companyId })
      .expect(201);

    await agent
      .post(`/api/v1/employees/${emp.employeeId}/recognitions/birthday-gift`)
      .set(authHeader(adminToken))
      .send({ companyId })
      .expect(409);
  });

  it('POST /employees/:id/recognitions creates EMP-011 award with gift metadata', async () => {
    const emp = await createTestEmployee(prisma, { hireDate: new Date('2020-01-01') });

    const res = await agent
      .post(`/api/v1/employees/${emp.employeeId}/recognitions`)
      .set(authHeader(adminToken))
      .send({
        companyId,
        recognitionType: 'EMPLOYEE_OF_MONTH',
        awardMonth: '2026-06-01',
        giftOrReward: 'Gift voucher',
        notes: 'Top performer',
      })
      .expect(201);

    expect(res.body.recognitionType).toBe('EMPLOYEE_OF_MONTH');
    expect(res.body.giftOrReward).toBe('Gift voucher');
    expect(res.body.awardMonth).toBe('2026-06-01');
  });

  it('GET /employees/dashboard/awards returns awards dashboard widgets', async () => {
    const res = await agent
      .get('/api/v1/employees/dashboard/awards')
      .query({ companyId })
      .set(authHeader(adminToken))
      .expect(200);

    expect(res.body).toHaveProperty('awardsThisMonth');
    expect(res.body).toHaveProperty('serviceAwardsDue');
    expect(res.body).toHaveProperty('recentRecognitions');
  });
});
