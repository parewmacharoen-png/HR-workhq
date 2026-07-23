// ============================================================================
// test/integration/hr-product-boundary.integration.spec.ts
// ============================================================================

import { INestApplication } from '@nestjs/common';
import { ToolRouter } from '../../src/modules/ai/application/tool-router.service';
import { authHeader, createTestApp, login, TestAgent } from '../helpers/bootstrap';
import {
  isMarketingMenuState,
  isMarketingOwnerCallback,
  MARKETING_DISABLED_AI_TOOLS,
} from '../../src/config/marketing-feature.constants';

describe('HR product boundary (integration)', () => {
  let app: INestApplication;
  let agent: TestAgent;
  let router: ToolRouter;
  let adminToken: string;

  beforeAll(async () => {
    delete process.env.MARKETING_ENABLED;
    ({ app, agent } = await createTestApp());
    router = app.get(ToolRouter);
    adminToken = await login(agent, 'admin', 'password');
  });

  afterAll(async () => {
    await app.close();
  });

  it('does not register marketing AI tools when MARKETING_ENABLED=false', async () => {
    const me = await agent
      .get('/api/v1/auth/me')
      .set(authHeader(adminToken))
      .expect(200);

    const tools = await router.getToolsForActor({
      userId: me.body.id as string,
      impersonatorUserId: null,
      companyId: me.body.companies?.[0]?.id ?? null,
    });
    const names = tools.map((t) => t.name);

    for (const blocked of MARKETING_DISABLED_AI_TOOLS) {
      expect(names).not.toContain(blocked);
    }
    expect(names).toContain('search_company_knowledge');
  });

  it('telegram marketing menu states are identifiable for HR filtering', () => {
    expect(isMarketingMenuState('marketing:submit')).toBe(true);
    expect(isMarketingMenuState('marketing:my_kpi')).toBe(true);
    expect(isMarketingMenuState('attendance:confirming_checkin')).toBe(false);
    expect(isMarketingOwnerCallback('owner:commission')).toBe(true);
    expect(isMarketingOwnerCallback('owner:company')).toBe(false);
  });
});
