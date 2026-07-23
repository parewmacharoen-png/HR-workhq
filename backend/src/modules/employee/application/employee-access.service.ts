// ============================================================================
// modules/employee/application/employee-access.service.ts
// SEC-001 / HR-013c — actor scope enforcement for employee endpoints.
// ============================================================================

import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { ActorContext } from '../../../shared/kernel/actor-context';
import { CompanyAccessService } from '../../../shared/kernel/company-access.service';
import {
  BUSINESS_PERMISSION_REPOSITORY,
  BusinessPermissionRepository,
} from '../../permission/domain/repositories/business-permission.repository';
import { EmployeeNotFoundError } from '../domain/errors/employee.errors';

@Injectable()
export class EmployeeAccessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly companyAccess: CompanyAccessService,
    @Inject(BUSINESS_PERMISSION_REPOSITORY) private readonly permissions: BusinessPermissionRepository,
  ) {}

  /** Self-scoped actors may read their own record; others need company scope. */
  async assertEmployeeReadable(actor: ActorContext, employeeId: string): Promise<string> {
    const access = await this.permissions.findUserAccess(actor.userId);
    if (access?.employeeId === employeeId) {
      return this.resolveCompanyId(employeeId);
    }

    const companyId = await this.resolveCompanyId(employeeId);
    await this.companyAccess.assertCompanyAccess(actor, companyId);
    return companyId;
  }

  async assertEmployeeInCompany(employeeId: string, companyId: string): Promise<void> {
    const assignment = await this.prisma.employeeAssignment.findFirst({
      where: {
        employeeId,
        companyId,
        effectiveTo: null,
        deletedAt: null,
      },
    });
    if (!assignment) {
      throw new EmployeeNotFoundError(employeeId);
    }
  }

  async assertEmployeeWritable(
    actor: ActorContext,
    employeeId: string,
    companyId: string,
  ): Promise<void> {
    await this.companyAccess.assertCompanyAccess(actor, companyId);
    await this.assertEmployeeInCompany(employeeId, companyId);
  }

  /** Self-scoped actors may act on own record; HR needs company scope + membership. */
  async assertEmployeeSelfOrCompany(
    actor: ActorContext,
    employeeId: string,
    companyId: string,
  ): Promise<void> {
    await this.assertEmployeeInCompany(employeeId, companyId);
    const access = await this.permissions.findUserAccess(actor.userId);
    if (access?.employeeId === employeeId) return;
    await this.companyAccess.assertCompanyAccess(actor, companyId);
  }

  private async resolveCompanyId(employeeId: string): Promise<string> {
    const primary = await this.prisma.employeeAssignment.findFirst({
      where: {
        employeeId,
        effectiveTo: null,
        deletedAt: null,
        isPrimaryCompany: true,
      },
      select: { companyId: true },
    });
    if (primary) return primary.companyId;

    const any = await this.prisma.employeeAssignment.findFirst({
      where: { employeeId, effectiveTo: null, deletedAt: null },
      select: { companyId: true },
    });
    if (!any) throw new EmployeeNotFoundError(employeeId);
    return any.companyId;
  }
}
