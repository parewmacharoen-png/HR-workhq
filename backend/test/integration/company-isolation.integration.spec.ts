// ============================================================================
// test/integration/company-isolation.integration.spec.ts
// Verifies non-platform-admin users cannot access another company's data.
// ============================================================================

import { INestApplication } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../src/shared/prisma/prisma.service';
import { authHeader, createTestApp, login, TestAgent } from '../helpers/bootstrap';
import {
  createTestEmployee,
  ensureLeaveTypes,
  ensureWorkflowDefinitions,
  grantPermissionsToRole,
  openPayrollCycle,
} from '../helpers/fixtures';

const HR_ROLE = 'hr_operator_iso';

const HR_PERMISSIONS = [
  'employee:read',
  'employee:write',
  'payroll:read',
  'payroll:write',
  'referral:read',
  'referral:write',
  'recruitment:read',
  'recruitment:write',
  'performance:read',
  'performance:write',
  'reporting:read',
  'leave:read',
];

async function createCompanyHrUser(
  prisma: PrismaService,
  companyCode: string,
): Promise<{ token: string; companyId: string; employeeId: string; username: string; password: string }> {
  const user = await createTestEmployee(prisma, {
    companyCode,
    roleCodes: [HR_ROLE],
    scopeType: 'company',
    withSalary: true,
  });
  return { ...user, token: '' };
}

describe('Company isolation (integration)', () => {
  let app: INestApplication;
  let agent: TestAgent;
  let prisma: PrismaService;
  let adminToken: string;

  let sbHr: Awaited<ReturnType<typeof createCompanyHrUser>>;
  let mbHr: Awaited<ReturnType<typeof createCompanyHrUser>>;

  let mbPayrollCycleId: string;
  let mbReferralId: string;
  let mbCandidateId: string;
  let mbEvaluationId: string;

  beforeAll(async () => {
    ({ app, agent } = await createTestApp());
    prisma = app.get(PrismaService);
    adminToken = await login(agent, 'admin', 'password');

    let hrRole = await prisma.role.findFirst({ where: { code: HR_ROLE, deletedAt: null } });
    if (!hrRole) {
      hrRole = await prisma.role.create({
        data: { id: randomUUID(), code: HR_ROLE, name: HR_ROLE, isSystem: false },
      });
    }
    await grantPermissionsToRole(prisma, HR_ROLE, HR_PERMISSIONS);
    await ensureWorkflowDefinitions(prisma);
    await ensureLeaveTypes(prisma);

    sbHr = await createCompanyHrUser(prisma, 'SB');
    mbHr = await createCompanyHrUser(prisma, 'MB');
    sbHr.token = await login(agent, sbHr.username, sbHr.password);
    mbHr.token = await login(agent, mbHr.username, mbHr.password);

    // ── Seed Company B resources via admin ──────────────────────────────────
    mbPayrollCycleId = await openPayrollCycle(prisma, mbHr.companyId);

    const mbReferrer = await createTestEmployee(prisma, {
      companyCode: 'MB',
      hireDate: new Date('2024-01-01'),
      employmentStatus: 'active',
      probationEndDate: new Date('2024-04-01'),
    });
    const mbReferred = await createTestEmployee(prisma, {
      companyCode: 'MB',
      hireDate: new Date('2024-01-01'),
      employmentStatus: 'active',
      probationEndDate: new Date('2024-04-01'),
    });
    const referralRes = await agent
      .post('/api/v1/referrals')
      .set(authHeader(adminToken))
      .send({
        referrerEmployeeId: mbReferrer.employeeId,
        referredEmployeeId: mbReferred.employeeId,
        companyId: mbHr.companyId,
      })
      .expect(201);
    mbReferralId = referralRes.body.id as string;

    const candidate = await prisma.candidate.create({
      data: {
        id: randomUUID(),
        companyId: mbHr.companyId,
        recruiterEmployeeId: mbHr.employeeId,
        fullName: 'MB Isolation Candidate',
        phone: `08${randomUUID().replace(/\D/g, '').slice(0, 8)}`,
        source: 'referral',
        stage: 'new',
      },
    });
    mbCandidateId = candidate.id;

    const cycleRes = await agent
      .post('/api/v1/performance/cycles')
      .set(authHeader(adminToken))
      .send({
        companyId: mbHr.companyId,
        periodStart: '2025-01-01',
        periodEnd: '2025-06-30',
      })
      .expect(201);
    const mbCycleId = cycleRes.body.id as string;

    const evalRes = await agent
      .post('/api/v1/performance/evaluations')
      .set(authHeader(adminToken))
      .send({
        companyId: mbHr.companyId,
        cycleId: mbCycleId,
        employeeId: mbHr.employeeId,
      })
      .expect(201);
    mbEvaluationId = evalRes.body.id as string;
  });

  afterAll(async () => {
    await app.close();
  });

  it('denies SB user reading MB payroll cycle payslip', async () => {
    const res = await agent
      .get(`/api/v1/payroll/cycles/${mbPayrollCycleId}/payslips/${mbHr.employeeId}`)
      .set(authHeader(sbHr.token));
    expect([403, 404]).toContain(res.status);
  });

  it('denies SB user reading MB referral by id', async () => {
    const res = await agent
      .get(`/api/v1/referrals/${mbReferralId}`)
      .set(authHeader(sbHr.token));
    expect([403, 404]).toContain(res.status);
  });

  it('denies SB user reading MB recruitment candidate', async () => {
    const res = await agent
      .get(`/api/v1/recruitment/candidates/${mbCandidateId}`)
      .set(authHeader(sbHr.token));
    expect([403, 404]).toContain(res.status);
  });

  it('denies SB user reading MB performance evaluation', async () => {
    const res = await agent
      .get(`/api/v1/performance/evaluations/${mbEvaluationId}`)
      .set(authHeader(sbHr.token));
    expect([403, 404]).toContain(res.status);
  });

  it('denies SB user reading MB reporting pending-approvals', async () => {
    const res = await agent
      .get(`/api/v1/reporting/pending-approvals?companyId=${mbHr.companyId}`)
      .set(authHeader(sbHr.token));
    expect([403, 404]).toContain(res.status);
  });

  it('requires companyId for SB user on reporting kpi trend', async () => {
    const res = await agent
      .get('/api/v1/reporting/kpi/trend/attendance_check_in_rate?from=2025-01-01&to=2025-12-31')
      .set(authHeader(sbHr.token));
    expect([400, 403]).toContain(res.status);
  });

  it('denies SB user reading MB employee profile (HR-013c scope)', async () => {
    const res = await agent
      .get(`/api/v1/employees/${mbHr.employeeId}`)
      .set(authHeader(sbHr.token));
    expect([403, 404]).toContain(res.status);
  });

  it('denies SB user reading MB employee assignments', async () => {
    const res = await agent
      .get(`/api/v1/employees/${mbHr.employeeId}/assignments`)
      .set(authHeader(sbHr.token));
    expect([403, 404]).toContain(res.status);
  });

  it('allows SB user to read own company referral list with companyId', async () => {
    await agent
      .get(`/api/v1/referrals?companyId=${sbHr.companyId}`)
      .set(authHeader(sbHr.token))
      .expect(200);
  });
});
