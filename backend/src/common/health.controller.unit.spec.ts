// ============================================================================
// common/health.controller.unit.spec.ts
// ============================================================================

import { HealthController } from './health.controller';

describe('HealthController', () => {
  const prisma = {
    $queryRawUnsafe: jest.fn().mockResolvedValue([{ '?column?': 1 }]),
    outboxEvent: { count: jest.fn().mockResolvedValue(0) },
  };
  const redisHealth = { ping: jest.fn().mockResolvedValue('up') };
  const telegramHealth = {
    check: jest.fn().mockResolvedValue({
      status: 'not_configured',
      webhookConfigured: false,
    }),
  };
  const aiHealth = {
    checkConfigured: jest.fn().mockResolvedValue({
      anthropic: 'not_configured',
      openai: 'not_configured',
    }),
  };
  const healthDetails = { build: jest.fn() };
  const metrics = { contentType: 'text/plain', getMetrics: jest.fn().mockResolvedValue('# metrics') };

  const controller = new HealthController(
    prisma as never,
    redisHealth as never,
    telegramHealth as never,
    aiHealth as never,
    healthDetails as never,
    metrics as never,
  );

  it('live probe answers without touching dependencies', () => {
    jest.clearAllMocks();
    expect(controller.live().status).toBe('ok');
    expect(prisma.$queryRawUnsafe).not.toHaveBeenCalled();
    expect(prisma.outboxEvent.count).not.toHaveBeenCalled();
    expect(redisHealth.ping).not.toHaveBeenCalled();
    expect(telegramHealth.check).not.toHaveBeenCalled();
  });

  it('returns structured health status', async () => {
    const result = await controller.health();

    expect(result.status).toBe('ok');
    expect(result.checks.database).toBe('up');
    expect(result.checks.redis).toBe('up');
    expect(result.checks.ai).toEqual({
      anthropic: 'not_configured',
      openai: 'not_configured',
    });
  });

  it('marks degraded when database is down', async () => {
    (prisma.$queryRawUnsafe as jest.Mock).mockRejectedValueOnce(new Error('db down'));

    const result = await controller.health();
    expect(result.status).toBe('degraded');
    expect(result.checks.database).toBe('down');
  });
});
