import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { WorkflowActionStepType } from '@prisma/client';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { AuditService } from '../../../shared/audit/audit.service';
import { ActorContext } from '../../../shared/kernel/actor-context';
import { RequestTypeService } from '../../request/application/request-type.service';
import { RequestFormFieldService } from '../../request/application/request-form-field.service';
import { RequestApprovalFlowService } from '../../request/application/request-approval-flow.service';
import { RequestAccessService } from '../../request/application/request-access.service';

/** WF-001 — Workflow Builder facade over Request Platform */
@Injectable()
export class WorkflowBuilderService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly access: RequestAccessService,
    private readonly types: RequestTypeService,
    private readonly fields: RequestFormFieldService,
    private readonly flows: RequestApprovalFlowService,
  ) {}

  list(actor: ActorContext, companyId?: string, status?: string, category?: string) {
    return this.types.list(actor, companyId, status, category);
  }

  get(actor: ActorContext, id: string) {
    return this.types.get(actor, id).then(async (type) => {
      const version = type.versions?.[0];
      const actionSteps = version
        ? await this.prisma.requestWorkflowActionStep.findMany({
            where: { requestTypeVersionId: version.id },
            orderBy: { stepOrder: 'asc' },
          })
        : [];
      return { ...type, actionSteps };
    });
  }

  create(actor: ActorContext, dto: Parameters<RequestTypeService['create']>[1]) {
    return this.types.create(actor, dto).then(async (result) => {
      await this.audit.record(actor, { entityType: 'WorkflowDefinition', entityId: result.id, action: 'workflow_created', after: result });
      return result;
    });
  }

  update(actor: ActorContext, id: string, dto: Parameters<RequestTypeService['update']>[2]) {
    return this.types.update(actor, id, dto).then(async (result) => {
      await this.audit.record(actor, { entityType: 'WorkflowDefinition', entityId: id, action: 'workflow_edited', after: result });
      return result;
    });
  }

  publish(actor: ActorContext, id: string) {
    return this.types.publish(actor, id).then(async (result) => {
      await this.audit.record(actor, { entityType: 'WorkflowDefinition', entityId: id, action: 'workflow_published', after: result });
      return result;
    });
  }

  archive(actor: ActorContext, id: string) {
    return this.types.archive(actor, id).then(async (result) => {
      await this.audit.record(actor, { entityType: 'WorkflowDefinition', entityId: id, action: 'workflow_archived' });
      return result;
    });
  }

  restore(actor: ActorContext, id: string) {
    return this.types.restore(actor, id).then(async (result) => {
      await this.audit.record(actor, { entityType: 'WorkflowDefinition', entityId: id, action: 'workflow_restored' });
      return result;
    });
  }

  clone(actor: ActorContext, id: string) {
    return this.types.clone(actor, id).then(async (result) => {
      await this.audit.record(actor, { entityType: 'WorkflowDefinition', entityId: result.id, action: 'workflow_cloned', after: { sourceId: id } });
      return result;
    });
  }

  async version(actor: ActorContext, id: string) {
    const type = await this.types.get(actor, id);
    const latestVersion = type.versions?.[0];
    if (!latestVersion || latestVersion.status !== 'published') {
      throw new Error('Only published workflows can be versioned');
    }
    const newVersionId = randomUUID();
    const newVersionNumber = latestVersion.versionNumber + 1;
    await this.prisma.$transaction(async (tx) => {
      await tx.requestTypeVersion.create({
        data: {
          id: newVersionId,
          requestTypeId: id,
          versionNumber: newVersionNumber,
          status: 'draft',
          nameSnapshot: latestVersion.nameSnapshot,
          descriptionSnapshot: latestVersion.descriptionSnapshot,
          iconSnapshot: latestVersion.iconSnapshot,
          categorySnapshot: latestVersion.categorySnapshot,
          visibleToRolesJson: latestVersion.visibleToRolesJson ?? undefined,
          visibleToCompaniesJson: latestVersion.visibleToCompaniesJson ?? undefined,
          visibleToDepartmentsJson: latestVersion.visibleToDepartmentsJson ?? undefined,
          requiresAttachment: latestVersion.requiresAttachment,
          allowCancelByRequester: latestVersion.allowCancelByRequester,
          cancelBeforeApprovalOnly: latestVersion.cancelBeforeApprovalOnly,
          slaHours: latestVersion.slaHours,
          notifyRequesterOnStepChange: latestVersion.notifyRequesterOnStepChange,
          notifyLeadersOnSubmit: latestVersion.notifyLeadersOnSubmit,
          telegramMenuOrder: latestVersion.telegramMenuOrder,
          telegramMenuIcon: latestVersion.telegramMenuIcon,
        },
      });
      const oldFields = await tx.requestFormField.findMany({ where: { requestTypeVersionId: latestVersion.id } });
      for (const f of oldFields) {
        await tx.requestFormField.create({
          data: {
            requestTypeVersionId: newVersionId,
            key: f.key,
            labelTh: f.labelTh,
            labelEn: f.labelEn,
            description: f.description,
            fieldType: f.fieldType,
            order: f.order,
            required: f.required,
            optionsJson: f.optionsJson ?? undefined,
            defaultValueJson: f.defaultValueJson ?? undefined,
            validationJson: f.validationJson ?? undefined,
            visibilityConditionJson: f.visibilityConditionJson ?? undefined,
            formulaJson: f.formulaJson ?? undefined,
          },
        });
      }
      const oldSteps = await tx.requestWorkflowActionStep.findMany({ where: { requestTypeVersionId: latestVersion.id } });
      for (const s of oldSteps) {
        await tx.requestWorkflowActionStep.create({
          data: {
            requestTypeVersionId: newVersionId,
            stepOrder: s.stepOrder,
            name: s.name,
            stepType: s.stepType,
            configJson: (s.configJson ?? {}) as object,
            conditionJson: (s.conditionJson ?? undefined) as object | undefined,
            timeoutHours: s.timeoutHours,
          },
        });
      }
      await tx.requestType.update({
        where: { id },
        data: { status: 'draft', sourceId: id, updatedBy: actor.userId },
      });
    });
    await this.audit.record(actor, { entityType: 'WorkflowDefinition', entityId: id, action: 'workflow_versioned', after: { versionNumber: newVersionNumber } });
    return this.get(actor, id);
  }

  delete(actor: ActorContext, id: string) {
    return this.types.softDelete(actor, id);
  }

  async listActionSteps(actor: ActorContext, typeId: string, versionId: string) {
    await this.types.get(actor, typeId);
    return this.prisma.requestWorkflowActionStep.findMany({
      where: { requestTypeVersionId: versionId },
      orderBy: { stepOrder: 'asc' },
    });
  }

  async upsertActionStep(
    actor: ActorContext,
    typeId: string,
    versionId: string,
    dto: {
      id?: string;
      stepOrder: number;
      name: string;
      stepType: WorkflowActionStepType;
      configJson?: Record<string, unknown>;
      conditionJson?: Record<string, unknown>;
      timeoutHours?: number;
    },
  ) {
    await this.types.get(actor, typeId);
    const version = await this.prisma.requestTypeVersion.findFirst({ where: { id: versionId, requestTypeId: typeId } });
    if (!version || version.status === 'published') throw new Error('Cannot edit published version action steps');

    if (dto.id) {
      return this.prisma.requestWorkflowActionStep.update({
        where: { id: dto.id },
        data: {
          stepOrder: dto.stepOrder,
          name: dto.name,
          stepType: dto.stepType,
          configJson: (dto.configJson ?? {}) as object,
          conditionJson: (dto.conditionJson ?? undefined) as object | undefined,
          timeoutHours: dto.timeoutHours,
        },
      });
    }
    return this.prisma.requestWorkflowActionStep.create({
      data: {
        requestTypeVersionId: versionId,
        stepOrder: dto.stepOrder,
        name: dto.name,
        stepType: dto.stepType,
        configJson: (dto.configJson ?? {}) as object,
        conditionJson: (dto.conditionJson ?? undefined) as object | undefined,
        timeoutHours: dto.timeoutHours,
      },
    });
  }

  async getVersionHistory(actor: ActorContext, typeId: string) {
    await this.types.get(actor, typeId);
    return this.prisma.requestTypeVersion.findMany({
      where: { requestTypeId: typeId },
      orderBy: { versionNumber: 'desc' },
    });
  }
}
