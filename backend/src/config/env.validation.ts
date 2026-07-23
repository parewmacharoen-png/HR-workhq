// ============================================================================
// config/env.validation.ts
// Validates process.env at boot. Fails fast with a clear message if misconfig.
// ============================================================================

import { plainToInstance, Transform } from 'class-transformer';
import {
  IsBoolean, IsEnum, IsInt, IsOptional, IsString, Min, MinLength, validateSync,
} from 'class-validator';

export enum NodeEnv {
  development = 'development',
  test = 'test',
  staging = 'staging',
  production = 'production',
}

export class EnvVars {
  @IsEnum(NodeEnv)
  NODE_ENV: NodeEnv = NodeEnv.development;

  @Transform(({ value }) => parseInt(value, 10))
  @IsInt()
  @Min(1)
  PORT = 3000;

  @IsString()
  @MinLength(1)
  DATABASE_URL!: string;

  @IsString()
  @MinLength(16, { message: 'JWT_SECRET must be at least 16 characters' })
  JWT_SECRET!: string;

  @IsString()
  JWT_ACCESS_TTL = '15m';

  @IsString()
  JWT_REFRESH_TTL = '30d';

  @IsOptional()
  @IsString()
  LOG_LEVEL = 'info';

  @IsOptional()
  @IsString()
  CORS_ORIGINS = '*';

  @IsOptional()
  @IsString()
  REDIS_URL?: string;

  @IsOptional()
  @IsString()
  SENTRY_DSN?: string;

  @IsOptional()
  @IsString()
  TELEGRAM_BOT_TOKEN?: string;

  @IsOptional()
  @IsString()
  TELEGRAM_WEBHOOK_URL?: string;

  @IsOptional()
  @IsString()
  ANTHROPIC_API_KEY?: string;

  @IsOptional()
  @IsString()
  ANTHROPIC_MODEL = 'claude-3-5-haiku-20241022';

  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  @IsInt()
  @Min(64)
  AI_MAX_TOKENS = 1024;

  @IsOptional()
  @IsString()
  OPENAI_API_KEY?: string;

  @IsOptional()
  @IsString()
  OPENAI_EMBEDDING_MODEL = 'text-embedding-3-small';

  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  @IsInt()
  @Min(1)
  RAG_TOP_K = 5;

  @IsOptional()
  @IsString()
  METRICS_TOKEN?: string;

  /** When false, hide MarketingOS surfaces (web nav, Telegram menus, AI tools). APIs remain for compatibility. */
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  MARKETING_ENABLED = false;
}

export function validateEnv(config: Record<string, unknown>): EnvVars {
  const validated = plainToInstance(EnvVars, config, {
    enableImplicitConversion: true,
  });
  const errors = validateSync(validated, { skipMissingProperties: false });
  if (errors.length > 0) {
    const details = errors
      .map((e) => Object.values(e.constraints ?? {}).join(', '))
      .join('; ');
    throw new Error(`Invalid environment configuration: ${details}`);
  }

  if (validated.NODE_ENV === NodeEnv.production || validated.NODE_ENV === NodeEnv.staging) {
    if (validated.JWT_SECRET.length < 64) {
      throw new Error('Invalid environment configuration: JWT_SECRET must be at least 64 characters in staging/production');
    }
    if (validated.CORS_ORIGINS === '*') {
      throw new Error('Invalid environment configuration: CORS_ORIGINS must not be * in staging/production');
    }
  }

  return validated;
}
