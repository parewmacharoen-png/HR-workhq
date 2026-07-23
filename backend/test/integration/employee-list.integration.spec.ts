// ============================================================================
// test/integration/employee-list.integration.spec.ts
// ============================================================================

import { INestApplication } from '@nestjs/common';
import { authHeader, createTestApp, login, TestAgent } from '../helpers/bootstrap';

describe('Employee list API (integration)', () => {
  let app: INestApplication;
  let agent: TestAgent;
  let adminToken: string;
  let companyId: string;

  beforeAll(async () => {
    ({ app, agent } = await createTestApp());
    adminToken = await login(agent, 'admin', 'password');
    const companies = await agent
      .get('/api/v1/organization/companies')
      .set(authHeader(adminToken))
      .expect(200);
    companyId = companies.body[0].id;
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns paginated JSON envelope even when empty', async () => {
    const res = await agent
      .get('/api/v1/employees')
      .query({ companyId: '00000000-0000-0000-0000-000000000000' })
      .set(authHeader(adminToken))
      .expect(200);

    expect(res.body).toEqual({ items: [], total: 0 });
    expect(res.text).toContain('"items"');
  });

  it('returns items array for company with employees', async () => {
    const res = await agent
      .get('/api/v1/employees')
      .query({ companyId })
      .set(authHeader(adminToken))
      .expect(200);

    expect(Array.isArray(res.body.items)).toBe(true);
    expect(typeof res.body.total).toBe('number');
  });
});
