// ============================================================================
// modules/ai/application/tool-executor.service.unit.spec.ts
// ============================================================================

import { ToolExecutor } from './tool-executor.service';
import { ToolRegistry } from './tool-registry.service';
import { PermissionService } from '../../permission/application/permission.service';
import { AiToolContextService } from './ai-tool-context.service';
import { AiToolDataService } from './ai-tool-data.service';
import { AuditService } from '../../../shared/audit/audit.service';
import { TelegramIdentityGuard } from '../../security/application/telegram-identity-guard.service';
import { SalaryVisibilityService } from '../../permission/application/salary-visibility.service';
import { PermissionDeniedError } from '../../permission/domain/errors/permission.errors';

describe('ToolExecutor', () => {
  const actor = { userId: 'user-1', impersonatorUserId: null, companyId: 'co-1' };

  let permissions: jest.Mocked<Pick<PermissionService, 'authorize'>>;
  let context: jest.Mocked<Pick<AiToolContextService, 'resolve' | 'isTeamLeader'>>;
  let data: jest.Mocked<Pick<AiToolDataService, 'fetch'>>;
  let audit: jest.Mocked<Pick<AuditService, 'record'>>;
  let executor: ToolExecutor;

  beforeEach(() => {
    permissions = { authorize: jest.fn().mockResolvedValue(undefined) };
    context = {
      resolve: jest.fn().mockResolvedValue({ employeeId: 'emp-1', companyId: 'co-1' }),
      isTeamLeader: jest.fn().mockResolvedValue(true),
    };
    data = {
      fetch: jest.fn().mockResolvedValue({ remaining: 5 }),
    };
    audit = {
      record: jest.fn().mockResolvedValue(undefined),
    };
    executor = new ToolExecutor(
      new ToolRegistry(),
      permissions as unknown as PermissionService,
      context as unknown as AiToolContextService,
      data as unknown as AiToolDataService,
      audit as unknown as AuditService,
      { assertSelfServiceToolAccess: jest.fn().mockResolvedValue(undefined) } as unknown as TelegramIdentityGuard,
      {
        canViewSalary: jest.fn().mockResolvedValue({ canView: true, reason: 'ok' }),
        canViewCompanyPayrollSummary: jest.fn().mockResolvedValue({ canView: true, reason: 'ok' }),
      } as unknown as SalaryVisibilityService,
    );
  });

  it('executes an employee tool when authorized and audits the call', async () => {
    const result = await executor.execute(actor, 'get_leave_balance', {});
    expect(result.ok).toBe(true);
    expect(result.data).toEqual({ remaining: 5 });
    expect(permissions.authorize).toHaveBeenCalledWith('user-1', {
      permission: 'leave:read',
      companyId: 'co-1',
      subjectUserId: 'user-1',
    });
    expect(audit.record).toHaveBeenCalledWith(actor, expect.objectContaining({
      entityType: 'AiTool',
      action: 'tool_call',
      after: expect.objectContaining({ toolName: 'get_leave_balance', ok: true }),
    }));
  });

  it('returns permission denied without calling data layer and audits failure', async () => {
    permissions.authorize.mockRejectedValue(new PermissionDeniedError('leave:read'));
    const result = await executor.execute(actor, 'get_leave_balance', {});
    expect(result.ok).toBe(false);
    expect(result.error).toContain('Permission denied');
    expect(data.fetch).not.toHaveBeenCalled();
    expect(audit.record).toHaveBeenCalledWith(actor, expect.objectContaining({
      action: 'tool_call_failed',
      after: expect.objectContaining({ ok: false }),
    }));
  });

  it('blocks leader tools when user is not a team leader', async () => {
    context.isTeamLeader.mockResolvedValue(false);
    const result = await executor.execute(actor, 'get_team_attendance', {});
    expect(result.ok).toBe(false);
    expect(result.error).toContain('Team leader scope');
    expect(data.fetch).not.toHaveBeenCalled();
    expect(audit.record).toHaveBeenCalled();
  });

  it('returns error for unknown tools', async () => {
    const result = await executor.execute(actor, 'unknown_tool', {});
    expect(result.ok).toBe(false);
    expect(result.error).toContain('Unknown tool');
    expect(audit.record).toHaveBeenCalled();
  });

  it('blocks self-service tools from querying another employee via prompt override', async () => {
    const result = await executor.execute(actor, 'get_my_leave_balance', {
      employeeId: 'emp-other',
    });
    expect(result.ok).toBe(false);
    expect(result.error).toContain('cannot query another employee');
    expect(data.fetch).not.toHaveBeenCalled();
  });

  it('executes self-service tools with sanitized input', async () => {
    data.fetch.mockResolvedValue({ annualLeaveRemaining: 8 });
    const result = await executor.execute(actor, 'get_my_leave_balance', {
      employeeId: 'emp-1',
    });
    expect(result.ok).toBe(true);
    expect(data.fetch).toHaveBeenCalledWith(
      'get_my_leave_balance',
      expect.objectContaining({ employeeId: 'emp-1' }),
      {},
      actor,
    );
  });
});
