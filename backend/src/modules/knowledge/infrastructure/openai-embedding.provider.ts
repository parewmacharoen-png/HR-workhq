// ============================================================================
// modules/knowledge/infrastructure/openai-embedding.provider.ts
// ============================================================================

import { Injectable, Logger } from '@nestjs/common';
import { AppConfigService } from '../../../config/app-config.service';

interface OpenAiEmbeddingResponse {
  data: Array<{ embedding: number[]; index: number }>;
}

@Injectable()
export class OpenAiEmbeddingProvider {
  private readonly logger = new Logger(OpenAiEmbeddingProvider.name);

  constructor(private readonly config: AppConfigService) {}

  isConfigured(): boolean {
    return !!this.config.openAiApiKey;
  }

  async embed(texts: string[]): Promise<number[][]> {
    if (!this.isConfigured()) {
      throw new Error('OpenAI embedding provider is not configured');
    }
    if (texts.length === 0) return [];

    const apiKey = this.config.openAiApiKey!;
    const model = this.config.openAiEmbeddingModel;

    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ model, input: texts }),
    });

    if (!response.ok) {
      const body = await response.text();
      this.logger.error(`OpenAI embeddings failed (${response.status}): ${body}`);
      throw new Error(`OpenAI embeddings request failed (${response.status})`);
    }

    const payload = await response.json() as OpenAiEmbeddingResponse;
    return payload.data
      .sort((a, b) => a.index - b.index)
      .map((item) => item.embedding);
  }
}
