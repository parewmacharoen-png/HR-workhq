import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { AuditService } from '../../../shared/audit/audit.service';
import { ActorContext } from '../../../shared/kernel/actor-context';
import { RequestAccessService } from './request-access.service';
import { RequestTypeService } from './request-type.service';
import { RequestNotFoundError, RequestValidationError } from '../domain/errors/request.errors';
import {
  CreateApprovalFlowDto, CreateApprovalStepDto, ReorderStepsDto, UpdateApprovalStepDto,
} from './dto/request.dto';

@Injectable()
export class RequestApprovalFlowService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly access: RequestAccessService,
    private readonly types: RequestTypeService,
  ) {}

  async createFlow(actor: ActorContext, typeId: string, versionId: string, dto: CreateApprovalFlowDto) {
    await this.assertDraftVersion(actor, typeId, versionId);
    const flow = await this.prisma.requestApprovalFlow.create({
      data: { requestTypeVersionId: versionId, name: dto.name, status: 'draft' },
    });
    await this.audit.record(actor, { entityType: 'RequestApprovalFlow', entityId: flow.id, action: 'create', after: flow });
    return flow;
  }

  async updateFlow(actor: ActorContext, flowId: string, dto: CreateApprovalFlowDto) {
    const flow = await this.getFlowOrThrow(flowId);
    await this.assertDraftVersion(actor, flow.requestTypeVersion.requestTypeId, flow.requestTypeVersionId);
    const updated = await this.prisma.requestApprovalFlow.update({
      where: { id: flowId },
      data: { name: dto.name },
    });
    await this.audit.record(actor, { entityType: 'RequestApprovalFlow', entityId: flowId, action: 'update', after: updated });
    return updated;
  }

  async addStep(actor: ActorContext, flowId: string, dto: CreateApprovalStepDto) {
    const flow = await this.getFlowOrThrow(flowId);
    await this.assertDraftVersion(actor, flow.requestTypeVersion.requestTypeId, flow.requestTypeVersionId);
    const step = await this.prisma.requestApprovalStepDefinition.create({
      data: {
        id: randomUUID(),
        approvalFlowId: flowId,
        stepOrder: dto.stepOrder,
        name: dto.name,
        approverType: dto.approverType as never,
        approverRole: dto.approverRole,
        approverEmployeeId: dto.approverEmployeeId,
        approverFieldKey: dto.approverFieldKey,
        requiredDecision: (dto.requiredDecision ?? 'any_one') as never,
        canReject: dto.canReject ?? true,
        conditionJson: dto.conditionJson as object | undefined,
        notifyTelegram: dto.notifyTelegram ?? true,
      },
    });
    await this.audit.record(actor, { entityType: 'RequestApprovalStepDefinition', entityId: step.id, action: 'create', after: step });
    return step;
  }

  async updateStep(actor: ActorContext, stepId: string, dto: UpdateApprovalStepDto) {
    const step = await this.getStepOrThrow(stepId);
    await this.assertDraftVersion(actor, step.approvalFlow.requestTypeVersion.requestTypeId, step.approvalFlow.requestTypeVersionId);
    const updated = await this.prisma.requestApprovalStepDefinition.update({
      where: { id: stepId },
      data: {
        ...(dto.stepOrder !== undefined ? { stepOrder: dto.stepOrder } : {}),
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.approverType !== undefined ? { approverType: dto.approverType as never } : {}),
        ...(dto.approverRole !== undefined ? { approverRole: dto.approverRole } : {}),
        ...(dto.approverEmployeeId !== undefined ? { approverEmployeeId: dto.approverEmployeeId } : {}),
        ...(dto.approverFieldKey !== undefined ? { approverFieldKey: dto.approverFieldKey } : {}),
        ...(dto.requiredDecision !== undefined ? { requiredDecision: dto.requiredDecision as never } : {}),
        ...(dto.canReject !== undefined ? { canReject: dto.canReject } : {}),
        ...(dto.conditionJson !== undefined ? { conditionJson: dto.conditionJson as object } : {}),
        ...(dto.notifyTelegram !== undefined ? { notifyTelegram: dto.notifyTelegram } : {}),
      },
    });
    await this.audit.record(actor, { entityType: 'RequestApprovalStepDefinition', entityId: stepId, action: 'update', after: updated });
    return updated;
  }

  async deleteStep(actor: ActorContext, stepId: string) {
    const step = await this.getStepOrThrow(stepId);
    await this.assertDraftVersion(actor, step.approvalFlow.requestTypeVersion.requestTypeId, step.approvalFlow.requestTypeVersionId);
    await this.prisma.requestApprovalStepDefinition.delete({ where: { id: stepId } });
    await this.audit.record(actor, { entityType: 'RequestApprovalStepDefinition', entityId: stepId, action: 'delete' });
    return { ok: true };
  }

  async reorderSteps(actor: ActorContext, flowId: string, dto: ReorderStepsDto) {
    const flow = await this.getFlowOrThrow(flowId);
    await this.assertDraftVersion(actor, flow.requestTypeVersion.requestTypeId, flow.requestTypeVersionId);
    await this.prisma.$transaction(
      dto.stepIds.map((id, idx) => this.prisma.requestApprovalStepDefinition.update({
        where: { id },
        data: { stepOrder: idx + 1 },
      })),
    );
    return this.prisma.requestApprovalStepDefinition.findMany({
      where: { approvalFlowId: flowId },
      orderBy: { stepOrder: 'asc' },
    });
  }

  private async getFlowOrThrow(flowId: string) {
    const flow = await this.prisma.requestApprovalFlow.findUnique({
      where: { id: flowId },
      include: { requestTypeVersion: true },
    });
    if (!flow) throw new RequestNotFoundError('Approval flow not found');
    return flow;
  }

  private async getStepOrThrow(stepId: string) {
    const step = await this.prisma.requestApprovalStepDefinition.findUnique({
      where: { id: stepId },
      include: { approvalFlow: { include: { requestTypeVersion: true } } },
    });
    if (!step) throw new RequestNotFoundError('Approval step not found');
    return step;
  }

  private async assertDraftVersion(actor: ActorContext, typeId: string, versionId: string) {
    const type = await this.types.get(actor, typeId);
    const version = type.versions.find((v) => v.id === versionId);
    if (!version) throw new RequestNotFoundError('Version not found');
    if (version.status !== 'draft') throw new RequestValidationError('Published approval flow is immutable');
  }
}
