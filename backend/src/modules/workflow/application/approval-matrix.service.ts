// ============================================================================
// modules/workflow/application/approval-matrix.service.ts
// CRUD + seed defaults + sync workflow definitions from matrix.
// ============================================================================

import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { AuditService } from '../../../shared/audit/audit.service';
import { ActorContext } from '../../../shared/kernel/actor-context';
import { ApprovalResolverService } from './approval-resolver.service';
import {
  ApproverStrategyType,
  MatrixStepInput,
  WORKFLOW_TYPE_ENTITY_MAP,
  WorkflowTypeKey,
} from '../domain/types/approval.types';
import { DEFAULT_MATRICES } from '../domain/approval-defaults';
import { ApprovalMatrixNotFoundError } from '../domain/errors/approval.errors';

export interface MatrixResponse {
  id: string;
  workflowType: string;
  name: string;
  approvalMode: string;
  minApprovalCount: number;
  active: boolean;
  version: number;
  companyId: string | null;
  steps: Array<{
    stepOrder: number;
    label: string;
    approverStrategy: string;
    fixedUserId: string | null;
    fixedRoleId: string | null;
  }>;
}

@Injectable()
export class ApprovalMatrixService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly resolver: ApprovalResolverService,
  ) {}

  async ensureDefaults(): Promise<void> {
    for (const def of DEFAULT_MATRICES) {
      const existing = await this.prisma.approvalAuthorityMatrix.findFirst({
        where: { workflowType: def.workflowType, companyId: null, deletedAt: null },
        include: { steps: { orderBy: { stepOrder: 'asc' } } },
      });
      if (!existing) {
        await this.prisma.approvalAuthorityMatrix.create({
          data: {
            id: randomUUID(),
            workflowType: def.workflowType,
            name: def.name,
            minApprovalCount: def.minApprovalCount,
            active: true,
            version: 1,
            steps: {
              create: def.steps.map((s) => ({
                id: randomUUID(),
                stepOrder: s.stepOrder,
                label: s.label,
                approverStrategy: s.approverStrategy,
                fixedUserId: s.fixedUserId ?? null,
                fixedRoleId: s.fixedRoleId ?? null,
              })),
            },
          },
        });
        continue;
      }

      const stepsMatch = existing.steps.length === def.steps.length
        && def.steps.every((s, i) => {
          const row = existing.steps.find((r) => r.stepOrder === s.stepOrder);
          return row
            && row.label === s.label
            && row.approverStrategy === s.approverStrategy;
        });
      if (stepsMatch && existing.minApprovalCount === def.minApprovalCount && existing.name === def.name) {
        continue;
      }

      await this.prisma.approvalMatrixStep.deleteMany({ where: { matrixId: existing.id } });
      await this.prisma.approvalAuthorityMatrix.update({
        where: { id: existing.id },
        data: {
          name: def.name,
          minApprovalCount: def.minApprovalCount,
          version: existing.version + 1,
          steps: {
            create: def.steps.map((s) => ({
              id: randomUUID(),
              stepOrder: s.stepOrder,
              label: s.label,
              approverStrategy: s.approverStrategy,
              fixedUserId: s.fixedUserId ?? null,
              fixedRoleId: s.fixedRoleId ?? null,
            })),
          },
        },
      });
    }

    const byEntity = new Map<string, { workflowType: WorkflowTypeKey; steps: MatrixStepInput[] }>();
    for (const def of DEFAULT_MATRICES) {
      const entityType = WORKFLOW_TYPE_ENTITY_MAP[def.workflowType];
      const prev = byEntity.get(entityType);
      if (!prev || def.steps.length > prev.steps.length) {
        byEntity.set(entityType, { workflowType: def.workflowType, steps: def.steps });
      }
    }
    for (const [, value] of byEntity) {
      await this.syncWorkflowDefinition(value.workflowType, value.steps);
    }
  }

  async listMatrices(companyId?: string | null): Promise<MatrixResponse[]> {
    const rows = await this.prisma.approvalAuthorityMatrix.findMany({
      where: {
        deletedAt: null,
        active: true,
        OR: [{ companyId: companyId ?? undefined }, { companyId: null }],
      },
      include: { steps: { orderBy: { stepOrder: 'asc' } } },
      orderBy: [{ workflowType: 'asc' }, { version: 'desc' }],
    });
    return rows.map((r) => this.toResponse(r));
  }

  async getMatrix(id: string): Promise<MatrixResponse> {
    const row = await this.prisma.approvalAuthorityMatrix.findFirst({
      where: { id, deletedAt: null },
      include: { steps: { orderBy: { stepOrder: 'asc' } } },
    });
    if (!row) throw new ApprovalMatrixNotFoundError(id);
    return this.toResponse(row);
  }

  async updateMatrix(
    actor: ActorContext,
    id: string,
    input: {
      name?: string;
      minApprovalCount?: number;
      steps?: MatrixStepInput[];
    },
  ): Promise<MatrixResponse> {
    const existing = await this.prisma.approvalAuthorityMatrix.findFirst({
      where: { id, deletedAt: null },
      include: { steps: true },
    });
    if (!existing) throw new ApprovalMatrixNotFoundError(id);

    const before = this.toResponse(existing);
    const steps = input.steps ?? existing.steps.map((s) => ({
      stepOrder: s.stepOrder,
      label: s.label,
      approverStrategy: s.approverStrategy as ApproverStrategyType,
      fixedUserId: s.fixedUserId,
      fixedRoleId: s.fixedRoleId,
    }));

    await this.prisma.approvalMatrixStep.deleteMany({ where: { matrixId: id } });
    const updated = await this.prisma.approvalAuthorityMatrix.update({
      where: { id },
      data: {
        name: input.name ?? existing.name,
        minApprovalCount: input.minApprovalCount ?? existing.minApprovalCount,
        version: existing.version + 1,
        updatedBy: actor.userId,
        steps: {
          create: steps.map((s) => ({
            id: randomUUID(),
            stepOrder: s.stepOrder,
            label: s.label,
            approverStrategy: s.approverStrategy,
            fixedUserId: s.fixedUserId ?? null,
            fixedRoleId: s.fixedRoleId ?? null,
          })),
        },
      },
      include: { steps: { orderBy: { stepOrder: 'asc' } } },
    });

    await this.syncWorkflowDefinition(existing.workflowType as WorkflowTypeKey, steps);
    const after = this.toResponse(updated);
    await this.audit.record(actor, {
      entityType: 'ApprovalAuthorityMatrix',
      entityId: id,
      action: 'update',
      before,
      after,
    });
    return after;
  }

  async syncWorkflowDefinition(workflowType: WorkflowTypeKey, steps: MatrixStepInput[]): Promise<void> {
    const entityType = WORKFLOW_TYPE_ENTITY_MAP[workflowType];
    if (!entityType) return;

    await this.prisma.workflowDefinition.updateMany({
      where: { entityType: entityType as never, isActive: true, deletedAt: null },
      data: { isActive: false },
    });

    const def = await this.prisma.workflowDefinition.create({
      data: {
        id: randomUUID(),
        code: `${workflowType}_matrix_v${Date.now()}`,
        name: `${workflowType} approval`,
        entityType: entityType as never,
        version: 1,
        isActive: true,
      },
    });

    for (const step of steps) {
      const rule = this.resolver.strategyToApproverRule(step.approverStrategy);
      await this.prisma.workflowStep.create({
        data: {
          id: randomUUID(),
          workflowDefinitionId: def.id,
          stepOrder: step.stepOrder,
          name: step.label,
          approverRule: rule as never,
          approverRoleId: step.fixedRoleId ?? null,
          allowEscalate: true,
        },
      });
    }
  }

  private toResponse(row: {
    id: string;
    workflowType: string;
    name: string;
    approvalMode: string;
    minApprovalCount: number;
    active: boolean;
    version: number;
    companyId: string | null;
    steps: Array<{
      stepOrder: number;
      label: string;
      approverStrategy: string;
      fixedUserId: string | null;
      fixedRoleId: string | null;
    }>;
  }): MatrixResponse {
    return {
      id: row.id,
      workflowType: row.workflowType,
      name: row.name,
      approvalMode: row.approvalMode,
      minApprovalCount: row.minApprovalCount,
      active: row.active,
      version: row.version,
      companyId: row.companyId,
      steps: row.steps.map((s) => ({
        stepOrder: s.stepOrder,
        label: s.label,
        approverStrategy: s.approverStrategy,
        fixedUserId: s.fixedUserId,
        fixedRoleId: s.fixedRoleId,
      })),
    };
  }
}
