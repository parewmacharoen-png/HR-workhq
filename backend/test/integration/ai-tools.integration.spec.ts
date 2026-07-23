// ============================================================================
// test/integration/ai-tools.integration.spec.ts
// ============================================================================

import { randomUUID } from 'crypto';
import { INestApplication } from '@nestjs/common';
import { PrismaService } from '../../src/shared/prisma/prisma.service';
import { ToolExecutor } from '../../src/modules/ai/application/tool-executor.service';
import { createTestApp, login, TestAgent } from '../helpers/bootstrap';
import { enableMarketingForIntegrationTests } from '../helpers/marketing-test';
import {
  createTestEmployee,
  ensureLeaveBalance,
  ensureLeaveTypes,
  grantPermissionsToRole,
  leavePeriodStart,
} from '../helpers/fixtures';

describe('AI HR Copilot tools (integration)', () => {
  let app: INestApplication;
  let agent: TestAgent;
  let prisma: PrismaService;
  let executor: ToolExecutor;
  let adminToken: string;

  beforeAll(async () => {
    enableMarketingForIntegrationTests();
    ({ app, agent } = await createTestApp());
    prisma = app.get(PrismaService);
    executor = app.get(ToolExecutor);
    await ensureLeaveTypes(prisma);
    await grantPermissionsToRole(prisma, 'employee', ['leave:read']);
    adminToken = await login(agent, 'admin', 'password');
  });

  afterAll(async () => {
    await app.close();
  });

  it('get_leave_balance returns real balance data for authorized user', async () => {
    const employee = await createTestEmployee(prisma);
    const { annualId } = await ensureLeaveTypes(prisma);
    const periodStart = leavePeriodStart(new Date());
    await ensureLeaveBalance(prisma, employee.employeeId, annualId, periodStart, 8);

    const result = await executor.execute(
      { userId: employee.userId, impersonatorUserId: null, companyId: employee.companyId },
      'get_leave_balance',
      {},
    );

    expect(result.ok).toBe(true);
    const data = result.data as { balances: Array<{ leaveTypeCode: string; remaining: number }> };
    const annual = data.balances.find((b) => b.leaveTypeCode === 'annual');
    expect(annual?.remaining).toBe(8);

    const audit = await prisma.auditLog.findFirst({
      where: {
        actorUserId: employee.userId,
        entityType: 'AiTool',
        action: 'tool_call',
      },
      orderBy: { occurredAt: 'desc' },
    });
    expect(audit?.after).toMatchObject({ toolName: 'get_leave_balance', ok: true });
  });

  it('owner tool is denied for employee-scoped user without reporting:owner', async () => {
    const employee = await createTestEmployee(prisma);

    const result = await executor.execute(
      { userId: employee.userId, impersonatorUserId: null, companyId: employee.companyId },
      'get_company_dashboard',
      {},
    );

    expect(result.ok).toBe(false);
    expect(result.error).toContain('Permission denied');
  });

  it('admin can access get_company_dashboard owner tool', async () => {
    const admin = await prisma.user.findFirst({ where: { username: 'admin', deletedAt: null } });
    expect(admin).toBeTruthy();

    const result = await executor.execute(
      { userId: admin!.id, impersonatorUserId: null, companyId: null },
      'get_company_dashboard',
      {},
    );

    expect(result.ok).toBe(true);
  });

  it('get_executive_summary returns aggregated owner brief for admin', async () => {
    const admin = await prisma.user.findFirst({ where: { username: 'admin', deletedAt: null } });
    expect(admin).toBeTruthy();

    const result = await executor.execute(
      { userId: admin!.id, impersonatorUserId: null, companyId: null },
      'get_executive_summary',
      {},
    );

    expect(result.ok).toBe(true);
    const data = result.data as { headline?: { financeNet?: number }; finance?: unknown };
    expect(data.headline).toBeDefined();
    expect(data.finance).toBeDefined();
  });

  it('admin can access get_commission_dashboard tool', async () => {
    const admin = await prisma.user.findFirst({ where: { username: 'admin', deletedAt: null } });
    expect(admin).toBeTruthy();

    const result = await executor.execute(
      { userId: admin!.id, impersonatorUserId: null, companyId: null },
      'get_commission_dashboard',
      {},
    );

    expect(result.ok).toBe(true);
    const data = result.data as { executiveSummary?: { totalPaid?: number } };
    expect(data.executiveSummary).toBeDefined();
  });

  it('employee can access get_my_leave_balance via AI tool', async () => {
    const employee = await createTestEmployee(prisma);
    const { annualId } = await ensureLeaveTypes(prisma);
    const periodStart = leavePeriodStart(new Date());
    await ensureLeaveBalance(prisma, employee.employeeId, annualId, periodStart, 6);
    await grantPermissionsToRole(prisma, 'employee', [
      'leave:read',
      'attendance:read',
      'payroll:read',
      'commission:read',
      'referral:read',
      'employee:read',
      'ai:chat',
    ]);

    const result = await executor.execute(
      { userId: employee.userId, impersonatorUserId: null, companyId: employee.companyId },
      'get_my_leave_balance',
      {},
    );

    expect(result.ok).toBe(true);
    const data = result.data as { annualLeaveRemaining?: number };
    expect(data.annualLeaveRemaining).toBe(6);
  });

  it('manager cannot query another employee through self-service AI tool', async () => {
    const employee = await createTestEmployee(prisma, { username: `selfsvc-a-${randomUUID().slice(0, 8)}` });
    const other = await createTestEmployee(prisma, {
      username: `selfsvc-b-${randomUUID().slice(0, 8)}`,
      companyCode: employee.companyCode,
    });
    await grantPermissionsToRole(prisma, 'employee', ['leave:read', 'ai:chat']);

    const result = await executor.execute(
      { userId: employee.userId, impersonatorUserId: null, companyId: employee.companyId },
      'get_my_leave_balance',
      { employeeId: other.employeeId },
    );

    expect(result.ok).toBe(false);
    expect(result.error).toContain('cannot query another employee');
  });

  it('preserves company isolation for self-service leave history', async () => {
    const employee = await createTestEmployee(prisma, {
      username: `selfsvc-co-${randomUUID().slice(0, 8)}`,
      companyCode: 'SB',
      scopeType: 'self',
    });
    await grantPermissionsToRole(prisma, 'employee', ['leave:read', 'ai:chat']);

    const otherCompany = await prisma.company.findFirst({
      where: { code: 'MB', deletedAt: null },
    });
    expect(otherCompany).toBeTruthy();

    const result = await executor.execute(
      { userId: employee.userId, impersonatorUserId: null, companyId: null },
      'get_my_leave_history',
      { companyId: otherCompany!.id },
    );

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/Company access denied|companyId could not be resolved/i);
  });
});
