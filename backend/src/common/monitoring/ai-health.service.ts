// ============================================================================
// common/monitoring/ai-health.service.ts
// Readiness probe for optional AI providers (Claude advisory + OpenAI embeddings).
// ============================================================================

import { Injectable } from '@nestjs/common';
import { AppConfigService } from '../../config/app-config.service';

export type ProviderStatus = 'up' | 'down' | 'not_configured';

export interface AiProviderHealth {
  anthropic: ProviderStatus;
  openai: ProviderStatus;
}

@Injectable()
export class AiHealthService {
  constructor(private readonly config: AppConfigService) {}

  async check(): Promise<AiProviderHealth> {
    const [anthropic, openai] = await Promise.all([
      this.checkAnthropic(),
      this.checkOpenAi(),
    ]);
    return { anthropic, openai };
  }

  /** Lightweight check for load-balancer probes (no paid API calls). */
  async checkConfigured(): Promise<AiProviderHealth> {
    return {
      anthropic: this.config.anthropicApiKey ? 'up' : 'not_configured',
      openai: this.config.openAiApiKey ? 'up' : 'not_configured',
    };
  }

  private async checkAnthropic(): Promise<ProviderStatus> {
    const key = this.config.anthropicApiKey;
    if (!key) return 'not_configured';
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': key,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: this.config.anthropicModel,
          max_tokens: 1,
          messages: [{ role: 'user', content: 'ping' }],
        }),
        signal: AbortSignal.timeout(5_000),
      });
      // 200/400 means reachable; 401 means bad key
      if (res.status === 401) return 'down';
      return res.ok || res.status === 400 ? 'up' : 'down';
    } catch {
      return 'down';
    }
  }

  private async checkOpenAi(): Promise<ProviderStatus> {
    const key = this.config.openAiApiKey;
    if (!key) return 'not_configured';
    try {
      const res = await fetch('https://api.openai.com/v1/models', {
        headers: { Authorization: `Bearer ${key}` },
        signal: AbortSignal.timeout(5_000),
      });
      if (res.status === 401) return 'down';
      return res.ok ? 'up' : 'down';
    } catch {
      return 'down';
    }
  }
}
