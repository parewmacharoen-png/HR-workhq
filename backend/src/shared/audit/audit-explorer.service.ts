// ============================================================================
// shared/audit/audit-explorer.service.ts
// AUDIT-002 — searchable audit log explorer
// ============================================================================

import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ActorContext } from '../kernel/actor-context';
import {
  BUSINESS_PERMISSION_REPOSITORY,
  BusinessPermissionRepository,
} from '../../modules/permission/domain/repositories/business-permission.repository';
import { Inject } from '@nestjs/common';

export interface AuditSearchQuery {
  companyId?: string;
  actorUserId?: string;
  entityType?: string;
  entityId?: string;
  action?: string;
  module?: string;
  employeeId?: string;
  from?: string;
  to?: string;
  limit?: number;
}

const SALARY_ENTITY_TYPES = new Set(['salary_review', 'SalaryHistory', 'payroll_item', 'Payslip']);

@Injectable()
export class AuditExplorerService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(BUSINESS_PERMISSION_REPOSITORY) private readonly permissions: BusinessPermissionRepository,
  ) {}

  async search(actor: ActorContext, query: AuditSearchQuery) {
    const access = await this.permissions.findUserAccess(actor.userId);
    const role = access?.businessRole ?? 'employee';
    const canViewAll = role === 'owner';
    const canViewCompany = role === 'secretary' || role === 'owner' || role === 'big_leader';

    if (!canViewCompany && !canViewAll) {
      query.actorUserId = actor.userId;
    }

    if (!canViewAll && query.companyId && actor.companyId && query.companyId !== actor.companyId) {
      throw new Error('Cross-company audit access denied');
    }

    const where: Prisma.AuditLogWhereInput = {
      ...(query.companyId ? { companyId: query.companyId } : {}),
      ...(query.actorUserId ? { actorUserId: query.actorUserId } : {}),
      ...(query.entityType ? { entityType: query.entityType } : {}),
      ...(query.entityId ? { entityId: query.entityId } : {}),
      ...(query.action ? { action: query.action } : {}),
      ...(query.from || query.to
        ? {
            occurredAt: {
              ...(query.from ? { gte: new Date(query.from) } : {}),
              ...(query.to ? { lte: new Date(query.to) } : {}),
            },
          }
        : {}),
    };

    if (query.module) {
      where.entityType = { contains: query.module, mode: 'insensitive' };
    }

    const rows = await this.prisma.auditLog.findMany({
      where,
      orderBy: { occurredAt: 'desc' },
      take: Math.min(query.limit ?? 100, 500),
    });

    const redactSalary = role === 'employee' || role === 'sub_leader';

    return rows.map((row) => ({
      id: row.id.toString(),
      actorUserId: row.actorUserId,
      companyId: row.companyId,
      entityType: row.entityType,
      entityId: row.entityId,
      action: row.action,
      occurredAt: row.occurredAt.toISOString(),
      before: redactSalary && SALARY_ENTITY_TYPES.has(row.entityType)
        ? this.redact(row.before)
        : row.before,
      after: redactSalary && SALARY_ENTITY_TYPES.has(row.entityType)
        ? this.redact(row.after)
        : row.after,
      suspicious: this.isSuspicious(row.action),
    }));
  }

  async exportCsv(actor: ActorContext, query: AuditSearchQuery): Promise<string> {
    const rows = await this.search(actor, { ...query, limit: 1000 });
    const header = 'occurredAt,entityType,entityId,action,actorUserId,companyId';
    const lines = rows.map((r) =>
      [r.occurredAt, r.entityType, r.entityId ?? '', r.action, r.actorUserId ?? '', r.companyId ?? ''].join(','),
    );
    return [header, ...lines].join('\n');
  }

  private redact(value: unknown): unknown {
    if (!value || typeof value !== 'object') return '[REDACTED]';
    return { redacted: true, reason: 'salary_visibility' };
  }

  private isSuspicious(action: string): boolean {
    return /delete|revoke|force|override|cross_company/i.test(action);
  }
}
