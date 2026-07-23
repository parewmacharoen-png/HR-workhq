// ============================================================================
// modules/knowledge/application/kb-indexing.service.ts
// Chunks published KB articles and stores embeddings for RAG retrieval.
// ============================================================================

import { Inject, Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import {
  KNOWLEDGE_REPOSITORY,
  KnowledgeRepository,
} from '../domain/repositories/knowledge.repository';
import { TextChunkerService } from '../domain/services/text-chunker.service';
import { EmbeddingRepository } from '../infrastructure/persistence/embedding.repository';
import { OpenAiEmbeddingProvider } from '../infrastructure/openai-embedding.provider';
import { KB_ARTICLE_SOURCE_TYPE } from '../domain/rag.types';

@Injectable()
export class KbIndexingService {
  private readonly logger = new Logger(KbIndexingService.name);

  constructor(
    @Inject(KNOWLEDGE_REPOSITORY) private readonly articles: KnowledgeRepository,
    private readonly chunker: TextChunkerService,
    private readonly embeddings: EmbeddingRepository,
    private readonly openAi: OpenAiEmbeddingProvider,
  ) {}

  async indexArticle(articleId: string, actorUserId?: string): Promise<number> {
    const article = await this.articles.findById(articleId);
    if (!article || !article.isPublished || !article.body?.trim()) {
      await this.embeddings.deleteBySource(KB_ARTICLE_SOURCE_TYPE, articleId);
      return 0;
    }

    const chunks = this.chunker.chunk(article.body);
    await this.embeddings.deleteBySource(KB_ARTICLE_SOURCE_TYPE, articleId);
    if (chunks.length === 0) return 0;

    let vectors: number[][] = [];
    if (this.openAi.isConfigured()) {
      try {
        vectors = await this.openAi.embed(chunks);
      } catch {
        this.logger.warn(
          `Embedding generation failed for article ${articleId}; storing chunks without vectors`,
        );
      }
    }

    const rows = chunks.map((chunk, index) => ({
      id: randomUUID(),
      sourceType: KB_ARTICLE_SOURCE_TYPE,
      sourceId: article.id,
      chunk,
      embedding: vectors[index] ?? null,
      metadata: {
        companyId: article.companyId,
        articleId: article.id,
        title: article.title,
        slug: article.slug,
        category: article.category,
        tags: article.tags,
        chunkIndex: index,
      },
      createdBy: actorUserId ?? null,
    }));

    await this.embeddings.insertMany(rows);
    return rows.length;
  }

  async reindexCompany(companyId: string, actorUserId?: string): Promise<number> {
    const articles = await this.articles.findPublishedForCompany(companyId);
    let total = 0;
    for (const article of articles) {
      total += await this.indexArticle(article.id, actorUserId);
    }
    return total;
  }
}
