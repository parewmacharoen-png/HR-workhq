// ============================================================================
// test/integration/absence-record.integration.spec.ts
// ============================================================================

import { INestApplication } from '@nestjs/common';
import { PrismaService } from '../../src/shared/prisma/prisma.service';
import { authHeader, createTestApp, login, TestAgent } from '../helpers/bootstrap';
import { createTestEmployee, grantPermissionsToRole } from '../helpers/fixtures';

describe('Absence records (integration)', () => {
  let app: INestApplication;
  let agent: TestAgent;
  let prisma: PrismaService;
  let adminToken: string;

  beforeAll(async () => {
    ({ app, agent } = await createTestApp());
    prisma = app.get(PrismaService);
    await grantPermissionsToRole(prisma, 'admin', [
      'attendance:read', 'attendance:write',
    ]);
    adminToken = await login(agent, 'admin', 'password');
  });

  afterAll(async () => {
    await app.close();
  });

  it('flags absence, approves with penalty, lists queue', async () => {
    const employee = await createTestEmployee(prisma, { companyCode: 'SB' });
    const workDate = '2026-06-10';

    const flag = await agent
      .post('/api/v1/attendance/absences/run-flag')
      .set(authHeader(adminToken))
      .send({ companyId: employee.companyId, workDate })
      .expect(201);
    expect(flag.body.flaggedCount).toBeGreaterThanOrEqual(1);

    const list = await agent
      .get('/api/v1/attendance/absences')
      .set(authHeader(adminToken))
      .query({ companyId: employee.companyId, status: 'flagged', from: workDate, to: workDate })
      .expect(200);

    const row = list.body.items.find((i: { employeeId: string }) => i.employeeId === employee.employeeId);
    expect(row).toBeTruthy();
    expect(row.status).toBe('flagged');

    const approved = await agent
      .post(`/api/v1/attendance/absences/${row.id}/approve`)
      .set(authHeader(adminToken))
      .send({
        contactAttemptedAt: '2026-06-11T09:00:00+07:00',
        contactNotes: 'โทร 3 ครั้ง ไม่รับสาย ส่ง LINE ไม่ตอบ',
      })
      .expect(201);

    expect(approved.body.status).toBe('approved');
    expect(approved.body.penaltyAmount).toBe(1000);
    expect(approved.body.roleLevelSnapshot).toBe('employee');
  });

  it('ABS-009: Secretary gets ฿3,000 penalty on approve', async () => {
    const employee = await createTestEmployee(prisma, { companyCode: 'MB' });
    await prisma.employee.update({
      where: { id: employee.employeeId },
      data: { position: 'Secretary' },
    });

    const workDate = '2026-06-11';
    await agent
      .post('/api/v1/attendance/absences/run-flag')
      .set(authHeader(adminToken))
      .send({ companyId: employee.companyId, workDate })
      .expect(201);

    const list = await agent
      .get('/api/v1/attendance/absences')
      .set(authHeader(adminToken))
      .query({ companyId: employee.companyId, employeeId: employee.employeeId, from: workDate, to: workDate })
      .expect(200);

    const row = list.body.items[0];
    const approved = await agent
      .post(`/api/v1/attendance/absences/${row.id}/approve`)
      .set(authHeader(adminToken))
      .send({
        contactAttemptedAt: '2026-06-12T09:00:00+07:00',
        contactNotes: 'ติดต่อ Secretary ไม่ได้ตลอดทั้งวัน',
      })
      .expect(201);

    expect(approved.body.penaltyAmount).toBe(3000);
    expect(approved.body.positionSnapshot).toBe('Secretary');
  });

  it('ABS-009a: Owner has no absence status — not flagged by job', async () => {
    const employee = await createTestEmployee(prisma, { companyCode: 'KW' });
    await prisma.employee.update({
      where: { id: employee.employeeId },
      data: { position: 'Owner' },
    });

    const workDate = '2026-06-12';
    const flag = await agent
      .post('/api/v1/attendance/absences/run-flag')
      .set(authHeader(adminToken))
      .send({ companyId: employee.companyId, workDate })
      .expect(201);

    const list = await agent
      .get('/api/v1/attendance/absences')
      .set(authHeader(adminToken))
      .query({ companyId: employee.companyId, employeeId: employee.employeeId, from: workDate, to: workDate })
      .expect(200);

    expect(list.body.items).toHaveLength(0);
    expect(flag.body.flaggedCount).toBe(0);
  });

  it('waives flagged absence', async () => {
    const employee = await createTestEmployee(prisma, { companyCode: 'SB' });
    const workDate = '2026-06-13';

    await agent
      .post('/api/v1/attendance/absences/run-flag')
      .set(authHeader(adminToken))
      .send({ companyId: employee.companyId, workDate })
      .expect(201);

    const list = await agent
      .get('/api/v1/attendance/absences')
      .set(authHeader(adminToken))
      .query({ companyId: employee.companyId, employeeId: employee.employeeId, from: workDate, to: workDate })
      .expect(200);

    const waived = await agent
      .post(`/api/v1/attendance/absences/${list.body.items[0].id}/waive`)
      .set(authHeader(adminToken))
      .send({ reason: 'ลาป่วยฉุกเฉิน อนุมัติย้อนหลังแล้ว' })
      .expect(201);

    expect(waived.body.status).toBe('waived');
    expect(waived.body.penaltyAmount).toBeNull();
  });
});
