// ============================================================================
// modules/knowledge/knowledge.module.ts
// ============================================================================

import { Module } from '@nestjs/common';
import { AppConfigModule } from '../../config/config.module';
import { KnowledgeController } from './interface/http/knowledge.controller';
import { KnowledgeBaseService } from './application/knowledge-base.service';
import { KbIndexingService } from './application/kb-indexing.service';
import { RagRetrievalService } from './application/rag-retrieval.service';
import { KNOWLEDGE_REPOSITORY } from './domain/repositories/knowledge.repository';
import { PrismaKnowledgeRepository } from './infrastructure/persistence/knowledge.prisma.repository';
import { EmbeddingRepository } from './infrastructure/persistence/embedding.repository';
import { OpenAiEmbeddingProvider } from './infrastructure/openai-embedding.provider';
import { TextChunkerService } from './domain/services/text-chunker.service';

@Module({
  imports: [AppConfigModule],
  controllers: [KnowledgeController],
  providers: [
    KnowledgeBaseService,
    KbIndexingService,
    RagRetrievalService,
    TextChunkerService,
    EmbeddingRepository,
    OpenAiEmbeddingProvider,
    { provide: KNOWLEDGE_REPOSITORY, useClass: PrismaKnowledgeRepository },
  ],
  exports: [KnowledgeBaseService, KbIndexingService, RagRetrievalService],
})
export class KnowledgeModule {}
