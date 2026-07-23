// ============================================================================
// test/helpers/bootstrap.ts
// ============================================================================

import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ThrottlerGuard } from '@nestjs/throttler';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { OutboxDispatcherService } from '../../src/common/outbox/outbox-dispatcher.service';
import { TelegramGatewayService } from '../../src/modules/telegram/infrastructure/telegram-gateway.service';
import { mockTelegramGateway } from './mock-telegram-gateway';

export type TestAgent = ReturnType<typeof request>;

export async function createTestApp(): Promise<{ app: INestApplication; agent: TestAgent }> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(TelegramGatewayService)
    .useValue(mockTelegramGateway)
    .overrideProvider(OutboxDispatcherService)
    .useValue({
      registerHandler: () => undefined,
      onApplicationBootstrap: () => undefined,
      onApplicationShutdown: () => undefined,
    })
    .overrideGuard(ThrottlerGuard)
    .useValue({ canActivate: () => true })
    .compile();

  const app = moduleRef.createNestApplication();
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
  await app.init();

  return { app, agent: request(app.getHttpServer()) };
}

export async function login(
  agent: TestAgent,
  username: string,
  password: string,
): Promise<string> {
  const res = await agent
    .post('/api/v1/auth/login')
    .send({ username, password })
    .expect(201);
  return res.body.accessToken as string;
}

export function authHeader(token: string): { Authorization: string } {
  return { Authorization: `Bearer ${token}` };
}
