// ============================================================================
// modules/knowledge/domain/rag.types.ts
// ============================================================================

export const KB_ARTICLE_SOURCE_TYPE = 'kb_article';

export const RAG_DEFAULT_TOP_K = 5;
export const RAG_CHUNK_SIZE = 800;
export const RAG_CHUNK_OVERLAP = 100;

export interface RagChunk {
  id: string;
  chunk: string;
  similarity: number;
  metadata: RagChunkMetadata;
}

export interface RagChunkMetadata {
  companyId?: string | null;
  articleId: string;
  title: string;
  slug: string;
  category?: string | null;
  tags?: string[];
  chunkIndex: number;
}

export interface EmbeddingInsertRow {
  id: string;
  sourceType: string;
  sourceId: string;
  chunk: string;
  embedding: number[] | null;
  metadata: RagChunkMetadata;
  createdBy?: string | null;
}

/** Appends retrieved KB excerpts to the base advisory system prompt. */
export function buildSystemPromptWithKnowledge(
  basePrompt: string,
  chunks: RagChunk[],
): string {
  if (chunks.length === 0) return basePrompt;

  const excerpts = chunks
    .map((chunk, index) => {
      const title = chunk.metadata.title;
      const category = chunk.metadata.category ? ` (${chunk.metadata.category})` : '';
      return `[${index + 1}] ${title}${category}\n${chunk.chunk}`;
    })
    .join('\n\n');

  return `${basePrompt}

---
Company Knowledge Base (authoritative for company policy questions):
${excerpts}

When answering policy questions, prefer these excerpts over general knowledge. Cite the article title when relevant. If the excerpts do not cover the question, say the policy is not documented and suggest contacting HR.`;
}
