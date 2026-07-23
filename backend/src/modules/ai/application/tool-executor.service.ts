// ============================================================================
// modules/ai/application/tool-executor.service.ts
// Executes read-only WorkHQ HR Copilot tools with RBAC + company isolation.
// Every tool invocation is written to the audit log (read-only advisory).
// ============================================================================

import { Injectable, Logger } from '@nestjs/common';
import { PermissionService } from '../../permission/application/permission.service';
import { PermissionDeniedError } from '../../permission/domain/errors/permission.errors';
import { ActorContext } from '../../../shared/kernel/actor-context';
import { CompanyAccessDeniedError } from '../../../shared/kernel/company-access.errors';
import { AuditService } from '../../../shared/audit/audit.service';
import { AiToolExecutionContext, AiToolExecutionResult, AiToolName } from '../domain/tool.types';
import {
  isSelfServiceTool,
  rejectCrossEmployeeOverride,
  sanitizeSelfServiceInput,
} from '../domain/self-service-tools';
import { AiToolContextService } from './ai-tool-context.service';
import { AiToolDataService } from './ai-tool-data.service';
import { EmployeeSelfServiceQueryService } from './employee-self-service-query.service';
import { ToolRegistry } from './tool-registry.service';
import { TelegramIdentityGuard } from '../../security/application/telegram-identity-guard.service';
import { TelegramAccessDeniedError } from '../../security/domain/errors/security.errors';
import { SalaryVisibilityService } from '../../permission/application/salary-visibility.service';
import { SALARY_SENSITIVE_AI_TOOLS } from '../../permission/domain/entities/salary-visibility-matrix';
import { SalaryAccessDeniedError } from '../../permission/domain/errors/permission.errors';

@Injectable()
export class ToolExecutor {
  private readonly logger = new Logger(ToolExecutor.name);

  constructor(
    private readonly registry: ToolRegistry,
    private readonly permissions: PermissionService,
    private readonly context: AiToolContextService,
    private readonly data: AiToolDataService,
    private readonly audit: AuditService,
    private readonly identityGuard: TelegramIdentityGuard,
    private readonly salaryVisibility: SalaryVisibilityService,
  ) {}

  async execute(
    actor: ActorContext,
    toolName: string,
    input: Record<string, unknown>,
    options?: { channel?: string },
  ): Promise<AiToolExecutionResult> {
    const def = this.registry.get(toolName);
    if (!def) {
      const result: AiToolExecutionResult = { ok: false, error: `Unknown tool: ${toolName}` };
      await this.recordAudit(actor, toolName, input, null, result);
      return result;
    }

    let ctx: AiToolExecutionContext | null = null;
    const selfService = isSelfServiceTool(toolName);
    const sanitizedInput = selfService ? sanitizeSelfServiceInput(input) : input;

    try {
      if (selfService) {
        await this.identityGuard.assertSelfServiceToolAccess(actor.userId, options?.channel);
      }

      await this.permissions.authorize(actor.userId, {
        permission: def.permission,
        companyId: actor.companyId
          ?? (typeof sanitizedInput.companyId === 'string' ? sanitizedInput.companyId : null),
        subjectUserId: selfService || def.tier === 'employee' ? actor.userId : null,
      });

      ctx = await this.context.resolve(actor, sanitizedInput);

      if (selfService) {
        const overrideError = rejectCrossEmployeeOverride(input, ctx.employeeId);
        if (overrideError) {
          const result: AiToolExecutionResult = { ok: false, error: overrideError };
          await this.recordAudit(actor, toolName, input, ctx, result);
          return result;
        }
        if (!ctx.employeeId) {
          const result: AiToolExecutionResult = {
            ok: false,
            error: 'No employee profile linked to this user',
          };
          await this.recordAudit(actor, toolName, input, ctx, result);
          return result;
        }
      }

      if (def.tier === 'leader') {
        if (!ctx.employeeId || !(await this.context.isTeamLeader(ctx.employeeId))) {
          const result: AiToolExecutionResult = {
            ok: false,
            error: 'Team leader scope required for this tool',
          };
          await this.recordAudit(actor, toolName, input, ctx, result);
          return result;
        }
      }

      if (toolName === 'get_payroll_summary') {
        const summaryCheck = await this.salaryVisibility.canViewCompanyPayrollSummary(
          actor.userId,
          ctx.companyId,
        );
        if (!summaryCheck.canView) {
          const result: AiToolExecutionResult = {
            ok: false,
            error: summaryCheck.reason,
          };
          await this.recordAudit(actor, toolName, input, ctx, result);
          return result;
        }
      } else if (
        (SALARY_SENSITIVE_AI_TOOLS as readonly string[]).includes(toolName)
        && toolName !== 'get_payroll_summary'
        && ctx.employeeId
      ) {
        const salaryCheck = await this.salaryVisibility.canViewSalary(actor.userId, ctx.employeeId);
        if (!salaryCheck.canView) {
          const result: AiToolExecutionResult = {
            ok: false,
            error: salaryCheck.reason,
          };
          await this.recordAudit(actor, toolName, input, ctx, result);
          return result;
        }
      }

      const data = await this.data.fetch(def.name as AiToolName, ctx, sanitizedInput, actor);
      const result: AiToolExecutionResult = { ok: true, data };
      await this.recordAudit(actor, toolName, input, ctx, result);
      return result;
    } catch (err: unknown) {
      if (err instanceof TelegramAccessDeniedError) {
        const result: AiToolExecutionResult = { ok: false, error: err.message };
        await this.recordAudit(actor, toolName, input, ctx, result);
        return result;
      }
      if (err instanceof PermissionDeniedError) {
        const result: AiToolExecutionResult = { ok: false, error: 'Permission denied for this tool' };
        await this.recordAudit(actor, toolName, input, ctx, result);
        return result;
      }
      if (err instanceof SalaryAccessDeniedError) {
        const result: AiToolExecutionResult = { ok: false, error: err.message };
        await this.recordAudit(actor, toolName, input, ctx, result);
        return result;
      }
      if (err instanceof CompanyAccessDeniedError) {
        const result: AiToolExecutionResult = { ok: false, error: 'Company access denied' };
        await this.recordAudit(actor, toolName, input, ctx, result);
        return result;
      }

      const message = err instanceof Error ? err.message : 'Tool execution failed';
      this.logger.warn(`Tool ${toolName} failed: ${message}`);
      const result: AiToolExecutionResult = { ok: false, error: message };
      await this.recordAudit(actor, toolName, input, ctx, result);
      return result;
    }
  }

  toToolResultContent(result: AiToolExecutionResult): string {
    return JSON.stringify(result.ok ? result.data : { error: result.error });
  }

  private async recordAudit(
    actor: ActorContext,
    toolName: string,
    input: Record<string, unknown>,
    ctx: AiToolExecutionContext | null,
    result: AiToolExecutionResult,
  ): Promise<void> {
    await this.audit.record(actor, {
      entityType: 'AiTool',
      entityId: null,
      action: result.ok ? 'tool_call' : 'tool_call_failed',
      after: {
        toolName,
        tier: this.registry.get(toolName)?.tier ?? null,
        companyId: ctx?.companyId ?? actor.companyId ?? null,
        input,
        ok: result.ok,
        error: result.error ?? null,
      },
    });
  }
}
