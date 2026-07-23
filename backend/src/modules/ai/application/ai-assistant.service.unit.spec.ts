// ============================================================================
// modules/ai/application/ai-assistant.service.unit.spec.ts
// ============================================================================

import { AiChannel } from '@prisma/client';
import {
  AiAssistantService,
  buildChatMessages,
} from './ai-assistant.service';
import { AiConversationService } from './ai-conversation.service';
import { ClaudeProvider } from '../infrastructure/claude.provider';
import { ToolRouter } from './tool-router.service';
import { ToolExecutor } from './tool-executor.service';
import { AiToolContextService } from './ai-tool-context.service';
import { RagRetrievalService } from '../../knowledge/application/rag-retrieval.service';
import {
  AI_ADVISORY_SYSTEM_PROMPT,
  AI_CONTEXT_MESSAGE_LIMIT,
} from '../domain/llm.types';
import { AiProviderNotConfiguredError } from '../domain/errors/ai.errors';

describe('buildChatMessages', () => {
  it('includes only the last N history turns plus the current user message', () => {
    const history = Array.from({ length: 12 }, (_, i) => ({
      role: i % 2 === 0 ? 'user' as const : 'assistant' as const,
      content: `msg-${i}`,
    }));

    const messages = buildChatMessages(history, 'latest question', 10);

    expect(messages).toHaveLength(11);
    expect(messages[0]?.content).toBe('msg-2');
    expect(messages[messages.length - 1]).toEqual({
      role: 'user',
      content: 'latest question',
    });
  });

  it('trims the current user message', () => {
    expect(buildChatMessages([], '  hello  ')).toEqual([
      { role: 'user', content: 'hello' },
    ]);
  });
});

describe('AiAssistantService', () => {
  const actor = { userId: 'user-1', impersonatorUserId: null, companyId: 'co-1' };

  let conversations: jest.Mocked<Pick<
    AiConversationService,
    'getOrCreateConversation' | 'getRecentMessages' | 'appendMessage' | 'toLlmHistory'
  >>;
  let claude: jest.Mocked<Pick<ClaudeProvider, 'isConfigured' | 'complete'>>;
  let toolRouter: jest.Mocked<Pick<ToolRouter, 'getToolsForActor'>>;
  let toolExecutor: jest.Mocked<Pick<ToolExecutor, 'execute' | 'toToolResultContent'>>;
  let toolContext: jest.Mocked<Pick<AiToolContextService, 'primaryCompanyIdForUser'>>;
  let rag: jest.Mocked<Pick<RagRetrievalService, 'buildAugmentedSystemPrompt'>>;
  let service: AiAssistantService;

  beforeEach(() => {
    conversations = {
      getOrCreateConversation: jest.fn().mockResolvedValue('conv-1'),
      getRecentMessages: jest.fn().mockResolvedValue([
        { id: 'm1', role: 'user', content: 'prior', createdAt: new Date() },
        { id: 'm2', role: 'assistant', content: 'answer', createdAt: new Date() },
      ]),
      appendMessage: jest.fn().mockResolvedValue({
        id: 'saved',
        role: 'assistant',
        content: 'ok',
        createdAt: new Date(),
      }),
      toLlmHistory: jest.fn().mockReturnValue([
        { role: 'user', content: 'prior' },
        { role: 'assistant', content: 'answer' },
      ]),
    };
    claude = {
      isConfigured: jest.fn().mockReturnValue(true),
      complete: jest.fn().mockResolvedValue({
        content: 'AI reply',
        contentBlocks: [{ type: 'text', text: 'AI reply' }],
        stopReason: 'end_turn',
        model: 'claude-test',
        inputTokens: 10,
        outputTokens: 5,
      }),
    };
    toolRouter = {
      getToolsForActor: jest.fn().mockResolvedValue([
        { name: 'get_leave_balance', description: 'x', input_schema: { type: 'object', properties: {} } },
      ]),
    };
    toolExecutor = {
      execute: jest.fn(),
      toToolResultContent: jest.fn().mockReturnValue('{"remaining":5}'),
    };
    toolContext = {
      primaryCompanyIdForUser: jest.fn().mockResolvedValue('co-1'),
    };
    rag = {
      buildAugmentedSystemPrompt: jest.fn().mockImplementation(
        async (base: string) => base,
      ),
    };
    service = new AiAssistantService(
      conversations as unknown as AiConversationService,
      claude as unknown as ClaudeProvider,
      toolRouter as unknown as ToolRouter,
      toolExecutor as unknown as ToolExecutor,
      toolContext as unknown as AiToolContextService,
      rag as unknown as RagRetrievalService,
    );
  });

  it('returns a prompt when the message is blank', async () => {
    const result = await service.chat(actor, { message: '   ' });
    expect(result.reply).toContain('กรุณาพิมพ์');
    expect(claude.complete).not.toHaveBeenCalled();
  });

  it('persists user and assistant messages and calls Claude with tools', async () => {
    const result = await service.chat(actor, {
      message: 'วันลาผมเหลือเท่าไร',
      channel: AiChannel.web,
    });

    expect(toolRouter.getToolsForActor).toHaveBeenCalledWith(actor);
    expect(rag.buildAugmentedSystemPrompt).toHaveBeenCalledWith(
      AI_ADVISORY_SYSTEM_PROMPT,
      'co-1',
      'วันลาผมเหลือเท่าไร',
    );
    expect(claude.complete).toHaveBeenCalledWith({
      system: AI_ADVISORY_SYSTEM_PROMPT,
      messages: buildChatMessages(
        [
          { role: 'user', content: 'prior' },
          { role: 'assistant', content: 'answer' },
        ],
        'วันลาผมเหลือเท่าไร',
      ),
      tools: [{ name: 'get_leave_balance', description: 'x', input_schema: { type: 'object', properties: {} } }],
    });
    expect(result).toMatchObject({
      conversationId: 'conv-1',
      reply: 'AI reply',
      model: 'claude-test',
    });
  });

  it('executes tools when Claude requests tool_use', async () => {
    claude.complete
      .mockResolvedValueOnce({
        content: '',
        contentBlocks: [{
          type: 'tool_use',
          id: 'tool-1',
          name: 'get_leave_balance',
          input: {},
        }],
        stopReason: 'tool_use',
        model: 'claude-test',
        inputTokens: 10,
        outputTokens: 5,
      })
      .mockResolvedValueOnce({
        content: 'คุณเหลือวันลา 5 วัน',
        contentBlocks: [{ type: 'text', text: 'คุณเหลือวันลา 5 วัน' }],
        stopReason: 'end_turn',
        model: 'claude-test',
        inputTokens: 8,
        outputTokens: 4,
      });

    toolExecutor.execute.mockResolvedValue({ ok: true, data: { remaining: 5 } });

    const result = await service.chat(actor, { message: 'วันลาผมเหลือเท่าไร' });

    expect(toolExecutor.execute).toHaveBeenCalledWith(actor, 'get_leave_balance', {}, { channel: 'web' });
    expect(result.reply).toBe('คุณเหลือวันลา 5 วัน');
    expect(claude.complete).toHaveBeenCalledTimes(2);
  });

  it('throws when the provider is not configured', async () => {
    claude.isConfigured.mockReturnValue(false);
    await expect(
      service.chat(actor, { message: 'hello' }),
    ).rejects.toBeInstanceOf(AiProviderNotConfiguredError);
  });
});
