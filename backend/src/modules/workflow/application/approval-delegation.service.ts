// ============================================================================
// modules/workflow/application/approval-delegation.service.ts
// Temporary approval delegation — delegate acts when delegator is approver.
// ============================================================================

import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { AuditService } from '../../../shared/audit/audit.service';
import { DateProvider } from '../../../shared/time/date.provider';
import { ActorContext } from '../../../shared/kernel/actor-context';
import { WorkflowEntityType } from '../domain/entities/workflow.entity';
import {
  DelegateNotFoundError,
  DelegateSelfNotAllowedError,
  DelegationForbiddenError,
  DelegationNotFoundError,
  InvalidDelegationPeriodError,
} from '../domain/errors/delegation.errors';

export interface DelegationResponse {
  id: string;
  delegatorUserId: string;
  delegatorName: string;
  delegateUserId: string;
  delegateName: string;
  companyId: string | null;
  entityType: WorkflowEntityType | null;
  reason: string | null;
  validFrom: string;
  validTo: string;
  isActive: boolean;
}

@Injectable()
export class ApprovalDelegationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly dates: DateProvider,
  ) {}

  async listForUser(userId: string): Promise<DelegationResponse[]> {
    const now = this.dates.now();
    const rows = await this.prisma.approvalDelegation.findMany({
      where: {
        deletedAt: null,
        OR: [{ delegatorUserId: userId }, { delegateUserId: userId }],
      },
      orderBy: { validFrom: 'desc' },
      include: {
        delegator: { include: { employee: { select: { firstName: true, lastName: true } } } },
        delegate: { include: { employee: { select: { firstName: true, lastName: true } } } },
      },
    });
    return rows.map((r) => this.toResponse(r, now));
  }

  async create(actor: ActorContext, input: {
    delegateUserId: string;
    companyId?: string | null;
    entityType?: WorkflowEntityType | null;
    validFrom: Date;
    validTo: Date;
    reason?: string | null;
  }): Promise<DelegationResponse> {
    if (input.delegateUserId === actor.userId) {
      throw new DelegateSelfNotAllowedError();
    }
    if (input.validTo <= input.validFrom) {
      throw new InvalidDelegationPeriodError();
    }

    const delegate = await this.prisma.user.findFirst({
      where: { id: input.delegateUserId, deletedAt: null, isActive: true },
    });
    if (!delegate) {
      throw new DelegateNotFoundError();
    }

    const row = await this.prisma.approvalDelegation.create({
      data: {
        id: randomUUID(),
        delegatorUserId: actor.userId,
        delegateUserId: input.delegateUserId,
        companyId: input.companyId ?? null,
        entityType: input.entityType ?? null,
        reason: input.reason ?? null,
        validFrom: input.validFrom,
        validTo: input.validTo,
        isActive: true,
        createdBy: actor.userId,
      },
      include: {
        delegator: { include: { employee: { select: { firstName: true, lastName: true } } } },
        delegate: { include: { employee: { select: { firstName: true, lastName: true } } } },
      },
    });

    await this.audit.record(actor, {
      entityType: 'ApprovalDelegation',
      entityId: row.id,
      action: 'create',
      after: row,
    });

    return this.toResponse(row, this.dates.now());
  }

  async revoke(actor: ActorContext, id: string): Promise<void> {
    const row = await this.prisma.approvalDelegation.findFirst({
      where: { id, deletedAt: null },
    });
    if (!row) {
      throw new DelegationNotFoundError();
    }
    if (row.delegatorUserId !== actor.userId) {
      throw new DelegationForbiddenError();
    }

    await this.prisma.approvalDelegation.update({
      where: { id },
      data: { isActive: false, deletedAt: this.dates.now(), deletedBy: actor.userId },
    });

    await this.audit.record(actor, {
      entityType: 'ApprovalDelegation',
      entityId: id,
      action: 'revoke',
    });
  }

  /** Active delegations where delegateUserId can act for delegatorUserId. */
  async activeDelegatorsForDelegate(
    delegateUserId: string,
    companyId?: string | null,
    entityType?: WorkflowEntityType | null,
  ): Promise<string[]> {
    const now = this.dates.now();
    const rows = await this.prisma.approvalDelegation.findMany({
      where: {
        delegateUserId,
        isActive: true,
        deletedAt: null,
        validFrom: { lte: now },
        validTo: { gte: now },
        OR: [{ companyId: companyId ?? undefined }, { companyId: null }],
        AND: [
          { OR: [{ entityType: entityType ?? undefined }, { entityType: null }] },
        ],
      },
      select: { delegatorUserId: true },
    });
    return [...new Set(rows.map((r) => r.delegatorUserId))];
  }

  /** Check if actor is delegate for any current approver on this instance. */
  async isDelegateForApprovers(
    actorUserId: string,
    approverUserIds: string[],
    companyId: string | null,
    entityType: WorkflowEntityType,
  ): Promise<boolean> {
    if (!approverUserIds.length) return false;
    const now = this.dates.now();
    const count = await this.prisma.approvalDelegation.count({
      where: {
        delegateUserId: actorUserId,
        delegatorUserId: { in: approverUserIds },
        isActive: true,
        deletedAt: null,
        validFrom: { lte: now },
        validTo: { gte: now },
        OR: [{ companyId }, { companyId: null }],
        AND: [{ OR: [{ entityType }, { entityType: null }] }],
      },
    });
    return count > 0;
  }

  private toResponse(
    row: {
      id: string;
      delegatorUserId: string;
      delegateUserId: string;
      companyId: string | null;
      entityType: WorkflowEntityType | null;
      reason: string | null;
      validFrom: Date;
      validTo: Date;
      isActive: boolean;
      deletedAt: Date | null;
      delegator: { username: string; employee: { firstName: string; lastName: string } | null };
      delegate: { username: string; employee: { firstName: string; lastName: string } | null };
    },
    now: Date,
  ): DelegationResponse {
    const active = row.isActive && !row.deletedAt && row.validFrom <= now && row.validTo >= now;
    return {
      id: row.id,
      delegatorUserId: row.delegatorUserId,
      delegatorName: this.displayName(row.delegator),
      delegateUserId: row.delegateUserId,
      delegateName: this.displayName(row.delegate),
      companyId: row.companyId,
      entityType: row.entityType,
      reason: row.reason,
      validFrom: row.validFrom.toISOString(),
      validTo: row.validTo.toISOString(),
      isActive: active,
    };
  }

  private displayName(user: { username: string; employee: { firstName: string; lastName: string } | null }): string {
    if (user.employee) {
      return `${user.employee.firstName} ${user.employee.lastName}`.trim();
    }
    return user.username;
  }
}
