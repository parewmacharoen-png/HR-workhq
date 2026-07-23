// ============================================================================
// modules/workflow/application/approval-resolver.service.ts
// HR-15 centralized approval routing using HierarchyResolver + matrix config.
// ============================================================================

import { Injectable } from '@nestjs/common';
import { HierarchyResolverService } from '../../hierarchy/application/hierarchy-resolver.service';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import {
  ApprovalChainStep,
  ApprovalContext,
  ApprovalPreviewResult,
  ApproverStrategyType,
  MatrixStepInput,
  OWNER_REQUIRED_WORKFLOW_TYPES,
  WorkflowTypeKey,
} from '../domain/types/approval.types';
import {
  DEFAULT_MATRICES,
  resolveRequesterRoleOverride,
} from '../domain/approval-defaults';
import {
  MinApproversNotMetError,
  NoApproverFoundError,
  OwnerApprovalRequiredError,
} from '../domain/errors/approval.errors';

type LoadedMatrix = {
  id: string;
  workflowType: string;
  approvalMode: 'sequential' | 'parallel';
  minApprovalCount: number;
  steps: MatrixStepInput[];
};

@Injectable()
export class ApprovalResolverService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly hierarchy: HierarchyResolverService,
  ) {}

  async resolveApprovers(
    workflowType: string,
    context: ApprovalContext,
    options: { strict?: boolean } = {},
  ): Promise<ApprovalPreviewResult> {
    const chain = await this.resolveApprovalChain(workflowType, context);
    if (options.strict) {
      this.validateChain(workflowType as WorkflowTypeKey, chain);
    }
    const approvers = chain.flatMap((step) => step.approvers);
    const matrix = await this.loadMatrix(workflowType, context.companyId);
    return {
      workflowType,
      approvalMode: matrix?.approvalMode ?? 'sequential',
      minApprovalCount: matrix?.minApprovalCount ?? 1,
      approvers,
      steps: chain,
      requiresOwner: OWNER_REQUIRED_WORKFLOW_TYPES.has(workflowType as WorkflowTypeKey),
    };
  }

  async resolveApprovalChain(
    workflowType: string,
    context: ApprovalContext,
  ): Promise<ApprovalChainStep[]> {
    const steps = await this.resolveStepDefinitions(workflowType, context);
    const chain: ApprovalChainStep[] = [];

    for (const step of steps) {
      const approvers = await this.resolveStrategyApprovers(
        step.approverStrategy,
        context,
        step,
      );
      chain.push({
        stepOrder: step.stepOrder,
        label: step.label,
        approverStrategy: step.approverStrategy,
        fixedUserId: step.fixedUserId,
        fixedRoleId: step.fixedRoleId,
        approvers: approvers.map((a, index) => ({
          ...a,
          stepOrder: step.stepOrder,
          stepLabel: step.label,
          strategy: step.approverStrategy,
        })),
      });
    }

    return chain;
  }

  async resolveWorkflow(
    workflowType: string,
    context: ApprovalContext,
  ): Promise<ApprovalPreviewResult> {
    return this.resolveApprovers(workflowType, context);
  }

  async assertCanSubmit(workflowType: string, context: ApprovalContext): Promise<ApprovalPreviewResult> {
    return this.resolveApprovers(workflowType, context, { strict: true });
  }

  strategyToApproverRule(strategy: ApproverStrategyType): string {
    switch (strategy) {
      case 'direct_manager': return 'direct_manager';
      case 'big_leader': return 'big_leader';
      case 'owner': return 'owner';
      case 'secretary': return 'secretary';
      case 'any_owner': return 'any_owner';
      case 'fixed_role': return 'role';
      case 'fixed_user':
      case 'workflow_override':
        return 'owner';
      default: return 'owner';
    }
  }

  private async resolveStepDefinitions(
    workflowType: string,
    context: ApprovalContext,
  ): Promise<MatrixStepInput[]> {
    const requesterOverride = resolveRequesterRoleOverride(context.requesterBusinessRole);
    if (requesterOverride) return requesterOverride;

    if (workflowType === 'ot_request') {
      return this.resolveOtSteps(context);
    }

    if (workflowType === 'monthly_off_request') {
      return this.resolveMonthlyOffSteps(context);
    }

    const matrix = await this.loadMatrix(workflowType, context.companyId);
    if (matrix?.steps.length) return matrix.steps;

    return this.defaultStepsForType(workflowType as WorkflowTypeKey);
  }

  private resolveOtSteps(context: ApprovalContext): MatrixStepInput[] {
    const role = context.requesterRoleLevel ?? context.requesterBusinessRole;
    if (role === 'big_leader') {
      return [{ stepOrder: 1, label: 'Any Owner', approverStrategy: 'any_owner' }];
    }
    if (role === 'sub_leader') {
      return [{ stepOrder: 1, label: 'Big Leader approval', approverStrategy: 'big_leader' }];
    }
    return [{ stepOrder: 1, label: 'Direct Manager approval', approverStrategy: 'direct_manager' }];
  }

  private resolveMonthlyOffSteps(context: ApprovalContext): MatrixStepInput[] {
    const role = context.requesterRoleLevel ?? context.requesterBusinessRole;
    if (role === 'big_leader' || role === 'owner') {
      return [{ stepOrder: 1, label: 'Any Owner', approverStrategy: 'any_owner' }];
    }
    if (role === 'sub_leader') {
      return [{ stepOrder: 1, label: 'Big Leader', approverStrategy: 'big_leader' }];
    }
    return [{ stepOrder: 1, label: 'Any Owner', approverStrategy: 'any_owner' }];
  }

  private defaultStepsForType(workflowType: WorkflowTypeKey): MatrixStepInput[] {
    const def = DEFAULT_MATRICES.find((m) => m.workflowType === workflowType);
    return def?.steps ?? [{ stepOrder: 1, label: 'Any Owner', approverStrategy: 'any_owner' }];
  }

  private async loadMatrix(
    workflowType: string,
    companyId?: string | null,
  ): Promise<LoadedMatrix | null> {
    const row = await this.prisma.approvalAuthorityMatrix.findFirst({
      where: {
        workflowType,
        active: true,
        deletedAt: null,
        OR: [{ companyId: companyId ?? undefined }, { companyId: null }],
      },
      orderBy: [{ companyId: 'desc' }, { version: 'desc' }],
      include: {
        steps: { orderBy: { stepOrder: 'asc' } },
      },
    });
    if (!row) return null;
    return {
      id: row.id,
      workflowType: row.workflowType,
      approvalMode: row.approvalMode,
      minApprovalCount: row.minApprovalCount,
      steps: row.steps.map((s) => ({
        stepOrder: s.stepOrder,
        label: s.label,
        approverStrategy: s.approverStrategy as ApproverStrategyType,
        fixedUserId: s.fixedUserId,
        fixedRoleId: s.fixedRoleId,
      })),
    };
  }

  private async resolveStrategyApprovers(
    strategy: ApproverStrategyType,
    context: ApprovalContext,
    step: MatrixStepInput,
  ): Promise<Array<{ employeeId: string | null; userId: string | null; name: string }>> {
    switch (strategy) {
      case 'direct_manager': {
        const manager = await this.hierarchy.getDirectManager(context.employeeId);
        if (!manager) return [];
        const userId = await this.userIdForEmployee(manager.employeeId);
        return [{
          employeeId: manager.employeeId,
          userId,
          name: `${manager.firstName} ${manager.lastName}`.trim(),
        }];
      }
      case 'big_leader': {
        const leader = await this.hierarchy.getBigLeader(context.employeeId, context.companyId ?? undefined);
        if (!leader || leader.employeeId === context.employeeId) {
          return this.usersForAnyOwner();
        }
        const userId = await this.userIdForEmployee(leader.employeeId);
        if (!userId) return this.usersForAnyOwner();
        return [{
          employeeId: leader.employeeId,
          userId,
          name: `${leader.firstName} ${leader.lastName}`.trim(),
        }];
      }
      case 'owner': {
        const owner = await this.hierarchy.getOwner(context.companyId ?? undefined);
        if (!owner) return [];
        const userId = await this.userIdForEmployee(owner.employeeId);
        return [{
          employeeId: owner.employeeId,
          userId,
          name: `${owner.firstName} ${owner.lastName}`.trim(),
        }];
      }
      case 'secretary':
        return this.usersForBusinessRole('secretary', context.companyId);
      case 'any_owner':
        return this.usersForAnyOwner();
      case 'fixed_user':
        if (!step.fixedUserId) return [];
        return this.userById(step.fixedUserId);
      case 'fixed_role':
        if (!step.fixedRoleId) return [];
        return this.usersForRoleId(step.fixedRoleId, context.companyId);
      case 'workflow_override':
        return this.usersForBusinessRole('owner', context.companyId);
      default:
        return [];
    }
  }

  private async userIdForEmployee(employeeId: string): Promise<string | null> {
    const user = await this.prisma.user.findFirst({
      where: { employeeId, deletedAt: null, isActive: true },
      select: { id: true },
    });
    return user?.id ?? null;
  }

  private async userById(userId: string) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null, isActive: true },
      include: { employee: { select: { id: true, firstName: true, lastName: true } } },
    });
    if (!user) return [];
    const name = user.employee
      ? `${user.employee.firstName} ${user.employee.lastName}`.trim()
      : user.username;
    return [{ employeeId: user.employeeId, userId: user.id, name }];
  }

  private async usersForAnyOwner() {
    const assignments = await this.prisma.businessRoleAssignment.findMany({
      where: { role: 'owner', isActive: true, deletedAt: null },
      select: { userId: true },
    });
    const results: Array<{ employeeId: string | null; userId: string | null; name: string }> = [];
    const seen = new Set<string>();
    for (const a of assignments) {
      if (seen.has(a.userId)) continue;
      seen.add(a.userId);
      const user = await this.prisma.user.findFirst({
        where: { id: a.userId, deletedAt: null, isActive: true },
        include: { employee: { select: { id: true, firstName: true, lastName: true } } },
      });
      if (!user) continue;
      results.push({
        employeeId: user.employeeId,
        userId: user.id,
        name: user.employee
          ? `${user.employee.firstName} ${user.employee.lastName}`.trim()
          : user.username,
      });
    }
    return results;
  }

  private async usersForBusinessRole(role: 'owner' | 'secretary', companyId?: string | null) {
    const assignments = await this.prisma.businessRoleAssignment.findMany({
      where: { role, isActive: true, deletedAt: null },
      select: { userId: true },
    });
    const results: Array<{ employeeId: string | null; userId: string | null; name: string }> = [];
    for (const a of assignments) {
      const user = await this.prisma.user.findFirst({
        where: { id: a.userId, deletedAt: null, isActive: true },
        include: { employee: { select: { id: true, firstName: true, lastName: true } } },
      });
      if (!user) continue;
      if (companyId && user.employeeId) {
        const inCompany = await this.prisma.employeeAssignment.findFirst({
          where: {
            employeeId: user.employeeId,
            companyId,
            effectiveTo: null,
            deletedAt: null,
          },
        });
        if (!inCompany) continue;
      }
      results.push({
        employeeId: user.employeeId,
        userId: user.id,
        name: user.employee
          ? `${user.employee.firstName} ${user.employee.lastName}`.trim()
          : user.username,
      });
    }
    return results;
  }

  private async usersForRoleId(roleId: string, companyId?: string | null) {
    const userRoles = await this.prisma.userRole.findMany({
      where: { roleId, deletedAt: null },
      include: {
        user: {
          include: {
            employee: { select: { id: true, firstName: true, lastName: true } },
            scopeGrants: { where: { deletedAt: null } },
          },
        },
      },
    });
    return userRoles
      .filter((ur) => ur.user.deletedAt === null && ur.user.isActive)
      .filter((ur) => this.matchesCompanyScope(ur.user.scopeGrants, companyId))
      .map((ur) => ({
        employeeId: ur.user.employeeId,
        userId: ur.userId,
        name: ur.user.employee
          ? `${ur.user.employee.firstName} ${ur.user.employee.lastName}`.trim()
          : ur.user.username,
      }));
  }

  private matchesCompanyScope(
    scopes: Array<{ scopeType: string; companyId: string | null }>,
    companyId?: string | null,
  ): boolean {
    if (scopes.some((s) => s.scopeType === 'all')) return true;
    if (!companyId) return true;
    return scopes.some((s) => s.scopeType === 'company' && s.companyId === companyId);
  }

  private validateChain(workflowType: WorkflowTypeKey, chain: ApprovalChainStep[]): void {
    const resolvedCount = chain.filter((s) => s.approvers.some((a) => a.userId || a.employeeId)).length;
    if (resolvedCount === 0) {
      throw new NoApproverFoundError(workflowType);
    }

    const minRequired = chain.length;
    if (resolvedCount < minRequired) {
      throw new MinApproversNotMetError(minRequired, resolvedCount);
    }

    if (OWNER_REQUIRED_WORKFLOW_TYPES.has(workflowType)) {
      const hasOwnerStep = chain.some((s) =>
        (s.approverStrategy === 'owner' || s.approverStrategy === 'any_owner')
        && s.approvers.length > 0);
      if (!hasOwnerStep) throw new OwnerApprovalRequiredError();
    }
  }
}
