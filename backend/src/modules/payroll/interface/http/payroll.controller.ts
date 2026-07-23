// ============================================================================
// modules/payroll/interface/http/payroll.controller.ts
// ============================================================================

import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { PayrollService } from '../../application/payroll.service';
import { PayrollBuilderService } from '../../application/payroll-builder.service';
import { ManualPayrollItemService } from '../../application/manual-payroll-item.service';
import {
  OpenPayrollCycleDto, AddPayrollItemDto, UpdatePayrollItemDto, AddDepositDto, AddLeaveBonusDto,
  PayrollEmployeeActionDto,
} from '../../application/dto/payroll.dto';
import { CurrentActor } from '../../../../auth/decorators/current-actor.decorator';
import { RequirePermission } from '../../../permission/interface/http/permission.guard';
import { ActorContext } from '../../../../shared/kernel/actor-context';
import { IsUUID } from 'class-validator';

class AddSalaryDto {
  @IsUUID() employeeId!: string;
}

@Controller('payroll')
export class PayrollController {
  constructor(
    private readonly service: PayrollService,
    private readonly builder: PayrollBuilderService,
    private readonly manualItems: ManualPayrollItemService,
  ) {}

  @Post('cycles')
  @RequirePermission('payroll:write')
  open(@CurrentActor() actor: ActorContext, @Body() dto: OpenPayrollCycleDto) {
    return this.service.openCycle(actor, dto);
  }

  @Post('cycles/:id/lock')
  @RequirePermission('payroll:write')
  lock(@CurrentActor() actor: ActorContext, @Param('id') id: string) {
    return this.service.lockCycle(actor, id);
  }

  @Post('cycles/:id/paid')
  @RequirePermission('payroll:write')
  markPaid(@CurrentActor() actor: ActorContext, @Param('id') id: string) {
    return this.service.markPaid(actor, id);
  }

  @Post('cycles/:id/items')
  @RequirePermission('payroll:write')
  addItem(@CurrentActor() actor: ActorContext, @Param('id') id: string, @Body() dto: AddPayrollItemDto) {
    return this.service.addItem(actor, id, dto);
  }

  @Patch('cycles/:id/items/:itemId')
  @RequirePermission('payroll:write')
  updateItem(
    @CurrentActor() actor: ActorContext,
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @Body() dto: UpdatePayrollItemDto,
  ) {
    return this.service.updateItem(actor, id, itemId, dto);
  }

  @Delete('cycles/:id/items/:itemId')
  @RequirePermission('payroll:write')
  deleteItem(
    @CurrentActor() actor: ActorContext,
    @Param('id') id: string,
    @Param('itemId') itemId: string,
  ) {
    return this.service.deleteItem(actor, id, itemId);
  }

  @Post('cycles/:id/salary')
  @RequirePermission('payroll:write')
  addSalary(@CurrentActor() actor: ActorContext, @Param('id') id: string, @Body() dto: AddSalaryDto) {
    return this.service.addSalaryItem(actor, id, dto.employeeId);
  }

  @Post('cycles/:id/meal-allowance')
  @RequirePermission('payroll:write')
  addMeal(@CurrentActor() actor: ActorContext, @Param('id') id: string, @Body() dto: PayrollEmployeeActionDto) {
    return this.service.addMealAllowance(actor, id, dto.employeeId);
  }

  @Post('cycles/:id/late-deduction')
  @RequirePermission('payroll:write')
  addLateDeduction(
    @CurrentActor() actor: ActorContext,
    @Param('id') id: string,
    @Body() dto: PayrollEmployeeActionDto,
  ) {
    return this.service.addLateDeduction(actor, id, dto.employeeId);
  }

  @Post('cycles/:id/absence-deduction')
  @RequirePermission('payroll:write')
  addAbsenceDeduction(
    @CurrentActor() actor: ActorContext,
    @Param('id') id: string,
    @Body() dto: PayrollEmployeeActionDto,
  ) {
    return this.service.addAbsenceDeduction(actor, id, dto.employeeId);
  }

  @Post('cycles/:id/deposit')
  @RequirePermission('payroll:write')
  addDeposit(@CurrentActor() actor: ActorContext, @Param('id') id: string, @Body() dto: AddDepositDto) {
    return this.service.addDeposit(actor, id, dto);
  }

  @Post('cycles/:id/leave-bonus')
  @RequirePermission('payroll:write')
  addLeaveBonus(
    @CurrentActor() actor: ActorContext,
    @Param('id') id: string,
    @Body() dto: AddLeaveBonusDto,
  ) {
    return this.service.addLeaveBonus(actor, id, dto);
  }

  @Post('cycles/:id/payslips/:employeeId')
  @RequirePermission('payroll:write')
  generatePayslip(@CurrentActor() actor: ActorContext, @Param('id') id: string, @Param('employeeId') employeeId: string) {
    return this.service.generatePayslip(actor, id, employeeId);
  }

  @Get('cycles/:id/payslips/:employeeId')
  @RequirePermission('payroll:read')
  getPayslip(
    @CurrentActor() actor: ActorContext,
    @Param('id') id: string,
    @Param('employeeId') employeeId: string,
  ) {
    return this.service.getPayslip(actor, id, employeeId);
  }

  @Get('cycles/:id/build-preview')
  @RequirePermission('payroll:read')
  buildPreview(@CurrentActor() actor: ActorContext, @Param('id') id: string) {
    return this.builder.buildPreview(actor, id);
  }

  @Post('cycles/:id/build')
  @RequirePermission('payroll:write')
  build(@CurrentActor() actor: ActorContext, @Param('id') id: string) {
    return this.builder.buildCycle(actor, id);
  }

  @Post('cycles/:id/apply-manual-items')
  @RequirePermission('payroll:write')
  applyManualItems(@CurrentActor() actor: ActorContext, @Param('id') id: string) {
    return this.manualItems.applyForCycle(actor, id);
  }

  @Get('cycles/:id')
  @RequirePermission('payroll:read')
  getCycle(@CurrentActor() actor: ActorContext, @Param('id') id: string) {
    return this.service.getCycle(actor, id);
  }

  @Get('cycles')
  @RequirePermission('payroll:read')
  listCycles(
    @CurrentActor() actor: ActorContext,
    @Query('companyId') companyId: string,
  ) {
    return this.service.listCycles(actor, companyId);
  }
}
