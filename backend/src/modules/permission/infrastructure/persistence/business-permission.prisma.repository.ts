// ============================================================================
// Business role assignments, overrides, scopes, and permission audit persistence.
// ============================================================================

import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { BusinessRoleCode } from '../../domain/entities/business-role.types';
import { BusinessPermissionRepository } from '../../domain/repositories/business-permission.repository';
import { OverrideNotFoundError } from '../../domain/errors/permission.errors';

@Injectable()
export class PrismaBusinessPermissionRepository implements BusinessPermissionRepository {
  constructor(private readonly prisma: PrismaService) {}

  async assignBusinessRole(input: {
    userId: string;
    role: BusinessRoleCode;
    actorUserId: string;
  }): Promise<void> {
    await this.prisma.businessRoleAssignment.updateMany({
      where: { userId: input.userId, isActive: true, deletedAt: null },
      data: {
        isActive: false,
        deletedAt: new Date(),
        deletedBy: input.actorUserId,
      },
    });

    await this.prisma.businessRoleAssignment.create({
      data: {
        id: randomUUID(),
        userId: input.userId,
        role: input.role,
        assignedBy: input.actorUserId,
        isActive: true,
        createdBy: input.actorUserId,
        updatedBy: input.actorUserId,
      },
    });

    const role = await this.prisma.role.findFirst({
      where: { code: input.role, deletedAt: null },
    });
    if (role) {
      await this.prisma.userRole.updateMany({
        where: { userId: input.userId, deletedAt: null },
        data: { deletedAt: new Date(), deletedBy: input.actorUserId },
      });
      await this.prisma.userRole.create({
        data: {
          id: randomUUID(),
          userId: input.userId,
          roleId: role.id,
          grantedBy: input.actorUserId,
          createdBy: input.actorUserId,
          updatedBy: input.actorUserId,
        },
      });
    }
  }

  async replaceScopes(input: {
    userId: string;
    scopes: Array<{
      scopeType: 'all' | 'company' | 'team' | 'self';
      companyId?: string | null;
      teamId?: string | null;
    }>;
    actorUserId: string;
  }): Promise<void> {
    await this.prisma.scopeGrant.updateMany({
      where: { userId: input.userId, deletedAt: null },
      data: { deletedAt: new Date(), deletedBy: input.actorUserId },
    });

    for (const scope of input.scopes) {
      await this.prisma.scopeGrant.create({
        data: {
          id: randomUUID(),
          userId: input.userId,
          scopeType: scope.scopeType,
          companyId: scope.companyId ?? null,
          teamId: scope.teamId ?? null,
          createdBy: input.actorUserId,
          updatedBy: input.actorUserId,
        },
      });
    }
  }

  async addOverride(input: {
    userId: string;
    permission: string;
    effect: 'allow' | 'deny';
    reason?: string | null;
    actorUserId: string;
  }): Promise<{ id: string }> {
    const id = randomUUID();
    await this.prisma.userPermissionOverride.create({
      data: {
        id,
        userId: input.userId,
        permission: input.permission,
        effect: input.effect,
        reason: input.reason ?? null,
        createdBy: input.actorUserId,
      },
    });
    return { id };
  }

  async removeOverride(overrideId: string, actorUserId: string): Promise<void> {
    const row = await this.prisma.userPermissionOverride.findFirst({
      where: { id: overrideId, deletedAt: null },
    });
    if (!row) throw new OverrideNotFoundError(overrideId);
    await this.prisma.userPermissionOverride.update({
      where: { id: overrideId },
      data: { deletedAt: new Date(), deletedBy: actorUserId },
    });
  }

  async recordAudit(input: {
    actorId: string;
    targetUserId: string;
    action: string;
    oldValue?: unknown;
    newValue?: unknown;
    reason?: string | null;
  }): Promise<void> {
    await this.prisma.permissionAudit.create({
      data: {
        id: randomUUID(),
        actorId: input.actorId,
        targetUserId: input.targetUserId,
        action: input.action,
        oldValue: input.oldValue ?? undefined,
        newValue: input.newValue ?? undefined,
        reason: input.reason ?? null,
      },
    });
  }

  async listAudit(targetUserId: string, limit = 50) {
    return this.prisma.permissionAudit.findMany({
      where: { targetUserId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  async findUserAccess(userId: string) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      include: {
        businessRoleAssignments: {
          where: { isActive: true, deletedAt: null },
          take: 1,
        },
        scopeGrants: { where: { deletedAt: null } },
        permissionOverrides: { where: { deletedAt: null } },
      },
    });
    if (!user) return null;

    return {
      userId: user.id,
      username: user.username,
      employeeId: user.employeeId,
      businessRole: (user.businessRoleAssignments[0]?.role as BusinessRoleCode | undefined) ?? null,
      scopes: user.scopeGrants.map((s) => ({
        id: s.id,
        scopeType: s.scopeType,
        companyId: s.companyId,
        teamId: s.teamId,
      })),
      overrides: user.permissionOverrides.map((o) => ({
        id: o.id,
        permission: o.permission,
        effect: o.effect as 'allow' | 'deny',
        reason: o.reason,
        createdAt: o.createdAt,
      })),
    };
  }

  async searchUsers(query: string, limit = 20) {
    const rows = await this.prisma.user.findMany({
      where: {
        deletedAt: null,
        OR: [
          { username: { contains: query, mode: 'insensitive' } },
          { employee: { globalId: { contains: query, mode: 'insensitive' } } },
          { employee: { firstName: { contains: query, mode: 'insensitive' } } },
          { employee: { lastName: { contains: query, mode: 'insensitive' } } },
        ],
      },
      include: {
        employee: {
          select: { id: true, firstName: true, lastName: true },
        },
      },
      take: limit,
    });
    return rows.map((u) => ({
      id: u.id,
      username: u.username,
      employeeId: u.employeeId,
      displayName: u.employee
        ? [u.employee.firstName, u.employee.lastName].filter(Boolean).join(' ')
        : null,
    }));
  }

  async getEmployeeCompanyIds(employeeId: string): Promise<string[]> {
    const rows = await this.prisma.employeeAssignment.findMany({
      where: { employeeId, deletedAt: null, effectiveTo: null },
      select: { companyId: true },
    });
    return [...new Set(rows.map((r) => r.companyId))];
  }

  async countActiveOwners(excludeUserId?: string): Promise<number> {
    return this.prisma.businessRoleAssignment.count({
      where: {
        role: 'owner',
        isActive: true,
        deletedAt: null,
        ...(excludeUserId ? { userId: { not: excludeUserId } } : {}),
      },
    });
  }

  async findUserIdByEmployeeId(employeeId: string): Promise<string | null> {
    const user = await this.prisma.user.findFirst({
      where: { employeeId, deletedAt: null, isActive: true },
      select: { id: true },
    });
    return user?.id ?? null;
  }

  async getActiveBusinessRole(userId: string): Promise<BusinessRoleCode | null> {
    const row = await this.prisma.businessRoleAssignment.findFirst({
      where: { userId, isActive: true, deletedAt: null },
      select: { role: true },
    });
    return (row?.role as BusinessRoleCode | undefined) ?? null;
  }

  async resolveCompanyNames(ids: string[]) {
    if (!ids.length) return [];
    const rows = await this.prisma.company.findMany({
      where: { id: { in: ids }, deletedAt: null },
      select: { id: true, name: true, code: true },
    });
    return rows;
  }

  async resolveTeamNames(ids: string[]) {
    if (!ids.length) return [];
    const rows = await this.prisma.team.findMany({
      where: { id: { in: ids }, deletedAt: null },
      select: { id: true, name: true, companyId: true },
    });
    return rows;
  }
}
