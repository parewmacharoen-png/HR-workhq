// ============================================================================
// modules/ai/application/tool-router.service.ts
// Filters tools exposed to Claude based on RBAC and role scope.
// ============================================================================

import { Injectable } from '@nestjs/common';
import { PermissionService } from '../../permission/application/permission.service';
import { ActorContext } from '../../../shared/kernel/actor-context';
import { AnthropicToolDefinition } from '../domain/llm.types';
import { AiToolContextService } from './ai-tool-context.service';
import { ToolRegistry } from './tool-registry.service';

@Injectable()
export class ToolRouter {
  constructor(
    private readonly registry: ToolRegistry,
    private readonly permissions: PermissionService,
    private readonly context: AiToolContextService,
  ) {}

  async getToolsForActor(actor: ActorContext): Promise<AnthropicToolDefinition[]> {
    const employeeId = await this.context.employeeIdForUser(actor.userId);
    const isLeader = employeeId ? await this.context.isTeamLeader(employeeId) : false;

    const tools: AnthropicToolDefinition[] = [];
    for (const def of this.registry.list()) {
      const allowed = await this.permissions.can(actor.userId, { permission: def.permission });
      if (!allowed) continue;
      if (def.tier === 'leader' && !isLeader) continue;
      tools.push(this.registry.toAnthropicTool(def));
    }
    return tools;
  }
}
