// ============================================================================
// test/integration/probation-review.integration.spec.ts
// EMP-010 — probation review workflow.
// ============================================================================

import { INestApplication } from '@nestjs/common';
import { authHeader, createTestApp, login, TestAgent } from '../helpers/bootstrap';
import { createTestEmployee, grantPermissionsToRole } from '../helpers/fixtures';
import { PrismaService } from '../../src/shared/prisma/prisma.service';

const HR_ROLE = 'probation_hr';

describe('Probation review EMP-010 (integration)', () => {
  let app: INestApplication;
  let agent: TestAgent;
  let prisma: PrismaService;
  let adminToken: string;
  let companyId: string;

  beforeAll(async () => {
    ({ app, agent } = await createTestApp());
    prisma = app.get(PrismaService);
    adminToken = await login(agent, 'admin', 'password');
    await grantPermissionsToRole(prisma, HR_ROLE, [
      'performance:read',
      'performance:write',
      'performance:finalize',
      'employee:read',
    ]);

    const companies = await agent
      .get('/api/v1/organization/companies')
      .set(authHeader(adminToken))
      .expect(200);
    companyId = companies.body[0].id;
  });

  afterAll(async () => {
    await app.close();
  });

  it('PASS sets employee status to active', async () => {
    const emp = await createTestEmployee(prisma, {
      employmentStatus: 'probation',
      probationEndDate: new Date('2026-07-01'),
    });
    const coId = emp.companyId;

    const createRes = await agent
      .post('/api/v1/performance/probation')
      .set(authHeader(adminToken))
      .send({
        employeeId: emp.employeeId,
        companyId: coId,
        probationStartDate: '2026-04-01',
        probationEndDate: '2026-07-01',
      })
      .expect(201);

    await agent
      .patch(`/api/v1/performance/probation/${createRes.body.id}/resolve`)
      .set(authHeader(adminToken))
      .send({ outcome: 'PASS' })
      .expect(200);

    const employee = await prisma.employee.findUnique({ where: { id: emp.employeeId } });
    expect(employee?.employmentStatus).toBe('active');
  });

  it('EXTEND updates probation end date with extensionDays', async () => {
    const emp = await createTestEmployee(prisma, {
      employmentStatus: 'probation',
      probationEndDate: new Date('2026-07-01'),
    });
    const coId = emp.companyId;

    const createRes = await agent
      .post('/api/v1/performance/probation')
      .set(authHeader(adminToken))
      .send({
        employeeId: emp.employeeId,
        companyId: coId,
        probationStartDate: '2026-04-01',
        probationEndDate: '2026-07-01',
      })
      .expect(201);

    await agent
      .patch(`/api/v1/performance/probation/${createRes.body.id}/resolve`)
      .set(authHeader(adminToken))
      .send({ outcome: 'EXTEND', extensionDays: 14 })
      .expect(200);

    const employee = await prisma.employee.findUnique({ where: { id: emp.employeeId } });
    expect(employee?.probationEndDate?.toISOString().slice(0, 10)).toBe('2026-07-15');

    const pending = await prisma.probationReview.findFirst({
      where: { employeeId: emp.employeeId, outcome: 'pending', deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    expect(pending).toBeTruthy();
  });

  it('FAIL creates exit case automatically', async () => {
    const emp = await createTestEmployee(prisma, {
      employmentStatus: 'probation',
      probationEndDate: new Date('2026-07-01'),
    });
    const coId = emp.companyId;

    const createRes = await agent
      .post('/api/v1/performance/probation')
      .set(authHeader(adminToken))
      .send({
        employeeId: emp.employeeId,
        companyId: coId,
        probationStartDate: '2026-04-01',
        probationEndDate: '2026-07-01',
      })
      .expect(201);

    await agent
      .patch(`/api/v1/performance/probation/${createRes.body.id}/resolve`)
      .set(authHeader(adminToken))
      .send({ outcome: 'FAIL', notes: 'Did not meet expectations' })
      .expect(200);

    const exitCase = await prisma.employeeExitCase.findFirst({
      where: { employeeId: emp.employeeId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    expect(exitCase).toBeTruthy();
    expect(exitCase?.exitReason).toBe('performance_failure');
  });

  it('onboarding auto-creates pending ProbationReview for probation employees', async () => {
    const companies = await agent
      .get('/api/v1/organization/companies')
      .set(authHeader(adminToken))
      .expect(200);
    const coId = companies.body[0].id;

    const onboardRes = await agent
      .post('/api/v1/employees/onboard')
      .set(authHeader(adminToken))
      .send({
        firstName: 'Prob',
        lastName: 'Auto',
        startDate: '2026-06-01',
        companyId: coId,
        employmentType: 'probation',
        probationEndDate: '2026-09-01',
      })
      .expect(201);

    const review = await prisma.probationReview.findFirst({
      where: {
        employeeId: onboardRes.body.id,
        outcome: 'pending',
        deletedAt: null,
      },
    });
    expect(review).toBeTruthy();
    expect(review?.probationEndDate.toISOString().slice(0, 10)).toBe('2026-09-01');
  });
});
