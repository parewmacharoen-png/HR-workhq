// ============================================================================
// test/integration/compensation-review.integration.spec.ts
// SAL-001b — salary/promotion review workflow.
// ============================================================================

import { INestApplication } from '@nestjs/common';
import { authHeader, createTestApp, login, TestAgent } from '../helpers/bootstrap';
import { createTestEmployee, grantPermissionsToRole } from '../helpers/fixtures';
import { PrismaService } from '../../src/shared/prisma/prisma.service';

describe('Compensation review SAL-001b (integration)', () => {
  let app: INestApplication;
  let agent: TestAgent;
  let prisma: PrismaService;
  let adminToken: string;

  beforeAll(async () => {
    ({ app, agent } = await createTestApp());
    prisma = app.get(PrismaService);
    await grantPermissionsToRole(prisma, 'admin', ['payroll:read', 'payroll:write']);
    adminToken = await login(agent, 'admin', 'password');
  });

  afterAll(async () => {
    await app.close();
  });

  it('runs salary review create → submit → approve → apply and updates salary history', async () => {
    const emp = await createTestEmployee(prisma, {
      withSalary: true,
      salaryAmount: 30000,
      salaryEffectiveFrom: new Date('2024-01-01'),
    });

    const createRes = await agent
      .post('/api/v1/salary-reviews')
      .set(authHeader(adminToken))
      .send({
        employeeId: emp.employeeId,
        companyId: emp.companyId,
        proposedSalary: 33000,
        effectiveDate: '2099-06-01',
        reason: 'Annual review',
        note: 'Strong performance',
      })
      .expect(201);

    expect(createRes.body.status).toBe('draft');
    expect(Number(createRes.body.currentSalary)).toBe(30000);

    await agent
      .post(`/api/v1/salary-reviews/${createRes.body.id}/submit`)
      .set(authHeader(adminToken))
      .expect(201);

    const pending = await agent
      .get('/api/v1/salary-reviews')
      .query({ companyId: emp.companyId, status: 'pending_approval' })
      .set(authHeader(adminToken))
      .expect(200);
    expect(pending.body.some((row: { id: string }) => row.id === createRes.body.id)).toBe(true);

    await agent
      .post(`/api/v1/salary-reviews/${createRes.body.id}/approve`)
      .set(authHeader(adminToken))
      .expect(201);

    const approved = await prisma.salaryReview.findUnique({ where: { id: createRes.body.id } });
    expect(approved?.status).toBe('approved');

    await agent
      .post(`/api/v1/salary-reviews/${createRes.body.id}/apply`)
      .set(authHeader(adminToken))
      .expect(201);

    const applied = await prisma.salaryReview.findUnique({ where: { id: createRes.body.id } });
    expect(applied?.status).toBe('applied');

    const band = await prisma.salaryHistory.findFirst({
      where: {
        employeeId: emp.employeeId,
        companyId: emp.companyId,
        monthlySalary: 33000,
        deletedAt: null,
      },
      orderBy: { effectiveFrom: 'desc' },
    });
    expect(band).toBeTruthy();
  });

  it('runs promotion review approve/apply and updates employee position', async () => {
    const emp = await createTestEmployee(prisma, { withSalary: true });
    await prisma.employee.update({
      where: { id: emp.employeeId },
      data: { position: 'Staff' },
    });

    const createRes = await agent
      .post('/api/v1/promotion-reviews')
      .set(authHeader(adminToken))
      .send({
        employeeId: emp.employeeId,
        companyId: emp.companyId,
        proposedPosition: 'Senior Staff',
        effectiveDate: '2099-07-01',
        reason: 'Promotion',
      })
      .expect(201);

    await agent
      .post(`/api/v1/promotion-reviews/${createRes.body.id}/submit`)
      .set(authHeader(adminToken))
      .expect(201);

    await agent
      .post(`/api/v1/promotion-reviews/${createRes.body.id}/approve`)
      .set(authHeader(adminToken))
      .expect(201);

    await agent
      .post(`/api/v1/promotion-reviews/${createRes.body.id}/apply`)
      .set(authHeader(adminToken))
      .expect(201);

    const employee = await prisma.employee.findUnique({ where: { id: emp.employeeId } });
    expect(employee?.position).toBe('Senior Staff');
  });

  it('denies employee role from creating salary review', async () => {
    const emp = await createTestEmployee(prisma, {
      roleCodes: ['employee'],
      businessRole: 'employee',
      scopeType: 'self',
      withSalary: true,
    });
    const target = await createTestEmployee(prisma, { withSalary: true, companyCode: emp.companyCode });

    const token = await login(agent, emp.username, emp.password);
    await agent
      .post('/api/v1/salary-reviews')
      .set(authHeader(token))
      .send({
        employeeId: target.employeeId,
        companyId: target.companyId,
        proposedSalary: 25000,
        effectiveDate: '2099-08-01',
      })
      .expect(403);
  });

  it('lists reviews with filters', async () => {
    const emp = await createTestEmployee(prisma, { withSalary: true });
    await agent
      .post('/api/v1/salary-reviews')
      .set(authHeader(adminToken))
      .send({
        employeeId: emp.employeeId,
        companyId: emp.companyId,
        proposedSalary: 28000,
        effectiveDate: '2099-09-01',
        reason: 'List test',
      })
      .expect(201);

    const listRes = await agent
      .get('/api/v1/compensation-reviews/list')
      .query({ companyId: emp.companyId, type: 'salary', status: 'draft' })
      .set(authHeader(adminToken))
      .expect(200);

    expect(listRes.body.total).toBeGreaterThan(0);
    expect(listRes.body.items.some((row: { employeeId: string }) => row.employeeId === emp.employeeId)).toBe(true);
  });
});
