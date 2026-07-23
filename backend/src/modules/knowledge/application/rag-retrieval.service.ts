// ============================================================================
// modules/knowledge/application/rag-retrieval.service.ts
// Retrieves relevant KB chunks for a user query (vector or keyword fallback).
// ============================================================================

import { Injectable, Logger } from '@nestjs/common';
import { AppConfigService } from '../../../config/app-config.service';
import { EmbeddingRepository } from '../infrastructure/persistence/embedding.repository';
import { OpenAiEmbeddingProvider } from '../infrastructure/openai-embedding.provider';
import {
  buildSystemPromptWithKnowledge,
  RagChunk,
  RAG_DEFAULT_TOP_K,
} from '../domain/rag.types';

@Injectable()
export class RagRetrievalService {
  private readonly logger = new Logger(RagRetrievalService.name);

  constructor(
    private readonly embeddings: EmbeddingRepository,
    private readonly openAi: OpenAiEmbeddingProvider,
    private readonly config: AppConfigService,
  ) {}

  async retrieve(companyId: string, query: string, topK?: number): Promise<RagChunk[]> {
    const limit = topK ?? this.config.ragTopK ?? RAG_DEFAULT_TOP_K;
    const trimmed = query.trim();
    if (!trimmed) return [];

    if (this.openAi.isConfigured()) {
      try {
        const [vector] = await this.openAi.embed([trimmed]);
        if (vector) {
          return this.embeddings.searchByVector(vector, companyId, limit);
        }
      } catch (err) {
        this.logger.warn('Vector retrieval failed; falling back to keyword search');
      }
    }

    return this.embeddings.searchByKeyword(trimmed, companyId, limit);
  }

  async buildAugmentedSystemPrompt(
    basePrompt: string,
    companyId: string | null,
    query: string,
  ): Promise<string> {
    if (!companyId) return basePrompt;

    const chunks = await this.retrieve(companyId, query);
    return buildSystemPromptWithKnowledge(basePrompt, chunks);
  }

  formatChunksForTool(chunks: RagChunk[]): unknown {
    return {
      count: chunks.length,
      results: chunks.map((chunk) => ({
        title: chunk.metadata.title,
        category: chunk.metadata.category ?? null,
        slug: chunk.metadata.slug,
        excerpt: chunk.chunk,
        similarity: chunk.similarity,
      })),
    };
  }
}
