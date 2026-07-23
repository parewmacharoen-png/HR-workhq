// ============================================================================
// modules/knowledge/domain/errors/knowledge.errors.ts
// ============================================================================

import { NotFoundException } from '@nestjs/common';

export class KbArticleNotFoundError extends NotFoundException {
  constructor(id: string) {
    super(`Knowledge base article not found: ${id}`);
  }
}
