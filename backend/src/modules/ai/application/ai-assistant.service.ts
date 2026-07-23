// ============================================================================
// modules/ai/application/ai-assistant.service.ts
// Read-only advisory chat with WorkHQ tool calling.
// ============================================================================

import { Injectable, Logger } from '@nestjs/common';
import { AiChannel } from '@prisma/client';
import { ActorContext } from '../../../shared/kernel/actor-context';
import { ClaudeProvider } from '../infrastructure/claude.provider';
import { AiConversationService } from './ai-conversation.service';
import { ToolRouter } from './tool-router.service';
import { ToolExecutor } from './tool-executor.service';
import { AiToolContextService } from './ai-tool-context.service';
import { RagRetrievalService } from '../../knowledge/application/rag-retrieval.service';
import {
  AI_ADVISORY_SYSTEM_PROMPT,
  AI_CONTEXT_MESSAGE_LIMIT,
  AI_MAX_TOOL_ROUNDS,
  LlmContentBlock,
  LlmMessage,
} from '../domain/llm.types';
import { AiProviderNotConfiguredError } from '../domain/errors/ai.errors';

export interface AiChatInput {
  message: string;
  conversationId?: string | null;
  channel?: AiChannel;
}

export interface AiChatResult {
  conversationId: string;
  reply: string;
  model: string | null;
  disclaimer: string;
}

const ADVISORY_DISCLAIMER =
  'ℹ️ คำตอบนี้เป็นข้อมูลแนะนำเท่านั้น ไม่ใช่การอนุมัติหรือคำสั่งทางการ';

/** Build Claude message list from prior history + current user message. */
export function buildChatMessages(
  history: LlmMessage[],
  userMessage: string,
  limit = AI_CONTEXT_MESSAGE_LIMIT,
): LlmMessage[] {
  const trimmed = userMessage.trim();
  const prior = history.slice(-limit);
  return [
    ...prior,
    { role: 'user' as const, content: trimmed },
  ];
}

@Injectable()
export class AiAssistantService {
  private readonly logger = new Logger(AiAssistantService.name);

  constructor(
    private readonly conversations: AiConversationService,
    private readonly claude: ClaudeProvider,
    private readonly toolRouter: ToolRouter,
    private readonly toolExecutor: ToolExecutor,
    private readonly toolContext: AiToolContextService,
    private readonly rag: RagRetrievalService,
  ) {}

  async chat(actor: ActorContext, input: AiChatInput): Promise<AiChatResult> {
    const message = input.message.trim();
    if (!message) {
      return {
        conversationId: input.conversationId ?? '',
        reply: 'กรุณาพิมพ์คำถามของคุณ',
        model: null,
        disclaimer: ADVISORY_DISCLAIMER,
      };
    }

    const channel = input.channel ?? AiChannel.web;
    const conversationId = await this.conversations.getOrCreateConversation(
      actor.userId,
      channel,
      input.conversationId,
    );

    const recent = await this.conversations.getRecentMessages(
      conversationId,
      AI_CONTEXT_MESSAGE_LIMIT,
    );
    const history = this.conversations.toLlmHistory(recent);

    await this.conversations.appendMessage({
      conversationId,
      role: 'user',
      content: message,
      actorUserId: actor.userId,
    });

    if (!this.claude.isConfigured()) {
      throw new AiProviderNotConfiguredError();
    }

    const tools = await this.toolRouter.getToolsForActor(actor);
    const companyId = actor.companyId
      ?? await this.toolContext.primaryCompanyIdForUser(actor.userId);
    const systemPrompt = await this.rag.buildAugmentedSystemPrompt(
      AI_ADVISORY_SYSTEM_PROMPT,
      companyId,
      message,
    );

    let messages: LlmMessage[] = buildChatMessages(history, message);
    let completion = await this.claude.complete({
      system: systemPrompt,
      messages,
      tools: tools.length > 0 ? tools : undefined,
    });

    let totalInputTokens = completion.inputTokens;
    let totalOutputTokens = completion.outputTokens;
    let rounds = 0;

    while (completion.stopReason === 'tool_use' && rounds < AI_MAX_TOOL_ROUNDS) {
      rounds += 1;
      const toolUses = completion.contentBlocks.filter(
        (block): block is Extract<LlmContentBlock, { type: 'tool_use' }> => block.type === 'tool_use',
      );
      if (toolUses.length === 0) break;

      messages = [
        ...messages,
        { role: 'assistant', content: completion.contentBlocks },
      ];

      const toolResults: LlmContentBlock[] = [];
      for (const toolUse of toolUses) {
        const result = await this.toolExecutor.execute(actor, toolUse.name, toolUse.input, {
          channel,
        });
        toolResults.push({
          type: 'tool_result',
          tool_use_id: toolUse.id,
          content: this.toolExecutor.toToolResultContent(result),
        });
      }

      messages = [...messages, { role: 'user', content: toolResults }];

      completion = await this.claude.complete({
        system: systemPrompt,
        messages,
        tools: tools.length > 0 ? tools : undefined,
      });
      totalInputTokens += completion.inputTokens;
      totalOutputTokens += completion.outputTokens;
    }

    if (rounds >= AI_MAX_TOOL_ROUNDS && completion.stopReason === 'tool_use') {
      this.logger.warn(`AI tool loop reached max rounds (${AI_MAX_TOOL_ROUNDS})`);
    }

    const reply = completion.content || 'ขออภัย ไม่สามารถสร้างคำตอบได้ในขณะนี้';

    await this.conversations.appendMessage({
      conversationId,
      role: 'assistant',
      content: reply,
      model: completion.model,
      tokens: totalInputTokens + totalOutputTokens,
      actorUserId: actor.userId,
    });

    return {
      conversationId,
      reply,
      model: completion.model,
      disclaimer: ADVISORY_DISCLAIMER,
    };
  }
}
