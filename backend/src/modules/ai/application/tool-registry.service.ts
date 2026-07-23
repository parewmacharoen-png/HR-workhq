// ============================================================================
// modules/ai/application/tool-registry.service.ts
// ============================================================================

import { Injectable } from '@nestjs/common';
import { AI_TOOL_DEFINITIONS } from '../domain/tools/tool-definitions';
import {
  AiToolDefinition,
  AiToolName,
} from '../domain/tool.types';
import { AnthropicToolDefinition } from '../domain/llm.types';

@Injectable()
export class ToolRegistry {
  private readonly byName = new Map<AiToolName, AiToolDefinition>(
    AI_TOOL_DEFINITIONS.map((tool) => [tool.name, tool]),
  );

  list(): AiToolDefinition[] {
    return [...this.byName.values()];
  }

  get(name: string): AiToolDefinition | undefined {
    return this.byName.get(name as AiToolName);
  }

  toAnthropicTool(def: AiToolDefinition): AnthropicToolDefinition {
    return {
      name: def.name,
      description: def.description,
      input_schema: def.inputSchema,
    };
  }
}
