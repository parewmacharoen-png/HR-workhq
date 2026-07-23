// ============================================================================
// shared/audit/audit.service.ts
// Writes immutable audit_logs rows (user / action / before / after / timestamp).
// Called by command handlers after a successful mutation. The DB enforces
// append-only via trigger; this service only ever inserts.
// ============================================================================

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ActorContext } from '../kernel/actor-context';

export interface AuditEntry {
  entityType: string;
  entityId: string | null;
  action: string; // create | update | delete | restore | approve | ...
  before?: unknown;
  after?: unknown;
  ipAddress?: string | null;
}

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async record(actor: ActorContext, entry: AuditEntry): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        actorUserId: actor.userId,
        impersonatorUserId: actor.impersonatorUserId,
        companyId: actor.companyId,
        entityType: entry.entityType,
        entityId: entry.entityId ?? undefined,
        action: entry.action,
        before: (entry.before ?? undefined) as object | undefined,
        after: (entry.after ?? undefined) as object | undefined,
        ipAddress: entry.ipAddress ?? undefined,
      },
    });
  }
}
