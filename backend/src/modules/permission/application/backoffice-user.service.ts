// ============================================================================
// Back-office users — standalone logins separate from employee Telegram flow.
// ============================================================================

import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { ActorContext } from '../../../shared/kernel/actor-context';
import {
  BUSINESS_PERMISSION_REPOSITORY,
  BusinessPermissionRepository,
} from '../domain/repositories/business-permission.repository';
import { AccessControlService } from './access-control.service';
import { BUSINESS_ROLE_BUNDLES } from '../domain/entities/business-role-bundles';
import {
  allMatrixPermissionKeys,
  BACKOFFICE_ACCESS_MODULES,
  BACKOFFICE_STAFF_ROLES,
  BackofficeStaffRole,
} from '../domain/entities/backoffice-access-matrix';
import { BusinessRoleCode } from '../domain/entities/business-role.types';
import { resolveEffectivePermissions } from '../domain/services/effective-permissions.service';
import {
  AUTH_CONTEXT_REPOSITORY,
  AuthContextRepository,
} from '../domain/repositories/permission.repository';
import { UserNotFoundError } from '../domain/errors/permission.errors';
import { ConflictError } from '../../../shared/kernel/domain-error';

const STAFF_ROLE_SET = new Set<string>(BACKOFFICE_STAFF_ROLES);
const MATRIX_KEYS = new Set(allMatrixPermissionKeys());

@Injectable()
export class BackofficeUserService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(BUSINESS_PERMISSION_REPOSITORY) private readonly repo: BusinessPermissionRepository,
    @Inject(AUTH_CONTEXT_REPOSITORY) private readonly authCtx: AuthContextRepository,
    private readonly accessControl: AccessControlService,
  ) {}

  getAccessMatrix() {
    const presets: Record<string, string[]> = {};
    for (const role of BACKOFFICE_STAFF_ROLES) {
      const bundle = BUSINESS_ROLE_BUNDLES[role as BusinessRoleCode] ?? [];
      presets[role] = bundle.filter((key) => MATRIX_KEYS.has(key));
    }
    return {
      modules: BACKOFFICE_ACCESS_MODULES,
      rolePresets: presets,
    };
  }

  async listUsers() {
    const rows = await this.prisma.user.findMany({
      where: {
        deletedAt: null,
        employeeId: null,
      },
      include: {
        businessRoleAssignments: {
          where: { isActive: true, deletedAt: null },
          take: 1,
        },
      },
      orderBy: { updatedAt: 'desc' },
      take: 200,
    });

    const userIds = rows.map((row) => row.id);
    const [accounts, usedInvites, pendingInvites] = userIds.length
      ? await Promise.all([
        this.prisma.telegramAccount.findMany({
          where: { userId: { in: userIds }, deletedAt: null, isActive: true },
          select: { userId: true, username: true },
        }),
        this.prisma.operatorTelegramInvite.findMany({
          where: { userId: { in: userIds }, status: 'used' },
          select: { userId: true },
        }),
        this.prisma.operatorTelegramInvite.findMany({
          where: { userId: { in: userIds }, status: 'pending', expiresAt: { gt: new Date() } },
          select: { userId: true },
        }),
      ])
      : [[], [], []];

    const accountByUser = new Map(accounts.map((a) => [a.userId, a]));
    const linkedUsers = new Set(usedInvites.map((i) => i.userId));
    const pendingUsers = new Set(pendingInvites.map((i) => i.userId));

    return rows.map((row) => {
      const account = accountByUser.get(row.id);
      let telegramStatus: 'NONE' | 'PENDING' | 'LINKED' | 'EXPIRED' = 'NONE';
      if (account && linkedUsers.has(row.id)) telegramStatus = 'LINKED';
      else if (pendingUsers.has(row.id)) telegramStatus = 'PENDING';

      return {
        id: row.id,
        username: row.username,
        displayName: row.displayName?.trim() || row.username,
        employeeId: null,
        employeeCode: null,
        isStandalone: true,
        businessRole: row.businessRoleAssignments[0]?.role ?? null,
        isActive: row.isActive,
        lastLoginAt: row.lastLoginAt?.toISOString() ?? null,
        updatedAt: row.updatedAt.toISOString(),
        telegramStatus,
        telegramUsername: account?.username ?? null,
      };
    });
  }

  async createUser(
    actor: ActorContext,
    input: {
      username: string;
      password: string;
      displayName?: string;
      businessRole: BackofficeStaffRole;
      companyScopeIds?: string[];
      teamScopeIds?: string[];
    },
  ) {
    const username = input.username.trim();
    if (!username) throw new ConflictError('Username is required');

    const taken = await this.prisma.user.findFirst({
      where: { username, deletedAt: null },
    });
    if (taken) throw new ConflictError(`Username "${username}" is already taken`);

    const userId = randomUUID();
    const passwordHash = await bcrypt.hash(input.password, 10);
    const companyScopeIds = input.companyScopeIds?.length
      ? input.companyScopeIds
      : actor.companyId && ['big_leader', 'admin_manager', 'admin'].includes(input.businessRole)
        ? [actor.companyId]
        : [];

    await this.prisma.user.create({
      data: {
        id: userId,
        employeeId: null,
        username,
        displayName: input.displayName?.trim() || null,
        passwordHash,
        userType: 'human',
        isActive: true,
        mustChangePassword: false,
        createdBy: actor.userId,
        updatedBy: actor.userId,
      },
    });

    await this.accessControl.assignBusinessRole(actor, userId, {
      role: input.businessRole,
      companyScopeIds,
      teamScopeIds: input.teamScopeIds ?? [],
      reason: input.displayName
        ? `สร้างผู้ใช้หลังบ้าน: ${input.displayName}`
        : 'สร้างผู้ใช้หลังบ้าน',
    });

    await this.repo.recordAudit({
      actorId: actor.userId,
      targetUserId: userId,
      action: 'create_backoffice_user',
      newValue: {
        username,
        displayName: input.displayName ?? null,
        businessRole: input.businessRole,
        employeeId: null,
      },
    });

    return this.getUserDetail(userId);
  }

  async updateUser(
    actor: ActorContext,
    userId: string,
    input: {
      password?: string;
      isActive?: boolean;
      displayName?: string;
      businessRole?: BackofficeStaffRole;
      companyScopeIds?: string[];
      teamScopeIds?: string[];
    },
  ) {
    const user = await this.prisma.user.findFirst({ where: { id: userId, deletedAt: null } });
    if (!user) throw new UserNotFoundError(userId);
    if (user.employeeId != null) {
      throw new ConflictError('ไม่สามารถแก้ไขบัญชีที่ผูกกับพนักงานได้จากหน้านี้');
    }

    if (input.password) {
      const passwordHash = await bcrypt.hash(input.password, 10);
      await this.prisma.user.update({
        where: { id: userId },
        data: {
          passwordHash,
          mustChangePassword: false,
          updatedBy: actor.userId,
        },
      });
    }

    if (input.displayName !== undefined) {
      await this.prisma.user.update({
        where: { id: userId },
        data: { displayName: input.displayName.trim() || null, updatedBy: actor.userId },
      });
    }

    if (input.isActive != null) {
      await this.prisma.user.update({
        where: { id: userId },
        data: { isActive: input.isActive, updatedBy: actor.userId },
      });
    }

    if (input.businessRole) {
      const companyScopeIds = input.companyScopeIds?.length
        ? input.companyScopeIds
        : actor.companyId && ['big_leader', 'admin_manager', 'admin'].includes(input.businessRole)
          ? [actor.companyId]
          : [];
      await this.accessControl.assignBusinessRole(actor, userId, {
        role: input.businessRole,
        companyScopeIds,
        teamScopeIds: input.teamScopeIds ?? [],
        reason: 'อัปเดตบทบาทผู้ใช้หลังบ้าน',
      });
    }

    return this.getUserDetail(userId);
  }

  async getUserDetail(userId: string) {
    const access = await this.repo.findUserAccess(userId);
    if (!access) throw new UserNotFoundError(userId);

    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      include: { employee: { select: { firstName: true, lastName: true, globalId: true } } },
    });
    if (!user) throw new UserNotFoundError(userId);

    const role = access.businessRole ?? 'employee';
    const roleBundle = new Set(
      STAFF_ROLE_SET.has(role) ? BUSINESS_ROLE_BUNDLES[role as BusinessRoleCode] : [],
    );

    const ctx = await this.authCtx.loadForUser(userId);
    const effective = ctx ? resolveEffectivePermissions(ctx) : new Set<string>();

    const grantedPermissions = [...MATRIX_KEYS].filter((key) => effective.has(key));

    const modules = BACKOFFICE_ACCESS_MODULES.map((mod) => ({
      id: mod.id,
      label: mod.label,
      icon: mod.icon,
      items: mod.items.map((item) => ({
        id: item.id,
        label: item.label,
        permission: item.permission,
        description: item.description,
        menuHint: item.menuHint,
        granted: effective.has(item.permission),
        inRoleBundle: roleBundle.has(item.permission),
      })),
    }));

    return {
      id: user.id,
      username: user.username,
      displayName: user.displayName?.trim() || user.username,
      employeeId: null,
      employeeCode: null,
      isStandalone: true,
      businessRole: access.businessRole,
      isActive: user.isActive,
      lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
      modules,
      grantedPermissions,
      overrides: access.overrides.filter((o) => MATRIX_KEYS.has(o.permission)),
    };
  }

  async replaceModulePermissions(
    actor: ActorContext,
    userId: string,
    input: {
      businessRole?: BackofficeStaffRole;
      companyScopeIds?: string[];
      teamScopeIds?: string[];
      permissions: string[];
    },
  ) {
    const access = await this.repo.findUserAccess(userId);
    if (!access) throw new UserNotFoundError(userId);

    const role = (input.businessRole ?? access.businessRole ?? 'admin') as BusinessRoleCode;
    if (!STAFF_ROLE_SET.has(role)) {
      throw new ConflictError('Invalid back-office role');
    }

    await this.accessControl.assignBusinessRole(actor, userId, {
      role,
      companyScopeIds: input.companyScopeIds?.length
        ? input.companyScopeIds
        : actor.companyId && ['big_leader', 'admin_manager', 'admin'].includes(role)
          ? [actor.companyId]
          : [],
      teamScopeIds: input.teamScopeIds ?? [],
      reason: 'อัปเดตสิทธิ์หลังบ้าน',
    });

    const roleBundle = new Set(BUSINESS_ROLE_BUNDLES[role]);
    const desired = new Set(input.permissions.filter((p) => MATRIX_KEYS.has(p)));

    const existingMatrixOverrides = access.overrides.filter((o) => MATRIX_KEYS.has(o.permission));
    for (const o of existingMatrixOverrides) {
      await this.repo.removeOverride(o.id, actor.userId);
    }

    for (const key of MATRIX_KEYS) {
      const want = desired.has(key);
      const roleHas = roleBundle.has(key);
      if (want === roleHas) continue;
      await this.repo.addOverride({
        userId,
        permission: key,
        effect: want ? 'allow' : 'deny',
        reason: 'กำหนดสิทธิ์หลังบ้าน',
        actorUserId: actor.userId,
      });
    }

    await this.repo.recordAudit({
      actorId: actor.userId,
      targetUserId: userId,
      action: 'replace_module_permissions',
      newValue: { role, permissions: [...desired] },
    });

    return this.getUserDetail(userId);
  }
}
