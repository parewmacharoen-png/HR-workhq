import { Injectable, OnModuleInit, Inject, forwardRef } from '@nestjs/common';
import { randomUUID } from 'crypto';
import {
  RequestTypeCategory, RequestTypeStatus, RequestTypeVersionStatus,
} from '@prisma/client';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { AuditService } from '../../../shared/audit/audit.service';
import { ActorContext } from '../../../shared/kernel/actor-context';
import { RequestAccessService } from './request-access.service';
import {
  RequestConflictError, RequestTypeNotFoundError, RequestValidationError,
} from '../domain/errors/request.errors';
import { CreateRequestTypeDto, UpdateRequestTypeDto } from './dto/request.dto';
import {
  DEFAULT_REQUEST_TYPE_SEEDS,
  expectedFormFieldKeys,
  expectedFormSchemaSignature,
  expectedLeaveApprovalFlowSignature,
  expectedPrimaryApproverType,
  seedFormFieldsForVersion,
  seedApprovalFlowForVersion,
} from './request-seed.defaults';
import { RequestApproverResolverService } from './request-approver-resolver.service';
import { valuesMapFromRows } from './request-condition.util';
import { LeaveApprovalRoutingService } from '../../leave/application/leave-approval-routing.service';

const TYPE_INCLUDE = {
  versions: { orderBy: { versionNumber: 'desc' as const }, take: 1 },
};

@Injectable()
export class RequestTypeService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly access: RequestAccessService,
    private readonly approverResolver: RequestApproverResolverService,
    @Inject(forwardRef(() => LeaveApprovalRoutingService))
    private readonly leaveRouting: LeaveApprovalRoutingService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.ensureSystemDefaults();
    await this.syncSystemRequestForms(['ot_request', 'leave_request', 'no_break_report']);
    await this.repairOrphanApprovalSteps();
    await this.repairLeaveApprovalRoutingSteps();
  }

  /** Assign owners to in-review requests whose approval step has no approver. */
  private async repairOrphanApprovalSteps(): Promise<void> {
    const orphans = await this.prisma.requestApprovalStepInstance.findMany({
      where: {
        status: 'pending',
        approverEmployeeId: null,
        requestInstance: { status: 'in_review', deletedAt: null },
      },
      include: {
        requestInstance: { include: { values: true } },
      },
      take: 100,
    });

    for (const step of orphans) {
      const inst = step.requestInstance;
      const values = valuesMapFromRows(inst.values);
      const approvers = await this.approverResolver.resolve(
        step.approverTypeSnapshot as never,
        inst.requesterEmployeeId,
        inst.companyId,
        values,
        { approverRole: step.approverRoleSnapshot },
      );
      const primary = approvers[0];
      if (!primary) continue;
      await this.prisma.requestApprovalStepInstance.update({
        where: { id: step.id },
        data: {
          approverEmployeeId: primary.employeeId,
          approverUserId: primary.userId,
        },
      });
    }
  }

  /** Re-resolve pending leave steps to match department/role routing policy. */
  private async repairLeaveApprovalRoutingSteps(): Promise<void> {
    const steps = await this.prisma.requestApprovalStepInstance.findMany({
      where: {
        status: 'pending',
        requestInstance: {
          status: 'in_review',
          deletedAt: null,
          requestType: { key: 'leave_request' },
        },
      },
      include: {
        requestInstance: { include: { values: true } },
      },
      take: 100,
    });

    for (const step of steps) {
      const inst = step.requestInstance;
      const values = valuesMapFromRows(inst.values);
      const leaveType = String(values.leaveType ?? '');
      const ctx = await this.leaveRouting.loadRequesterContext(
        inst.requesterEmployeeId,
        inst.companyId,
      );
      const route = this.leaveRouting.resolveRoute(leaveType, ctx);
      if (step.approverTypeSnapshot === route.approverType && step.approverEmployeeId) continue;

      const approvers = await this.approverResolver.resolve(
        route.approverType,
        inst.requesterEmployeeId,
        inst.companyId,
        values,
      );
      const primary = approvers[0];
      if (!primary) continue;
      await this.prisma.requestApprovalStepInstance.update({
        where: { id: step.id },
        data: {
          approverTypeSnapshot: route.approverType,
          approverEmployeeId: primary.employeeId,
          approverUserId: primary.userId,
        },
      });
    }
  }

  /** Republish system request forms when seed shape or approval flow changed. */
  async syncSystemRequestForms(typeKeys: string[]): Promise<void> {
    for (const typeKey of typeKeys) {
      const type = await this.prisma.requestType.findFirst({
        where: { companyId: null, key: typeKey, deletedAt: null },
      });
      if (!type) continue;

      const published = await this.prisma.requestTypeVersion.findFirst({
        where: { requestTypeId: type.id, status: 'published' },
        orderBy: { versionNumber: 'desc' },
        include: {
          formFields: { orderBy: { order: 'asc' } },
          approvalFlows: {
            where: { status: 'active' },
            include: { steps: { orderBy: { stepOrder: 'asc' } } },
          },
        },
      });
      if (!published) continue;

      const currentKeys = published.formFields.map((f) => f.key).join(',');
      const expectedKeys = expectedFormFieldKeys(typeKey).join(',');
      const currentSchemaSig = JSON.stringify(published.formFields.map((f) => ({
        key: f.key,
        fieldType: f.fieldType,
        required: f.required,
        optionsJson: f.optionsJson ?? null,
        visibilityConditionJson: f.visibilityConditionJson ?? null,
        helpText: f.helpText ?? null,
      })));
      const expectedSchemaSig = expectedFormSchemaSignature(typeKey);
      const currentApprover = published.approvalFlows[0]?.steps[0]?.approverType ?? null;
      const expectedApprover = expectedPrimaryApproverType(typeKey);
      const leaveFlowOk = typeKey !== 'leave_request'
        || (published.approvalFlows[0]?.name ?? '') === expectedLeaveApprovalFlowSignature();
      if (
        currentKeys === expectedKeys
        && currentSchemaSig === expectedSchemaSig
        && currentApprover === expectedApprover
        && leaveFlowOk
      ) continue;

      const newVersionId = randomUUID();
      const newVersionNumber = published.versionNumber + 1;
      await this.prisma.$transaction(async (tx) => {
        await tx.requestTypeVersion.updateMany({
          where: { requestTypeId: type.id, status: 'published' },
          data: { status: 'archived' },
        });
        await tx.requestTypeVersion.create({
          data: {
            id: newVersionId,
            requestTypeId: type.id,
            versionNumber: newVersionNumber,
            status: 'published',
            nameSnapshot: published.nameSnapshot,
            descriptionSnapshot: published.descriptionSnapshot,
            iconSnapshot: published.iconSnapshot,
            categorySnapshot: published.categorySnapshot,
            telegramMenuOrder: published.telegramMenuOrder,
            telegramMenuIcon: published.telegramMenuIcon,
            publishedAt: new Date(),
          },
        });
        await seedFormFieldsForVersion(tx, newVersionId, typeKey);
        await seedApprovalFlowForVersion(tx, newVersionId, typeKey);
      });
    }
  }

  async ensureSystemDefaults(): Promise<void> {
    for (const seed of DEFAULT_REQUEST_TYPE_SEEDS) {
      const existing = await this.prisma.requestType.findFirst({
        where: { companyId: null, key: seed.key, deletedAt: null },
      });
      if (existing) continue;

      const typeId = randomUUID();
      const versionId = randomUUID();
      await this.prisma.$transaction(async (tx) => {
        await tx.requestType.create({
          data: {
            id: typeId,
            companyId: null,
            key: seed.key,
            nameTh: seed.nameTh,
            nameEn: seed.nameEn,
            description: seed.description,
            icon: seed.icon,
            category: seed.category,
            status: 'published',
            isSystem: true,
            isActive: true,
          },
        });
        await tx.requestTypeVersion.create({
          data: {
            id: versionId,
            requestTypeId: typeId,
            versionNumber: 1,
            status: 'published',
            nameSnapshot: seed.nameTh,
            descriptionSnapshot: seed.description,
            iconSnapshot: seed.icon,
            categorySnapshot: seed.category,
            telegramMenuOrder: seed.telegramMenuOrder,
            telegramMenuIcon: seed.telegramMenuIcon,
            publishedAt: new Date(),
          },
        });
        await seedFormFieldsForVersion(tx, versionId, seed.key);
        await seedApprovalFlowForVersion(tx, versionId, seed.key);
      });
    }
  }

  async create(actor: ActorContext, dto: CreateRequestTypeDto) {
    await this.access.assertCanManageTypes(actor, dto.companyId ?? null);
    const dup = await this.prisma.requestType.findFirst({
      where: { companyId: dto.companyId ?? null, key: dto.key, deletedAt: null },
    });
    if (dup) throw new RequestConflictError(`Request type key "${dto.key}" already exists`);

    const typeId = randomUUID();
    const versionId = randomUUID();
    const category = (dto.category ?? 'general') as RequestTypeCategory;
    const result = await this.prisma.$transaction(async (tx) => {
      const type = await tx.requestType.create({
        data: {
          id: typeId,
          companyId: dto.companyId ?? null,
          key: dto.key,
          nameTh: dto.nameTh,
          nameEn: dto.nameEn,
          description: dto.description,
          icon: dto.icon,
          category,
          status: 'draft',
          createdBy: actor.userId,
          updatedBy: actor.userId,
        },
      });
      const version = await tx.requestTypeVersion.create({
        data: {
          id: versionId,
          requestTypeId: typeId,
          versionNumber: 1,
          status: 'draft',
          nameSnapshot: dto.nameTh,
          descriptionSnapshot: dto.description,
          iconSnapshot: dto.icon,
          categorySnapshot: category,
        },
      });
      await tx.requestApprovalFlow.create({
        data: { requestTypeVersionId: versionId, name: 'Default flow', status: 'draft' },
      });
      return { type, version };
    });

    await this.audit.record(actor, {
      entityType: 'RequestType', entityId: typeId, action: 'create', after: result.type,
    });
    return this.get(actor, typeId);
  }

  async list(actor: ActorContext, companyId?: string, status?: string, category?: string) {
    if (companyId) await this.access.assertCanViewCompanyRequests(actor, companyId);
    else await this.access.assertCanManageTypes(actor, null);

    const types = await this.prisma.requestType.findMany({
      where: {
        deletedAt: null,
        ...(companyId !== undefined ? { OR: [{ companyId }, { companyId: null }] } : {}),
        ...(status ? { status: status as RequestTypeStatus } : {}),
        ...(category ? { category: category as RequestTypeCategory } : {}),
      },
      include: TYPE_INCLUDE,
      orderBy: [{ isSystem: 'desc' }, { key: 'asc' }],
    });
    return types.map((t) => this.toListItem(t));
  }

  async get(actor: ActorContext, id: string) {
    const type = await this.prisma.requestType.findFirst({
      where: { id, deletedAt: null },
      include: {
        versions: {
          orderBy: { versionNumber: 'desc' },
          include: {
            formFields: { orderBy: { order: 'asc' } },
            approvalFlows: { include: { steps: { orderBy: { stepOrder: 'asc' } } } },
          },
        },
      },
    });
    if (!type) throw new RequestTypeNotFoundError();
    await this.access.assertCanManageTypes(actor, type.companyId);
    return type;
  }

  async update(actor: ActorContext, id: string, dto: UpdateRequestTypeDto) {
    const type = await this.get(actor, id);
    const draftVersion = type.versions.find((v) => v.status === 'draft');
    if (!draftVersion) throw new RequestValidationError('No draft version to edit');

    const updated = await this.prisma.$transaction(async (tx) => {
      const t = await tx.requestType.update({
        where: { id },
        data: {
          ...(dto.nameTh !== undefined ? { nameTh: dto.nameTh } : {}),
          ...(dto.nameEn !== undefined ? { nameEn: dto.nameEn } : {}),
          ...(dto.description !== undefined ? { description: dto.description } : {}),
          ...(dto.icon !== undefined ? { icon: dto.icon } : {}),
          ...(dto.category !== undefined ? { category: dto.category as RequestTypeCategory } : {}),
          ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
          updatedBy: actor.userId,
        },
      });
      await tx.requestTypeVersion.update({
        where: { id: draftVersion.id },
        data: {
          ...(dto.nameTh !== undefined ? { nameSnapshot: dto.nameTh } : {}),
          ...(dto.description !== undefined ? { descriptionSnapshot: dto.description } : {}),
          ...(dto.icon !== undefined ? { iconSnapshot: dto.icon } : {}),
          ...(dto.category !== undefined ? { categorySnapshot: dto.category as RequestTypeCategory } : {}),
          ...(dto.visibleToRolesJson !== undefined ? { visibleToRolesJson: dto.visibleToRolesJson as object } : {}),
          ...(dto.visibleToCompaniesJson !== undefined ? { visibleToCompaniesJson: dto.visibleToCompaniesJson as object } : {}),
          ...(dto.visibleToDepartmentsJson !== undefined ? { visibleToDepartmentsJson: dto.visibleToDepartmentsJson as object } : {}),
          ...(dto.requiresAttachment !== undefined ? { requiresAttachment: dto.requiresAttachment } : {}),
          ...(dto.allowCancelByRequester !== undefined ? { allowCancelByRequester: dto.allowCancelByRequester } : {}),
          ...(dto.cancelBeforeApprovalOnly !== undefined ? { cancelBeforeApprovalOnly: dto.cancelBeforeApprovalOnly } : {}),
          ...(dto.slaHours !== undefined ? { slaHours: dto.slaHours } : {}),
          ...(dto.notifyRequesterOnStepChange !== undefined ? { notifyRequesterOnStepChange: dto.notifyRequesterOnStepChange } : {}),
          ...(dto.notifyLeadersOnSubmit !== undefined ? { notifyLeadersOnSubmit: dto.notifyLeadersOnSubmit } : {}),
          ...(dto.telegramMenuOrder !== undefined ? { telegramMenuOrder: dto.telegramMenuOrder } : {}),
          ...(dto.telegramMenuIcon !== undefined ? { telegramMenuIcon: dto.telegramMenuIcon } : {}),
        },
      });
      return t;
    });

    await this.audit.record(actor, { entityType: 'RequestType', entityId: id, action: 'update', after: updated });
    return this.get(actor, id);
  }

  async clone(actor: ActorContext, id: string) {
    const source = await this.get(actor, id);
    const latest = source.versions[0];
    const newTypeId = randomUUID();
    const newVersionId = randomUUID();
    const newKey = `${source.key}_copy_${Date.now().toString(36).slice(-4)}`;

    await this.prisma.$transaction(async (tx) => {
      await tx.requestType.create({
        data: {
          id: newTypeId,
          companyId: source.companyId,
          key: newKey,
          nameTh: `${source.nameTh} (สำเนา)`,
          nameEn: source.nameEn,
          description: source.description,
          icon: source.icon,
          category: source.category,
          status: 'draft',
          createdBy: actor.userId,
        },
      });
      await tx.requestTypeVersion.create({
        data: {
          id: newVersionId,
          requestTypeId: newTypeId,
          versionNumber: 1,
          status: 'draft',
          nameSnapshot: `${source.nameTh} (สำเนา)`,
          descriptionSnapshot: source.description,
          iconSnapshot: source.icon,
          categorySnapshot: source.category,
          visibleToRolesJson: latest.visibleToRolesJson ?? undefined,
          telegramMenuOrder: latest.telegramMenuOrder,
          telegramMenuIcon: latest.telegramMenuIcon,
        },
      });
      for (const f of latest.formFields) {
        await tx.requestFormField.create({
          data: {
            requestTypeVersionId: newVersionId,
            key: f.key,
            labelTh: f.labelTh,
            labelEn: f.labelEn,
            description: f.description,
            fieldType: f.fieldType,
            placeholder: f.placeholder,
            helpText: f.helpText,
            required: f.required,
            order: f.order,
            defaultValueJson: f.defaultValueJson ?? undefined,
            optionsJson: f.optionsJson ?? undefined,
            validationJson: f.validationJson ?? undefined,
            visibilityConditionJson: f.visibilityConditionJson ?? undefined,
            isSystem: f.isSystem,
          },
        });
      }
      const flow = latest.approvalFlows[0];
      if (flow) {
        const newFlow = await tx.requestApprovalFlow.create({
          data: { requestTypeVersionId: newVersionId, name: flow.name, status: 'draft' },
        });
        for (const s of flow.steps) {
          await tx.requestApprovalStepDefinition.create({
            data: {
              approvalFlowId: newFlow.id,
              stepOrder: s.stepOrder,
              name: s.name,
              approverType: s.approverType,
              approverRole: s.approverRole,
              approverEmployeeId: s.approverEmployeeId,
              approverFieldKey: s.approverFieldKey,
              requiredDecision: s.requiredDecision,
              canReject: s.canReject,
              conditionJson: s.conditionJson ?? undefined,
              notifyTelegram: s.notifyTelegram,
            },
          });
        }
      }
    });

    await this.audit.record(actor, { entityType: 'RequestType', entityId: newTypeId, action: 'clone', after: { sourceId: id } });
    return this.get(actor, newTypeId);
  }

  async publish(actor: ActorContext, id: string) {
    const type = await this.get(actor, id);
    const draft = type.versions.find((v) => v.status === 'draft');
    if (!draft) throw new RequestValidationError('No draft version to publish');

    await this.prisma.$transaction(async (tx) => {
      await tx.requestTypeVersion.updateMany({
        where: { requestTypeId: id, status: 'published' },
        data: { status: 'archived' },
      });
      await tx.requestTypeVersion.update({
        where: { id: draft.id },
        data: { status: 'published', publishedAt: new Date(), publishedBy: actor.userId },
      });
      await tx.requestType.update({
        where: { id },
        data: { status: 'published', updatedBy: actor.userId },
      });
      await tx.requestApprovalFlow.updateMany({
        where: { requestTypeVersionId: draft.id },
        data: { status: 'active' },
      });
    });

    await this.audit.record(actor, { entityType: 'RequestType', entityId: id, action: 'publish' });
    return this.get(actor, id);
  }

  async archive(actor: ActorContext, id: string) {
    await this.get(actor, id);
    await this.prisma.requestType.update({
      where: { id },
      data: { status: 'archived', archivedAt: new Date(), isActive: false, updatedBy: actor.userId },
    });
    await this.audit.record(actor, { entityType: 'RequestType', entityId: id, action: 'archive' });
    return this.get(actor, id);
  }

  async restore(actor: ActorContext, id: string) {
    await this.get(actor, id);
    await this.prisma.requestType.update({
      where: { id },
      data: { status: 'published', archivedAt: null, isActive: true, updatedBy: actor.userId },
    });
    await this.audit.record(actor, { entityType: 'RequestType', entityId: id, action: 'restore' });
    return this.get(actor, id);
  }

  async softDelete(actor: ActorContext, id: string) {
    const type = await this.get(actor, id);
    if (type.isSystem) throw new RequestValidationError('Cannot delete system request type');
    const submitted = await this.prisma.requestInstance.count({
      where: { requestTypeId: id, status: { not: 'draft' }, deletedAt: null },
    });
    if (submitted > 0) {
      throw new RequestValidationError('Cannot delete: submitted requests exist — archive instead');
    }
    await this.prisma.requestType.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false },
    });
    await this.audit.record(actor, { entityType: 'RequestType', entityId: id, action: 'delete' });
    return { ok: true };
  }

  async listAvailableForTelegram(employeeId: string, companyId: string) {
    const types = await this.prisma.requestType.findMany({
      where: {
        deletedAt: null,
        isActive: true,
        status: 'published',
        OR: [{ companyId }, { companyId: null }],
      },
      include: {
        versions: {
          where: { status: 'published' },
          orderBy: { versionNumber: 'desc' },
          take: 1,
        },
      },
    });
    return types
      .filter((t) => t.versions.length > 0)
      .map((t) => ({
        id: t.id,
        key: t.key,
        nameTh: t.nameTh,
        icon: t.versions[0].telegramMenuIcon ?? t.icon,
        order: t.versions[0].telegramMenuOrder,
        versionId: t.versions[0].id,
      }))
      .sort((a, b) => a.order - b.order || a.nameTh.localeCompare(b.nameTh, 'th'));
  }

  async getPublishedVersion(typeId: string) {
    return this.prisma.requestTypeVersion.findFirst({
      where: { requestTypeId: typeId, status: 'published' },
      orderBy: { versionNumber: 'desc' },
      include: {
        formFields: { orderBy: { order: 'asc' } },
        approvalFlows: {
          where: { status: 'active' },
          include: { steps: { orderBy: { stepOrder: 'asc' } } },
        },
        requestType: true,
      },
    });
  }

  private toListItem(type: {
    id: string; key: string; nameTh: string; category: string; status: string;
    isSystem: boolean; isActive: boolean; icon: string | null;
    versions: Array<{ versionNumber: number; status: string; telegramMenuOrder: number }>;
  }) {
    const latest = type.versions[0];
    return {
      id: type.id,
      key: type.key,
      nameTh: type.nameTh,
      category: type.category,
      status: type.status,
      isSystem: type.isSystem,
      isActive: type.isActive,
      icon: type.icon,
      versionNumber: latest?.versionNumber ?? 0,
      versionStatus: latest?.status ?? 'draft',
      telegramMenuOrder: latest?.telegramMenuOrder ?? 0,
      activeInTelegram: type.status === 'published' && type.isActive,
    };
  }
}
