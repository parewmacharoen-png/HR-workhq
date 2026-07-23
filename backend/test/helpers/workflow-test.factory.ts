// ============================================================================
// test/helpers/workflow-test.factory.ts
// TEST-001c — workflow approve/reject + audit helpers
// ============================================================================

import { INestApplication } from '@nestjs/common';
import { PrismaService } from '../../src/shared/prisma/prisma.service';
import { authHeader, login, TestAgent } from './bootstrap';
import { drainOutbox } from './outbox';

export class WorkflowTestFactory {
  constructor(
    private readonly app: INestApplication,
    private readonly agent: TestAgent,
    private readonly prisma: PrismaService,
    private readonly adminToken: string,
  ) {}

  async approve(instanceId: string, token = this.adminToken): Promise<void> {
    await this.agent
      .post(`/api/v1/workflow/instances/${instanceId}/actions`)
      .set(authHeader(token))
      .send({ action: 'approve' })
      .expect(201);
    await drainOutbox(this.app);
  }

  async reject(instanceId: string, comment = 'Not approved', token = this.adminToken): Promise<void> {
    await this.agent
      .post(`/api/v1/workflow/instances/${instanceId}/actions`)
      .set(authHeader(token))
      .send({ action: 'reject', comment })
      .expect(201);
    await drainOutbox(this.app);
  }

  async expectAudit(entityType: string, entityId: string, action: string): Promise<void> {
    const row = await this.prisma.auditLog.findFirst({
      where: { entityType, entityId, action },
      orderBy: { createdAt: 'desc' },
    });
    expect(row).toBeTruthy();
  }

  async loginAs(username: string, password: string): Promise<string> {
    return login(this.agent, username, password);
  }
}
