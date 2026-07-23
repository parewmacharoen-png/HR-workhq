// ============================================================================
// modules/ai/application/tool-router.service.unit.spec.ts
// ============================================================================

import { ToolRouter } from './tool-router.service';
import { ToolRegistry } from './tool-registry.service';
import { PermissionService } from '../../permission/application/permission.service';
import { AiToolContextService } from './ai-tool-context.service';
import { AppConfigService } from '../../../config/app-config.service';
import { MARKETING_DISABLED_AI_TOOLS } from '../../../config/marketing-feature.constants';

describe('ToolRouter', () => {
  const actor = { userId: 'user-1', impersonatorUserId: null, companyId: 'co-1' };

  let permissions: jest.Mocked<Pick<PermissionService, 'can'>>;
  let context: jest.Mocked<Pick<AiToolContextService, 'employeeIdForUser' | 'isTeamLeader'>>;
  let config: { marketingEnabled: boolean };
  let router: ToolRouter;

  beforeEach(() => {
    permissions = {
      can: jest.fn(async (_userId, req) =>
        req.permission === 'leave:read'
        || req.permission === 'attendance:read'
        || req.permission === 'employee:read'
        || req.permission === 'marketing:read'
        || req.permission === 'reporting:owner'
        || req.permission === 'ai:chat'),
    };
    context = {
      employeeIdForUser: jest.fn().mockResolvedValue('emp-1'),
      isTeamLeader: jest.fn().mockResolvedValue(false),
    };
    config = { marketingEnabled: true };
    router = new ToolRouter(
      new ToolRegistry(),
      permissions as unknown as PermissionService,
      context as unknown as AiToolContextService,
      config as unknown as AppConfigService,
    );
  });

  it('includes employee tools when permission is granted', async () => {
    const tools = await router.getToolsForActor(actor);
    const names = tools.map((t) => t.name);
    expect(names).toContain('get_leave_balance');
    expect(names).toContain('get_attendance_summary');
    expect(names).toContain('get_employee_profile');
  });

  it('excludes leader tools when user is not a team leader', async () => {
    const tools = await router.getToolsForActor(actor);
    const names = tools.map((t) => t.name);
    expect(names).not.toContain('get_team_attendance');
  });

  it('includes leader tools for team leaders with permission', async () => {
    permissions.can.mockImplementation(async (_userId, req) =>
      req.permission === 'leave:read'
      || req.permission === 'attendance:read'
      || req.permission === 'performance:read');
    context.isTeamLeader.mockResolvedValue(true);
    const tools = await router.getToolsForActor(actor);
    const names = tools.map((t) => t.name);
    expect(names).toContain('get_team_attendance');
    expect(names).toContain('get_team_performance_summary');
  });

  it('excludes marketing tools when MARKETING_ENABLED=false', async () => {
    config.marketingEnabled = false;
    const tools = await router.getToolsForActor(actor);
    const names = tools.map((t) => t.name);
    for (const blocked of MARKETING_DISABLED_AI_TOOLS) {
      expect(names).not.toContain(blocked);
    }
    expect(names).toContain('get_leave_balance');
  });
});
