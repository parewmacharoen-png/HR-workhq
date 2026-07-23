// ============================================================================
// Onboarding timeline events → employeeChangeHistory
// ============================================================================

import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { ActorContext } from '../../../shared/kernel/actor-context';
import { OnboardingTimelineEventKey } from '../domain/employee-onboarding.constants';

@Injectable()
export class EmployeeOnboardingTimelineService {
  constructor(private readonly prisma: PrismaService) {}

  async recordIfNew(
    employeeId: string,
    eventKey: OnboardingTimelineEventKey,
    actorUserId: string | null,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    const idempotencyKey = metadata?.requestInstanceId
      ? `${eventKey}:${metadata.requestInstanceId}`
      : metadata?.invitationId
        ? `${eventKey}:${metadata.invitationId}`
        : null;

    if (idempotencyKey) {
      const recent = await this.prisma.employeeChangeHistory.findMany({
        where: { employeeId, changeType: 'access', fieldName: 'onboarding' },
        orderBy: { changedAt: 'desc' },
        take: 100,
      });
      const dup = recent.some((row) => {
        const json = row.afterValueJson as Record<string, unknown> | null;
        return json?.idempotencyKey === idempotencyKey;
      });
      if (dup) return;
    }

    await this.prisma.employeeChangeHistory.create({
      data: {
        id: randomUUID(),
        employeeId,
        changeType: 'access',
        fieldName: 'onboarding',
        afterValueJson: {
          event: eventKey,
          idempotencyKey,
          ...metadata,
        } as Prisma.InputJsonValue,
        changedBy: actorUserId ?? '00000000-0000-0000-0000-000000000000',
        source: 'workflow',
      },
    });
  }

  async record(
    actor: ActorContext,
    employeeId: string,
    eventKey: OnboardingTimelineEventKey,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    await this.recordIfNew(employeeId, eventKey, actor.userId, metadata);
  }
}
