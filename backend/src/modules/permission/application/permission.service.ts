// ============================================================================
// modules/permission/application/permission.service.ts
// Application layer for access control. Wraps the pure AuthorizationPolicy with
// data loading + caching, and exposes role/scope administration and
// impersonation use cases (all audited).
// ============================================================================

import { Inject, Injectable } from '@nestjs/common';
import {
  AUTH_CONTEXT_REPOSITORY, ROLE_ASSIGNMENT_REPOSITORY, IMPERSONATION_REPOSITORY,
  AuthContextRepository, RoleAssignmentRepository, ImpersonationRepository,
} from '../domain/repositories/permission.repository';
import { AuthorizationPolicy } from '../domain/services/authorization.service';
import { resolveEffectivePermissions } from '../domain/services/effective-permissions.service';
import { AccessRequest, AuthorizationContext } from '../domain/entities/authorization.types';
import {
  PermissionDeniedError, UserNotFoundError, CannotImpersonateError,
} from '../domain/errors/permission.errors';
import { AuditService } from '../../../shared/audit/audit.service';
import { ActorContext } from '../../../shared/kernel/actor-context';

@Injectable()
export class PermissionService {
  private readonly policy = new AuthorizationPolicy();

  constructor(
    @Inject(AUTH_CONTEXT_REPOSITORY) private readonly authCtx: AuthContextRepository,
    @Inject(ROLE_ASSIGNMENT_REPOSITORY) private readonly roleAssignments: RoleAssignmentRepository,
    @Inject(IMPERSONATION_REPOSITORY) private readonly impersonations: ImpersonationRepository,
    private readonly audit: AuditService,
  ) {}

  /** Returns true/false without throwing — used for menu rendering. */
  async can(userId: string, req: AccessRequest): Promise<boolean> {
    const ctx = await this.authCtx.loadForUser(userId);
    if (!ctx) return false;
    return this.policy.decide(ctx, req).allowed;
  }

  async loadContext(userId: string): Promise<AuthorizationContext | null> {
    return this.authCtx.loadForUser(userId);
  }

  async getEffectivePermissions(userId: string): Promise<string[]> {
    const ctx = await this.authCtx.loadForUser(userId);
    if (!ctx) return [];
    return [...resolveEffectivePermissions(ctx)].sort();
  }

  /** Throws PermissionDeniedError if not allowed — used by the guard. */
  async authorize(userId: string, req: AccessRequest): Promise<void> {
    const ctx = await this.authCtx.loadForUser(userId);
    if (!ctx) throw new UserNotFoundError(userId);
    const decision = this.policy.decide(ctx, req);
    if (!decision.allowed) {
      throw new PermissionDeniedError(`${req.permission} (${decision.reason})`);
    }
  }

  // ---- administration ----------------------------------------------------

  async assignRole(actor: ActorContext, userId: string, roleId: string): Promise<void> {
    await this.roleAssignments.assignRole(userId, roleId, actor.userId);
    await this.audit.record(actor, {
      entityType: 'UserRole', entityId: userId, action: 'assign_role',
      after: { userId, roleId },
    });
  }

  async revokeRole(actor: ActorContext, userId: string, roleId: string): Promise<void> {
    await this.roleAssignments.revokeRole(userId, roleId, actor.userId);
    await this.audit.record(actor, {
      entityType: 'UserRole', entityId: userId, action: 'revoke_role',
      before: { userId, roleId },
    });
  }

  async grantScope(actor: ActorContext, input: {
    userId: string;
    scopeType: 'all' | 'company' | 'team' | 'self';
    companyId?: string | null;
    teamId?: string | null;
  }): Promise<void> {
    await this.roleAssignments.grantScope({ ...input, actorUserId: actor.userId });
    await this.audit.record(actor, {
      entityType: 'ScopeGrant', entityId: input.userId, action: 'grant_scope',
      after: input,
    });
  }

  // ---- impersonation -----------------------------------------------------

  /**
   * Start impersonation. Only callers holding `impersonation:use` may do this
   * (enforced by the guard at the controller). Self-impersonation is rejected.
   */
  async startImpersonation(actor: ActorContext, targetUserId: string, reason?: string): Promise<{ impersonationId: string }> {
    if (actor.userId === targetUserId) throw new CannotImpersonateError();
    const id = await this.impersonations.start(actor.userId, targetUserId, reason ?? null);
    await this.audit.record(actor, {
      entityType: 'ImpersonationLog', entityId: id, action: 'impersonation_start',
      after: { targetUserId, reason: reason ?? null },
    });
    return { impersonationId: id };
  }

  async endImpersonation(actor: ActorContext, impersonationId: string): Promise<void> {
    await this.impersonations.end(impersonationId);
    await this.audit.record(actor, {
      entityType: 'ImpersonationLog', entityId: impersonationId, action: 'impersonation_end',
    });
  }
}
