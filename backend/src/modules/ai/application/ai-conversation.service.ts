// ============================================================================
// modules/ai/application/ai-conversation.service.ts
// Persists AI conversations and messages in ai_conversations / ai_messages.
// ============================================================================

import { Injectable } from '@nestjs/common';
import { AiChannel, AiMessageRole } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { AI_CONTEXT_MESSAGE_LIMIT, LlmMessage } from '../domain/llm.types';
import { AiConversationNotFoundError } from '../domain/errors/ai.errors';

export interface StoredAiMessage {
  id: string;
  role: AiMessageRole;
  content: string | null;
  createdAt: Date;
}

@Injectable()
export class AiConversationService {
  constructor(private readonly prisma: PrismaService) {}

  async getOrCreateConversation(
    userId: string,
    channel: AiChannel,
    conversationId?: string | null,
  ): Promise<string> {
    if (conversationId) {
      const existing = await this.prisma.aiConversation.findFirst({
        where: { id: conversationId, userId, deletedAt: null },
        select: { id: true },
      });
      if (!existing) throw new AiConversationNotFoundError(conversationId);
      return existing.id;
    }

    const created = await this.prisma.aiConversation.create({
      data: {
        id: randomUUID(),
        userId,
        channel,
        createdBy: userId,
        updatedBy: userId,
      },
      select: { id: true },
    });
    return created.id;
  }

  async getRecentMessages(
    conversationId: string,
    limit = AI_CONTEXT_MESSAGE_LIMIT,
  ): Promise<StoredAiMessage[]> {
    const rows = await this.prisma.aiMessage.findMany({
      where: {
        conversationId,
        role: { in: ['user', 'assistant'] },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
        role: true,
        content: true,
        createdAt: true,
      },
    });
    return rows.reverse();
  }

  async appendMessage(input: {
    conversationId: string;
    role: AiMessageRole;
    content: string;
    model?: string | null;
    tokens?: number | null;
    actorUserId: string;
  }): Promise<StoredAiMessage> {
    const row = await this.prisma.aiMessage.create({
      data: {
        id: randomUUID(),
        conversationId: input.conversationId,
        role: input.role,
        content: input.content,
        model: input.model ?? undefined,
        tokens: input.tokens ?? undefined,
      },
      select: {
        id: true,
        role: true,
        content: true,
        createdAt: true,
      },
    });

    await this.prisma.aiConversation.update({
      where: { id: input.conversationId },
      data: { updatedBy: input.actorUserId },
    });

    return row;
  }

  /** Map stored DB messages to LLM history (excludes the latest user turn when building context). */
  toLlmHistory(messages: StoredAiMessage[]): LlmMessage[] {
    return messages
      .filter((m) => m.content)
      .map((m) => ({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: m.content!,
      }));
  }
}
