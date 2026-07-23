// ============================================================================
// Salary visibility checks using business role policy.
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
import {
  SalaryVisibilityPolicy,
  SalaryVisibilityDecision,
} from '../domain/services/salary-visibility.policy';
import { BusinessRoleCode } from '../domain/entities/business-role.types';
import { SalaryAccessDeniedError } from '../domain/errors/permission.errors';

@Injectable()
export class SalaryVisibilityService {
  private readonly policy = new SalaryVisibilityPolicy();

  constructor(
    @Inject(AUTH_CONTEXT_REPOSITORY) private readonly authCtx: AuthContextRepository,
    @Inject(BUSINESS_PERMISSION_REPOSITORY) private readonly repo: BusinessPermissionRepository,
  ) {}

  async canViewSalary(viewerUserId: string, targetEmployeeId: string): Promise<SalaryVisibilityDecision> {
    const ctx = await this.authCtx.loadForUser(viewerUserId);
    if (!ctx) {
      return { canView: false, reason: 'Viewer user not found.' };
    }
    const targetCompanyIds = await this.repo.getEmployeeCompanyIds(targetEmployeeId);
    return this.policy.decide(
      {
        viewerUserId: ctx.userId,
        viewerEmployeeId: ctx.employeeId,
        businessRole: ctx.businessRole as BusinessRoleCode | null,
        scopes: ctx.scopes,
        overrides: ctx.overrides,
      },
      targetEmployeeId,
      targetCompanyIds,
    );
  }

  async assertCanViewSalary(viewerUserId: string, targetEmployeeId: string): Promise<void> {
    const decision = await this.canViewSalary(viewerUserId, targetEmployeeId);
    if (!decision.canView) {
      throw new SalaryAccessDeniedError(decision.reason);
    }
  }

  preview(
    viewerUserId: string,
    targetEmployeeId: string,
  ): Promise<{ canView: boolean; reason: string }> {
    return this.canViewSalary(viewerUserId, targetEmployeeId);
  }

  async canViewCompanyPayrollSummary(
    viewerUserId: string,
    companyId: string,
  ): Promise<SalaryVisibilityDecision> {
    const ctx = await this.authCtx.loadForUser(viewerUserId);
    if (!ctx) {
      return { canView: false, reason: 'Viewer user not found.' };
    }
    return this.policy.decideCompanyPayrollSummary(
      {
        viewerUserId: ctx.userId,
        viewerEmployeeId: ctx.employeeId,
        businessRole: ctx.businessRole as BusinessRoleCode | null,
        scopes: ctx.scopes,
        overrides: ctx.overrides,
      },
      companyId,
    );
  }
}
