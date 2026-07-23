// ============================================================================
// test/integration/payroll-absence-deduction.integration.spec.ts
// ============================================================================

import { randomUUID } from 'crypto';
import { INestApplication } from '@nestjs/common';
import { PrismaService } from '../../src/shared/prisma/prisma.service';
import { authHeader, createTestApp, login, TestAgent } from '../helpers/bootstrap';
import { createTestEmployee, grantPermissionsToRole } from '../helpers/fixtures';

describe('Payroll absence deduction (integration)', () => {
  let app: INestApplication;
  let agent: TestAgent;
  let prisma: PrismaService;
  let adminToken: string;

  beforeAll(async () => {
    ({ app, agent } = await createTestApp());
    prisma = app.get(PrismaService);
    await grantPermissionsToRole(prisma, 'admin', ['payroll:write', 'payroll:read']);
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

  async function createApprovedAbsence(input: {
    employeeId: string;
    companyId: string;
    workDate: string;
    penaltyAmount: number;
    roleLevel: 'employee' | 'sub_leader' | 'big_leader';
    positionSnapshot?: string | null;
    status?: 'approved' | 'flagged' | 'waived' | 'disputed';
  }) {
    return prisma.absenceRecord.create({
      data: {
        id: randomUUID(),
        employeeId: input.employeeId,
        companyId: input.companyId,
        workDate: new Date(input.workDate),
        status: input.status ?? 'approved',
        roleLevelSnapshot: input.roleLevel,
        positionSnapshot: input.positionSnapshot ?? null,
        penaltyAmount: input.penaltyAmount,
        flaggedReason: 'no_checkin_no_leave',
        contactNotes: input.status === 'approved' ? 'โทร 3 ครั้ง ไม่รับสาย ส่ง LINE ไม่ตอบ' : null,
        approvedAt: input.status === 'approved' ? new Date() : null,
      },
    });
  }

  it('posts employee ฿1,000 and sub leader ฿2,000 absence deductions', async () => {
    const employee = await createTestEmployee(prisma, { assignmentRoleLevel: 'employee' });
    const sub = await createTestEmployee(prisma, { companyCode: 'SB', assignmentRoleLevel: 'sub_leader' });

    const recA = await createApprovedAbsence({
      employeeId: employee.employeeId,
      companyId: employee.companyId,
      workDate: '2026-06-02',
      penaltyAmount: 1000,
      roleLevel: 'employee',
    });
    const recB = await createApprovedAbsence({
      employeeId: employee.employeeId,
      companyId: employee.companyId,
      workDate: '2026-06-03',
      penaltyAmount: 1000,
      roleLevel: 'employee',
    });
    await createApprovedAbsence({
      employeeId: sub.employeeId,
      companyId: sub.companyId,
      workDate: '2026-06-04',
      penaltyAmount: 2000,
      roleLevel: 'sub_leader',
    });

    const cycleId = await openCycle(employee.companyId);

    const result = await agent
      .post(`/api/v1/payroll/cycles/${cycleId}/absence-deduction`)
      .set(authHeader(adminToken))
      .send({ employeeId: employee.employeeId })
      .expect(201);

    expect(result.body.totalDeduction).toBe(2000);
    expect(result.body.sourceCount).toBe(2);
    expect(result.body.skipped).toBe(false);

    const item = await prisma.payrollItem.findFirst({
      where: {
        payrollCycleId: cycleId,
        employeeId: employee.employeeId,
        itemType: 'absence_deduction',
        deletedAt: null,
      },
    });
    expect(item).toBeTruthy();
    expect(Number(item?.amount)).toBe(-2000);
    expect(item?.sourceRefType).toBe('absence_record');
    expect(item?.sourceRefId).toBe(recA.id);

    const linked = await prisma.absenceRecord.findMany({
      where: { id: { in: [recA.id, recB.id] } },
    });
    expect(linked.every((r) => r.payrollItemId === item?.id)).toBe(true);
  });

  it('includes big leader ฿3,000 and secretary ฿3,000 in build preview without writing items', async () => {
    const big = await createTestEmployee(prisma, { companyCode: 'MB', assignmentRoleLevel: 'big_leader' });
    const sec = await createTestEmployee(prisma, { companyCode: 'MB', assignmentRoleLevel: 'employee' });

    await prisma.employee.update({ where: { id: sec.employeeId }, data: { position: 'Secretary' } });

    await createApprovedAbsence({
      employeeId: big.employeeId,
      companyId: big.companyId,
      workDate: '2026-06-06',
      penaltyAmount: 3000,
      roleLevel: 'big_leader',
    });
    await createApprovedAbsence({
      employeeId: sec.employeeId,
      companyId: sec.companyId,
      workDate: '2026-06-07',
      penaltyAmount: 3000,
      roleLevel: 'employee',
      positionSnapshot: 'Secretary',
    });

    const cycleId = await openCycle(big.companyId);
    const before = await prisma.payrollItem.count({ where: { payrollCycleId: cycleId, deletedAt: null } });

    const preview = await agent
      .get(`/api/v1/payroll/cycles/${cycleId}/build-preview`)
      .set(authHeader(adminToken))
      .expect(200);

    const bigRow = preview.body.employees.find((r: { employeeId: string }) => r.employeeId === big.employeeId);
    const secRow = preview.body.employees.find((r: { employeeId: string }) => r.employeeId === sec.employeeId);
    expect(bigRow.absenceDeduction).toBe(3000);
    expect(secRow.absenceDeduction).toBe(3000);
    expect(preview.body.totals.totalAbsenceDeductions).toBeGreaterThanOrEqual(6000);

    const after = await prisma.payrollItem.count({ where: { payrollCycleId: cycleId, deletedAt: null } });
    expect(after).toBe(before);
  });

  it('ignores flagged, waived, disputed, and owner zero-penalty records', async () => {
    const employee = await createTestEmployee(prisma, { companyCode: 'KW' });
    await createApprovedAbsence({
      employeeId: employee.employeeId,
      companyId: employee.companyId,
      workDate: '2026-06-08',
      penaltyAmount: 1000,
      roleLevel: 'employee',
      status: 'flagged',
    });
    await createApprovedAbsence({
      employeeId: employee.employeeId,
      companyId: employee.companyId,
      workDate: '2026-06-09',
      penaltyAmount: 1000,
      roleLevel: 'employee',
      status: 'waived',
    });
    await createApprovedAbsence({
      employeeId: employee.employeeId,
      companyId: employee.companyId,
      workDate: '2026-06-10',
      penaltyAmount: 1000,
      roleLevel: 'employee',
      status: 'disputed',
    });
    await createApprovedAbsence({
      employeeId: employee.employeeId,
      companyId: employee.companyId,
      workDate: '2026-06-11',
      penaltyAmount: 0,
      roleLevel: 'big_leader',
      positionSnapshot: 'Owner',
      status: 'approved',
    });
    await createApprovedAbsence({
      employeeId: employee.employeeId,
      companyId: employee.companyId,
      workDate: '2026-06-12',
      penaltyAmount: 1000,
      roleLevel: 'employee',
      status: 'approved',
    });

    const cycleId = await openCycle(employee.companyId);
    const result = await agent
      .post(`/api/v1/payroll/cycles/${cycleId}/absence-deduction`)
      .set(authHeader(adminToken))
      .send({ employeeId: employee.employeeId })
      .expect(201);

    expect(result.body.totalDeduction).toBe(1000);
    expect(result.body.sourceCount).toBe(1);
  });

  it('manual endpoint is idempotent per cycle', async () => {
    const employee = await createTestEmployee(prisma);
    await createApprovedAbsence({
      employeeId: employee.employeeId,
      companyId: employee.companyId,
      workDate: '2026-06-13',
      penaltyAmount: 1000,
      roleLevel: 'employee',
    });
    const cycleId = await openCycle(employee.companyId);

    await agent
      .post(`/api/v1/payroll/cycles/${cycleId}/absence-deduction`)
      .set(authHeader(adminToken))
      .send({ employeeId: employee.employeeId })
      .expect(201);

    await agent
      .post(`/api/v1/payroll/cycles/${cycleId}/absence-deduction`)
      .set(authHeader(adminToken))
      .send({ employeeId: employee.employeeId })
      .expect(409);
  });
});
