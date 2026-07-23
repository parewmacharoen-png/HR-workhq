// ============================================================================
// Employee business role changes from HR admin (employment tab).
// ============================================================================

import { Inject, Injectable } from '@nestjs/common';
import { EmployeeChangeType, Prisma } from '@prisma/client';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { AuditService } from '../../../shared/audit/audit.service';
import { ActorContext } from '../../../shared/kernel/actor-context';
import { AccessControlService } from '../../permission/application/access-control.service';
import {
  BUSINESS_PERMISSION_REPOSITORY,
  BusinessPermissionRepository,
} from '../../permission/domain/repositories/business-permission.repository';
import { BusinessRoleCode } from '../../permission/domain/entities/business-role.types';
import { AccessControlValidationService } from '../../permission/domain/services/access-control-validation.service';
import { AccessControlValidationError } from '../../permission/domain/errors/access-control.errors';
import { EmployeeProfileAccessService } from './employee-profile-access.service';
import { UpdateEmployeeBusinessRoleDto } from './dto/employee-business-role.dto';

export interface BusinessRoleChangeResult {
  employeeId: string;
  userId: string;
  businessRole: BusinessRoleCode;
  previousRole: BusinessRoleCode | null;
}

@Injectable()
export class EmployeeBusinessRoleService {
  private readonly validation = new AccessControlValidationService();

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly profileAccess: EmployeeProfileAccessService,
    private readonly accessControl: AccessControlService,
    @Inject(BUSINESS_PERMISSION_REPOSITORY) private readonly permissions: BusinessPermissionRepository,
  ) {}

  async updateBusinessRole(
    actor: ActorContext,
    employeeId: string,
    dto: UpdateEmployeeBusinessRoleDto,
    companyId?: string,
  ): Promise<BusinessRoleChangeResult> {
    const resolvedCompanyId = companyId ?? await this.resolvePrimaryCompanyId(employeeId);
    if (!resolvedCompanyId) throw new Error('Company context required');
    await this.profileAccess.assertOwnerOrSecretary(actor, employeeId);

    const actorAccess = await this.permissions.findUserAccess(actor.userId);
    const actorRole = actorAccess?.businessRole ?? null;

    const targetContext = await this.accessControl.getEmployeeAccessContext(employeeId);
    const previousRole = targetContext.businessRole;

    if (previousRole === dto.businessRole) {
      return {
        employeeId,
        userId: targetContext.userId,
        businessRole: dto.businessRole,
        previousRole,
      };
    }

    this.validation.assertActorCanAssignBusinessRole(actorRole, previousRole, dto.businessRole);

    const { companyScopeIds, teamScopeIds } = await this.resolveDefaultScopes(
      employeeId,
      resolvedCompanyId,
      dto.businessRole,
    );

    await this.accessControl.assignBusinessRole(actor, targetContext.userId, {
      role: dto.businessRole,
      companyScopeIds,
      teamScopeIds,
      reason: dto.reason,
    });

    await this.prisma.employeeChangeHistory.create({
      data: {
        employeeId,
        companyId: resolvedCompanyId,
        changeType: 'access' satisfies EmployeeChangeType,
        fieldName: 'businessRole',
        beforeValueJson: previousRole ?? undefined,
        afterValueJson: dto.businessRole,
        reason: dto.reason,
        changedBy: actor.userId,
        source: 'web',
      },
    });

    await this.audit.record(actor, {
      entityType: 'Employee',
      entityId: employeeId,
      action: 'employee_business_role_changed',
      before: { businessRole: previousRole },
      after: { businessRole: dto.businessRole, reason: dto.reason },
    });

    return {
      employeeId,
      userId: targetContext.userId,
      businessRole: dto.businessRole,
      previousRole,
    };
  }

  async resolveEditorPermissions(
    actor: ActorContext,
    employeeId: string,
    targetRole: BusinessRoleCode | null,
  ): Promise<{ canEditBusinessRole: boolean; canAssignOwnerRole: boolean }> {
    const canEditProfile = await this.profileAccess.canEditProfile(actor);
    if (!canEditProfile) {
      return { canEditBusinessRole: false, canAssignOwnerRole: false };
    }

    const actorAccess = await this.permissions.findUserAccess(actor.userId);
    const actorRole = actorAccess?.businessRole ?? null;
    const canAssignOwnerRole = actorRole === 'owner';

    try {
      await this.profileAccess.assertOwnerOrSecretary(actor, employeeId);
    } catch {
      return { canEditBusinessRole: false, canAssignOwnerRole };
    }

    if (targetRole === 'owner' && actorRole !== 'owner') {
      return { canEditBusinessRole: false, canAssignOwnerRole };
    }

    return { canEditBusinessRole: true, canAssignOwnerRole };
  }

  private async resolvePrimaryCompanyId(employeeId: string): Promise<string | null> {
    const assignment = await this.prisma.employeeAssignment.findFirst({
      where: { employeeId, effectiveTo: null, deletedAt: null },
      orderBy: [{ isPrimaryCompany: 'desc' }, { effectiveFrom: 'desc' }],
      select: { companyId: true },
    });
    return assignment?.companyId ?? null;
  }

  private async resolveDefaultScopes(
    employeeId: string,
    companyId: string,
    role: BusinessRoleCode,
  ): Promise<{ companyScopeIds: string[]; teamScopeIds: string[] }> {
    if (role === 'big_leader') {
      return { companyScopeIds: [companyId], teamScopeIds: [] };
    }
    if (role === 'sub_leader') {
      const assignment = await this.prisma.employeeAssignment.findFirst({
        where: { employeeId, companyId, effectiveTo: null, deletedAt: null },
        select: { teamId: true },
      });
      if (!assignment?.teamId) {
        throw new AccessControlValidationError(
          'TEAM_SCOPE_REQUIRED',
          'Sub Leader requires a team assignment. Assign a team first.',
        );
      }
      return { companyScopeIds: [], teamScopeIds: [assignment.teamId] };
    }
    return { companyScopeIds: [], teamScopeIds: [] };
  }
}
