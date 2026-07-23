// ============================================================================
// modules/knowledge/infrastructure/persistence/embedding.repository.ts
// Raw SQL for pgvector operations (Prisma Unsupported type).
// ============================================================================

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import {
  EmbeddingInsertRow,
  KB_ARTICLE_SOURCE_TYPE,
  RagChunk,
  RagChunkMetadata,
} from '../../domain/rag.types';

interface RawRagRow {
  id: string;
  chunk: string;
  similarity: number;
  metadata: RagChunkMetadata;
}

@Injectable()
export class EmbeddingRepository {
  constructor(private readonly prisma: PrismaService) {}

  async deleteBySource(sourceType: string, sourceId: string): Promise<void> {
    await this.prisma.$executeRawUnsafe(
      `DELETE FROM ai.ai_embeddings WHERE source_type = $1 AND source_id = $2::uuid`,
      sourceType,
      sourceId,
    );
  }

  async insertMany(rows: EmbeddingInsertRow[]): Promise<void> {
    for (const row of rows) {
      const vectorLiteral = row.embedding
        ? `[${row.embedding.join(',')}]`
        : null;

      if (vectorLiteral) {
        await this.prisma.$executeRawUnsafe(
          `INSERT INTO ai.ai_embeddings
             (id, source_type, source_id, chunk, embedding, metadata, created_by, updated_by)
           VALUES ($1::uuid, $2, $3::uuid, $4, $5::vector, $6::jsonb, $7::uuid, $7::uuid)`,
          row.id,
          row.sourceType,
          row.sourceId,
          row.chunk,
          vectorLiteral,
          JSON.stringify(row.metadata),
          row.createdBy ?? null,
        );
      } else {
        await this.prisma.$executeRawUnsafe(
          `INSERT INTO ai.ai_embeddings
             (id, source_type, source_id, chunk, embedding, metadata, created_by, updated_by)
           VALUES ($1::uuid, $2, $3::uuid, $4, NULL, $5::jsonb, $6::uuid, $6::uuid)`,
          row.id,
          row.sourceType,
          row.sourceId,
          row.chunk,
          JSON.stringify(row.metadata),
          row.createdBy ?? null,
        );
      }
    }
  }

  async searchByVector(
    embedding: number[],
    companyId: string,
    topK: number,
  ): Promise<RagChunk[]> {
    const vectorLiteral = `[${embedding.join(',')}]`;
    const rows = await this.prisma.$queryRawUnsafe<RawRagRow[]>(
      `SELECT
         e.id,
         e.chunk,
         e.metadata,
         1 - (e.embedding <=> $1::vector) AS similarity
       FROM ai.ai_embeddings e
       WHERE e.source_type = $2
         AND e.embedding IS NOT NULL
         AND (
           e.metadata->>'companyId' IS NULL
           OR e.metadata->>'companyId' = $3
         )
       ORDER BY e.embedding <=> $1::vector
       LIMIT $4`,
      vectorLiteral,
      KB_ARTICLE_SOURCE_TYPE,
      companyId,
      topK,
    );

    return rows.map((row) => ({
      id: row.id,
      chunk: row.chunk,
      similarity: Number(row.similarity),
      metadata: row.metadata,
    }));
  }

  async searchByKeyword(
    query: string,
    companyId: string,
    topK: number,
  ): Promise<RagChunk[]> {
    const pattern = `%${query.trim()}%`;
    const rows = await this.prisma.$queryRawUnsafe<RawRagRow[]>(
      `SELECT
         e.id,
         e.chunk,
         e.metadata,
         0.5 AS similarity
       FROM ai.ai_embeddings e
       WHERE e.source_type = $1
         AND (
           e.metadata->>'companyId' IS NULL
           OR e.metadata->>'companyId' = $2
         )
         AND e.chunk ILIKE $3
       ORDER BY e.updated_at DESC
       LIMIT $4`,
      KB_ARTICLE_SOURCE_TYPE,
      companyId,
      pattern,
      topK,
    );

    return rows.map((row) => ({
      id: row.id,
      chunk: row.chunk,
      similarity: Number(row.similarity),
      metadata: row.metadata,
    }));
  }
}
