// ============================================================================
// modules/ai/application/tool-registry.service.unit.spec.ts
// ============================================================================

import { ToolRegistry } from './tool-registry.service';
import { AI_TOOL_DEFINITIONS } from '../domain/tools/tool-definitions';

describe('ToolRegistry', () => {
  const registry = new ToolRegistry();

  it('registers all defined HR Copilot tools', () => {
    expect(registry.list()).toHaveLength(AI_TOOL_DEFINITIONS.length);
    expect(AI_TOOL_DEFINITIONS).toHaveLength(51);
  });

  it('returns a tool by name', () => {
    const tool = registry.get('get_leave_balance');
    expect(tool?.permission).toBe('leave:read');
    expect(tool?.tier).toBe('employee');
  });

  it('maps to Anthropic tool format', () => {
    const tool = registry.get('get_attendance_summary');
    expect(registry.toAnthropicTool(tool!)).toEqual({
      name: 'get_attendance_summary',
      description: tool!.description,
      input_schema: tool!.inputSchema,
    });
  });
});
