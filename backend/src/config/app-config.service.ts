// ============================================================================
// config/app-config.service.ts
// Thin typed wrapper over Nest ConfigService so the rest of the app reads
// strongly-typed config instead of raw strings.
// ============================================================================

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NodeEnv } from './env.validation';

@Injectable()
export class AppConfigService {
  constructor(private readonly config: ConfigService) {}

  private get<T>(key: string): T {
    return this.config.getOrThrow<T>(key);
  }

  get nodeEnv(): NodeEnv { return this.get<NodeEnv>('NODE_ENV'); }
  get isProd(): boolean { return this.nodeEnv === NodeEnv.production; }
  get port(): number { return Number(this.get<number>('PORT')); }
  get databaseUrl(): string { return this.get<string>('DATABASE_URL'); }
  get jwtSecret(): string { return this.get<string>('JWT_SECRET'); }
  get jwtAccessTtl(): string { return this.get<string>('JWT_ACCESS_TTL'); }
  get jwtRefreshTtl(): string { return this.get<string>('JWT_REFRESH_TTL'); }
  get logLevel(): string { return this.config.get<string>('LOG_LEVEL') ?? 'info'; }
  get corsOrigins(): string[] {
    const raw = this.config.get<string>('CORS_ORIGINS') ?? '*';
    return raw === '*' ? ['*'] : raw.split(',').map((s) => s.trim());
  }
  get redisUrl(): string | undefined { return this.config.get<string>('REDIS_URL'); }
  get sentryDsn(): string | undefined { return this.config.get<string>('SENTRY_DSN'); }
  get telegramBotToken(): string | undefined { return this.config.get<string>('TELEGRAM_BOT_TOKEN'); }
  get telegramWebhookUrl(): string | undefined { return this.config.get<string>('TELEGRAM_WEBHOOK_URL'); }
  get anthropicApiKey(): string | undefined { return this.config.get<string>('ANTHROPIC_API_KEY'); }
  get anthropicModel(): string { return this.config.get<string>('ANTHROPIC_MODEL') ?? 'claude-3-5-haiku-20241022'; }
  get aiMaxTokens(): number { return Number(this.config.get<number>('AI_MAX_TOKENS') ?? 1024); }
  get openAiApiKey(): string | undefined { return this.config.get<string>('OPENAI_API_KEY'); }
  get openAiEmbeddingModel(): string {
    return this.config.get<string>('OPENAI_EMBEDDING_MODEL') ?? 'text-embedding-3-small';
  }
  get ragTopK(): number { return Number(this.config.get<number>('RAG_TOP_K') ?? 5); }
  get metricsToken(): string | undefined { return this.config.get<string>('METRICS_TOKEN'); }

  /** HR-only mode when false — MarketingOS surfaces hidden; APIs kept for compatibility. */
  get marketingEnabled(): boolean {
    return this.config.get<string>('MARKETING_ENABLED') === 'true'
      || this.config.get<boolean>('MARKETING_ENABLED') === true;
  }
}
