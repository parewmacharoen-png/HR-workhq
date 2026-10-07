// ============================================================================
// main.ts
// Application entrypoint. Boots Nest, installs the global validation pipe,
// CORS, security headers, graceful shutdown, and starts the HTTP server.
// (Global guards, interceptor, and filter are bound in AppModule via APP_*.)
// ============================================================================

import './common/monitoring/sentry.instrument';

import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe, VersioningType } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import * as Sentry from '@sentry/nestjs';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { AppConfigService } from './config/app-config.service';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  const config = app.get(AppConfigService);
  const logger = new Logger('Bootstrap');

  // The API always sits behind one reverse proxy (Caddy on the VPS, Render's router).
  // Without this, req.ip is the proxy's address and every user shares one throttle bucket.
  app.set('trust proxy', Number(process.env.TRUST_PROXY_HOPS ?? 1));

  app.use(helmet());

  app.enableCors({
    origin: config.corsOrigins.includes('*') ? true : config.corsOrigins,
    credentials: true,
  });

  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  app.enableShutdownHooks();

  await app.listen(config.port);
  logger.log(`WorkHQ API listening on :${config.port} (${config.nodeEnv})`);
}

process.on('unhandledRejection', (reason) => {
  Sentry.captureException(reason);
});

process.on('uncaughtException', (err) => {
  Sentry.captureException(err);
});

bootstrap().catch((err) => {
  Sentry.captureException(err);
  // eslint-disable-next-line no-console
  console.error('Fatal bootstrap error', err);
  process.exit(1);
});
