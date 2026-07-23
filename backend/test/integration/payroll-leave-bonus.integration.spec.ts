// ============================================================================
// test/integration/payroll-leave-bonus.integration.spec.ts
// ============================================================================

import { INestApplication } from '@nestjs/common';
import { PrismaService } from '../../src/shared/prisma/prisma.service';
import { authHeader, createTestApp, login, TestAgent } from '../helpers/bootstrap';
import { createTestEmployee, ensureLeaveTypes } from '../helpers/fixtures';

describe('Payroll leave bonus (integration)', () => {
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

  async function seedApprovedOffDayLeave(input: {
    employeeId: string;
    companyId: string;
    leaveTypeId: string;
    startDate: string;
    endDate: string;
    days: number;
  }) {
    return prisma.leaveRequest.create({
      data: {
        employeeId: input.employeeId,
        companyId: input.companyId,
        leaveTypeId: input.leaveTypeId,
        startDate: new Date(input.startDate),
        endDate: new Date(input.endDate),
        days: input.days,
        status: 'approved',
        isBorrowed: false,
      },
    });
  }

  it('adds leave_bonus payroll item from approved off-day usage', async () => {
    const employee = await createTestEmployee(prisma);
    const { annualId } = await ensureLeaveTypes(prisma);
    await seedApprovedOffDayLeave({
      employeeId: employee.employeeId,
      companyId: employee.companyId,
      leaveTypeId: annualId,
      startDate: '2026-06-01',
      endDate: '2026-06-03',
      days: 3,
    });

    const cycleId = await openCycle(employee.companyId);

    const bonus = await agent
      .post(`/api/v1/payroll/cycles/${cycleId}/leave-bonus`)
      .set(authHeader(adminToken))
      .send({ employeeId: employee.employeeId })
      .expect(201);

    expect(bonus.body.usedOffDays).toBe(3);
    expect(bonus.body.eligibleBonusDays).toBe(1);
    expect(bonus.body.bonusAmount).toBe(600);
    expect(bonus.body.skipped).toBe(false);

    const item = await prisma.payrollItem.findFirst({
      where: {
        payrollCycleId: cycleId,
        employeeId: employee.employeeId,
        itemType: 'leave_bonus',
        deletedAt: null,
      },
    });
    expect(item).toBeTruthy();
    expect(Number(item?.amount)).toBe(600);
  });

  it('returns skipped response when bonus is zero', async () => {
    const employee = await createTestEmployee(prisma);
    const { annualId } = await ensureLeaveTypes(prisma);
    await seedApprovedOffDayLeave({
      employeeId: employee.employeeId,
      companyId: employee.companyId,
      leaveTypeId: annualId,
      startDate: '2026-06-01',
      endDate: '2026-06-04',
      days: 4,
    });

    const cycleId = await openCycle(employee.companyId);

    const bonus = await agent
      .post(`/api/v1/payroll/cycles/${cycleId}/leave-bonus`)
      .set(authHeader(adminToken))
      .send({ employeeId: employee.employeeId })
      .expect(201);

    expect(bonus.body.bonusAmount).toBe(0);
    expect(bonus.body.skipped).toBe(true);
    expect(bonus.body.id).toBeNull();
  });

  it('allows owner override above normal cap', async () => {
    const employee = await createTestEmployee(prisma);
    const cycleId = await openCycle(employee.companyId);

    const bonus = await agent
      .post(`/api/v1/payroll/cycles/${cycleId}/leave-bonus`)
      .set(authHeader(adminToken))
      .send({
        employeeId: employee.employeeId,
        overrideApproved: true,
        overrideReason: 'Staffing emergency',
      })
      .expect(201);

    expect(bonus.body.usedOffDays).toBe(0);
    expect(bonus.body.eligibleBonusDays).toBe(4);
    expect(bonus.body.bonusAmount).toBe(2400);
    expect(bonus.body.overrideApproved).toBe(true);
  });
});
