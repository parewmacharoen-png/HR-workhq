// ============================================================================
// test/integration/payroll-build.integration.spec.ts
// ============================================================================

import { randomUUID } from 'crypto';
import { INestApplication } from '@nestjs/common';
import { PrismaService } from '../../src/shared/prisma/prisma.service';
import { authHeader, createTestApp, login, TestAgent } from '../helpers/bootstrap';
import { createTestEmployee, ensureLeaveTypes } from '../helpers/fixtures';
import { PAYROLL_BUILDER_NOTE_PREFIX } from '../../src/modules/payroll/domain/payroll-builder.constants';

describe('Payroll cycle build (integration)', () => {
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

  let cycleSeq = 0;

  async function openCycle(companyId: string) {
    cycleSeq += 1;
    const year = 2025 + Math.floor((cycleSeq - 1) / 12);
    const month = ((cycleSeq - 1) % 12) + 1;
    const nextMonth = month === 12 ? 1 : month + 1;
    const nextYear = month === 12 ? year + 1 : year;
    const periodStart = `${year}-${String(month).padStart(2, '0')}-25`;
    const periodEnd = `${nextYear}-${String(nextMonth).padStart(2, '0')}-23`;
    const payDate = `${nextYear}-${String(nextMonth).padStart(2, '0')}-25`;

    const opened = await agent
      .post('/api/v1/payroll/cycles')
      .set(authHeader(adminToken))
      .send({ companyId, periodStart, periodEnd, payDate })
      .expect(201);
    return { id: opened.body.id as string, periodStart, periodEnd };
  }

  it('preview does not write payroll items', async () => {
    const employee = await createTestEmployee(prisma, { companyCode: 'SB', withSalary: true });
    const { id: cycleId } = await openCycle(employee.companyId);

    const beforeCount = await prisma.payrollItem.count({
      where: { payrollCycleId: cycleId, deletedAt: null },
    });

    const preview = await agent
      .get(`/api/v1/payroll/cycles/${cycleId}/build-preview`)
      .set(authHeader(adminToken))
      .expect(200);

    expect(preview.body.totals.employeeCount).toBeGreaterThanOrEqual(1);

    const afterCount = await prisma.payrollItem.count({
      where: { payrollCycleId: cycleId, deletedAt: null },
    });
    expect(afterCount).toBe(beforeCount);
  });

  it('build creates payroll items for active employees with salary', async () => {
    const employee = await createTestEmployee(prisma, { companyCode: 'MB', withSalary: true });
    const { id: cycleId } = await openCycle(employee.companyId);

    const result = await agent
      .post(`/api/v1/payroll/cycles/${cycleId}/build`)
      .set(authHeader(adminToken))
      .expect(201);

    expect(result.body.employeesProcessed).toBeGreaterThanOrEqual(1);
    expect(result.body.itemsCreated).toBeGreaterThan(0);

    const salaryItem = await prisma.payrollItem.findFirst({
      where: {
        payrollCycleId: cycleId,
        employeeId: employee.employeeId,
        itemType: 'salary',
        deletedAt: null,
      },
    });
    expect(salaryItem).toBeTruthy();
    expect(salaryItem?.note).toContain(PAYROLL_BUILDER_NOTE_PREFIX);
    expect(Number(salaryItem?.amount)).toBeGreaterThan(0);
  });

  it('build is idempotent', async () => {
    const employee = await createTestEmployee(prisma, { companyCode: 'KW', withSalary: true });
    const { id: cycleId } = await openCycle(employee.companyId);

    await agent
      .post(`/api/v1/payroll/cycles/${cycleId}/build`)
      .set(authHeader(adminToken))
      .expect(201);

    const countAfterFirst = await prisma.payrollItem.count({
      where: { payrollCycleId: cycleId, deletedAt: null },
    });

    const second = await agent
      .post(`/api/v1/payroll/cycles/${cycleId}/build`)
      .set(authHeader(adminToken))
      .expect(201);

    expect(second.body.itemsUpdated).toBeGreaterThan(0);
    expect(second.body.itemsCreated).toBe(0);

    const countAfterSecond = await prisma.payrollItem.count({
      where: { payrollCycleId: cycleId, deletedAt: null },
    });
    expect(countAfterSecond).toBe(countAfterFirst);
  });

  it('build skips WFH meal allowance but still pays monthly cross-border', async () => {
    const employee = await createTestEmployee(prisma, { companyCode: 'VB', withSalary: true });
    await prisma.employee.update({
      where: { id: employee.employeeId },
      data: { workCategory: 'wfh' },
    });

    const { id: cycleId, periodStart } = await openCycle(employee.companyId);
    await prisma.attendanceRecord.create({
      data: {
        id: randomUUID(),
        employeeId: employee.employeeId,
        companyId: employee.companyId,
        workDate: new Date(periodStart),
        workCategory: 'wfh',
        checkInAt: new Date(`${periodStart}T02:00:00.000Z`),
        workedMinutes: 480,
        status: 'present',
      },
    });
    await agent
      .post(`/api/v1/payroll/cycles/${cycleId}/build`)
      .set(authHeader(adminToken))
      .expect(201);

    const mealItem = await prisma.payrollItem.findFirst({
      where: {
        payrollCycleId: cycleId,
        employeeId: employee.employeeId,
        itemType: 'meal_allowance',
        deletedAt: null,
      },
    });
    expect(mealItem).toBeNull();

    // WFH-only days do not earn cross-border allowance (office days only).
    const crossBorder = await prisma.payrollItem.findFirst({
      where: {
        payrollCycleId: cycleId,
        employeeId: employee.employeeId,
        itemType: 'cross_border',
        deletedAt: null,
      },
    });
    expect(crossBorder).toBeNull();
  });

  it('build includes late deduction from attendance', async () => {
    const employee = await createTestEmployee(prisma, { companyCode: 'HH', withSalary: true });
    const { id: cycleId, periodStart } = await openCycle(employee.companyId);
    await prisma.attendanceRecord.create({
      data: {
        id: randomUUID(),
        employeeId: employee.employeeId,
        companyId: employee.companyId,
        workDate: new Date(periodStart),
        checkInAt: new Date(`${periodStart}T02:30:00.000Z`),
        lateMinutes: 30,
        lateDeduction: 60,
        workedMinutes: 450,
        status: 'present',
      },
    });
    await agent
      .post(`/api/v1/payroll/cycles/${cycleId}/build`)
      .set(authHeader(adminToken))
      .expect(201);

    const lateItem = await prisma.payrollItem.findFirst({
      where: {
        payrollCycleId: cycleId,
        employeeId: employee.employeeId,
        itemType: 'late_deduction',
        deletedAt: null,
      },
    });
    expect(lateItem).toBeTruthy();
    expect(Number(lateItem?.amount)).toBe(-60);
  });

  it('build includes leave bonus', async () => {
    const employee = await createTestEmployee(prisma, { companyCode: 'SB', withSalary: true });
    const { id: cycleId, periodStart } = await openCycle(employee.companyId);
    const leaveStart = new Date(periodStart);
    leaveStart.setUTCDate(leaveStart.getUTCDate() + 5);
    const leaveEnd = new Date(leaveStart);
    leaveEnd.setUTCDate(leaveEnd.getUTCDate() + 2);
    const { annualId } = await ensureLeaveTypes(prisma);
    await prisma.leaveRequest.create({
      data: {
        employeeId: employee.employeeId,
        companyId: employee.companyId,
        leaveTypeId: annualId,
        startDate: leaveStart,
        endDate: leaveEnd,
        days: 3,
        status: 'approved',
        isBorrowed: false,
      },
    });
    await agent
      .post(`/api/v1/payroll/cycles/${cycleId}/build`)
      .set(authHeader(adminToken))
      .expect(201);

    const bonusItem = await prisma.payrollItem.findFirst({
      where: {
        payrollCycleId: cycleId,
        employeeId: employee.employeeId,
        itemType: 'leave_bonus',
        deletedAt: null,
      },
    });
    expect(bonusItem).toBeTruthy();
    expect(Number(bonusItem?.amount)).toBe(600);
  });

  it('build cannot run on paid cycle', async () => {
    const employee = await createTestEmployee(prisma, { companyCode: 'MB', withSalary: true });
    const { id: cycleId } = await openCycle(employee.companyId);

    await agent
      .post(`/api/v1/payroll/cycles/${cycleId}/build`)
      .set(authHeader(adminToken))
      .expect(201);

    await agent
      .post(`/api/v1/payroll/cycles/${cycleId}/lock`)
      .set(authHeader(adminToken))
      .expect(201);

    await agent
      .post(`/api/v1/payroll/cycles/${cycleId}/paid`)
      .set(authHeader(adminToken))
      .expect(201);

    await agent
      .post(`/api/v1/payroll/cycles/${cycleId}/build`)
      .set(authHeader(adminToken))
      .expect(409);
  });
});
