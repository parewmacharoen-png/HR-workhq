// ============================================================================
// Updated auth context loader — business role bundle, scopes, overrides.
// ============================================================================

import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { AuthorizationContext } from '../../domain/entities/authorization.types';
import {
  AuthContextRepository, RoleAssignmentRepository, ImpersonationRepository,
} from '../../domain/repositories/permission.repository';
import { DuplicateRoleAssignmentError } from '../../domain/errors/permission.errors';
import { BUSINESS_ROLE_BUNDLES } from '../../domain/entities/business-role-bundles';
import { BusinessRoleCode } from '../../domain/entities/business-role.types';

@Injectable()
export class PrismaAuthContextRepository implements AuthContextRepository {
  constructor(private readonly prisma: PrismaService) {}

  async loadForUser(userId: string): Promise<AuthorizationContext | null> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      include: {
        businessRoleAssignments: {
          where: { isActive: true, deletedAt: null },
          take: 1,
        },
        userRoles: {
          where: { deletedAt: null },
          include: {
            role: {
              include: {
                rolePermissions: { include: { permission: true } },
              },
            },
          },
        },
        scopeGrants: { where: { deletedAt: null } },
        permissionOverrides: { where: { deletedAt: null } },
      },
    });
    if (!user) return null;

    const businessAssignment = user.businessRoleAssignments[0] ?? null;
    const businessRole = businessAssignment?.role ?? null;

    const roleCodes: string[] = [];
    const permissions = new Set<string>();
    const seenRoleCodes = new Set<string>();

    // Merge permissions from every assigned RBAC role (e.g. super_admin + owner).
    for (const ur of user.userRoles) {
      if (!seenRoleCodes.has(ur.role.code)) {
        seenRoleCodes.add(ur.role.code);
        roleCodes.push(ur.role.code);
      }
      for (const rp of ur.role.rolePermissions) {
        permissions.add(rp.permission.key);
      }
    }

    // Ensure business role code is present and load bundle if not linked via UserRole.
    if (businessRole && !seenRoleCodes.has(businessRole)) {
      roleCodes.push(businessRole);
      const role = await this.prisma.role.findFirst({
        where: { code: businessRole, deletedAt: null },
        include: { rolePermissions: { include: { permission: true } } },
      });
      for (const rp of role?.rolePermissions ?? []) {
        permissions.add(rp.permission.key);
      }
    } else if (businessRole && !roleCodes.includes(businessRole)) {
      roleCodes.unshift(businessRole);
    }

    if (businessRole) {
      const bundle = BUSINESS_ROLE_BUNDLES[businessRole as BusinessRoleCode] ?? [];
      for (const key of bundle) permissions.add(key);
    }

    const overrides = user.permissionOverrides.map((o) => ({
      permission: o.permission,
      effect: o.effect as 'allow' | 'deny',
    }));

    return {
      userId: user.id,
      employeeId: user.employeeId,
      userType: user.userType as 'human' | 'system' | 'ai',
      businessRole,
      roleCodes,
      permissions,
      overrides,
      scopes: user.scopeGrants.map((s) => ({
        scopeType: s.scopeType as AuthorizationContext['scopes'][number]['scopeType'],
        companyId: s.companyId,
        teamId: s.teamId,
      })),
    };
  }
}

@Injectable()
export class PrismaRoleAssignmentRepository implements RoleAssignmentRepository {
  constructor(private readonly prisma: PrismaService) {}

  async userHasRole(userId: string, roleId: string): Promise<boolean> {
    const count = await this.prisma.userRole.count({
      where: { userId, roleId, deletedAt: null },
    });
    return count > 0;
  }

  async assignRole(userId: string, roleId: string, actorUserId: string): Promise<void> {
    if (await this.userHasRole(userId, roleId)) {
      throw new DuplicateRoleAssignmentError();
    }
    await this.prisma.userRole.create({
      data: {
        id: randomUUID(),
        userId,
        roleId,
        grantedBy: actorUserId,
        createdBy: actorUserId,
        updatedBy: actorUserId,
      },
    });
  }

  async revokeRole(userId: string, roleId: string, actorUserId: string): Promise<void> {
    await this.prisma.userRole.updateMany({
      where: { userId, roleId, deletedAt: null },
      data: { deletedAt: new Date(), deletedBy: actorUserId },
    });
  }

  async grantScope(input: {
    userId: string;
    scopeType: 'all' | 'company' | 'team' | 'self';
    companyId?: string | null;
    teamId?: string | null;
    actorUserId: string;
  }): Promise<void> {
    await this.prisma.scopeGrant.create({
      data: {
        id: randomUUID(),
        userId: input.userId,
        scopeType: input.scopeType,
        companyId: input.companyId ?? null,
        teamId: input.teamId ?? null,
        createdBy: input.actorUserId,
        updatedBy: input.actorUserId,
      },
    });
  }
}

@Injectable()
export class PrismaImpersonationRepository implements ImpersonationRepository {
  constructor(private readonly prisma: PrismaService) {}

  async start(actorUserId: string, targetUserId: string, reason: string | null): Promise<string> {
    const row = await this.prisma.impersonationLog.create({
      data: {
        id: randomUUID(),
        actorUserId,
        targetUserId,
        reason: reason ?? undefined,
        createdBy: actorUserId,
        updatedBy: actorUserId,
      },
    });
    return row.id;
  }

  async end(impersonationId: string): Promise<void> {
    await this.prisma.impersonationLog.update({
      where: { id: impersonationId },
      data: { endedAt: new Date() },
    });
  }
}
