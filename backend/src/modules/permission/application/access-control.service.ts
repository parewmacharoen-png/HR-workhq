// ============================================================================
// HR-13 access control — role assignment, preview, overrides (owner-only).
// ============================================================================

import { Inject, Injectable } from '@nestjs/common';
import {
  BUSINESS_PERMISSION_REPOSITORY,
  BusinessPermissionRepository,
} from '../domain/repositories/business-permission.repository';
import {
  AUTH_CONTEXT_REPOSITORY,
  AuthContextRepository,
} from '../domain/repositories/permission.repository';
import { BUSINESS_ROLE_TEMPLATES } from '../domain/entities/business-role-bundles';
import { BusinessRoleCode } from '../domain/entities/business-role.types';
import { AccessControlValidationService } from '../domain/services/access-control-validation.service';
import { EffectiveAccessPreviewService } from '../domain/services/effective-access-preview.service';
import { SalaryVisibilityService } from './salary-visibility.service';
import { PAYROLL_OVERRIDE_PERMISSIONS } from '../domain/entities/salary-visibility-matrix';
import {
  AccessControlValidationError,
  OwnerOnlyOverrideError,
} from '../domain/errors/access-control.errors';
import { UserNotFoundError } from '../domain/errors/permission.errors';
import { ActorContext } from '../../../shared/kernel/actor-context';

export interface EffectiveAccessResponse {
  userId: string;
  employeeId: string | null;
  username: string;
  businessRole: BusinessRoleCode | null;
  roleLabel: string;
  scopeBadge: string;
  companyScopes: Array<{ id: string; name: string; code: string }>;
  teamScopes: Array<{ id: string; name: string; companyId: string }>;
  preview: {
    can: string[];
    cannot: string[];
    salaryVisibility: string;
  };
  salaryPreview: {
    canViewOthers: boolean;
    reason: string;
  } | null;
  overrides: Array<{
    id: string;
    permission: string;
    effect: 'allow' | 'deny';
    reason: string | null;
  }>;
}

@Injectable()
export class AccessControlService {
  private readonly validation = new AccessControlValidationService();
  private readonly previewBuilder = new EffectiveAccessPreviewService();

  constructor(
    @Inject(BUSINESS_PERMISSION_REPOSITORY) private readonly repo: BusinessPermissionRepository,
    @Inject(AUTH_CONTEXT_REPOSITORY) private readonly authCtx: AuthContextRepository,
    private readonly salaryVisibility: SalaryVisibilityService,
  ) {}

  listRoleTemplates() {
    return BUSINESS_ROLE_TEMPLATES.map((t) => ({
      code: t.code,
      name: this.validation.roleLabel(t.code),
      description: t.description,
      requiredScopeType: t.defaultScopeType,
      showsAllCompaniesBadge: t.code === 'owner' || t.code === 'secretary',
      hidesScopeSelector: ['owner', 'secretary', 'admin_manager', 'admin', 'employee'].includes(t.code),
      requiresCompanyScope: t.code === 'big_leader',
      requiresTeamScope: t.code === 'sub_leader',
    }));
  }

  async getEmployeeAccessContext(employeeId: string) {
    const userId = await this.repo.findUserIdByEmployeeId(employeeId);
    if (!userId) {
      throw new AccessControlValidationError('NO_LINKED_USER', 'Employee has no linked login account.');
    }
    return this.getEffectiveAccess(userId);
  }

  async getEffectiveAccess(userId: string): Promise<EffectiveAccessResponse> {
    const access = await this.repo.findUserAccess(userId);
    if (!access) throw new UserNotFoundError(userId);

    const role = access.businessRole ?? 'employee';
    const companyIds = access.scopes
      .filter((s) => s.scopeType === 'company' && s.companyId)
      .map((s) => s.companyId!);
    const teamIds = access.scopes
      .filter((s) => s.scopeType === 'team' && s.teamId)
      .map((s) => s.teamId!);

    const [companies, teams] = await Promise.all([
      this.repo.resolveCompanyNames(companyIds),
      this.repo.resolveTeamNames(teamIds),
    ]);

    const hasSalaryOverride = access.overrides.some(
      (o) => o.effect === 'allow'
        && PAYROLL_OVERRIDE_PERMISSIONS.includes(o.permission as typeof PAYROLL_OVERRIDE_PERMISSIONS[number]),
    );

    const scopeBadge = this.validation.scopeBadge(
      role,
      companies.map((c) => c.code),
      teams.map((t) => t.name),
    );

    const preview = this.previewBuilder.build(role, scopeBadge, hasSalaryOverride);

    let salaryPreview: EffectiveAccessResponse['salaryPreview'] = null;
    if (access.employeeId) {
      const others = await this.salaryVisibility.canViewSalary(userId, access.employeeId);
      salaryPreview = {
        canViewOthers: others.canView,
        reason: others.reason,
      };
    }

    return {
      userId: access.userId,
      employeeId: access.employeeId,
      username: access.username,
      businessRole: access.businessRole,
      roleLabel: preview.roleLabel,
      scopeBadge,
      companyScopes: companies,
      teamScopes: teams,
      preview: {
        can: preview.can,
        cannot: preview.cannot,
        salaryVisibility: preview.salaryVisibility,
      },
      salaryPreview,
      overrides: access.overrides.map((o) => ({
        id: o.id,
        permission: o.permission,
        effect: o.effect,
        reason: o.reason,
      })),
    };
  }

  async previewEffectiveAccess(
    userId: string,
    input: {
      role: BusinessRoleCode;
      companyScopeIds: string[];
      teamScopeIds: string[];
    },
  ): Promise<Pick<EffectiveAccessResponse, 'roleLabel' | 'scopeBadge' | 'preview' | 'salaryPreview'>> {
    this.validation.validateRoleAssignment(input);

    const [companies, teams] = await Promise.all([
      this.repo.resolveCompanyNames(input.companyScopeIds),
      this.repo.resolveTeamNames(input.teamScopeIds),
    ]);

    const scopeBadge = this.validation.scopeBadge(
      input.role,
      companies.map((c) => c.code),
      teams.map((t) => t.name),
    );

    const access = await this.repo.findUserAccess(userId);
    const hasSalaryOverride = access?.overrides.some(
      (o) => o.effect === 'allow'
        && PAYROLL_OVERRIDE_PERMISSIONS.includes(o.permission as typeof PAYROLL_OVERRIDE_PERMISSIONS[number]),
    ) ?? false;

    const preview = this.previewBuilder.build(input.role, scopeBadge, hasSalaryOverride);

    let salaryPreview: EffectiveAccessResponse['salaryPreview'] = null;
    if (access?.employeeId) {
      const selfOnly = ['sub_leader', 'employee', 'admin', 'admin_manager'].includes(input.role);
      const allAccess = input.role === 'owner' || input.role === 'secretary';
      const scoped = input.role === 'big_leader';
      salaryPreview = {
        canViewOthers: allAccess || scoped || (hasSalaryOverride && !['sub_leader', 'employee'].includes(input.role)),
        reason: preview.salaryVisibility,
      };
    }

    return {
      roleLabel: preview.roleLabel,
      scopeBadge,
      preview: {
        can: preview.can,
        cannot: preview.cannot,
        salaryVisibility: preview.salaryVisibility,
      },
      salaryPreview,
    };
  }

  async assignBusinessRole(
    actor: ActorContext,
    userId: string,
    input: {
      role: BusinessRoleCode;
      companyScopeIds?: string[];
      teamScopeIds?: string[];
      reason?: string;
    },
  ): Promise<EffectiveAccessResponse> {
    const access = await this.repo.findUserAccess(userId);
    if (!access) throw new UserNotFoundError(userId);

    const companyScopeIds = input.companyScopeIds ?? [];
    const teamScopeIds = input.teamScopeIds ?? [];

    this.validation.validateRoleAssignment({
      role: input.role,
      companyScopeIds,
      teamScopeIds,
    });

    const ownerCount = await this.repo.countActiveOwners(userId);
    this.validation.assertCanChangeFromOwner(access.businessRole, input.role, ownerCount);

    await this.repo.assignBusinessRole({
      userId,
      role: input.role,
      actorUserId: actor.userId,
    });

    const scopes = this.validation.buildScopesForRole(input.role, companyScopeIds, teamScopeIds);
    await this.repo.replaceScopes({ userId, scopes, actorUserId: actor.userId });

    await this.repo.recordAudit({
      actorId: actor.userId,
      targetUserId: userId,
      action: 'assign_business_role',
      oldValue: {
        employeeId: access.employeeId,
        businessRole: access.businessRole,
        scopes: access.scopes,
      },
      newValue: {
        employeeId: access.employeeId,
        businessRole: input.role,
        companyScopeIds,
        teamScopeIds,
      },
      reason: input.reason ?? null,
    });

    return this.getEffectiveAccess(userId);
  }

  async addOverride(
    actor: ActorContext,
    userId: string,
    input: { permission: string; effect: 'allow' | 'deny'; reason?: string },
  ): Promise<{ id: string }> {
    await this.assertActorIsOwner(actor.userId);

    const access = await this.repo.findUserAccess(userId);
    if (!access) throw new UserNotFoundError(userId);

    this.validation.validateOverride(access.businessRole, input.permission, input.effect);

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
      newValue: input,
      reason: input.reason ?? null,
    });

    return created;
  }

  async removeOverride(actor: ActorContext, userId: string, overrideId: string): Promise<void> {
    await this.assertActorIsOwner(actor.userId);
    await this.repo.removeOverride(overrideId, actor.userId);
    await this.repo.recordAudit({
      actorId: actor.userId,
      targetUserId: userId,
      action: 'remove_override',
      oldValue: { overrideId },
    });
  }

  private async assertActorIsOwner(actorUserId: string): Promise<void> {
    const role = await this.repo.getActiveBusinessRole(actorUserId);
    if (role !== 'owner') {
      throw new OwnerOnlyOverrideError();
    }
  }
}
