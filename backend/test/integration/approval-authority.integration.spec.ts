// ============================================================================
// test/integration/approval-authority.integration.spec.ts
// HR-15 Approval Authority Matrix
// ============================================================================

import { INestApplication } from '@nestjs/common';
import { PrismaService } from '../../src/shared/prisma/prisma.service';
import { ApprovalResolverService } from '../../src/modules/workflow/application/approval-resolver.service';
import { authHeader, createTestApp, login, TestAgent } from '../helpers/bootstrap';
import {
  createTestEmployee,
  ensureLeaveBalance,
  ensureLeaveTypes,
  ensureWorkflowDefinitions,
  leavePeriodStart,
} from '../helpers/fixtures';

describe('Approval Authority Matrix (HR-15 integration)', () => {
  let app: INestApplication;
  let agent: TestAgent;
  let prisma: PrismaService;
  let adminToken: string;
  let companyId: string;
  let approvalResolver: ApprovalResolverService;

  beforeAll(async () => {
    ({ app, agent } = await createTestApp());
    prisma = app.get(PrismaService);
    approvalResolver = app.get(ApprovalResolverService);
    await ensureLeaveTypes(prisma);
    adminToken = await login(agent, 'admin', 'password');
    const companies = await agent
      .get('/api/v1/organization/companies')
      .set(authHeader(adminToken))
      .expect(200);
    companyId = companies.body[0].id;
    await ensureWorkflowDefinitions(prisma);
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns workflow preview for sick leave routing to any owner', async () => {
    const emp = await createTestEmployee(prisma, { companyCode: 'SB' });
    const res = await agent
      .post('/api/v1/workflow/preview')
      .set(authHeader(adminToken))
      .send({
        workflowType: 'leave_sick',
        employeeId: emp.employeeId,
        companyId: emp.companyId,
        leaveTypeCode: 'sick',
      })
      .expect(201);

    expect(res.body.steps[0].approverStrategy).toBe('any_owner');
    expect(res.body.approvers.length).toBeGreaterThan(0);
  });

  it('returns multi-step preview for payroll adjustment', async () => {
    const emp = await createTestEmployee(prisma, { companyCode: 'SB' });
    const res = await agent
      .post('/api/v1/workflow/preview')
      .set(authHeader(adminToken))
      .send({
        workflowType: 'payroll_adjustment',
        employeeId: emp.employeeId,
        companyId: emp.companyId,
      })
      .expect(201);

    expect(res.body.steps.length).toBeGreaterThanOrEqual(2);
    expect(res.body.minApprovalCount).toBeGreaterThanOrEqual(2);
    expect(res.body.requiresOwner).toBe(false);
  });

  it('returns owner-required for salary adjustment preview', async () => {
    const emp = await createTestEmployee(prisma, { companyCode: 'SB' });
    const res = await agent
      .post('/api/v1/workflow/preview')
      .set(authHeader(adminToken))
      .send({
        workflowType: 'salary_adjustment',
        employeeId: emp.employeeId,
        companyId: emp.companyId,
      })
      .expect(201);

    expect(res.body.requiresOwner).toBe(true);
    expect(res.body.steps.some((s: { approverStrategy: string }) => s.approverStrategy === 'any_owner')).toBe(true);
  });

  it('lists approval matrix configuration', async () => {
    const res = await agent
      .get('/api/v1/workflow/approval-matrix')
      .set(authHeader(adminToken))
      .expect(200);

    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.some((r: { workflowType: string }) => r.workflowType === 'leave_sick')).toBe(true);
  });

  it('routes OT for regular employee to direct manager', async () => {
    const manager = await createTestEmployee(prisma, { companyCode: 'SB' });
    const emp = await createTestEmployee(prisma, { companyCode: 'SB' });
    await agent
      .patch(`/api/v1/employees/${emp.employeeId}/reporting-line`)
      .query({ companyId: emp.companyId })
      .set(authHeader(adminToken))
      .send({ managerEmployeeId: manager.employeeId })
      .expect(200);

    const res = await agent
      .post('/api/v1/workflow/preview')
      .set(authHeader(adminToken))
      .send({
        workflowType: 'ot_request',
        employeeId: emp.employeeId,
        companyId: emp.companyId,
      })
      .expect(201);

    expect(res.body.steps[0].approverStrategy).toBe('direct_manager');
    expect(res.body.steps[0].approvers[0].employeeId).toBe(manager.employeeId);
  });

  it('returns big leader for off-day leave preview', async () => {
    const leader = await createTestEmployee(prisma, {
      companyCode: 'SB',
      businessRole: 'big_leader',
      assignmentRoleLevel: 'big_leader',
    });
    const emp = await createTestEmployee(prisma, { companyCode: 'SB' });
    await agent
      .patch(`/api/v1/employees/${emp.employeeId}/reporting-line`)
      .query({ companyId: emp.companyId })
      .set(authHeader(adminToken))
      .send({ managerEmployeeId: leader.employeeId })
      .expect(200);

    const res = await agent
      .post('/api/v1/workflow/preview')
      .set(authHeader(adminToken))
      .send({
        workflowType: 'leave_off_day',
        employeeId: emp.employeeId,
        companyId: emp.companyId,
        leaveTypeCode: 'annual',
      })
      .expect(201);

    expect(res.body.steps[0].approverStrategy).toBe('big_leader');
    expect(res.body.steps[0].approvers[0].employeeId).toBe(leader.employeeId);
  });

  it('blocks leave submit when no approver can be resolved', async () => {
    const emp = await createTestEmployee(prisma, { companyCode: 'SB' });
    const { annualId } = await ensureLeaveTypes(prisma);
    const periodStart = leavePeriodStart(new Date('2026-06-01'));
    await ensureLeaveBalance(prisma, emp.employeeId, annualId, periodStart, 10);

    const res = await agent
      .post(`/api/v1/leave/employees/${emp.employeeId}/requests`)
      .set(authHeader(adminToken))
      .send({
        companyId: emp.companyId,
        leaveTypeCode: 'annual',
        startDate: '2026-06-10',
        endDate: '2026-06-11',
        days: 1,
        reason: 'No approver chain',
      })
      .expect(422);

    expect(res.body.code).toBe('NO_APPROVER_FOUND');
  });

  it('enforces min approvers on strict submit for payroll adjustment', async () => {
    const emp = await createTestEmployee(prisma, { companyCode: 'SB' });
    await expect(
      approvalResolver.assertCanSubmit('payroll_adjustment', {
        employeeId: emp.employeeId,
        companyId: emp.companyId,
      }),
    ).rejects.toMatchObject({ code: 'MIN_APPROVERS_NOT_MET' });
  });

  it('routes OT for sub leader to big leader', async () => {
    const leader = await createTestEmployee(prisma, {
      companyCode: 'SB',
      businessRole: 'big_leader',
      assignmentRoleLevel: 'big_leader',
    });
    const sub = await createTestEmployee(prisma, {
      companyCode: 'SB',
      assignmentRoleLevel: 'sub_leader',
      businessRole: 'sub_leader',
    });
    await agent
      .patch(`/api/v1/employees/${sub.employeeId}/reporting-line`)
      .query({ companyId: sub.companyId })
      .set(authHeader(adminToken))
      .send({ managerEmployeeId: leader.employeeId })
      .expect(200);

    const res = await agent
      .post('/api/v1/workflow/preview')
      .set(authHeader(adminToken))
      .send({
        workflowType: 'ot_request',
        employeeId: sub.employeeId,
        companyId: sub.companyId,
      })
      .expect(201);

    expect(res.body.steps[0].approverStrategy).toBe('big_leader');
  });

  it('routes admin requester to secretary', async () => {
    const adminEmp = await createTestEmployee(prisma, {
      companyCode: 'SB',
      businessRole: 'admin',
    });
    const res = await agent
      .post('/api/v1/workflow/preview')
      .set(authHeader(adminToken))
      .send({
        workflowType: 'leave_sick',
        employeeId: adminEmp.employeeId,
        companyId: adminEmp.companyId,
        leaveTypeCode: 'sick',
      })
      .expect(201);

    expect(res.body.steps).toHaveLength(1);
    expect(res.body.steps[0].approverStrategy).toBe('secretary');
  });

  it('routes secretary requester to any owner', async () => {
    const secEmp = await createTestEmployee(prisma, {
      companyCode: 'SB',
      businessRole: 'secretary',
    });
    const res = await agent
      .post('/api/v1/workflow/preview')
      .set(authHeader(adminToken))
      .send({
        workflowType: 'payroll_adjustment',
        employeeId: secEmp.employeeId,
        companyId: secEmp.companyId,
      })
      .expect(201);

    expect(res.body.steps).toHaveLength(1);
    expect(res.body.steps[0].approverStrategy).toBe('any_owner');
  });
});
