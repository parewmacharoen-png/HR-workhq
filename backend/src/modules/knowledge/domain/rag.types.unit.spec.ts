// ============================================================================
// modules/knowledge/domain/rag.types.unit.spec.ts
// ============================================================================

import { buildSystemPromptWithKnowledge, RagChunk } from './rag.types';

describe('buildSystemPromptWithKnowledge', () => {
  const base = 'Base prompt';

  it('returns base prompt when no chunks', () => {
    expect(buildSystemPromptWithKnowledge(base, [])).toBe(base);
  });

  it('appends numbered excerpts with titles', () => {
    const chunks: RagChunk[] = [{
      id: '1',
      chunk: 'ลากิจได้ 3 วัน',
      similarity: 0.9,
      metadata: {
        articleId: 'a1',
        title: 'นโยบายลากิจ',
        slug: 'leave-personal-policy',
        category: 'leave',
        chunkIndex: 0,
      },
    }];

    const result = buildSystemPromptWithKnowledge(base, chunks);
    expect(result).toContain('Base prompt');
    expect(result).toContain('[1] นโยบายลากิจ (leave)');
    expect(result).toContain('ลากิจได้ 3 วัน');
  });
});
