// ============================================================================
// modules/knowledge/application/rag-retrieval.service.unit.spec.ts
// ============================================================================

import { RagRetrievalService } from './rag-retrieval.service';
import { EmbeddingRepository } from '../infrastructure/persistence/embedding.repository';
import { OpenAiEmbeddingProvider } from '../infrastructure/openai-embedding.provider';
import { AppConfigService } from '../../../config/app-config.service';

describe('RagRetrievalService', () => {
  let embeddings: jest.Mocked<Pick<EmbeddingRepository, 'searchByVector' | 'searchByKeyword'>>;
  let openAi: jest.Mocked<Pick<OpenAiEmbeddingProvider, 'isConfigured' | 'embed'>>;
  let config: Pick<AppConfigService, 'ragTopK'>;
  let service: RagRetrievalService;

  beforeEach(() => {
    embeddings = {
      searchByVector: jest.fn().mockResolvedValue([]),
      searchByKeyword: jest.fn().mockResolvedValue([
        {
          id: 'c1',
          chunk: 'ลากิจได้ 3 วัน',
          similarity: 0.5,
          metadata: {
            articleId: 'a1',
            title: 'นโยบายลากิจ',
            slug: 'leave-personal-policy',
            chunkIndex: 0,
          },
        },
      ]),
    };
    openAi = {
      isConfigured: jest.fn().mockReturnValue(false),
      embed: jest.fn(),
    };
    config = { ragTopK: 5 };
    service = new RagRetrievalService(
      embeddings as unknown as EmbeddingRepository,
      openAi as unknown as OpenAiEmbeddingProvider,
      config as AppConfigService,
    );
  });

  it('uses keyword fallback when OpenAI is not configured', async () => {
    const chunks = await service.retrieve('co-1', 'ลากิจได้กี่วัน');
    expect(openAi.embed).not.toHaveBeenCalled();
    expect(embeddings.searchByKeyword).toHaveBeenCalledWith('ลากิจได้กี่วัน', 'co-1', 5);
    expect(chunks[0]?.chunk).toContain('ลากิจ');
  });

  it('uses vector search when OpenAI is configured', async () => {
    openAi.isConfigured.mockReturnValue(true);
    openAi.embed.mockResolvedValue([[0.1, 0.2]]);
    await service.retrieve('co-1', 'OT คิดยังไง');
    expect(openAi.embed).toHaveBeenCalledWith(['OT คิดยังไง']);
    expect(embeddings.searchByVector).toHaveBeenCalledWith([0.1, 0.2], 'co-1', 5);
  });

  it('augments system prompt with retrieved chunks', async () => {
    const prompt = await service.buildAugmentedSystemPrompt('Base', 'co-1', 'ลากิจ');
    expect(prompt).toContain('Base');
    expect(prompt).toContain('นโยบายลากิจ');
  });
});
