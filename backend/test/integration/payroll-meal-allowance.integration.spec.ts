// ============================================================================
// test/integration/payroll-meal-allowance.integration.spec.ts
// ============================================================================

import { randomUUID } from 'crypto';
import { INestApplication } from '@nestjs/common';
import { PrismaService } from '../../src/shared/prisma/prisma.service';
import { authHeader, createTestApp, login, TestAgent } from '../helpers/bootstrap';
import { createTestEmployee, ensureLeaveTypes } from '../helpers/fixtures';

describe('Payroll meal allowance (integration)', () => {
  let app: INestApplication;
  let agent: TestAgent;
  let prisma: PrismaService;
  let adminToken: string;

  beforeAll(async () => {
    ({ app, agent } = await createTestApp());
    prisma = app.get(PrismaService);
    await ensureLeaveTypes(prisma);
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

  async function seedWorkingDay(input: {
    employeeId: string;
    companyId: string;
    workDate: string;
    workCategory?: 'office' | 'wfh';
  }) {
    await prisma.attendanceRecord.create({
      data: {
        id: randomUUID(),
        employeeId: input.employeeId,
        companyId: input.companyId,
        workDate: new Date(input.workDate),
        workCategory: input.workCategory ?? 'office',
        checkInAt: new Date(`${input.workDate}T02:00:00.000Z`),
        checkOutAt: new Date(`${input.workDate}T10:00:00.000Z`),
        workedMinutes: 480,
        status: 'present',
      },
    });
  }

  it('adds meal allowance for OFFICE employees from settings rate × eligible days', async () => {
    const employee = await createTestEmployee(prisma);
    await prisma.employee.update({
      where: { id: employee.employeeId },
      data: { workCategory: 'office' },
    });

    for (let day = 1; day <= 26; day += 1) {
      const date = `2026-06-${String(day).padStart(2, '0')}`;
      await seedWorkingDay({
        employeeId: employee.employeeId,
        companyId: employee.companyId,
        workDate: date,
      });
    }

    const { annualId } = await ensureLeaveTypes(prisma);
    await prisma.leaveRequest.create({
      data: {
        employeeId: employee.employeeId,
        companyId: employee.companyId,
        leaveTypeId: annualId,
        startDate: new Date('2026-06-20'),
        endDate: new Date('2026-06-23'),
        days: 4,
        status: 'approved',
        isBorrowed: false,
      },
    });

    const cycleId = await openCycle(employee.companyId);

    const result = await agent
      .post(`/api/v1/payroll/cycles/${cycleId}/meal-allowance`)
      .set(authHeader(adminToken))
      .send({ employeeId: employee.employeeId })
      .expect(201);

    expect(result.body.workCategory).toBe('office');
    expect(result.body.workingDays).toBe(26);
    expect(result.body.offDayLeaveDays).toBe(4);
    expect(result.body.eligibleDays).toBe(30);
    expect(result.body.ratePerDay).toBe(100);
    expect(result.body.amount).toBe(3000);
    expect(result.body.skipped).toBe(false);
  });

  it('skips meal allowance for WFH attendance days', async () => {
    const employee = await createTestEmployee(prisma);
    await prisma.employee.update({
      where: { id: employee.employeeId },
      data: { workCategory: 'wfh' },
    });
    await seedWorkingDay({
      employeeId: employee.employeeId,
      companyId: employee.companyId,
      workDate: '2026-06-10',
      workCategory: 'wfh',
    });

    const cycleId = await openCycle(employee.companyId);

    const result = await agent
      .post(`/api/v1/payroll/cycles/${cycleId}/meal-allowance`)
      .set(authHeader(adminToken))
      .send({ employeeId: employee.employeeId })
      .expect(201);

    expect(result.body.workCategory).toBe('wfh');
    expect(result.body.amount).toBe(0);
    expect(result.body.skipped).toBe(true);
    expect(result.body.id).toBeNull();
  });

  it('counts only office days for hybrid attendance', async () => {
    const employee = await createTestEmployee(prisma);
    await seedWorkingDay({
      employeeId: employee.employeeId,
      companyId: employee.companyId,
      workDate: '2026-06-10',
      workCategory: 'office',
    });
    await seedWorkingDay({
      employeeId: employee.employeeId,
      companyId: employee.companyId,
      workDate: '2026-06-11',
      workCategory: 'wfh',
    });

    const cycleId = await openCycle(employee.companyId);
    const result = await agent
      .post(`/api/v1/payroll/cycles/${cycleId}/meal-allowance`)
      .set(authHeader(adminToken))
      .send({ employeeId: employee.employeeId })
      .expect(201);

    expect(result.body.eligibleDays).toBe(1);
    expect(result.body.amount).toBe(100);
    expect(result.body.skipped).toBe(false);
  });
});
