// ============================================================================
// modules/knowledge/domain/services/text-chunker.service.ts
// Splits long article bodies into overlapping chunks for embedding.
// ============================================================================

import { Injectable } from '@nestjs/common';
import { RAG_CHUNK_OVERLAP, RAG_CHUNK_SIZE } from '../rag.types';

@Injectable()
export class TextChunkerService {
  chunk(
    text: string,
    chunkSize = RAG_CHUNK_SIZE,
    overlap = RAG_CHUNK_OVERLAP,
  ): string[] {
    const normalized = text.replace(/\r\n/g, '\n').trim();
    if (!normalized) return [];

    const paragraphs = normalized
      .split(/\n{2,}/)
      .map((p) => p.trim())
      .filter(Boolean);

    const chunks: string[] = [];
    let buffer = '';

    const flush = (): void => {
      const piece = buffer.trim();
      if (piece) chunks.push(piece);
      buffer = '';
    };

    for (const paragraph of paragraphs) {
      if (!buffer) {
        if (paragraph.length <= chunkSize) {
          buffer = paragraph;
        } else {
          chunks.push(...this.splitLongText(paragraph, chunkSize, overlap));
        }
        continue;
      }

      if (`${buffer}\n\n${paragraph}`.length <= chunkSize) {
        buffer = `${buffer}\n\n${paragraph}`;
        continue;
      }

      flush();
      if (paragraph.length <= chunkSize) {
        buffer = paragraph;
        continue;
      }

      chunks.push(...this.splitLongText(paragraph, chunkSize, overlap));
    }

    flush();
    return this.mergeSmallTrailing(chunks, chunkSize);
  }

  private splitLongText(text: string, chunkSize: number, overlap: number): string[] {
    const result: string[] = [];
    let start = 0;

    while (start < text.length) {
      const end = Math.min(start + chunkSize, text.length);
      result.push(text.slice(start, end).trim());
      if (end >= text.length) break;
      start = Math.max(end - overlap, start + 1);
    }

    return result.filter(Boolean);
  }

  private mergeSmallTrailing(chunks: string[], chunkSize: number): string[] {
    if (chunks.length < 2) return chunks;

    const last = chunks[chunks.length - 1]!;
    const prev = chunks[chunks.length - 2]!;
    if (last.length < chunkSize / 4 && `${prev}\n\n${last}`.length <= chunkSize) {
      return [...chunks.slice(0, -2), `${prev}\n\n${last}`];
    }
    return chunks;
  }
}
