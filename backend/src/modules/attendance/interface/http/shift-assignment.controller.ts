// ============================================================================
// modules/attendance/interface/http/shift-assignment.controller.ts
// ============================================================================

import { Body, Controller, Delete, Get, Param, Post, Put, Query } from '@nestjs/common';
import { ShiftAssignmentService } from '../../application/shift-assignment.service';
import { CreateShiftDto, ScheduleShiftAssignmentDto, UpdateShiftDto } from '../../application/dto/shift-assignment.dto';
import { CurrentActor } from '../../../../auth/decorators/current-actor.decorator';
import { RequirePermission } from '../../../permission/interface/http/permission.guard';
import { ActorContext } from '../../../../shared/kernel/actor-context';

@Controller()
export class ShiftAssignmentController {
  constructor(private readonly shifts: ShiftAssignmentService) {}

  @Get('companies/:companyId/shifts')
  @RequirePermission('attendance:read')
  listShifts(
    @CurrentActor() actor: ActorContext,
    @Param('companyId') companyId: string,
  ) {
    return this.shifts.listCompanyShifts(companyId);
  }

  @Post('companies/:companyId/shifts')
  @RequirePermission('attendance:write')
  createShift(
    @CurrentActor() actor: ActorContext,
    @Param('companyId') companyId: string,
    @Body() dto: CreateShiftDto,
  ) {
    return this.shifts.createShift(actor, companyId, dto);
  }

  @Put('companies/:companyId/shifts/:shiftId')
  @RequirePermission('attendance:write')
  updateShift(
    @CurrentActor() actor: ActorContext,
    @Param('companyId') companyId: string,
    @Param('shiftId') shiftId: string,
    @Body() dto: UpdateShiftDto,
  ) {
    return this.shifts.updateShift(actor, companyId, shiftId, dto);
  }

  @Delete('companies/:companyId/shifts/:shiftId')
  @RequirePermission('attendance:write')
  deleteShift(
    @CurrentActor() actor: ActorContext,
    @Param('companyId') companyId: string,
    @Param('shiftId') shiftId: string,
  ) {
    return this.shifts.deleteShift(actor, companyId, shiftId);
  }

  @Get('employees/:employeeId/shift-assignments')
  @RequirePermission('attendance:read')
  getProfile(
    @CurrentActor() actor: ActorContext,
    @Param('employeeId') employeeId: string,
    @Query('companyId') companyId: string,
  ) {
    return this.shifts.getShiftProfile(employeeId, companyId);
  }

  @Post('employees/:employeeId/shift-assignments')
  @RequirePermission('attendance:write')
  schedule(
    @CurrentActor() actor: ActorContext,
    @Param('employeeId') employeeId: string,
    @Body() dto: ScheduleShiftAssignmentDto,
  ) {
    return this.shifts.scheduleAssignment(actor, {
      employeeId,
      companyId: dto.companyId,
      shiftId: dto.shiftId,
      effectiveFrom: dto.effectiveFrom,
      effectiveTo: dto.effectiveTo,
      reason: dto.reason,
    });
  }
}
