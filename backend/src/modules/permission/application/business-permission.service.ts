// ============================================================================
// Business role administration — assign roles, scopes, overrides (audited).
// ============================================================================

import { Inject, Injectable } from '@nestjs/common';
import {
  AUTH_CONTEXT_REPOSITORY,
  AuthContextRepository,
} from '../domain/repositories/permission.repository';
import {
  BUSINESS_PERMISSION_REPOSITORY,
  BusinessPermissionRepository,
} from '../domain/repositories/business-permission.repository';
import { BUSINESS_ROLE_TEMPLATES } from '../domain/entities/business-role-bundles';
import {
  BusinessRoleCode,
  UserAccessSnapshot,
} from '../domain/entities/business-role.types';
import { resolveEffectivePermissions, explainSalaryVisibilityRole } from '../domain/services/effective-permissions.service';
import { SalaryVisibilityService } from './salary-visibility.service';
import { UserNotFoundError } from '../domain/errors/permission.errors';
import { ActorContext } from '../../../shared/kernel/actor-context';

@Injectable()
export class BusinessPermissionService {
  constructor(
    @Inject(BUSINESS_PERMISSION_REPOSITORY) private readonly repo: BusinessPermissionRepository,
    @Inject(AUTH_CONTEXT_REPOSITORY) private readonly authCtx: AuthContextRepository,
    private readonly salaryVisibility: SalaryVisibilityService,
  ) {}

  listBusinessRoles() {
    return BUSINESS_ROLE_TEMPLATES;
  }

  async getUserAccess(userId: string): Promise<UserAccessSnapshot> {
    const access = await this.repo.findUserAccess(userId);
    if (!access) throw new UserNotFoundError(userId);

    const ctx = await this.authCtx.loadForUser(userId);
    const effectivePermissions = ctx ? [...resolveEffectivePermissions(ctx)].sort() : [];

    return {
      userId: access.userId,
      username: access.username,
      employeeId: access.employeeId,
      businessRole: access.businessRole,
      scopes: access.scopes,
      effectivePermissions,
      overrides: access.overrides.map((o) => ({
        id: o.id,
        permission: o.permission,
        effect: o.effect,
        reason: o.reason,
        createdAt: o.createdAt.toISOString(),
      })),
      salaryVisibilityNote: explainSalaryVisibilityRole(access.businessRole),
    };
  }

  async getMyEffectiveAccess(userId: string) {
    return this.getUserAccess(userId);
  }

  async assignBusinessRole(
    actor: ActorContext,
    userId: string,
    role: BusinessRoleCode,
    reason?: string,
  ): Promise<void> {
    const before = await this.repo.findUserAccess(userId);
    if (!before) throw new UserNotFoundError(userId);

    await this.repo.assignBusinessRole({
      userId,
      role,
      actorUserId: actor.userId,
    });

    await this.repo.recordAudit({
      actorId: actor.userId,
      targetUserId: userId,
      action: 'assign_business_role',
      oldValue: { businessRole: before.businessRole },
      newValue: { businessRole: role },
      reason: reason ?? null,
    });
  }

  async replaceScopes(
    actor: ActorContext,
    userId: string,
    scopes: Array<{
      scopeType: 'all' | 'company' | 'team' | 'self';
      companyId?: string | null;
      teamId?: string | null;
    }>,
    reason?: string,
  ): Promise<void> {
    const before = await this.repo.findUserAccess(userId);
    if (!before) throw new UserNotFoundError(userId);

    await this.repo.replaceScopes({ userId, scopes, actorUserId: actor.userId });
    await this.repo.recordAudit({
      actorId: actor.userId,
      targetUserId: userId,
      action: 'replace_scopes',
      oldValue: { scopes: before.scopes },
      newValue: { scopes },
      reason: reason ?? null,
    });
  }

  async addOverride(
    actor: ActorContext,
    userId: string,
    input: { permission: string; effect: 'allow' | 'deny'; reason?: string },
  ): Promise<{ id: string }> {
    const before = await this.repo.findUserAccess(userId);
    if (!before) throw new UserNotFoundError(userId);

    const created = await this.repo.addOverride({
      userId,
      permission: input.permission,
      effect: input.effect,
      reason: input.reason ?? null,
      actorUserId: actor.userId,
    });

    await this.repo.recordAudit({
      actorId: actor.userId,
      targetUserId: userId,
      action: 'add_override',
      oldValue: { overrides: before.overrides },
      newValue: { override: { ...input, id: created.id } },
      reason: input.reason ?? null,
    });

    return created;
  }

  async removeOverride(actor: ActorContext, userId: string, overrideId: string): Promise<void> {
    const before = await this.repo.findUserAccess(userId);
    if (!before) throw new UserNotFoundError(userId);

    const target = before.overrides.find((o) => o.id === overrideId);
    await this.repo.removeOverride(overrideId, actor.userId);
    await this.repo.recordAudit({
      actorId: actor.userId,
      targetUserId: userId,
      action: 'remove_override',
      oldValue: { override: target ?? { id: overrideId } },
      newValue: null,
    });
  }

  async listAudit(userId: string) {
    const rows = await this.repo.listAudit(userId);
    return rows.map((r) => ({
      id: r.id,
      actorId: r.actorId,
      targetUserId: r.targetUserId,
      action: r.action,
      oldValue: r.oldValue,
      newValue: r.newValue,
      reason: r.reason,
      createdAt: r.createdAt.toISOString(),
    }));
  }

  searchUsers(query: string) {
    return this.repo.searchUsers(query);
  }

  previewSalaryVisibility(viewerUserId: string, targetEmployeeId: string) {
    return this.salaryVisibility.preview(viewerUserId, targetEmployeeId);
  }
}
