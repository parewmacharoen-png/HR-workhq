// ============================================================================
// modules/hierarchy/application/hierarchy-resolver.service.ts
// ============================================================================

import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import {
  HIERARCHY_REPOSITORY,
  HierarchyRepository,
} from '../domain/repositories/hierarchy.repository';
import type {
  DirectReportItem,
  HierarchyEmployeeSummary,
  HierarchyRelationshipType,
  HierarchySummary,
  OrganizationTreeNode,
  ReportingPathNode,
} from '../domain/types/hierarchy.types';

@Injectable()
export class HierarchyResolverService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(HIERARCHY_REPOSITORY) private readonly hierarchy: HierarchyRepository,
  ) {}

  async getDirectManager(
    employeeId: string,
    relationshipType: HierarchyRelationshipType = 'direct_manager',
  ): Promise<HierarchyEmployeeSummary | null> {
    const line = await this.hierarchy.findActiveByEmployee(employeeId, relationshipType);
    if (!line) return null;
    return this.loadEmployeeSummary(line.managerEmployeeId);
  }

  async getManagerChain(
    employeeId: string,
    relationshipType: HierarchyRelationshipType = 'direct_manager',
  ): Promise<HierarchyEmployeeSummary[]> {
    const chain: HierarchyEmployeeSummary[] = [];
    const visited = new Set<string>();
    let currentId: string | null = employeeId;

    while (currentId) {
      const line = await this.hierarchy.findActiveByEmployee(currentId, relationshipType);
      if (!line) break;
      if (visited.has(line.managerEmployeeId)) break;
      visited.add(line.managerEmployeeId);
      const manager = await this.loadEmployeeSummary(line.managerEmployeeId);
      if (!manager) break;
      chain.push(manager);
      currentId = line.managerEmployeeId;
    }

    return chain;
  }

  async getDirectReports(
    managerEmployeeId: string,
    relationshipType: HierarchyRelationshipType = 'direct_manager',
  ): Promise<DirectReportItem[]> {
    const lines = await this.hierarchy.findActiveByManager(managerEmployeeId, relationshipType);
    const items: DirectReportItem[] = [];
    for (const line of lines) {
      const summary = await this.loadDirectReport(line.employeeId);
      if (summary) items.push(summary);
    }
    return items;
  }

  async getReportingPath(
    employeeId: string,
    relationshipType: HierarchyRelationshipType = 'direct_manager',
  ): Promise<ReportingPathNode[]> {
    const path: ReportingPathNode[] = [];
    const self = await this.loadEmployeeSummary(employeeId);
    if (!self) return path;

    path.push({ ...self, relationshipType: null });

    const chain = await this.getManagerChain(employeeId, relationshipType);
    for (const manager of chain) {
      path.push({ ...manager, relationshipType });
    }

    return path.reverse();
  }

  async getBigLeader(employeeId: string, companyId?: string): Promise<HierarchyEmployeeSummary | null> {
    const teamLeaderId = await this.teamBigLeaderEmployeeId(employeeId);
    if (teamLeaderId && teamLeaderId !== employeeId) {
      return this.loadEmployeeSummary(teamLeaderId);
    }

    const chain = await this.getManagerChain(employeeId);
    for (const manager of chain) {
      if (manager.roleLevel === 'big_leader' || manager.businessRole === 'big_leader') {
        return manager;
      }
    }

    const assignment = await this.prisma.employeeAssignment.findFirst({
      where: {
        employeeId,
        effectiveTo: null,
        deletedAt: null,
        ...(companyId ? { companyId } : {}),
        roleLevel: 'big_leader',
      },
    });
    if (assignment) {
      return this.loadEmployeeSummary(employeeId);
    }

    const businessRole = await this.businessRoleForEmployee(employeeId);
    if (businessRole === 'big_leader') {
      return this.loadEmployeeSummary(employeeId);
    }

    return chain.find((m) => m.roleLevel === 'big_leader' || m.businessRole === 'big_leader') ?? null;
  }

  private async teamBigLeaderEmployeeId(employeeId: string): Promise<string | null> {
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
    if (!assignment?.teamId) return null;
    const team = await this.prisma.team.findFirst({
      where: { id: assignment.teamId, deletedAt: null },
      select: { bigLeaderEmployeeId: true },
    });
    return team?.bigLeaderEmployeeId ?? null;
  }

  private async businessRoleForEmployee(employeeId: string): Promise<string | null> {
    const user = await this.prisma.user.findFirst({
      where: { employeeId, deletedAt: null, isActive: true },
      include: {
        businessRoleAssignments: {
          where: { isActive: true, deletedAt: null },
          select: { role: true },
          take: 1,
        },
      },
    });
    return user?.businessRoleAssignments[0]?.role ?? null;
  }

  async getOwner(companyId?: string): Promise<HierarchyEmployeeSummary | null> {
    const ownerAssignment = await this.prisma.businessRoleAssignment.findFirst({
      where: { role: 'owner', isActive: true, deletedAt: null },
      select: { userId: true },
    });
    if (!ownerAssignment) return null;

    const user = await this.prisma.user.findFirst({
      where: { id: ownerAssignment.userId, deletedAt: null, employeeId: { not: null } },
      select: { employeeId: true },
    });
    if (!user?.employeeId) return null;

    if (companyId) {
      const inCompany = await this.prisma.employeeAssignment.findFirst({
        where: {
          employeeId: user.employeeId,
          companyId,
          effectiveTo: null,
          deletedAt: null,
        },
      });
      if (!inCompany) return null;
    }

    return this.loadEmployeeSummary(user.employeeId);
  }

  async getDescendantEmployeeIds(
    managerEmployeeId: string,
    relationshipType: HierarchyRelationshipType = 'direct_manager',
  ): Promise<string[]> {
    const result: string[] = [];
    const queue = [managerEmployeeId];
    const visited = new Set<string>([managerEmployeeId]);

    while (queue.length) {
      const current = queue.shift()!;
      const reports = await this.hierarchy.findActiveByManager(current, relationshipType);
      for (const line of reports) {
        if (visited.has(line.employeeId)) continue;
        visited.add(line.employeeId);
        result.push(line.employeeId);
        queue.push(line.employeeId);
      }
    }

    return result;
  }

  async getHierarchySummary(
    employeeId: string,
    companyId?: string,
  ): Promise<HierarchySummary> {
    const directReports = await this.getDirectReports(employeeId);
    const descendants = await this.getDescendantEmployeeIds(employeeId);
    const teamIds = [employeeId, ...descendants];

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [pendingLeaveCount, pendingApprovalCount, lateArrivalCountToday] = await Promise.all([
      this.prisma.leaveRequest.count({
        where: {
          employeeId: { in: teamIds },
          status: 'pending',
          deletedAt: null,
          ...(companyId ? { companyId } : {}),
        },
      }),
      this.countPendingApprovals(teamIds, companyId),
      this.prisma.attendanceRecord.count({
        where: {
          employeeId: { in: teamIds },
          workDate: today,
          lateMinutes: { gt: 0 },
          deletedAt: null,
          ...(companyId ? { companyId } : {}),
        },
      }),
    ]);

    return {
      employeeId,
      directReportCount: directReports.length,
      teamSize: descendants.length,
      pendingLeaveCount,
      pendingApprovalCount,
      lateArrivalCountToday,
    };
  }

  async buildOrganizationTree(companyId: string): Promise<OrganizationTreeNode[]> {
    const employees = await this.prisma.employee.findMany({
      where: {
        deletedAt: null,
        assignments: {
          some: { companyId, effectiveTo: null, deletedAt: null },
        },
      },
      select: { id: true },
    });
    const employeeIds = new Set(employees.map((e) => e.id));

    const lines = await this.hierarchy.findAllActive('direct_manager');
    const companyLines = lines.filter(
      (line) => employeeIds.has(line.employeeId) && employeeIds.has(line.managerEmployeeId),
    );

    const managerByEmployee = new Map<string, string>();
    const childrenByManager = new Map<string, string[]>();

    for (const line of companyLines) {
      managerByEmployee.set(line.employeeId, line.managerEmployeeId);
      const siblings = childrenByManager.get(line.managerEmployeeId) ?? [];
      siblings.push(line.employeeId);
      childrenByManager.set(line.managerEmployeeId, siblings);
    }

    const roots = [...employeeIds].filter((id) => !managerByEmployee.has(id));
    const sortedRoots = await this.sortEmployeeIds(roots);

    const nodes: OrganizationTreeNode[] = [];
    for (const rootId of sortedRoots) {
      nodes.push(await this.buildTreeNode(rootId, childrenByManager));
    }

    return nodes;
  }

  private async buildTreeNode(
    employeeId: string,
    childrenByManager: Map<string, string[]>,
  ): Promise<OrganizationTreeNode> {
    const summary = await this.loadEmployeeSummary(employeeId);
    const childIds = childrenByManager.get(employeeId) ?? [];
    const sortedChildIds = await this.sortEmployeeIds(childIds);
    const children: OrganizationTreeNode[] = [];
    for (const childId of sortedChildIds) {
      children.push(await this.buildTreeNode(childId, childrenByManager));
    }

    return {
      employeeId,
      globalId: summary?.globalId ?? employeeId.slice(0, 8),
      firstName: summary?.firstName ?? 'Unknown',
      lastName: summary?.lastName ?? '',
      position: summary?.position ?? null,
      department: summary?.department ?? null,
      roleLevel: summary?.roleLevel ?? null,
      businessRole: summary?.businessRole ?? null,
      directReportCount: children.length,
      children,
    };
  }

  private async sortEmployeeIds(ids: string[]): Promise<string[]> {
    if (!ids.length) return [];
    const rows = await this.prisma.employee.findMany({
      where: { id: { in: ids }, deletedAt: null },
      select: { id: true, globalId: true, firstName: true, lastName: true },
      orderBy: [{ globalId: 'asc' }],
    });
    return rows.map((r) => r.id);
  }

  private async loadEmployeeSummary(employeeId: string): Promise<HierarchyEmployeeSummary | null> {
    const employee = await this.prisma.employee.findFirst({
      where: { id: employeeId, deletedAt: null },
      select: {
        id: true,
        globalId: true,
        firstName: true,
        lastName: true,
        position: true,
        department: true,
        assignments: {
          where: { effectiveTo: null, deletedAt: null, isPrimaryCompany: true },
          select: { roleLevel: true },
          take: 1,
        },
        users: {
          where: { deletedAt: null, isActive: true },
          select: {
            businessRoleAssignments: {
              where: { isActive: true, deletedAt: null },
              select: { role: true },
              take: 1,
            },
          },
          take: 1,
        },
      },
    });
    if (!employee) return null;

    return {
      employeeId: employee.id,
      globalId: employee.globalId,
      firstName: employee.firstName,
      lastName: employee.lastName,
      position: employee.position,
      department: employee.department,
      roleLevel: employee.assignments[0]?.roleLevel ?? null,
      businessRole: employee.users[0]?.businessRoleAssignments[0]?.role ?? null,
    };
  }

  private async loadDirectReport(employeeId: string): Promise<DirectReportItem | null> {
    const employee = await this.prisma.employee.findFirst({
      where: { id: employeeId, deletedAt: null },
      select: {
        id: true,
        globalId: true,
        firstName: true,
        lastName: true,
        position: true,
        department: true,
        employmentStatus: true,
        assignments: {
          where: { effectiveTo: null, deletedAt: null, isPrimaryCompany: true },
          select: { roleLevel: true },
          take: 1,
        },
        users: {
          where: { deletedAt: null, isActive: true },
          select: {
            businessRoleAssignments: {
              where: { isActive: true, deletedAt: null },
              select: { role: true },
              take: 1,
            },
          },
          take: 1,
        },
      },
    });
    if (!employee) return null;

    return {
      employeeId: employee.id,
      globalId: employee.globalId,
      firstName: employee.firstName,
      lastName: employee.lastName,
      position: employee.position,
      department: employee.department,
      roleLevel: employee.assignments[0]?.roleLevel ?? null,
      businessRole: employee.users[0]?.businessRoleAssignments[0]?.role ?? null,
      employmentStatus: employee.employmentStatus,
    };
  }

  private async countPendingApprovals(teamIds: string[], companyId?: string): Promise<number> {
    const entityIds = await this.pendingEntityIdsForTeam(teamIds);
    if (!entityIds.length) return 0;
    return this.prisma.workflowInstance.count({
      where: {
        status: 'pending',
        deletedAt: null,
        entityId: { in: entityIds },
        ...(companyId ? { companyId } : {}),
      },
    });
  }

  private async pendingEntityIdsForTeam(teamIds: string[]): Promise<string[]> {
    const [leaveIds, otIds] = await Promise.all([
      this.prisma.leaveRequest.findMany({
        where: { employeeId: { in: teamIds }, status: 'pending', deletedAt: null },
        select: { id: true },
      }),
      this.prisma.overtimeRecord.findMany({
        where: { employeeId: { in: teamIds }, deletedAt: null },
        select: { id: true },
      }),
    ]);
    return [...leaveIds.map((r) => r.id), ...otIds.map((r) => r.id)];
  }
}
