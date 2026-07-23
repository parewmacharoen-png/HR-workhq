// ============================================================================
// test/integration/employee-telegram-invite.integration.spec.ts
// EMP-001b/c invite link + self-onboarding
// ============================================================================

import { INestApplication } from '@nestjs/common';
import { createHash } from 'crypto';
import { PrismaService } from '../../src/shared/prisma/prisma.service';
import { authHeader, createTestApp, login, TestAgent } from '../helpers/bootstrap';
import { createTestEmployee, grantPermissionsToRole } from '../helpers/fixtures';
import { EmployeeTelegramInviteService } from '../../src/modules/employee-onboarding/application/employee-telegram-invite.service';
import { sanitizeSubmittedData } from '../../src/modules/employee-onboarding/domain/self-onboarding.types';

const describeIfDb = process.env.DATABASE_URL ? describe : describe.skip;

describeIfDb('Employee Telegram Invite + Self-Onboarding', () => {
  let app: INestApplication;
  let agent: TestAgent;
  let prisma: PrismaService;
  let adminToken: string;
  let inviteService: EmployeeTelegramInviteService;

  beforeAll(async () => {
    ({ app, agent } = await createTestApp());
    prisma = app.get(PrismaService);
    inviteService = app.get(EmployeeTelegramInviteService);
    await grantPermissionsToRole(prisma, 'owner', ['employee:read', 'employee:write', 'security:write']);
    adminToken = await login(agent, 'admin', 'password');
  });

  afterAll(async () => {
    await app.close();
  });

  it('creates invite via API and stores hash only', async () => {
    const emp = await createTestEmployee(prisma, { companyCode: 'SB' });
    const res = await agent
      .post(`/api/v1/employees/${emp.employeeId}/telegram-invite`)
      .set(authHeader(adminToken))
      .send({ companyId: emp.companyId })
      .expect(201);

    expect(res.body.inviteLink).toContain('invite_');
    expect(res.body.inviteId).toBeTruthy();

    const invite = await prisma.employeeTelegramInvite.findUnique({ where: { id: res.body.inviteId } });
    expect(invite?.tokenHash).toBeTruthy();
    expect(invite?.tokenPreview).toHaveLength(8);
    expect(invite?.status).toBe('pending');
  });

  it('rejects HR-only fields in submitted data sanitizer', () => {
    const sanitized = sanitizeSubmittedData({
      fullName: 'Test User',
      phone: '0812345678',
      salary: '99999',
      companyId: 'hack',
      position: 'CEO',
    });
    expect(sanitized.fullName).toBe('Test User');
    expect((sanitized as Record<string, unknown>).salary).toBeUndefined();
    expect((sanitized as Record<string, unknown>).companyId).toBeUndefined();
  });

  it('lists self-onboarding submissions', async () => {
    const emp = await createTestEmployee(prisma, { companyCode: 'SB' });
    await prisma.employeeSelfOnboardingSubmission.create({
      data: {
        employeeId: emp.employeeId,
        companyId: emp.companyId,
        status: 'submitted',
        submittedDataJson: { fullName: 'Integration Test', phone: '0899999999' },
        submittedAt: new Date(),
      },
    });

    const res = await agent
      .get('/api/v1/self-onboarding/submissions')
      .query({ companyId: emp.companyId, status: 'submitted' })
      .set(authHeader(adminToken))
      .expect(200);

    expect(res.body.total).toBeGreaterThan(0);
  });

  it('token hash matches consume lookup pattern', () => {
    const raw = 'test-token-raw-value';
    const hash = createHash('sha256').update(raw).digest('hex');
    expect(inviteService.hashToken(raw)).toBe(hash);
  });
});
