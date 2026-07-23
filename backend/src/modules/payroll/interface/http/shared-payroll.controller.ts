// ============================================================================
// Shared payroll HTTP API
// ============================================================================

import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { IsInt, IsOptional, IsUUID, Min } from 'class-validator';
import { SharedPayrollService } from '../../application/shared-payroll.service';
import { CurrentActor } from '../../../../auth/decorators/current-actor.decorator';
import { RequirePermission } from '../../../permission/interface/http/permission.guard';
import { ActorContext } from '../../../../shared/kernel/actor-context';
import { CompanyAccessService } from '../../../../shared/kernel/company-access.service';

class UpdateSharedPayrollDto {
  @IsOptional() @IsInt() @Min(1) masterMonthlySalary?: number;
  @IsOptional() @IsUUID() depositCollectionCompanyId?: string | null;
  @IsOptional() effectiveFrom?: string;
}

@Controller()
export class SharedPayrollController {
  constructor(
    private readonly sharedPayroll: SharedPayrollService,
    private readonly companyAccess: CompanyAccessService,
  ) {}

  @Get('employees/:employeeId/shared-payroll')
  @RequirePermission('payroll:read')
  async getInfo(
    @CurrentActor() actor: ActorContext,
    @Param('employeeId') employeeId: string,
  ) {
    return this.sharedPayroll.getEmployeeInfo(employeeId);
  }

  @Patch('employees/:employeeId/shared-payroll')
  @RequirePermission('payroll:write')
  async updateSettings(
    @CurrentActor() actor: ActorContext,
    @Param('employeeId') employeeId: string,
    @Body() dto: UpdateSharedPayrollDto,
  ) {
    if (dto.depositCollectionCompanyId) {
      await this.companyAccess.assertCompanyAccess(actor, dto.depositCollectionCompanyId);
    }
    return this.sharedPayroll.updateSettings(actor, employeeId, {
      masterMonthlySalary: dto.masterMonthlySalary,
      depositCollectionCompanyId: dto.depositCollectionCompanyId,
      effectiveFromIso: dto.effectiveFrom,
    });
  }

  @Post('payroll/shared/migrate')
  @RequirePermission('payroll:write')
  async migrate(
    @CurrentActor() actor: ActorContext,
    @Query('employeeId') employeeId?: string,
  ) {
    return this.sharedPayroll.migrateQualifyingEmployees(actor, employeeId);
  }

  @Post('payroll/shared/reconcile')
  @RequirePermission('payroll:write')
  async reconcile(@CurrentActor() actor: ActorContext) {
    return this.sharedPayroll.reconcileAllSharedEmployees(actor);
  }
}
