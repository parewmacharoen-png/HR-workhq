// ============================================================================
// modules/workflow/application/workflow-approver.service.ts
// Resolves who may act on the current workflow step based on step approver rules.
// ============================================================================

import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { HierarchyResolverService } from '../../hierarchy/application/hierarchy-resolver.service';
import { ApprovalResolverService } from './approval-resolver.service';
import { ApprovalDelegationService } from './approval-delegation.service';
import {
  resolveLeaveWorkflowType,
  WORKFLOW_TYPE_ENTITY_MAP,
} from '../domain/types/approval.types';
import { StepDef, WorkflowEntityType } from '../domain/entities/workflow.entity';

type LoadedInstance = Prisma.WorkflowInstanceGetPayload<{
  include: { definition: { include: { steps: true } } };
}>;

@Injectable()
export class WorkflowApproverService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly hierarchy: HierarchyResolverService,
    private readonly approvalResolver: ApprovalResolverService,
    private readonly delegation: ApprovalDelegationService,
  ) {}

  /** Platform admins (super_admin + scope:all) may act via API; Telegram uses strict matching. */
  async isPlatformBypass(userId: string): Promise<boolean> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      include: {
        userRoles: { where: { deletedAt: null }, include: { role: true } },
        scopeGrants: { where: { deletedAt: null } },
      },
    });
    if (!user) return false;
    const isSuperAdmin = user.userRoles.some((ur) => ur.role.code === 'super_admin');
    const hasAllScope = user.scopeGrants.some((s) => s.scopeType === 'all');
    return isSuperAdmin && hasAllScope;
  }

  async isActorCurrentApprover(
    actorUserId: string,
    instanceId: string,
    preloaded?: LoadedInstance,
  ): Promise<boolean> {
    const instance = preloaded ?? (await this.loadInstance(instanceId));
    if (!instance || instance.status !== 'pending') return false;

    const step = instance.definition.steps.find((s) => s.stepOrder === instance.currentStepOrder);
    if (!step) return false;

    const employeeId = await this.subjectEmployeeId(instance);
    const dynamicIds = await this.resolveDynamicApproverUserIds(instance, employeeId);
    if (dynamicIds.length) {
      if (dynamicIds.includes(actorUserId)) return true;
      const isDelegate = await this.delegation.isDelegateForApprovers(
        actorUserId,
        dynamicIds,
        instance.companyId,
        instance.entityType as WorkflowEntityType,
      );
      if (isDelegate) return true;
    }

    const approverIds = await this.resolveApproverUserIds(
      {
        stepOrder: step.stepOrder,
        approverRule: step.approverRule as StepDef['approverRule'],
        approverRoleId: step.approverRoleId,
        allowEscalate: step.allowEscalate,
      },
      instance.companyId,
      employeeId,
    );
    if (approverIds.includes(actorUserId)) return true;
    return this.delegation.isDelegateForApprovers(
      actorUserId,
      approverIds,
      instance.companyId,
      instance.entityType as WorkflowEntityType,
    );
  }

  /** REQ-005 — user ids who may act on the current workflow step. */
  async getCurrentStepApproverUserIds(instanceId: string): Promise<string[]> {
    const instance = await this.loadInstance(instanceId);
    if (!instance || instance.status !== 'pending') return [];

    const employeeId = await this.subjectEmployeeId(instance);
    const dynamicIds = await this.resolveDynamicApproverUserIds(instance, employeeId);
    if (dynamicIds.length) return dynamicIds;

    const step = instance.definition.steps.find((s) => s.stepOrder === instance.currentStepOrder);
    if (!step) return [];
    return this.resolveApproverUserIds(
      {
        stepOrder: step.stepOrder,
        approverRule: step.approverRule as StepDef['approverRule'],
        approverRoleId: step.approverRoleId,
        allowEscalate: step.allowEscalate,
      },
      instance.companyId,
      employeeId,
    );
  }

  async findPendingForActor(
    actorUserId: string,
    entityType: WorkflowEntityType,
    companyId: string | null,
    limit = 5,
  ): Promise<LoadedInstance[]> {
    if (await this.isBusinessOwnerOrSecretary(actorUserId)) {
      return this.prisma.workflowInstance.findMany({
        where: {
          status: 'pending',
          entityType,
          deletedAt: null,
          ...(companyId ? { companyId } : {}),
        },
        orderBy: { createdAt: 'asc' },
        take: limit,
        include: { definition: { include: { steps: true } } },
      });
    }

    const instances = await this.prisma.workflowInstance.findMany({
      where: {
        status: 'pending',
        entityType,
        deletedAt: null,
        ...(companyId ? { companyId } : {}),
      },
      orderBy: { createdAt: 'asc' },
      take: 100,
      include: { definition: { include: { steps: true } } },
    });

    const matched: LoadedInstance[] = [];
    for (const inst of instances) {
      if (await this.isActorCurrentApprover(actorUserId, inst.id, inst)) {
        matched.push(inst);
        if (matched.length >= limit) break;
      }
    }
    return matched;
  }

  async isBusinessOwnerOrSecretary(userId: string): Promise<boolean> {
    const row = await this.prisma.businessRoleAssignment.findFirst({
      where: {
        userId,
        isActive: true,
        deletedAt: null,
        role: { in: ['owner', 'secretary'] },
      },
    });
    return !!row;
  }

  private async loadInstance(instanceId: string): Promise<LoadedInstance | null> {
    return this.prisma.workflowInstance.findFirst({
      where: { id: instanceId, deletedAt: null },
      include: { definition: { include: { steps: true } } },
    });
  }

  private async resolveDynamicApproverUserIds(
    instance: LoadedInstance,
    subjectEmployeeId: string | null,
  ): Promise<string[]> {
    if (!subjectEmployeeId) return [];

    const workflowType = await this.resolveWorkflowType(instance, subjectEmployeeId);
    if (!workflowType) return [];

    const context = await this.buildApprovalContext(subjectEmployeeId, instance.companyId, workflowType, instance);
    const chain = await this.approvalResolver.resolveApprovalChain(workflowType, context);
    const current = chain.find((s) => s.stepOrder === instance.currentStepOrder);
    if (!current) return [];
    return current.approvers
      .map((a) => a.userId)
      .filter((id): id is string => !!id);
  }

  private async resolveWorkflowType(
    instance: LoadedInstance,
    subjectEmployeeId: string,
  ): Promise<string | null> {
    if (instance.entityType === 'leave') {
      const row = await this.prisma.leaveRequest.findFirst({
        where: { id: instance.entityId, deletedAt: null },
        include: { leaveType: { select: { code: true } } },
      });
      if (row?.leaveType?.code) return resolveLeaveWorkflowType(row.leaveType.code);
      return 'leave_request';
    }
    if (instance.entityType === 'overtime') return 'ot_request';
    if (instance.entityType === 'monthly_off') return 'monthly_off_request';
    if (instance.entityType === 'leave_reschedule') return 'leave_reschedule';
    if (instance.entityType === 'leave_shift_swap') return 'leave_shift_swap';
    if (instance.entityType === 'attendance_correction') return 'attendance_correction';
    if (instance.entityType === 'document_request') return 'document_request';
    if (instance.entityType === 'commission_adjustment') return 'commission_adjustment';
    if (instance.entityType === 'payroll_adjustment') return 'payroll_adjustment';
    if (instance.entityType === 'advance') return 'advance_payment';
    const mapped = Object.entries(WORKFLOW_TYPE_ENTITY_MAP)
      .find(([, entityType]) => entityType === instance.entityType);
    return mapped?.[0] ?? null;
  }

  private async buildApprovalContext(
    employeeId: string,
    companyId: string | null,
    workflowType: string,
    instance: LoadedInstance,
  ) {
    const assignment = await this.prisma.employeeAssignment.findFirst({
      where: { employeeId, effectiveTo: null, deletedAt: null, isPrimaryCompany: true },
      select: { roleLevel: true },
    });
    const user = await this.prisma.user.findFirst({
      where: { employeeId, deletedAt: null },
      include: {
        businessRoleAssignments: { where: { isActive: true, deletedAt: null }, take: 1 },
      },
    });
    let leaveTypeCode: string | undefined;
    if (workflowType.startsWith('leave_') && instance.entityType === 'leave') {
      const row = await this.prisma.leaveRequest.findFirst({
        where: { id: instance.entityId, deletedAt: null },
        include: { leaveType: { select: { code: true } } },
      });
      leaveTypeCode = row?.leaveType?.code;
    }
    return {
      employeeId,
      companyId,
      leaveTypeCode,
      requesterRoleLevel: assignment?.roleLevel ?? null,
      requesterBusinessRole: user?.businessRoleAssignments[0]?.role ?? null,
    };
  }

  private async resolveApproverUserIds(
    step: StepDef,
    companyId: string | null,
    subjectEmployeeId: string | null,
  ): Promise<string[]> {
    switch (step.approverRule) {
      case 'sub_leader':
        return this.usersForTeamRole(subjectEmployeeId, 'sub_leader');
      case 'big_leader':
        return this.usersForBigLeader(subjectEmployeeId);
      case 'hr':
        return this.usersForHr(companyId);
      case 'finance':
        return this.usersForFinance(companyId);
      case 'owner':
        return this.usersForOwner(companyId);
      case 'direct_manager':
        return this.usersForDirectManager(subjectEmployeeId);
      case 'secretary':
        return this.usersForSecretary(companyId);
      case 'any_owner':
        return this.usersForAnyOwner();
      case 'role':
        return step.approverRoleId
          ? this.usersForRoleId(step.approverRoleId, companyId)
          : [];
      default:
        return [];
    }
  }

  /** Employee who owns the workflow entity (leave requester, OT worker, etc.). */
  private async subjectEmployeeId(instance: LoadedInstance): Promise<string | null> {
    switch (instance.entityType) {
      case 'leave': {
        const row = await this.prisma.leaveRequest.findFirst({
          where: { id: instance.entityId, deletedAt: null },
          select: { employeeId: true },
        });
        return row?.employeeId ?? null;
      }
      case 'overtime': {
        const row = await this.prisma.overtimeRecord.findFirst({
          where: { id: instance.entityId, deletedAt: null },
          select: { employeeId: true },
        });
        return row?.employeeId ?? null;
      }
      case 'leave_reschedule': {
        const row = await this.prisma.leaveRescheduleRequest.findFirst({
          where: { id: instance.entityId, deletedAt: null },
          select: { employeeId: true },
        });
        return row?.employeeId ?? null;
      }
      case 'leave_shift_swap': {
        const row = await this.prisma.leaveShiftSwapRequest.findFirst({
          where: { id: instance.entityId, deletedAt: null },
          select: { requesterEmployeeId: true },
        });
        return row?.requesterEmployeeId ?? null;
      }
      case 'advance': {
        const row = await this.prisma.advanceRequest.findFirst({
          where: { id: instance.entityId, deletedAt: null },
          select: { employeeId: true },
        });
        return row?.employeeId ?? null;
      }
      case 'attendance_correction': {
        const row = await this.prisma.attendanceCorrection.findFirst({
          where: { id: instance.entityId, deletedAt: null },
          include: { attendanceRecord: { select: { employeeId: true } } },
        });
        return row?.attendanceRecord?.employeeId ?? null;
      }
      case 'monthly_off': {
        const row = await this.prisma.monthlyOffRequest.findFirst({
          where: { id: instance.entityId, deletedAt: null },
          select: { employeeId: true },
        });
        return row?.employeeId ?? null;
      }
      case 'document_request': {
        const row = await this.prisma.documentRequest.findFirst({
          where: { id: instance.entityId },
          select: { employeeId: true },
        });
        return row?.employeeId ?? null;
      }
      default: {
        if (!instance.initiatedBy) return null;
        const user = await this.prisma.user.findFirst({
          where: { id: instance.initiatedBy, deletedAt: null },
          select: { employeeId: true },
        });
        return user?.employeeId ?? null;
      }
    }
  }

  private async employeeTeamId(employeeId: string | null): Promise<string | null> {
    if (!employeeId) return null;
    const assignment = await this.prisma.employeeAssignment.findFirst({
      where: {
        employeeId,
        teamId: { not: null },
        effectiveTo: null,
        deletedAt: null,
      },
      orderBy: [{ isPrimaryTeam: 'desc' }, { isPrimaryCompany: 'desc' }],
      select: { teamId: true },
    });
    return assignment?.teamId ?? null;
  }

  private async usersForTeamRole(
    subjectEmployeeId: string | null,
    roleLevel: 'sub_leader' | 'big_leader',
  ): Promise<string[]> {
    const teamId = await this.employeeTeamId(subjectEmployeeId);
    if (!teamId) return [];

    const assignments = await this.prisma.employeeAssignment.findMany({
      where: {
        teamId,
        roleLevel,
        effectiveTo: null,
        deletedAt: null,
      },
      include: {
        employee: {
          include: {
            users: { where: { deletedAt: null, isActive: true }, select: { id: true } },
          },
        },
      },
    });
    return [...new Set(assignments.flatMap((a) => a.employee.users.map((u) => u.id)))];
  }

  private async usersForBigLeader(subjectEmployeeId: string | null): Promise<string[]> {
    const teamId = await this.employeeTeamId(subjectEmployeeId);
    if (!teamId) return [];

    const ids = new Set<string>();
    const team = await this.prisma.team.findFirst({
      where: { id: teamId, deletedAt: null },
      select: { bigLeaderEmployeeId: true },
    });
    if (team?.bigLeaderEmployeeId) {
      const users = await this.prisma.user.findMany({
        where: { employeeId: team.bigLeaderEmployeeId, deletedAt: null, isActive: true },
        select: { id: true },
      });
      users.forEach((u) => ids.add(u.id));
    }
    for (const uid of await this.usersForTeamRole(subjectEmployeeId, 'big_leader')) {
      ids.add(uid);
    }
    return [...ids];
  }

  private async usersForHr(companyId: string | null): Promise<string[]> {
    return this.usersForRolePattern(
      (code) => code === 'hr' || code.startsWith('hr_') || code === 'super_admin',
      companyId,
    );
  }

  private async usersForFinance(companyId: string | null): Promise<string[]> {
    return this.usersForRolePattern(
      (code) => code === 'finance' || code.startsWith('finance_'),
      companyId,
    );
  }

  private async usersForDirectManager(subjectEmployeeId: string | null): Promise<string[]> {
    if (!subjectEmployeeId) return [];
    const manager = await this.hierarchy.getDirectManager(subjectEmployeeId);
    if (!manager) return [];
    const users = await this.prisma.user.findMany({
      where: { employeeId: manager.employeeId, deletedAt: null, isActive: true },
      select: { id: true },
    });
    return users.map((u) => u.id);
  }

  private async usersForSecretary(companyId: string | null): Promise<string[]> {
    const assignments = await this.prisma.businessRoleAssignment.findMany({
      where: { role: 'secretary', isActive: true, deletedAt: null },
      select: { userId: true },
    });
    const ids: string[] = [];
    for (const a of assignments) {
      const user = await this.prisma.user.findFirst({
        where: { id: a.userId, deletedAt: null, isActive: true },
        include: { scopeGrants: { where: { deletedAt: null } } },
      });
      if (!user) continue;
      if (this.userMatchesCompanyScope(user.scopeGrants, companyId, false)) {
        ids.push(user.id);
      }
    }
    return ids;
  }

  private async usersForAnyOwner(): Promise<string[]> {
    const assignments = await this.prisma.businessRoleAssignment.findMany({
      where: { role: 'owner', isActive: true, deletedAt: null },
      select: { userId: true },
    });
    const ids: string[] = [];
    for (const a of assignments) {
      const user = await this.prisma.user.findFirst({
        where: { id: a.userId, deletedAt: null, isActive: true },
        select: { id: true },
      });
      if (user) ids.push(user.id);
    }
    return ids;
  }

  private async usersForOwner(companyId: string | null): Promise<string[]> {
    return this.usersForRolePattern(
      (code) => code === 'owner' || code === 'super_admin',
      companyId,
      true,
    );
  }

  private async usersForRoleId(roleId: string, companyId: string | null): Promise<string[]> {
    const userRoles = await this.prisma.userRole.findMany({
      where: { roleId, deletedAt: null },
      include: {
        user: {
          include: { scopeGrants: { where: { deletedAt: null } } },
        },
      },
    });
    return userRoles
      .filter((ur) => ur.user.deletedAt === null && ur.user.isActive)
      .filter((ur) => this.userMatchesCompanyScope(ur.user.scopeGrants, companyId, false))
      .map((ur) => ur.userId);
  }

  private async usersForRolePattern(
    match: (code: string) => boolean,
    companyId: string | null,
    ownerRule = false,
  ): Promise<string[]> {
    const users = await this.prisma.user.findMany({
      where: { deletedAt: null, isActive: true },
      include: {
        userRoles: { where: { deletedAt: null }, include: { role: true } },
        scopeGrants: { where: { deletedAt: null } },
      },
    });

    return users
      .filter((u) => u.userRoles.some((ur) => match(ur.role.code)))
      .filter((u) => this.userMatchesCompanyScope(u.scopeGrants, companyId, ownerRule))
      .map((u) => u.id);
  }

  private userMatchesCompanyScope(
    scopes: Array<{ scopeType: string; companyId: string | null }>,
    companyId: string | null,
    ownerRule: boolean,
  ): boolean {
    if (scopes.some((s) => s.scopeType === 'all')) return true;
    if (!companyId) return ownerRule;
    return scopes.some((s) => s.scopeType === 'company' && s.companyId === companyId);
  }
}
