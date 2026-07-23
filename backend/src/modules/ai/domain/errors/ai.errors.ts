// ============================================================================
// modules/ai/domain/errors/ai.errors.ts
// ============================================================================

import { ServiceUnavailableException } from '@nestjs/common';
import { NotFoundError } from '../../../../shared/kernel/domain-error';

export class AiConversationNotFoundError extends NotFoundError {
  constructor(id: string) {
    super(`AI conversation ${id} not found`);
  }
}

export class AiProviderNotConfiguredError extends ServiceUnavailableException {
  constructor() {
    super('AI provider is not configured (ANTHROPIC_API_KEY missing)');
  }
}

export class AiProviderError extends ServiceUnavailableException {
  constructor(message: string) {
    super(message);
  }
}
