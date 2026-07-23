import { Inject, Injectable, forwardRef } from '@nestjs/common';
import { PayrollService } from '../../payroll/application/payroll.service';
import { PayrollBuilderService } from '../../payroll/application/payroll-builder.service';
import { SharedPayrollService } from '../../payroll/application/shared-payroll.service';
import { EmployeeAccessService } from './employee-access.service';
import { SalaryVisibilityService } from '../../permission/application/salary-visibility.service';
import { ActorContext } from '../../../shared/kernel/actor-context';
import { EmployeePayrollViewDto } from './dto/employee-payroll.dto';

@Injectable()
export class EmployeePayrollService {
  constructor(
    private readonly payrollService: PayrollService,
    private readonly employeeAccess: EmployeeAccessService,
    private readonly salaryVisibility: SalaryVisibilityService,
    @Inject(forwardRef(() => PayrollBuilderService))
    private readonly payrollBuilder: PayrollBuilderService,
    @Inject(forwardRef(() => SharedPayrollService))
    private readonly sharedPayroll: SharedPayrollService,
  ) {}

  async getPayroll(
    actor: ActorContext,
    employeeId: string,
    companyId: string,
  ): Promise<EmployeePayrollViewDto> {
    await this.employeeAccess.assertEmployeeReadable(actor, employeeId);
    return this.payrollService.getEmployeePayrollView(actor, employeeId, companyId);
  }

  async syncOpenCycleItems(
    actor: ActorContext,
    employeeId: string,
    companyId: string,
  ): Promise<{ cyclesSynced: number; warnings: string[] }> {
    await this.employeeAccess.assertEmployeeReadable(actor, employeeId);
    await this.salaryVisibility.assertCanViewSalary(actor.userId, employeeId);

    const info = await this.sharedPayroll.getEmployeeInfo(employeeId);
    if (info.mode === 'shared_across_companies') {
      const companyIds = await this.sharedPayroll.listActiveCompanyIds();
      let cyclesSynced = 0;
      const warnings: string[] = [];
      for (const cid of companyIds) {
        const result = await this.payrollBuilder.syncEmployeeInOpenCycles(actor, employeeId, cid);
        cyclesSynced += result.cyclesSynced;
        warnings.push(...result.warnings);
      }
      return { cyclesSynced, warnings };
    }

    return this.payrollBuilder.syncEmployeeInOpenCycles(actor, employeeId, companyId);
  }
}
