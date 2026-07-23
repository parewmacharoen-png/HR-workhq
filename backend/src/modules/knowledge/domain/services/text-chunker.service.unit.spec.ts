// ============================================================================
// modules/knowledge/domain/services/text-chunker.service.unit.spec.ts
// ============================================================================

import { TextChunkerService } from './text-chunker.service';

describe('TextChunkerService', () => {
  const chunker = new TextChunkerService();

  it('returns empty array for blank text', () => {
    expect(chunker.chunk('   ')).toEqual([]);
  });

  it('keeps short articles as a single chunk', () => {
    const text = 'ลากิจได้ 3 วันต่อปี\n\nต้องแจ้งล่วงหน้า 1 วัน';
    expect(chunker.chunk(text)).toEqual([text]);
  });

  it('splits long paragraphs into multiple chunks', () => {
    const paragraph = 'a'.repeat(900);
    const chunks = chunker.chunk(paragraph, 400, 50);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((c) => c.length <= 400)).toBe(true);
  });
});
