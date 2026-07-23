import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import {
  ApprovalFlowConfigStatus, RequestApproverType, RequiredDecisionType, Prisma,
} from '@prisma/client';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { AuditService } from '../../../shared/audit/audit.service';
import { ActorContext } from '../../../shared/kernel/actor-context';
import { CompanyAccessService } from '../../../shared/kernel/company-access.service';
import { RequestAccessService } from './request-access.service';
import { RequestApproverResolverService } from './request-approver-resolver.service';
import { evaluateCondition } from './request-condition.util';

export class ApprovalFlowNotFoundError extends Error {
  constructor(id: string) { super(`Approval flow not found: ${id}`); this.name = 'ApprovalFlowNotFoundError'; }
}

export interface CreateApprovalFlowDto {
  companyId?: string;
  name: string;
  description?: string;
  steps?: CreateApprovalStepDto[];
}

export interface CreateApprovalStepDto {
  stepOrder: number;
  name: string;
  approverType: RequestApproverType;
  approverRole?: string;
  approverEmployeeId?: string;
  approverFieldKey?: string;
  requiredDecision?: RequiredDecisionType;
  conditionJson?: Record<string, unknown>;
  slaHours?: number;
  escalationJson?: Record<string, unknown>;
  notifyTelegram?: boolean;
  canReject?: boolean;
  canRequestMoreInfo?: boolean;
}

/** WF-002 — Dynamic Approval Builder */
@Injectable()
export class ApprovalFlowBuilderService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly companyAccess: CompanyAccessService,
    private readonly access: RequestAccessService,
    private readonly approverResolver: RequestApproverResolverService,
  ) {}

  async list(actor: ActorContext, companyId?: string, status?: string) {
    if (companyId) this.companyAccess.assertCompanyAccess(actor, companyId);
    else await this.access.assertCanManageTypes(actor, null);
    return this.prisma.approvalFlowDefinition.findMany({
      where: {
        deletedAt: null,
        ...(companyId !== undefined ? { OR: [{ companyId }, { companyId: null }] } : {}),
        ...(status ? { status: status as ApprovalFlowConfigStatus } : {}),
      },
      include: { steps: { orderBy: { stepOrder: 'asc' } } },
      orderBy: { name: 'asc' },
    });
  }

  async get(actor: ActorContext, id: string) {
    const row = await this.prisma.approvalFlowDefinition.findFirst({
      where: { id, deletedAt: null },
      include: { steps: { orderBy: { stepOrder: 'asc' } } },
    });
    if (!row) throw new ApprovalFlowNotFoundError(id);
    if (row.companyId) this.companyAccess.assertCompanyAccess(actor, row.companyId);
    return row;
  }

  async create(actor: ActorContext, dto: CreateApprovalFlowDto) {
    if (dto.companyId) this.companyAccess.assertCompanyAccess(actor, dto.companyId);
    else await this.access.assertCanManageTypes(actor, null);
    const id = randomUUID();
    await this.prisma.$transaction(async (tx) => {
      await tx.approvalFlowDefinition.create({
        data: {
          id,
          companyId: dto.companyId ?? null,
          name: dto.name,
          description: dto.description,
          status: 'draft',
          version: 1,
          createdBy: actor.userId,
          updatedBy: actor.userId,
        },
      });
      if (dto.steps?.length) {
        await tx.approvalStepDefinition.createMany({
          data: dto.steps.map((s) => ({
            approvalFlowDefinitionId: id,
            stepOrder: s.stepOrder,
            name: s.name,
            approverType: s.approverType,
            approverRole: s.approverRole,
            approverEmployeeId: s.approverEmployeeId,
            approverFieldKey: s.approverFieldKey,
            requiredDecision: s.requiredDecision ?? 'any_one',
            conditionJson: (s.conditionJson ?? undefined) as object | undefined,
            slaHours: s.slaHours,
            escalationJson: (s.escalationJson ?? undefined) as object | undefined,
            notifyTelegram: s.notifyTelegram ?? true,
            canReject: s.canReject ?? true,
            canRequestMoreInfo: s.canRequestMoreInfo ?? false,
          })),
        });
      }
    });
    await this.audit.record(actor, { entityType: 'ApprovalFlowDefinition', entityId: id, action: 'create' });
    return this.get(actor, id);
  }

  async update(actor: ActorContext, id: string, dto: Partial<CreateApprovalFlowDto>) {
    const existing = await this.get(actor, id);
    if (existing.status === 'published') throw new Error('Published approval flows are immutable');
    await this.prisma.approvalFlowDefinition.update({
      where: { id },
      data: {
        ...(dto.name ? { name: dto.name } : {}),
        ...(dto.description !== undefined ? { description: dto.description } : {}),
        updatedBy: actor.userId,
      },
    });
    await this.audit.record(actor, { entityType: 'ApprovalFlowDefinition', entityId: id, action: 'edit' });
    return this.get(actor, id);
  }

  async upsertStep(actor: ActorContext, flowId: string, dto: CreateApprovalStepDto & { id?: string }) {
    const flow = await this.get(actor, flowId);
    if (flow.status === 'published') throw new Error('Published approval flows are immutable');
    if (dto.id) {
      return this.prisma.approvalStepDefinition.update({
        where: { id: dto.id },
        data: {
          stepOrder: dto.stepOrder,
          name: dto.name,
          approverType: dto.approverType,
          approverRole: dto.approverRole,
          approverEmployeeId: dto.approverEmployeeId,
          approverFieldKey: dto.approverFieldKey,
          requiredDecision: dto.requiredDecision ?? 'any_one',
          conditionJson: (dto.conditionJson ?? undefined) as object | undefined,
          slaHours: dto.slaHours,
          escalationJson: (dto.escalationJson ?? undefined) as object | undefined,
          notifyTelegram: dto.notifyTelegram ?? true,
          canReject: dto.canReject ?? true,
          canRequestMoreInfo: dto.canRequestMoreInfo ?? false,
        },
      });
    }
    return this.prisma.approvalStepDefinition.create({
      data: {
        approvalFlowDefinitionId: flowId,
        stepOrder: dto.stepOrder,
        name: dto.name,
        approverType: dto.approverType,
        approverRole: dto.approverRole,
        approverEmployeeId: dto.approverEmployeeId,
        approverFieldKey: dto.approverFieldKey,
        requiredDecision: dto.requiredDecision ?? 'any_one',
        conditionJson: dto.conditionJson as Prisma.InputJsonValue | undefined,
        slaHours: dto.slaHours,
        escalationJson: dto.escalationJson as Prisma.InputJsonValue | undefined,
        notifyTelegram: dto.notifyTelegram ?? true,
        canReject: dto.canReject ?? true,
        canRequestMoreInfo: dto.canRequestMoreInfo ?? false,
      },
    });
  }

  async publish(actor: ActorContext, id: string) {
    const flow = await this.get(actor, id);
    if (!flow.steps.length) throw new Error('Approval flow must have at least one step');
    await this.prisma.approvalFlowDefinition.update({
      where: { id },
      data: { status: 'published', publishedBy: actor.userId, publishedAt: new Date() },
    });
    await this.audit.record(actor, { entityType: 'ApprovalFlowDefinition', entityId: id, action: 'publish' });
    return this.get(actor, id);
  }

  async archive(actor: ActorContext, id: string) {
    await this.get(actor, id);
    await this.prisma.approvalFlowDefinition.update({
      where: { id },
      data: { status: 'archived', archivedAt: new Date() },
    });
    await this.audit.record(actor, { entityType: 'ApprovalFlowDefinition', entityId: id, action: 'archive' });
    return this.get(actor, id);
  }

  async clone(actor: ActorContext, id: string) {
    const src = await this.get(actor, id);
    const newId = randomUUID();
    await this.prisma.$transaction(async (tx) => {
      await tx.approvalFlowDefinition.create({
        data: {
          id: newId,
          companyId: src.companyId,
          name: `${src.name} (Copy)`,
          description: src.description,
          status: 'draft',
          version: 1,
          rootId: src.rootId ?? src.id,
          sourceId: src.id,
          createdBy: actor.userId,
          updatedBy: actor.userId,
        },
      });
      if (src.steps.length) {
        await tx.approvalStepDefinition.createMany({
          data: src.steps.map((s) => ({
            approvalFlowDefinitionId: newId,
            stepOrder: s.stepOrder,
            name: s.name,
            approverType: s.approverType,
            approverRole: s.approverRole,
            approverEmployeeId: s.approverEmployeeId,
            approverFieldKey: s.approverFieldKey,
            requiredDecision: s.requiredDecision,
            conditionJson: (s.conditionJson ?? undefined) as object | undefined,
            slaHours: s.slaHours,
            escalationJson: (s.escalationJson ?? undefined) as object | undefined,
            notifyTelegram: s.notifyTelegram,
            canReject: s.canReject,
            canRequestMoreInfo: s.canRequestMoreInfo,
          })),
        });
      }
    });
    await this.audit.record(actor, { entityType: 'ApprovalFlowDefinition', entityId: newId, action: 'clone', after: { sourceId: id } });
    return this.get(actor, newId);
  }

  async version(actor: ActorContext, id: string) {
    const src = await this.get(actor, id);
    if (src.status !== 'published') throw new Error('Only published flows can be versioned');
    const newId = randomUUID();
    await this.prisma.$transaction(async (tx) => {
      await tx.approvalFlowDefinition.create({
        data: {
          id: newId,
          companyId: src.companyId,
          name: src.name,
          description: src.description,
          status: 'draft',
          version: src.version + 1,
          rootId: src.rootId ?? src.id,
          sourceId: src.id,
          createdBy: actor.userId,
          updatedBy: actor.userId,
        },
      });
      if (src.steps.length) {
        await tx.approvalStepDefinition.createMany({
          data: src.steps.map((s) => ({
            approvalFlowDefinitionId: newId,
            stepOrder: s.stepOrder,
            name: s.name,
            approverType: s.approverType,
            approverRole: s.approverRole,
            approverEmployeeId: s.approverEmployeeId,
            approverFieldKey: s.approverFieldKey,
            requiredDecision: s.requiredDecision,
            conditionJson: (s.conditionJson ?? undefined) as object | undefined,
            slaHours: s.slaHours,
            escalationJson: (s.escalationJson ?? undefined) as object | undefined,
            notifyTelegram: s.notifyTelegram,
            canReject: s.canReject,
            canRequestMoreInfo: s.canRequestMoreInfo,
          })),
        });
      }
    });
    await this.audit.record(actor, { entityType: 'ApprovalFlowDefinition', entityId: newId, action: 'version' });
    return this.get(actor, newId);
  }

  /** Preview approvers for sample requester + form values */
  async previewApprovers(
    actor: ActorContext,
    flowId: string,
    sample: { requesterEmployeeId: string; companyId: string; formValues?: Record<string, unknown> },
  ) {
    const flow = await this.get(actor, flowId);
    const steps = [];
    for (const step of flow.steps) {
      if (step.conditionJson && sample.formValues) {
        const pass = evaluateCondition(step.conditionJson as never, sample.formValues);
        if (!pass) continue;
      }
      const approvers = await this.approverResolver.resolve(
        step.approverType,
        sample.requesterEmployeeId,
        sample.companyId,
        sample.formValues ?? {},
        {
          approverRole: step.approverRole,
          approverEmployeeId: step.approverEmployeeId,
          approverFieldKey: step.approverFieldKey,
        },
      );
      steps.push({ step: step.name, stepOrder: step.stepOrder, approvers });
    }
    return { flowId, steps };
  }
}
