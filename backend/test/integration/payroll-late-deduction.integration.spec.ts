// ============================================================================
// test/integration/payroll-late-deduction.integration.spec.ts
// ============================================================================

import { randomUUID } from 'crypto';
import { INestApplication } from '@nestjs/common';
import { PrismaService } from '../../src/shared/prisma/prisma.service';
import { authHeader, createTestApp, login, TestAgent } from '../helpers/bootstrap';
import { createTestEmployee } from '../helpers/fixtures';

describe('Payroll late deduction (integration)', () => {
  let app: INestApplication;
  let agent: TestAgent;
  let prisma: PrismaService;
  let adminToken: string;

  beforeAll(async () => {
    ({ app, agent } = await createTestApp());
    prisma = app.get(PrismaService);
    adminToken = await login(agent, 'admin', 'password');
  });

  afterAll(async () => {
    await app.close();
  });

  async function openCycle(companyId: string) {
    const opened = await agent
      .post('/api/v1/payroll/cycles')
      .set(authHeader(adminToken))
      .send({
        companyId,
        periodStart: '2026-05-25',
        periodEnd: '2026-06-23',
        payDate: '2026-06-25',
      })
      .expect(201);
    return opened.body.id as string;
  }

  it('posts stored attendance late deductions with source references', async () => {
    const employee = await createTestEmployee(prisma);
    const recordA = await prisma.attendanceRecord.create({
      data: {
        id: randomUUID(),
        employeeId: employee.employeeId,
        companyId: employee.companyId,
        workDate: new Date('2026-06-02'),
        checkInAt: new Date('2026-06-02T02:30:00.000Z'),
        lateMinutes: 30,
        lateDeduction: 60,
        workedMinutes: 480,
        status: 'present',
      },
    });
    const recordB = await prisma.attendanceRecord.create({
      data: {
        id: randomUUID(),
        employeeId: employee.employeeId,
        companyId: employee.companyId,
        workDate: new Date('2026-06-03'),
        checkInAt: new Date('2026-06-03T02:45:00.000Z'),
        lateMinutes: 45,
        lateDeduction: 40,
        workedMinutes: 465,
        status: 'present',
      },
    });

    const cycleId = await openCycle(employee.companyId);

    const result = await agent
      .post(`/api/v1/payroll/cycles/${cycleId}/late-deduction`)
      .set(authHeader(adminToken))
      .send({ employeeId: employee.employeeId })
      .expect(201);

    expect(result.body.totalDeduction).toBe(100);
    expect(result.body.sourceCount).toBe(2);
    expect(result.body.skipped).toBe(false);
    expect(result.body.sources).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ attendanceRecordId: recordA.id, amount: 60 }),
        expect.objectContaining({ attendanceRecordId: recordB.id, amount: 40 }),
      ]),
    );

    const item = await prisma.payrollItem.findFirst({
      where: {
        payrollCycleId: cycleId,
        employeeId: employee.employeeId,
        itemType: 'late_deduction',
        deletedAt: null,
      },
    });
    expect(item).toBeTruthy();
    expect(Number(item?.amount)).toBe(-100);
    expect(item?.sourceRefType).toBe('attendance');
    expect(item?.sourceRefId).toBe(recordA.id);
    expect(item?.note).toContain(recordA.id);
    expect(item?.note).toContain(recordB.id);
  });

  it('skips payroll item when no late deductions exist', async () => {
    const employee = await createTestEmployee(prisma);
    const cycleId = await openCycle(employee.companyId);

    const result = await agent
      .post(`/api/v1/payroll/cycles/${cycleId}/late-deduction`)
      .set(authHeader(adminToken))
      .send({ employeeId: employee.employeeId })
      .expect(201);

    expect(result.body.skipped).toBe(true);
    expect(result.body.id).toBeNull();
  });
});
