// ============================================================================
// modules/payroll/application/payroll-overview-access.service.ts
// PAY-007 — company payroll overview access (SalaryVisibilityPolicy + scope).
// ============================================================================

import { Injectable } from '@nestjs/common';
import { ActorContext } from '../../../shared/kernel/actor-context';
import { CompanyAccessService } from '../../../shared/kernel/company-access.service';
import { SalaryVisibilityService } from '../../permission/application/salary-visibility.service';
import { SalaryAccessDeniedError } from '../../permission/domain/errors/permission.errors';
import { EmployeeAccessService } from '../../employee/application/employee-access.service';

@Injectable()
export class PayrollOverviewAccessService {
  constructor(
    private readonly companyAccess: CompanyAccessService,
    private readonly salaryVisibility: SalaryVisibilityService,
    private readonly employeeAccess: EmployeeAccessService,
  ) {}

  async assertCanViewCompanyOverview(actor: ActorContext, companyId: string): Promise<void> {
    await this.companyAccess.assertCompanyAccess(actor, companyId);
    const decision = await this.salaryVisibility.canViewCompanyPayrollSummary(actor.userId, companyId);
    if (!decision.canView) {
      throw new SalaryAccessDeniedError(decision.reason);
    }
  }

  async assertCanViewEmployeeRow(
    actor: ActorContext,
    employeeId: string,
    companyId: string,
  ): Promise<void> {
    const decision = await this.salaryVisibility.canViewCompanyPayrollSummary(actor.userId, companyId);
    if (decision.canView) {
      await this.companyAccess.assertCompanyAccess(actor, companyId);
      await this.employeeAccess.assertEmployeeInCompany(employeeId, companyId);
      return;
    }

    await this.employeeAccess.assertEmployeeReadable(actor, employeeId);
    await this.employeeAccess.assertEmployeeInCompany(employeeId, companyId);
  }
}
