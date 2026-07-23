// ============================================================================
// modules/ai/application/ai-conversation.service.unit.spec.ts
// ============================================================================

import { AiConversationService } from './ai-conversation.service';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { AiConversationNotFoundError } from '../domain/errors/ai.errors';

describe('AiConversationService', () => {
  let prisma: {
    aiConversation: {
      findFirst: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
    aiMessage: {
      findMany: jest.Mock;
      create: jest.Mock;
    };
  };
  let service: AiConversationService;

  beforeEach(() => {
    prisma = {
      aiConversation: {
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      aiMessage: {
        findMany: jest.fn(),
        create: jest.fn(),
      },
    };
    service = new AiConversationService(prisma as unknown as PrismaService);
  });

  describe('getOrCreateConversation', () => {
    it('returns an existing conversation owned by the user', async () => {
      prisma.aiConversation.findFirst.mockResolvedValue({ id: 'conv-existing' });

      const id = await service.getOrCreateConversation('user-1', 'telegram', 'conv-existing');

      expect(id).toBe('conv-existing');
      expect(prisma.aiConversation.create).not.toHaveBeenCalled();
    });

    it('throws when the conversation id does not belong to the user', async () => {
      prisma.aiConversation.findFirst.mockResolvedValue(null);

      await expect(
        service.getOrCreateConversation('user-1', 'telegram', 'conv-missing'),
      ).rejects.toBeInstanceOf(AiConversationNotFoundError);
    });

    it('creates a conversation when no id is provided', async () => {
      prisma.aiConversation.create.mockResolvedValue({ id: 'conv-new' });

      const id = await service.getOrCreateConversation('user-1', 'web');

      expect(id).toBe('conv-new');
      expect(prisma.aiConversation.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: 'user-1',
            channel: 'web',
            createdBy: 'user-1',
          }),
        }),
      );
    });
  });

  describe('getRecentMessages', () => {
    it('returns messages in chronological order', async () => {
      prisma.aiMessage.findMany.mockResolvedValue([
        { id: 'm2', role: 'assistant', content: 'b', createdAt: new Date('2024-01-02') },
        { id: 'm1', role: 'user', content: 'a', createdAt: new Date('2024-01-01') },
      ]);

      const rows = await service.getRecentMessages('conv-1', 10);

      expect(rows.map((r) => r.id)).toEqual(['m1', 'm2']);
      expect(prisma.aiMessage.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            conversationId: 'conv-1',
            role: { in: ['user', 'assistant'] },
          },
          orderBy: { createdAt: 'desc' },
          take: 10,
        }),
      );
    });
  });

  describe('toLlmHistory', () => {
    it('maps stored roles to LLM user/assistant pairs and skips empty content', () => {
      const history = service.toLlmHistory([
        { id: '1', role: 'user', content: 'hi', createdAt: new Date() },
        { id: '2', role: 'assistant', content: 'hello', createdAt: new Date() },
        { id: '3', role: 'system', content: null, createdAt: new Date() },
      ]);

      expect(history).toEqual([
        { role: 'user', content: 'hi' },
        { role: 'assistant', content: 'hello' },
      ]);
    });
  });
});
